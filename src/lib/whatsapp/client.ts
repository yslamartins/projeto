import { Client, LocalAuth } from 'whatsapp-web.js';
import { toString as qrToString, toDataURL as qrToDataURL } from 'qrcode';
import { scannerEvents } from '@/lib/scanner/events';

export type WhatsAppState = 'disconnected' | 'waiting_qr' | 'connecting' | 'connected';

export interface WhatsAppQrResult {
  state: WhatsAppState;
  qr: string | null;
}

const SESSION_DIR = '.whatsapp';
const QR_WAIT_TIMEOUT_MS = 20000;
const QR_POLL_INTERVAL_MS = 300;

interface WhatsAppRuntime {
  state: WhatsAppState;
  currentQr: string | null;
  clientPromise: Promise<Client> | null;
  teardown: Promise<void> | null;
}

const runtime: WhatsAppRuntime = {
  state: 'disconnected',
  currentQr: null,
  clientPromise: null,
  teardown: null,
};

function markDisconnected(): void {
  runtime.state = 'disconnected';
  runtime.currentQr = null;
  runtime.clientPromise = null;
}

function teardownClient(client: Client): void {
  runtime.teardown = (runtime.teardown ?? Promise.resolve()).then(() =>
    client.destroy().catch(() => {})
  );
}

function printQrToTerminal(qr: string): void {
  qrToString(
    qr,
    { type: 'terminal', small: true },
    (error, terminal) => {
      if (!error && terminal) {
        console.log('\n[WhatsApp] Escaneie o QR code abaixo:\n' + terminal + '\n');
      }
    }
  );
}

function buildClient(): Client {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  });

  client.on('qr', (qr) => {
    runtime.currentQr = qr;
    runtime.state = 'waiting_qr';
    printQrToTerminal(qr);
    scannerEvents.emit('step', 'WhatsApp: escaneie o QR code para conectar.');
    scannerEvents.emit('info', 'WhatsApp: um novo QR code foi gerado.', { qrAvailable: true });
  });

  client.on('authenticated', () => {
    runtime.state = 'connecting';
    scannerEvents.emit('info', 'WhatsApp: autenticado, preparando a sessão...');
  });

  client.on('ready', () => {
    runtime.currentQr = null;
    runtime.state = 'connected';
    scannerEvents.emit('success', 'WhatsApp: conectado.');
  });

  client.on('auth_failure', (message) => {
    markDisconnected();
    teardownClient(client);
    scannerEvents.emit('error', `WhatsApp: falha na autenticação (${message}).`);
  });

  client.on('disconnected', (reason) => {
    markDisconnected();
    teardownClient(client);
    scannerEvents.emit('warn', `WhatsApp: sessão desconectada (${reason}).`);
  });

  return client;
}

async function initializeClient(): Promise<Client> {
  scannerEvents.emit('step', 'WhatsApp: iniciando sessão (WhatsApp Web)...');

  if (runtime.teardown) {
    await runtime.teardown;
  }

  const client = buildClient();
  try {
    await client.initialize();
    return client;
  } catch (error) {
    markDisconnected();
    teardownClient(client);
    scannerEvents.emit('error', 'WhatsApp: não foi possível iniciar a sessão.');
    throw error;
  }
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

export async function requestWhatsAppQr(
  timeoutMs: number = QR_WAIT_TIMEOUT_MS
): Promise<WhatsAppQrResult> {
  await ensureWhatsAppSession();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (runtime.state === 'connected') {
      return { state: 'connected', qr: null };
    }
    if (runtime.currentQr) {
      const qr = await qrToDataURL(runtime.currentQr);
      return { state: 'waiting_qr', qr };
    }
    await new Promise((resolve) => setTimeout(resolve, QR_POLL_INTERVAL_MS));
  }

  return { state: runtime.state, qr: null };
}

export function resetWhatsAppSessionForTests(): void {
  runtime.state = 'disconnected';
  runtime.currentQr = null;
  runtime.clientPromise = null;
  runtime.teardown = null;
}
