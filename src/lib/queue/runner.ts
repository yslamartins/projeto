import { scannerEvents } from '@/lib/scanner/events';

export type QueueKind = 'download' | 'send';
export type QueueStatus = 'idle' | 'running' | 'cancelling';

export interface QueueState {
  kind: QueueKind | null;
  status: QueueStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentProductId: string | null;
}

export interface QueueWorkerResult {
  success: boolean;
  error?: string;
}

export type QueueWorker = (productId: string, index: number) => Promise<QueueWorkerResult>;

export interface QueueStartResult {
  ok: boolean;
  error?: string;
}

const QUEUE_LABEL: Record<QueueKind, string> = {
  download: 'Fila de download',
  send: 'Fila de envio',
};

const IDLE_STATE: QueueState = {
  kind: null,
  status: 'idle',
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
  currentProductId: null,
};

/**
 * Fila em memória, sequencial: um item por vez, com cancelamento entre itens.
 * Não sobrevive a reinício do servidor — de propósito, o trabalho pendente é
 * re-enfileirável a partir do estado do produto no banco.
 */
export class QueueRunner {
  private state: QueueState = { ...IDLE_STATE };
  private running = false;
  private cancelRequested = false;

  isRunning(): boolean {
    return this.running;
  }

  getState(): QueueState {
    return { ...this.state };
  }

  start(kind: QueueKind, productIds: string[], worker: QueueWorker): QueueStartResult {
    if (this.running) {
      return { ok: false, error: 'Já existe uma fila em andamento.' };
    }
    if (productIds.length === 0) {
      return { ok: false, error: 'Nenhum produto elegível para a fila.' };
    }

    this.running = true;
    this.cancelRequested = false;
    this.state = {
      kind,
      status: 'running',
      total: productIds.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      currentProductId: null,
    };

    this.run(kind, productIds, worker).catch((error) => {
      // A trava é liberada no `finally` de `run`; chegar aqui é um bug.
      console.error('Unhandled queue error:', error);
    });

    return { ok: true };
  }

  cancel(): QueueStartResult {
    if (!this.running) {
      return { ok: false, error: 'Nenhuma fila em andamento.' };
    }
    this.cancelRequested = true;
    this.state.status = 'cancelling';
    scannerEvents.emit('warn', `${QUEUE_LABEL[this.state.kind!]}: parada solicitada, terminando o item atual...`);
    return { ok: true };
  }

  private async run(kind: QueueKind, productIds: string[], worker: QueueWorker): Promise<void> {
    const label = QUEUE_LABEL[kind];
    scannerEvents.emit('step', `${label}: iniciada com ${productIds.length} produto(s).`);

    try {
      for (let index = 0; index < productIds.length; index += 1) {
        if (this.cancelRequested) break;

        const productId = productIds[index];
        this.state.currentProductId = productId;
        scannerEvents.emit('step', `${label}: ${index + 1} de ${productIds.length}.`);

        try {
          const result = await worker(productId, index);
          if (result.success) {
            this.state.succeeded += 1;
          } else {
            this.state.failed += 1;
            scannerEvents.emit('error', `${label}: item ${index + 1} falhou — ${result.error || 'erro desconhecido'}`);
          }
        } catch (error: any) {
          // Um item que estoura exceção não pode derrubar o restante da fila.
          this.state.failed += 1;
          scannerEvents.emit('error', `${label}: item ${index + 1} falhou — ${error?.message || 'erro inesperado'}`);
        }

        this.state.processed += 1;
        this.state.currentProductId = null;
      }

      const { processed, total, succeeded, failed } = this.state;
      if (this.cancelRequested) {
        scannerEvents.emit('warn', `${label}: parada. ${processed} de ${total} processado(s).`);
      } else {
        scannerEvents.emit(
          failed > 0 ? 'warn' : 'success',
          `${label}: concluída! ${succeeded} concluído(s), ${failed} falha(s) de ${total}.`
        );
      }
    } finally {
      this.running = false;
      this.cancelRequested = false;
      this.state = {
        ...this.state,
        status: 'idle',
        currentProductId: null,
      };
    }
  }
}

const globalForQueue = globalThis as unknown as { queueRunner: QueueRunner | undefined };

export const queueRunner = globalForQueue.queueRunner ?? new QueueRunner();

if (process.env.NODE_ENV !== 'production') globalForQueue.queueRunner = queueRunner;
