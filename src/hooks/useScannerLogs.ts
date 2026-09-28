'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScanLogEvent } from '@/types/product';

type LogListener = (event: ScanLogEvent) => void;

const LOGS_ENDPOINT = '/api/scanner/logs';

/**
 * Uma única conexão SSE para o dashboard inteiro. Cada ação (varredura, busca,
 * download, pipeline, filas) assina o stream enquanto dura e devolve a
 * assinatura; a conexão só fecha quando ninguém mais está ouvindo.
 */
export function useScannerLogs() {
  const [logs, setLogs] = useState<ScanLogEvent[]>([]);
  const sourceRef = useRef<EventSource | null>(null);
  const listenersRef = useRef<Set<LogListener>>(new Set());

  const addLog = useCallback((type: ScanLogEvent['type'], message: string) => {
    setLogs((prev) => [
      ...prev,
      { type, message, timestamp: new Date().toLocaleTimeString() },
    ]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const handleMessage = useCallback(
    (raw: string) => {
      let event: ScanLogEvent;
      try {
        event = JSON.parse(raw);
      } catch {
        addLog('info', raw);
        return;
      }
      addLog(event.type || 'info', event.message);
      listenersRef.current.forEach((listener) => listener(event));
    },
    [addLog]
  );

  const open = useCallback(() => {
    if (sourceRef.current) return;
    const source = new EventSource(LOGS_ENDPOINT);
    source.onmessage = (message) => handleMessage(message.data);
    source.onerror = () => {
      source.close();
      if (sourceRef.current === source) sourceRef.current = null;
    };
    sourceRef.current = source;
  }, [handleMessage]);

  const close = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  useEffect(() => close, [close]);

  const subscribe = useCallback(
    (listener?: LogListener) => {
      if (listener) listenersRef.current.add(listener);
      open();
      return () => {
        if (listener) listenersRef.current.delete(listener);
        if (listenersRef.current.size === 0) close();
      };
    },
    [open, close]
  );

  return { logs, addLog, clearLogs, subscribe };
}
