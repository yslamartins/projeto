'use client';

import React, { useEffect, useRef } from 'react';
import { Terminal, ChevronDown, ChevronUp, Trash2, CheckCircle2, AlertCircle, Info, Sparkles } from 'lucide-react';
import { ScanLogEvent } from '@/types/product';

interface TerminalDrawerProps {
  logs: ScanLogEvent[];
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
  isScanning: boolean;
}

export const TerminalDrawer: React.FC<TerminalDrawerProps> = ({
  logs,
  isOpen,
  onToggle,
  onClear,
  isScanning,
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  const getLogIcon = (type: ScanLogEvent['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />;
      case 'warn':
        return <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />;
      case 'step':
        return <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />;
    }
  };

  const getLogTextColor = (type: ScanLogEvent['type']) => {
    switch (type) {
      case 'success':
        return 'text-emerald-300 font-medium';
      case 'error':
        return 'text-rose-300 font-semibold';
      case 'warn':
        return 'text-amber-300';
      case 'step':
        return 'text-sky-300 font-medium';
      default:
        return 'text-gray-300';
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-gray-800 shadow-2xl text-white transition-all duration-300">
      {/* Drawer Header / Bar */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer select-none bg-gray-950/80 hover:bg-gray-950 transition"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">
              Terminal de Varredura
            </span>
          </div>

          {isScanning && (
            <div className="flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-medium animate-pulse">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
              <span>Varredura ativa...</span>
            </div>
          )}

          <span className="text-xs text-gray-500">
            {logs.length} {logs.length === 1 ? 'evento' : 'eventos'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition"
              title="Limpar logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition"
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Drawer Content */}
      {isOpen && (
        <div className="h-64 overflow-y-auto p-4 font-mono text-xs space-y-2 bg-gray-950/95">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 italic">
              <span>Nenhum log registrado. Inicie uma varredura para acompanhar em tempo real.</span>
            </div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-2.5 leading-relaxed">
                <span className="text-gray-500 text-[10px] tabular-nums shrink-0 pt-0.5">
                  {log.timestamp}
                </span>
                {getLogIcon(log.type)}
                <span className={`break-words ${getLogTextColor(log.type)}`}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
      )}
    </div>
  );
};
