import {
  killProcessTree,
  listWindowsProcesses,
  removeOrphanLockArtifacts,
  sweepProcesses,
} from '../process/sweep';

const PROFILE_FLAG = '--user-data-dir=';

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

export type ChromePidLister = (profileDir: string) => Promise<number[]>;
export type ChromePidKiller = (pid: number) => Promise<void>;

async function defaultLister(profileDir: string): Promise<number[]> {
  const processes = await listWindowsProcesses('chrome.exe');
  const profileKey = normalizeKey(profileDir);
  return processes.filter((p) => isChromeForProfile(p.commandLine, profileKey)).map((p) => p.pid);
}

/**
 * Derruba o Chrome que ficou preso no perfil de sessão do WhatsApp.
 *
 * A sessão salva é retomada reabrindo o MESMO perfil do Chrome
 * (`--user-data-dir=session`). Se uma run anterior deixou um Chrome vivo segurando
 * esse perfil — crash, Ctrl+C no processo errado, teardown que NÃO derrubou a
 * árvore — o Puppeteer recusa com "already running" e o retry quebraria pra sempre.
 */
export async function sweepStaleSessionChrome(
  profileDir: string,
  lister: ChromePidLister = defaultLister,
  killer: ChromePidKiller = killProcessTree
): Promise<number> {
  let pids: number[];
  try {
    pids = await lister(profileDir);
  } catch {
    return 0;
  }
  if (pids.length === 0) return 0;

  await Promise.all(pids.map((pid) => killer(pid).catch(() => {})));

  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    try {
      if ((await lister(profileDir)).length === 0) break;
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  if ((await lister(profileDir).catch(() => pids)).length === 0) {
    removeOrphanLockArtifacts(profileDir);
  }
  return pids.length;
}

export { sweepProcesses };