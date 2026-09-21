import { spawn } from 'child_process';

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

async function runPowerShell(script: string): Promise<string> {
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
  const key = normalizeKey(profileDir);
  const pids: number[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const pid = Number(line.slice(0, tab));
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (isChromeForProfile(line.slice(tab + 1), key)) pids.push(pid);
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
  return pids.length;
}
