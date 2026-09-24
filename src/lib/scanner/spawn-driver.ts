import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import { scannerEvents } from './events';
import { ScanLogEvent } from '@/types/product';

/**
 * Ponte Node <-> Python: dispara `python tools/scrapling/collect.py` como
 * subprocesso e traduz o contrato JSONL (stdout) em eventos + resultado.
 *
 * Contrato (ver tools/scrapling/collect.py):
 *   {"t":"log","level":"step|info|warn|error|success","message":"..."}
 *   {"t":"result","ok":true,"data":{...}}  |  {"t":"result","ok":false,"error":"..."}
 */

export const COLLECT_SCRIPT = path.resolve(process.cwd(), 'tools', 'scrapling', 'collect.py');

const LOG_LEVELS: ScanLogEvent['type'][] = ['step', 'info', 'warn', 'error', 'success'];

/** Binário do Python do Scrapling: `SCRAPLING_PYTHON` sobrescreve o padrão da venv. */
export function resolvePythonPath(): string {
  const env = process.env.SCRAPLING_PYTHON;
  if (env && env.trim()) return env.trim();
  return process.platform === 'win32'
    ? path.resolve(process.cwd(), '.venv', 'Scripts', 'python.exe')
    : path.resolve(process.cwd(), '.venv', 'bin', 'python');
}

export interface CollectLogEvent {
  level: ScanLogEvent['type'];
  message: string;
}

export interface RunCollectOutcome<T> {
  ok: boolean;
  data?: T;
  error?: string;
  exitCode: number | null;
}

interface RunCollectOptions<T> {
  args: string[];
  /** Encaminha os logs do driver para o scannerEvents (padrão: true). */
  emitLogs?: boolean;
  onLog?: (log: CollectLogEvent) => void;
  timeoutMs?: number;
}

function parseLogLine(raw: string): CollectLogEvent | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.t === 'log' && typeof parsed.message === 'string') {
      const level = LOG_LEVELS.includes(parsed.level)
        ? (parsed.level as ScanLogEvent['type'])
        : 'info';
      return { level, message: parsed.message };
    }
  } catch {
    // linha que não é JSON: ignora
  }
  return null;
}

function parseResultLine<T>(
  raw: string
): { ok: true; data: T } | { ok: false; error: string } | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.t !== 'result') return null;
    if (parsed.ok === true) return { ok: true, data: parsed.data as T };
    return {
      ok: false,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erro desconhecido do driver.',
    };
  } catch {
    return null;
  }
}

/**
 * Classifica uma linha do stderr do driver. O Scrapling/loguru escreve o
 * progresso no stderr (ex.: "INFO: Fetched (200) <GET ...>"); tratá-lo como
 * erro polui o terminal. Só linhas de erro real (ou exception stack) causam
 * evento `error`; as demais viram info/warn ou são ignoradas.
 */
function classifyStderrLine(raw: string): CollectLogEvent | null {
  const line = raw.trim();
  if (!line) return null;
  if (/\b(CRITICAL|ERROR)\b/i.test(line)) return { level: 'error', message: line };
  if (/\b(WARNING|WARN)\b/i.test(line)) return { level: 'warn', message: line };
  if (/\b(TRACE|DEBUG)\b/.test(line)) return null;
  if (/\bINFO\b/i.test(line)) return { level: 'info', message: line };
  if (/traceback|exception|assert/gi.test(line)) return { level: 'error', message: line };
  return null;
}

interface CollectProcessHandlers {
  onLine: (line: string) => void;
  onStderr?: (line: string) => void;
  onExit?: () => void;
}

/** Sobe o subprocesso e repassa cada linha (JSONL) do stdout. */
export function openCollectProcess(args: string[], handlers: CollectProcessHandlers): ChildProcess {
  const child = spawn(resolvePythonPath(), [COLLECT_SCRIPT, ...args], {
    cwd: path.resolve(process.cwd()),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString('utf8');
    let newline: number;
    while ((newline = stdoutBuffer.indexOf('\n')) !== -1) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (line) handlers.onLine(line);
    }
  });

  let stderrBuffer = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString('utf8');
    let newline: number;
    while ((newline = stderrBuffer.indexOf('\n')) !== -1) {
      const line = stderrBuffer.slice(0, newline).trim();
      stderrBuffer = stderrBuffer.slice(newline + 1);
      if (line) handlers.onStderr?.(line);
    }
  });

  child.on('close', () => handlers.onExit?.());
  return child;
}

/**
 * Executa uma ação do driver e aguarda a linha `result` (ou o encerramento).
 * Os logs JSONL do driver são encaminhados ao scannerEvents conforme `emitLogs`.
 */
export function runCollect<T>(options: RunCollectOptions<T>): Promise<RunCollectOutcome<T>> {
  return new Promise((resolve) => {
    const emitLogs = options.emitLogs ?? true;
    let settled = false;
    let result: { ok: true; data: T } | { ok: false; error: string } | null = null;
    let stderrLines: string[] = [];

    const onLine = (line: string) => {
      if (result) return; // já resolveu
      const log = parseLogLine(line);
      if (log) {
        if (emitLogs) scannerEvents.emit(log.level, log.message);
        options.onLog?.(log);
        return;
      }
      result = parseResultLine<T>(line);
    };

    const onStderr = (line: string) => {
      const log = classifyStderrLine(line);
      if (!log) return;
      if (log.level === 'error') stderrLines = [...stderrLines, line].slice(-5);
      scannerEvents.emit(log.level, log.message);
    };

    let child: ChildProcess;
    try {
      child = openCollectProcess(options.args, { onLine, onStderr });
    } catch (error: any) {
      resolve({ ok: false, error: `Falha ao iniciar o driver Python: ${error.message}`, exitCode: null });
      return;
    }

    const timeout = options.timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill('SIGTERM');
          resolve({ ok: false, error: 'Driver excedeu o tempo limite.', exitCode: null });
        }, options.timeoutMs)
      : null;

    child.on('error', (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ ok: false, error: `Falha ao iniciar o driver Python: ${error.message}`, exitCode: null });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (result) {
        if (result.ok) {
          resolve({ ok: true, data: result.data, exitCode: code });
        } else {
          resolve({ ok: false, error: result.error, exitCode: code });
        }
        return;
      }
      const last = stderrLines[stderrLines.length - 1];
      const error = last || (code ? `Driver encerrou com erro (código ${code}).` : 'Driver terminou sem resultado.');
      resolve({ ok: false, error, exitCode: code });
    });
  });
}

/**
 * Subprocesso de sessão aberto via `runCollectSession` (ex.: `collect shopee
 * session` / `collect tiktok session`). Fica aberto até o usuário fechar a
 * janela; guardamos o handle para o reset de perfil poder encerrá-lo antes de
 * renomear o diretório do perfil (senão o navegador segura o lock).
 */
let activeCollectSession: ChildProcess | null = null;

/** Dispara um subprocesso de sessão (ex.: `collect shopee session`) e NÃO aguarda o término. */
export function runCollectSession(options: {
  args: string[];
  onLog?: (log: CollectLogEvent) => void;
}): { child: ChildProcess } {
  const onLine = (line: string) => {
    const log = parseLogLine(line);
    if (log) {
      scannerEvents.emit(log.level, log.message);
      options.onLog?.(log);
    }
  };
  const child = openCollectProcess(options.args, {
    onLine,
    onStderr: (line) => {
      const log = classifyStderrLine(line);
      if (!log) return;
      scannerEvents.emit(log.level, log.message);
    },
    onExit: () => {
      if (activeCollectSession === child) activeCollectSession = null;
    },
  });
  activeCollectSession = child;
  return { child };
}

/** Encerra a sessão de navegador aberta via `runCollectSession`, se houver. */
export function killActiveCollectSession(): void {
  if (!activeCollectSession) return;
  const child = activeCollectSession;
  activeCollectSession = null;
  child.kill('SIGTERM');
}