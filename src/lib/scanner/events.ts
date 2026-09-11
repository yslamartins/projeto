import { ScanLogEvent } from '@/types/product';

type LogListener = (event: ScanLogEvent) => void;

class ScannerEventEmitter {
  private listeners: Set<LogListener> = new Set();
  private recentLogs: ScanLogEvent[] = [];
  private isScanning: boolean = false;

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    // Send recent logs on connect
    this.recentLogs.slice(-15).forEach((log) => listener(log));

    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(type: ScanLogEvent['type'], message: string, data?: any) {
    const event: ScanLogEvent = {
      type,
      message,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      data,
    };

    this.recentLogs.push(event);
    if (this.recentLogs.length > 200) {
      this.recentLogs.shift();
    }

    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error notifying log listener', err);
      }
    });
  }

  public setIsScanning(scanning: boolean) {
    this.isScanning = scanning;
  }

  public getIsScanning(): boolean {
    return this.isScanning;
  }

  public clear() {
    this.recentLogs = [];
  }
}

const globalForScanner = globalThis as unknown as {
  scannerEvents: ScannerEventEmitter | undefined;
};

export const scannerEvents =
  globalForScanner.scannerEvents ?? new ScannerEventEmitter();

if (process.env.NODE_ENV !== 'production') {
  globalForScanner.scannerEvents = scannerEvents;
}
