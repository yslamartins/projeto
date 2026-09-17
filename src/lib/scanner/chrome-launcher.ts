import { chromium, BrowserContext } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import { createServer } from 'net';
import fs from 'fs';
import path from 'path';

// Sobe um Chrome "comum" (sem as flags de automação do Playwright) e conecta
// via CDP. Isso reduz o vetor de detecção do anti-bot, que enxerga um Chrome
// normal aberto com remote debugging em vez de um browser dirigido.

export interface ManagedChrome {
  context: BrowserContext;
  dispose: () => Promise<void>;
}

function findChromePath(): string {
  const configured = process.env.SHOPEE_CHROME_PATH || process.env.CHROME_PATH;
  if (configured && fs.existsSync(configured)) return configured;

  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    localAppData
      ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    'Google Chrome não encontrado. Defina a variável SHOPEE_CHROME_PATH com o caminho do chrome.exe.'
  );
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error('Não foi possível reservar uma porta.'))));
    });
  });
}

async function waitForCdp(port: number, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Não foi possível conectar ao Chrome (CDP) a tempo.');
}

function killChrome(child: ChildProcess, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve) => {
    const pid = child.pid;
    if (!pid) return resolve();

    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    // Mata o processo principal (no Windows, uv_process_kill → TerminateProcess).
    // Os processos filhos (renderer/gpu/etc.) saem sozinhos quando o browser
    // principal morre.
    try {
      child.kill('SIGKILL');
    } catch {
      // processo já encerrado
    }

    // No Windows, best-effort para derrubar a árvore inteira. Não podemos
    // depender de taskkill (pode não estar no PATH), por isso também matamos
    // o processo principal e AGUARDAMOS a sua saída via poll.
    if (process.platform === 'win32') {
      try {
        const tk = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        tk.on('error', () => {});
        tk.on('close', () => {});
      } catch {
        // ignora: o poll abaixo garante a espera pelo exit do principal
      }
    }

    // Espera o processo realmente sumir do sistema antes de liberar o perfil.
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      if (Date.now() >= deadline) return finish();
      try {
        // process.kill(pid, 0) apenas testa a existência; lança ESRCH se não existe.
        process.kill(pid, 0);
        setTimeout(poll, 200);
      } catch {
        finish();
      }
    };
    poll();
  });
}

export async function launchManagedChrome(options: {
  userDataDir: string;
  headless?: boolean;
  url?: string;
}): Promise<ManagedChrome> {
  const { userDataDir, headless = false, url = 'about:blank' } = options;

  fs.mkdirSync(userDataDir, { recursive: true });
  const chromePath = findChromePath();
  const port = await getFreePort();

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    // Evita assinaturas típicas de automação ('--no-first-run' e
    // '--no-default-browser-check' são flags de bot bem conhecidas) e
    // desativa a detecção Blink de automação via navigator.webdriver.
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    ...(headless ? ['--headless=new'] : ['--start-maximized']),
    url,
  ];

  const child = spawn(chromePath, args, { stdio: 'ignore' });

  try {
    await waitForCdp(port);
  } catch (error) {
    await killChrome(child);
    throw error;
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0] || (await browser.newContext());

  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    try {
      await browser.close();
    } catch {
      // conexão já encerrada
    }
    // Aguarda o Chrome realmente sair para liberar o user-data-dir do perfil.
    try {
      await killChrome(child);
    } catch {
      // processo já encerrado
    }
  };

  return { context, dispose };
}
