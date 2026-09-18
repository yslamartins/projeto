import { Client, LocalAuth } from 'whatsapp-web.js';
import { toString as qrToString, toDataURL as qrToDataURL } from 'qrcode';
import { spawn } from 'child_process';
import path from 'path';
import { scannerEvents } from '@/lib/scanner/events';

export type WhatsAppState = 'disconnected' | 'waiting_qr' | 'connecting' | 'connected';

export interface WhatsAppQrResult {
  state: WhatsAppState;
  qr: string | null;
}

const SESSION_DIR = '.whatsapp';
const QR_WAIT_TIMEOUT_MS = 20000;
const QR_POLL_INTERVAL_MS = 300;
const INIT_RETRY_DELAY_MS = 1500;
const MAX_INIT_ATTEMPTS = 2;

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

function scheduleTeardown(client: Client): void {
  const afterInit = (runtime.clientPromise ?? Promise.resolve(client)).catch(() => undefined);
  runtime.teardown = (runtime.teardown ?? Promise.resolve())
    .then(() => afterInit)
    .then(() => client.destroy().catch(() => {}));
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
      headless: process.env.WHATSAPP_HEADLESS !== 'false',
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
    scheduleTeardown(client);
    scannerEvents.emit('error', `WhatsApp: falha na autenticação (${message}).`);
  });

  client.on('disconnected', (reason) => {
    markDisconnected();
    scheduleTeardown(client);
    scannerEvents.emit('warn', `WhatsApp: sessão desconectada (${reason}).`);
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

  scannerEvents.emit('error', 'WhatsApp: não foi possível iniciar a sessão.');
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
