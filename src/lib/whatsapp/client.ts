import { Client, LocalAuth } from 'whatsapp-web.js';
import { toDataURL as qrToDataURL } from 'qrcode';
import { scannerEvents } from '@/lib/scanner/events';
import type { ScanLogEvent } from '@/types/product';

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
}

const runtime: WhatsAppRuntime = {
  state: 'disconnected',
  currentQr: null,
  clientPromise: null,
};

function emit(type: ScanLogEvent['type'], message: string, data?: any) {
  scannerEvents.emit(type, message, data);
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
    emit('step', 'WhatsApp: escaneie o QR code para conectar.');
    emit('info', 'WhatsApp: um novo QR code foi gerado.', { qrAvailable: true });
  });

  client.on('authenticated', () => {
    runtime.state = 'connecting';
    emit('info', 'WhatsApp: autenticado, preparando a sessão...');
  });

  client.on('ready', () => {
    runtime.currentQr = null;
    runtime.state = 'connected';
    emit('success', 'WhatsApp: conectado.');
  });

  client.on('auth_failure', (message) => {
    runtime.state = 'disconnected';
    emit('error', `WhatsApp: falha na autenticação (${message}).`);
  });

  client.on('disconnected', (reason) => {
    runtime.currentQr = null;
    runtime.state = 'disconnected';
    runtime.clientPromise = null;
    emit('warn', `WhatsApp: sessão desconectada (${reason}).`);
    client.destroy().catch(() => {});
  });

  return client;
}

async function initializeClient(): Promise<Client> {
  emit('step', 'WhatsApp: iniciando sessão (WhatsApp Web)...');

  const client = buildClient();
  try {
    await client.initialize();
    return client;
  } catch (error) {
    runtime.currentQr = null;
    runtime.state = 'disconnected';
    runtime.clientPromise = null;
    emit('error', 'WhatsApp: não foi possível iniciar a sessão.');
    client.destroy().catch(() => {});
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

export function resetWhatsAppSessionForTests() {
  runtime.state = 'disconnected';
  runtime.currentQr = null;
  runtime.clientPromise = null;
}