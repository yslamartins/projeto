import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';

const PROFILE_FLAG = '--user-data-dir=';
const SWEEP_CONFIRM_TIMEOUT_MS = 4000;
const SWEEP_CONFIRM_INTERVAL_MS = 150;
const LOCK_ARTIFACTS = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];

function normalizeKey(dir: string): string {
  return dir.replace(/\\/g, '/').replace(/\/+$/, '');
}

function extractProfileValue(commandLine: string): string | null {
  const at = commandLine.indexOf(PROFILE_FLAG);
  if (at === -1) return null;
  let rest = commandLine.slice(at + PROFILE_FLAG.length);
  let value: string;
  if (rest.startsWith('"')) {
    const close = rest.indexOf('"', 1);
    value = close === -1 ? rest.slice(1) : rest.slice(1, close);
  } else {
    value = rest.split(' ')[0];
  }
  return value || null;
}

function isChromeForProfile(commandLine: string, profileKey: string): boolean {
  const value = extractProfileValue(commandLine);
  return value !== null && normalizeKey(value) === profileKey;
}

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

async function listChromePidsForProfile(profileDir: string): Promise<number[]> {
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
    'ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }';
  const stdout = await runPowerShell(script);
  const profileKey = normalizeKey(profileDir);
  const pids: number[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const pid = Number(line.slice(0, tab));
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (isChromeForProfile(line.slice(tab + 1), profileKey)) pids.push(pid);
  }
  return pids;
}

async function killChromeTree(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const taskkill = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    taskkill.on('error', () => resolve());
    taskkill.on('close', () => resolve());
  });
}

export type ChromePidLister = (profileDir: string) => Promise<number[]>;
export type ChromePidKiller = (pid: number) => Promise<void>;

export async function sweepStaleSessionChrome(
  profileDir: string,
  lister: ChromePidLister = listChromePidsForProfile,
  killer: ChromePidKiller = killChromeTree
): Promise<number> {
  let pids: number[];
  try {
    pids = await lister(profileDir);
  } catch {
    return 0;
  }
  await Promise.all(pids.map((pid) => killer(pid).catch(() => {})));
  // taskkill (spawn) fecha antes de o Chrome TERMINAR de morrer: o
  // SingletonLock do perfil pode demorar alguns ms pra ser liberado.
  // Se o retry subir o Chrome agora, vai receber 'already running' de novo.
  // Aguarda a liberacao REAL (re-lister ate restar 0), com timeout p/
  // nunca pendurar a sessao se a morte demorar demais.
  if (pids.length > 0) {
    const deadline = Date.now() + SWEEP_CONFIRM_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const restantes = await lister(profileDir);
        if (restantes.length === 0) break;
      } catch { break; }
      await new Promise((r) => setTimeout(r, SWEEP_CONFIRM_INTERVAL_MS));
    }
  }

  // Importante: o Puppeteer em Windows (BrowserLauncher.js:175) dispara o
  // erro "already running" se o ARQUIVO `lockfile` EXISTIR no userDataDir —
  // nao e o SingletonLock, e nao exige Chrome vivo. taskkill /F mata o
  // processo mas deixa o `lockfile` (e os Singleton*) ORFAOS em disco; se
  // nao removermos, o retry re-sobe e recebe o mesmo erro pra sempre.
  // Sao so artefatos de lock (o Chrome recria no launch), nunca a sessao.
  //
  // Caso decisivo: quando o Chrome JA morreu sozinho (lister = 0) o
  // `lockfile` pode ter ficado ORFAO de um kill/crash anterior — e o
  // `if (pids.length > 0)` NAO entra (0), deixando o lockfile pra sempre.
  // Por isso a remocao so roda se o perfil estiver LIVRE de processos
  // (re-lister atual = 0), que cobre os dois casos: pos-kill E orfao.
  const restantes = await lister(profileDir);
  const livre = restantes.length === 0;
  if (livre) {
    for (const name of LOCK_ARTIFACTS) {
      try {
        const p = join(profileDir, name);
        if (existsSync(p)) rmSync(p, { force: true });
      } catch { /* arquivo em uso por um processo que ainda morre -> visto no proximo retry */ }
    }
  }
  return pids.length;
}
