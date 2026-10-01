/**
 * Varredura de processos ├│rf├úos no Windows.
 *
 * Existe por causa de um sintoma concreto: um driver `collect.py` de uma sess├úo
 * anterior pode ficar vivo segurando o `user_data_dir` muito depois do servidor
 * que o iniciou ter morrido (restart do `next dev`). Quem reinicia o servidor
 * perde o handle, o processo vira lixo e o perfil fica travado para o login
 * seguinte ÔÇö com um Chrome ├│rf├úo junto.
 *
 * Por isso as duas coisas precisam ser varridas juntas: o Chrome segurando o
 * perfil e o driver Python segurando a sess├úo.
 *
 * `taskkill /F /T` falha silenciosamente neste ambiente (sa├¡da vazia, processo
 * sobrevive) ÔÇö ver o diagn├│stico em `src/lib/whatsapp/sweep.test.ts`. S├│
 * `Stop-Process -Force` derruba de verdade.
 */
import { spawn } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

const SWEEP_CONFIRM_TIMEOUT_MS = 4000;
const SWEEP_CONFIRM_INTERVAL_MS = 150;

/** Artefatos de lock que um launch interrompido deixa ├│rf├úos em disco. */
export const LOCK_ARTIFACTS = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];

export type ProcessInfo = { pid: number; commandLine: string };
export type ProcessLister = (processName: string) => Promise<ProcessInfo[]>;
export type ProcessKiller = (pid: number) => Promise<void>;

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve) => {
    let stdout = '';
    const child = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(stdout));
  });
}

/** Enumera `processName` com PID e command line. Devolve [] se o PowerShell falhar. */
export async function listWindowsProcesses(processName: string): Promise<ProcessInfo[]> {
  const script =
    `Get-CimInstance Win32_Process -Filter "Name='${processName}'" | ` +
    'ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }';
  const stdout = await runPowerShell(script);
  const found: ProcessInfo[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const pid = Number(line.slice(0, tab));
    if (!Number.isInteger(pid) || pid <= 0) continue;
    found.push({ pid, commandLine: line.slice(tab + 1) });
  }
  return found;
}

export async function killProcessTree(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const ps = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', `Stop-Process -Id ${pid} -Force`],
      { windowsHide: true, stdio: 'ignore' }
    );
    ps.on('error', () => resolve());
    ps.on('close', () => resolve());
  });
}

/**
 * Casa um needle como token inteiro do command line, ignorando aspas.
 *
 * Substring pura seria perigoso aqui: `collect.py shopee session-status` contém
 * "session" como pedaço, e um sweep de "derruba a sessão de login" acabaria
 * matando também a consulta de status — ou, pior, uma varredura em andamento.
 */
function commandLineHasToken(commandLine: string, needle: string): boolean {
  const tokens = commandLine
    .replace(/["']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return tokens.some((token) => token.toLowerCase() === needle.toLowerCase());
}

/**
 * Um needle casa como token exato, exceto quando ele é um trecho de caminho
 * (`collect.py`, que vive dentro de `...\collect.py shopee session`). Nesse caso
 * vale substring — e só nesse caso.
 *
 * O resultado é o que o caller quer: `collect.py shopee session` bate, e
 * `collect.py shopee session-status` NÃO bate no filtro `session`.
 */
function commandLineHasNeedle(commandLine: string, needle: string): boolean {
  const isPathFragment = needle.includes('\\') || needle.includes('/') || needle.includes('.py');
  return isPathFragment
    ? commandLine.toLowerCase().includes(needle.toLowerCase())
    : commandLineHasToken(commandLine, needle);
}

/**
 * Derruba todo processo cujo command line contém todos os `mustContain`.
 *
 * Ver {@link commandLineHasNeedle}: ações casam por token (`session` ≠
 * `session-status`), trechos de caminho por substring (`collect.py`).
 */
export async function sweepProcesses(options: {
  processName: string;
  mustContain: readonly string[];
  lister?: ProcessLister;
  killer?: ProcessKiller;
}): Promise<number> {
  const lister = options.lister ?? listWindowsProcesses;
  const killer = options.killer ?? killProcessTree;

  let candidates: ProcessInfo[];
  try {
    candidates = await lister(options.processName);
  } catch {
    return 0;
  }

  const doomed = candidates.filter((proc) =>
    options.mustContain.every((needle) => commandLineHasNeedle(proc.commandLine, needle))
  );
  if (doomed.length === 0) return 0;

  await Promise.all(doomed.map((proc) => killer(proc.pid).catch(() => {})));

  // O Stop-Process roda assíncrono: o processo pode levar alguns ms para morrer
  // de fato e liberar o user-data-dir. Se subirmos o Chrome agora, ele herda um
  // perfil ainda travado. Espera pela liberação real, com teto.
  const deadline = Date.now() + SWEEP_CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const restantes = await lister(options.processName);
      const stillDoomed = restantes.filter((proc) =>
        options.mustContain.every((needle) => commandLineHasNeedle(proc.commandLine, needle))
      );
      if (stillDoomed.length === 0) break;
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, SWEEP_CONFIRM_INTERVAL_MS));
  }

  return doomed.length;
}

/**
 * Remove artefatos de lock ├│rf├úos depois que todos os processos do perfil ca├¡ram.
 *
 * Sem isso o retry sobe e recebe o mesmo erro: o `Stop-Process -Force` mata o
 * processo, mas o arquivo continua existindo e o Chrome se recusa a abrir o perfil
 * de novo. S├úo s├│ artefatos de lock (o Chrome recria no launch), nunca a sess├úo.
 */
export function removeOrphanLockArtifacts(profileDir: string): void {
  for (const name of LOCK_ARTIFACTS) {
    try {
      const artifact = join(profileDir, name);
      if (existsSync(artifact)) rmSync(artifact, { force: true });
    } catch {
      // Em uso por um processo que ainda est├í morrendo: visto no pr├│ximo retry.
    }
  }
}
