import { Client, LocalAuth } from 'whatsapp-web.js';
import path from 'path';
import { scannerEvents } from '@/lib/scanner/events';
import { sweepStaleSessionChrome } from './sweep';

export type WhatsAppState = 'disconnected' | 'connecting' | 'connected';

const SESSION_DIR = '.whatsapp';
const INIT_RETRY_DELAY_MS = 1500;
const MAX_INIT_ATTEMPTS = 2;
// Mantém a página do WA Web "viva" enquanto o pipeline de vídeo roda (minutos
// de ociosidade): sem esse toque periódico o Chrome descarta o renderer do
// frame ("Attempted to use detached Frame" na próxima chamada).
const WHATSAPP_KEEPALIVE_MS = 15000;

interface WhatsAppRuntime {
  state: WhatsAppState;
  clientPromise: Promise<Client> | null;
  teardown: Promise<void> | null;
}

// Persiste o runtime no globalThis para sobreviver ao hot-reload do dev-server
// (mesmo padrão do scannerEvents): HMR reavalia o módulo, mas o estado da
// sessão do WhatsApp precisa continuar sendo o do client autenticado.
const globalForWhatsApp = globalThis as unknown as {
  __whatsAppRuntime: WhatsAppRuntime | undefined;
};

const runtime: WhatsAppRuntime =
  globalForWhatsApp.__whatsAppRuntime ?? {
    state: 'disconnected',
    clientPromise: null,
    teardown: null,
  };

if (process.env.NODE_ENV !== 'production') {
  globalForWhatsApp.__whatsAppRuntime = runtime;
}

function markDisconnected(): void {
  runtime.state = 'disconnected';
  runtime.clientPromise = null;
}

function scheduleTeardown(client: Client): void {
  const afterInit = (runtime.clientPromise ?? Promise.resolve(client)).catch(() => undefined);
  runtime.teardown = (runtime.teardown ?? Promise.resolve())
    .then(() => afterInit)
    .then(() => client.destroy().catch(() => {}));
}

function buildClient(): Client {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
    puppeteer: {
      headless: process.env.WHATSAPP_HEADLESS === 'true',
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // WA Web fica ocioso durante o pipeline de vídeo; o Chrome então
        // descarta/recria o renderer e o frame antigo fica desanexado ("Attempted
        // to use detached Frame"). Esses flags impedem o descarte por economia de
        // memória e a troca de processo por site isolation.
        '--disable-features=IsolateOrigins,site-per-process,MemorySaverMode',
        '--disable-site-isolation-trials',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    },
  });

  let keepAliveTimer: NodeJS.Timeout | null = null;
  const stopKeepAlive = () => {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  };
  const startKeepAlive = () => {
    if (keepAliveTimer) return;
    // Chama `evaluate` periodicamente só para indicar atividade ao Chrome; se a
    // página estiver navegando, o erro é esperado e ignorado.
    keepAliveTimer = setInterval(() => {
      client.pupPage?.evaluate(() => document.readyState).catch(() => {});
    }, WHATSAPP_KEEPALIVE_MS);
  };

  client.on('qr', () => {
    runtime.state = 'connecting';
    scannerEvents.emit(
      'step',
      'WhatsApp: escaneie o QR code na janela do navegador que acabou de abrir.'
    );
  });

  client.on('authenticated', () => {
    runtime.state = 'connecting';
    scannerEvents.emit('info', 'WhatsApp: autenticado, preparando a sessÃ£o...');
  });

  client.on('ready', () => {
    runtime.state = 'connected';
    startKeepAlive();
    scannerEvents.emit('success', 'WhatsApp: conectado.');
  });

  client.on('auth_failure', (message) => {
    stopKeepAlive();
    markDisconnected();
    scheduleTeardown(client);
    scannerEvents.emit('error', `WhatsApp: falha na autenticaÃ§Ã£o (${message}).`);
  });

  client.on('disconnected', (reason) => {
    stopKeepAlive();
    markDisconnected();
    scheduleTeardown(client);
    scannerEvents.emit('warn', `WhatsApp: sessÃ£o desconectada (${reason}).`);
  });

  return client;
}

async function initializeClient(): Promise<Client> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_INIT_ATTEMPTS; attempt += 1) {
    scannerEvents.emit(
      'step',
      attempt === 1
        ? 'WhatsApp: iniciando sessão (WhatsApp Web)...'
        : `WhatsApp: tentando iniciar a sessão novamente (tentativa ${attempt}/${MAX_INIT_ATTEMPTS})...`
    );

    if (runtime.teardown) {
      await runtime.teardown;
      runtime.teardown = null;
    }

    // A sessão salva é retomada reabrindo o MESMO perfil do Chrome
    // (`--user-data-dir=session`). Se uma run anterior deixou um Chrome vivo
    // segurando esse perfil — crash, Ctrl+C no processo errado, teardown que
    // nÃ£o derrubou a Ã¡rvore â€” o Puppeteer recusa com "already running" e o
    // retry quebraria pra sempre. Derruba qualquer Chrome que aponte pro nosso
    // perfil ANTES de cada tentativa (idempotente: nÃ£o existe = nada a fazer).
    const swept = await sweepStaleSessionChrome(path.resolve(SESSION_DIR, 'session'));
    if (swept > 0) {
      scannerEvents.emit('warn', `WhatsApp: encerrei ${swept} Chrome(s) preso(s) no perfil da sessão.`);
    }

    const client = buildClient();
    const initialize = client.initialize();
    initialize.catch(() => {});
    try {
      await initialize;
      return client;
    } catch (error) {
      lastError = error;
      scannerEvents.emit(
        'warn',
        `WhatsApp: falha ao iniciar a sessão (tentativa ${attempt}/${MAX_INIT_ATTEMPTS}).`
      );
      markDisconnected();
      scheduleTeardown(client);
      if (attempt < MAX_INIT_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, INIT_RETRY_DELAY_MS));
      }
    }
  }

  scannerEvents.emit('error', 'WhatsApp: nÃ£o foi possÃ­vel iniciar a sessÃ£o.');
  throw lastError;
}

export async function ensureWhatsAppSession(): Promise<Client> {
  if (runtime.clientPromise) {
    return runtime.clientPromise;
  }

  runtime.clientPromise = initializeClient();
  return runtime.clientPromise;
}

export function getWhatsAppState(): WhatsAppState {
  return runtime.state;
}

export function resetWhatsAppSessionForTests(): void {
  runtime.state = 'disconnected';
  runtime.clientPromise = null;
  runtime.teardown = null;
}
