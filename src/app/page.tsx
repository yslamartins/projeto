'use client';

import React, { useState, useEffect } from 'react';
import { Play, LogIn, Eye, Sparkles, RefreshCw, Filter, Video, Trash2, ListVideo, Square, Send } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { ProductCard } from '@/components/ProductCard';
import { TerminalDrawer } from '@/components/TerminalDrawer';
import { useScannerLogs } from '@/hooks/useScannerLogs';
import { MIN_SALES } from '@/lib/scanner/parser';
import { Product, ProductStatus, QueueState } from '@/types/product';

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [headfulMode, setHeadfulMode] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isLaunchingSession, setIsLaunchingSession] = useState(false);
  const [isShopeeLoggedIn, setIsShopeeLoggedIn] = useState<boolean | null>(null);
  const [isLaunchingTikTok, setIsLaunchingTikTok] = useState(false);
  const [isResettingProfile, setIsResettingProfile] = useState(false);
  const [videoSearchingId, setVideoSearchingId] = useState<string | null>(null);
  const [whatsappSendingId, setWhatsappSendingId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueState | null>(null);
  const { logs, addLog, clearLogs, subscribe } = useScannerLogs();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`/api/products?status=${statusFilter}`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
      }
    } catch (err) {
      console.error('Failed to fetch products', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [statusFilter]);

  const [customSearchTerm, setCustomSearchTerm] = useState('');

  const queueRunning = queue?.status === 'running' || queue?.status === 'cancelling';
  const queueLabel = queue?.kind === 'send' ? 'envio' : 'download';

  // Acompanha a fila em segundo plano: o progresso chega pelo terminal via SSE,
  // aqui é só para saber quando ela terminou (e atualizar os cards).
  useEffect(() => {
    if (!queueRunning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/queue');
        const data = await res.json();
        if (data.success) {
          setQueue((prev) => {
            if (prev && prev.status !== 'idle' && data.queue.status === 'idle') {
              addLog(
                'success',
                `Fila de ${queueLabel}: ${data.queue.succeeded} concluído(s), ${data.queue.failed} falha(s).`
              );
              fetchProducts();
            }
            return data.queue;
          });
        }
      } catch {
        // servidor ocupado com a fila; tenta de novo no próximo tique
      }
    }, 2000);
    return () => clearInterval(interval);
    // `queueLabel` acompanha `queue.kind`, que não muda durante a execução.
  }, [queueRunning, queueLabel]);

  // Selo de autenticação ao lado do botão "Login Shopee". Faz uma leitura no mount
  // e depois a cada 30s — só para mostrar o estado; quem fecha o login é a pessoa,
  // no Chrome. Enquanto a janela está aberta a leitura volta `null` (arquivo de
  // cookies travado), que é exatamente o que o selo precisa distinguir de "sem login".
  useEffect(() => {
    void refreshSessionStatus();
    const interval = setInterval(() => void refreshSessionStatus(), 30_000);
    return () => clearInterval(interval);
  }, []);

  const TRENDING_CHIPS = [
    'Projetor',
    'Mouse Sem Fio',
    'Capa de Chuva Moto',
    'Lembrancinha Professores',
    'Panela Mexedeira de Massa Salgado',
    'Rasteirinha',
    'PC Gamer',
    'Playstation 5',
    'Biquíni',
    'Kit Calcinha Algodao',
    'Bebê Reborn',
    'Pião Fever Profissional',
  ];

  const handleStartScan = async (specificTerm?: string) => {
    if (isScanning) return;
    setIsScanning(true);
    setIsDrawerOpen(true);

    const termToUse = specificTerm || customSearchTerm.trim() || undefined;

    addLog(
      'step',
      `Iniciando varredura na Shopee ${
        termToUse ? `para o termo: "${termToUse}"` : '(automático de Buscas em Alta)'
      } (Modo: ${headfulMode ? 'Visível' : 'Invisível/Headless'})...`
    );

    try {
      const unsubscribe = subscribe((logData) => {
        if (
          logData.type === 'success' ||
          logData.message.includes('finalizada') ||
          logData.message.includes('concluída')
        ) {
          fetchProducts();
        }
      });

      // Trigger start
      const startRes = await fetch('/api/scanner/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headful: headfulMode, term: termToUse }),
      });

      const startData = await startRes.json();

      if (!startData.success) {
        addLog('error', `Erro ao disparar varredura: ${startData.error}`);
        setIsScanning(false);
        unsubscribe();
        return;
      }

      // Wait until scan completes via polling status or SSE stream close
      const checkInterval = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/scanner/status');
          const statusData = await statusRes.json();
          if (!statusData.isScanning) {
            clearInterval(checkInterval);
            setIsScanning(false);
            unsubscribe();
            fetchProducts();
            addLog('success', 'Varredura finalizada. Lista de produtos atualizada.');
          }
        } catch {
          clearInterval(checkInterval);
          setIsScanning(false);
          unsubscribe();
        }
      }, 2000);

    } catch (err: any) {
      addLog('error', `Falha de conexão: ${err.message}`);
      setIsScanning(false);
    }
  };

  /**
   * Estado de login do perfil. `null` não é "deslogado": é "não deu para ler agora",
   * o que acontece enquanto o Chrome está aberto (ele trava o arquivo de cookies).
   */
  const refreshSessionStatus = async () => {
    try {
      const res = await fetch('/api/scanner/session');
      const data = await res.json();
      setIsShopeeLoggedIn(typeof data.authenticated === 'boolean' ? data.authenticated : null);
    } catch {
      setIsShopeeLoggedIn(null);
    }
  };

  const handleLaunchSession = async () => {
    if (isLaunchingSession) return;
    setIsLaunchingSession(true);
    setIsDrawerOpen(true);
    addLog('step', 'Abrindo o Chrome no perfil persistente da Shopee...');

    try {
      const res = await fetch('/api/scanner/session', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addLog('success', 'Chrome aberto! Faça o login na janela e feche-a quando terminar.');
      } else {
        addLog('error', `Falha ao abrir navegador: ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `Erro ao comunicar com o servidor: ${err.message}`);
    } finally {
      setIsLaunchingSession(false);
      void refreshSessionStatus();
    }
  };

  const handleLaunchTikTokSession = async () => {
    if (isLaunchingTikTok) return;
    setIsLaunchingTikTok(true);
    setIsDrawerOpen(true);
    addLog('step', 'Abrindo navegador persistente para autenticação no TikTok...');

    try {
      const res = await fetch('/api/tiktok/session', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addLog('success', 'TikTok aberto! Faça o login ou resolva verificações se necessário.');
      } else {
        addLog('error', `Falha ao abrir TikTok: ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `Erro ao comunicar com o servidor: ${err.message}`);
    } finally {
      setIsLaunchingTikTok(false);
    }
  };

  const handleResetProfile = async () => {
    if (isResettingProfile || isScanning) return;
    if (!window.confirm('Resetar o perfil da Shopee? Isso remove o cookie anti-bot gravado e permite tentar o login do zero. O perfil atual será salvo em /backups.')) {
      return;
    }
    setIsResettingProfile(true);
    setIsDrawerOpen(true);
    addLog('step', 'Resetando perfil persistente da Shopee (anti-bot)...');

    try {
      const res = await fetch('/api/scanner/profile/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addLog('success', data.message);
      } else {
        addLog('error', `Falha ao resetar perfil: ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `Erro ao resetar perfil: ${err.message}`);
    } finally {
      setIsResettingProfile(false);
    }
  };

  const handleSearchVideo = async (id: string) => {
    if (videoSearchingId) return;
    setVideoSearchingId(id);
    setIsDrawerOpen(true);

    const unsubscribe = subscribe();

    addLog('step', `Buscando vídeo no TikTok para o produto selecionado...`);

    try {
      const res = await fetch('/api/video/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, headful: headfulMode }),
      });
      const data = await res.json();

      if (data.success) {
        addLog('success', 'Vídeo encontrado e link salvo no produto.');
        fetchProducts();
      } else {
        addLog('error', `Busca de vídeo falhou: ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `Erro ao buscar vídeo: ${err.message}`);
    } finally {
      unsubscribe();
      setVideoSearchingId(null);
    }
  };

  const handleDownloadVideo = async (id: string) => {
    if (videoSearchingId) return;
    setVideoSearchingId(id);
    setIsDrawerOpen(true);

    const unsubscribe = subscribe();

    addLog('step', `Iniciando download do vídeo via TikDrop...`);

    try {
      const res = await fetch('/api/video/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, headful: headfulMode }),
      });
      const data = await res.json();

      if (data.success) {
        addLog('success', 'Vídeo baixado com sucesso!');
        fetchProducts();
      } else {
        addLog('error', `Download falhou: ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `Erro ao baixar vídeo: ${err.message}`);
    } finally {
      unsubscribe();
      setVideoSearchingId(null);
    }
  };

  const handlePipelineVideo = async (id: string) => {
    if (videoSearchingId) return;
    setVideoSearchingId(id);
    setIsDrawerOpen(true);

    const unsubscribe = subscribe();

    addLog('step', `Pipeline: buscar e baixar vídeo do TikTok (termo do produto)...`);

    try {
      const res = await fetch('/api/video/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, headful: headfulMode }),
      });
      const data = await res.json();

      if (data.success) {
        addLog('success', 'Pipeline concluído: vídeo baixado e pronto para acesso.');
        fetchProducts();
      } else {
        addLog('error', `Pipeline falhou (etapa ${data.step || '?'}): ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `Erro ao executar pipeline: ${err.message}`);
    } finally {
      unsubscribe();
      setVideoSearchingId(null);
    }
  };

  const handleSendToWhatsApp = async (id: string) => {
    if (whatsappSendingId) return;
    setWhatsappSendingId(id);
    setIsDrawerOpen(true);

    const unsubscribe = subscribe();

    addLog('step', 'WhatsApp: enviando o vídeo do produto selecionado...');

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id }),
      });
      const data = await res.json();

      if (data.success) {
        addLog('success', 'Vídeo enviado para o grupo.');
        fetchProducts();
      } else {
        addLog('error', `Envio ao WhatsApp falhou: ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `Erro ao enviar ao WhatsApp: ${err.message}`);
    } finally {
      unsubscribe();
      setWhatsappSendingId(null);
    }
  };

  const handleStartDownloadQueue = async () => {
    if (queueRunning) return;
    setIsDrawerOpen(true);

    const unsubscribe = subscribe();
    addLog('step', 'Fila de download: montando a lista de produtos...');

    try {
      const res = await fetch('/api/queue/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headful: headfulMode }),
      });
      const data = await res.json();

      if (data.success) {
        setQueue(data.queue);
        addLog('success', `Fila de download iniciada com ${data.queue.total} produto(s).`);
      } else {
        addLog('error', `Não foi possível iniciar a fila: ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `Erro ao iniciar a fila de download: ${err.message}`);
    } finally {
      unsubscribe();
    }
  };

  const handleStartSendQueue = async () => {
    if (queueRunning) return;
    setIsDrawerOpen(true);

    const unsubscribe = subscribe();
    addLog('step', 'Fila de envio: montando a lista de vídeos para o WhatsApp...');

    try {
      const res = await fetch('/api/queue/send', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        setQueue(data.queue);
        addLog('success', `Fila de envio iniciada com ${data.queue.total} vídeo(s).`);
      } else {
        addLog('error', `Não foi possível iniciar a fila de envio: ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `Erro ao iniciar a fila de envio: ${err.message}`);
    } finally {
      unsubscribe();
    }
  };

  const handleCancelQueue = async () => {
    try {
      const res = await fetch('/api/queue/cancel', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        addLog('warn', `Não foi possível parar a fila: ${data.error}`);
      }
    } catch (err: any) {
      addLog('error', `Erro ao parar a fila: ${err.message}`);
    }
  };

  const handleStatusChange = async (id: string, newStatus: ProductStatus) => {
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setProducts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p))
        );
      }
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setProducts((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete product', err);
    }
  };

  const pendingCount = products.filter((p) => p.status === 'pending').length;
  const publishedCount = products.filter((p) => p.status === 'published').length;

  return (
    <div className="min-h-screen pb-24">
      <Navbar
        totalCount={products.length}
        pendingCount={pendingCount}
        publishedCount={publishedCount}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Actions & Controls Bar */}
        <section className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#EE4D2D]" />
              Painel de Mineração de Vídeos
            </h2>
            <p className="text-xs sm:text-sm text-gray-500">
              Monitore produtos recentes de buscas em alta com pelo menos {MIN_SALES} venda para a Shopee Vídeo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle Headful Mode */}
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-2.5 rounded-xl cursor-pointer transition select-none">
              <input
                type="checkbox"
                checked={headfulMode}
                onChange={(e) => setHeadfulMode(e.target.checked)}
                className="w-4 h-4 rounded text-[#EE4D2D] focus:ring-orange-400"
              />
              <Eye className="w-3.5 h-3.5 text-gray-500" />
              <span>Modo Visível</span>
            </label>

            {/* Login Browser Button */}
            <button
              type="button"
              onClick={handleLaunchSession}
              disabled={isLaunchingSession || isScanning}
              title={
                isShopeeLoggedIn === true
                  ? 'Perfil autenticado (cookie SPC_ST gravado). Clique para abrir o Chrome mesmo assim.'
                  : isShopeeLoggedIn === null
                    ? 'Não foi possível ler o estado agora (o Chrome aberto trava o arquivo de cookies).'
                    : 'Perfil sem login. A varredura funciona, mas alguns termos só aparecem para contas autenticadas.'
              }
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
            >
              <LogIn className="w-4 h-4 text-gray-500" />
              <span>{isLaunchingSession ? 'Abrindo...' : 'Login Shopee'}</span>
              <SessionBadge state={isShopeeLoggedIn} />
            </button>

            {/* Login TikTok Button */}
            <button
              type="button"
              onClick={handleLaunchTikTokSession}
              disabled={isLaunchingTikTok || isScanning}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
            >
              <Video className="w-4 h-4 text-gray-500" />
              <span>{isLaunchingTikTok ? 'Abrindo...' : 'Login TikTok'}</span>
            </button>

            {/* Reset Shopee Profile Button */}
            <button
              type="button"
              onClick={handleResetProfile}
              disabled={isResettingProfile || isScanning}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isResettingProfile ? 'Resetando...' : 'Limpar Perfil'}</span>
            </button>

            {/* Start Scan Button */}
            <button
              type="button"
              onClick={() => handleStartScan()}
              disabled={isScanning || queueRunning}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#EE4D2D] hover:bg-[#D03E1F] text-white text-xs font-bold rounded-xl shadow-md shadow-orange-500/20 transition disabled:opacity-50 active:scale-95"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Varrendo Shopee...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Iniciar Varredura Automática</span>
                </>
              )}
            </button>

            {/* Download Queue Button */}
            <button
              type="button"
              onClick={handleStartDownloadQueue}
              disabled={queueRunning || isScanning}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
            >
              <ListVideo className="w-4 h-4" />
              <span>
                {queueRunning && queue?.kind === 'download'
                  ? `Baixando ${queue.processed}/${queue.total}...`
                  : 'Fila: Baixar Todos os Vídeos'}
              </span>
            </button>

            {/* Send Queue Button */}
            <button
              type="button"
              onClick={handleStartSendQueue}
              disabled={queueRunning || isScanning}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#25D366] hover:bg-[#1eb856] text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>
                {queueRunning && queue?.kind === 'send'
                  ? `Enviando ${queue.processed}/${queue.total}...`
                  : 'Fila: Enviar Todos para o WhatsApp'}
              </span>
            </button>

            {/* Stop Queue Button */}
            {queueRunning && (
              <button
                type="button"
                onClick={handleCancelQueue}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold rounded-xl transition shadow-sm"
              >
                <Square className="w-4 h-4" />
                <span>Parar Fila</span>
              </button>
            )}
          </div>
        </section>

        {/* Trending Searches Chips Section */}
        <section className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                🔥 Buscas em Alta na Shopee:
              </span>
              <span className="text-xs text-gray-500">
                (Clique em um termo para minerar diretamente ou digite abaixo)
              </span>
            </div>

            <div className="flex items-center gap-2 max-w-sm w-full">
              <input
                type="text"
                value={customSearchTerm}
                onChange={(e) => setCustomSearchTerm(e.target.value)}
                placeholder="Ex: Projetor, Mouse Sem Fio..."
                disabled={isScanning}
                className="w-full text-xs bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition"
              />
              {customSearchTerm && (
                <button
                  type="button"
                  onClick={() => handleStartScan(customSearchTerm)}
                  disabled={isScanning}
                  className="px-3 py-2 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded-xl shrink-0 transition"
                >
                  Buscar
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {TRENDING_CHIPS.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  setCustomSearchTerm(term);
                  handleStartScan(term);
                }}
                disabled={isScanning}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-orange-50/70 hover:bg-orange-100/90 text-gray-800 hover:text-[#EE4D2D] border border-orange-200/70 transition font-medium disabled:opacity-50"
              >
                <span>{term}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Filter Tabs & Counter */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
            <span className="text-xs font-semibold text-gray-400 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Filtrar:
            </span>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'pending', label: 'Pendentes' },
              { id: 'published', label: 'Vídeo Publicado' },
              { id: 'discarded', label: 'Descartados' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`text-xs font-medium px-3.5 py-1.5 rounded-lg transition ${
                  statusFilter === tab.id
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={fetchProducts}
            className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1.5 self-end sm:self-auto font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar lista</span>
          </button>
        </section>

        {/* Product Grid */}
        <section>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="bg-white rounded-2xl border border-gray-200 h-80 animate-pulse p-4 space-y-3"
                >
                  <div className="w-full aspect-square bg-gray-100 rounded-xl" />
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-4 bg-gray-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-12 text-center max-w-lg mx-auto space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#EE4D2D] flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-gray-900">
                  Nenhuma oportunidade encontrada
                </h3>
                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                  {statusFilter === 'all'
                    ? 'Clique no botão "Iniciar Varredura" acima para minerar o primeiro produto em alta na Shopee.'
                    : `Não há produtos no status "${statusFilter}".`}
                </p>
              </div>
              {statusFilter === 'all' && (
                <button
                  type="button"
                  onClick={() => handleStartScan()}
                  disabled={isScanning}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#EE4D2D] text-white text-xs font-bold rounded-xl shadow hover:bg-[#D03E1F] transition"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Começar agora</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDeleteProduct}
                  onSearchVideo={handleSearchVideo}
                  onDownloadVideo={handleDownloadVideo}
                  onPipelineVideo={handlePipelineVideo}
                  onSendToWhatsApp={handleSendToWhatsApp}
                  videoProcessing={videoSearchingId === product.id}
                  whatsappSending={whatsappSendingId === product.id}
                  actionsDisabled={queueRunning}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Terminal Drawer for SSE Logs */}
      <TerminalDrawer
        logs={logs}
        isOpen={isDrawerOpen}
        onToggle={() => setIsDrawerOpen(!isDrawerOpen)}
        onClear={clearLogs}
        isScanning={isScanning}
      />
    </div>
  );
}

/**
 * Selo de três estados ao lado do botão "Login Shopee".
 *
 * O estado `null` (não deu para ler) é separado de propósito: com o Chrome aberto o
 * arquivo de cookies fica travado, e mostrar "sem login" ali seria mentira — foi
 * exatamente a confusão que o app vinha causando ("abriu mas não entrei").
 */
function SessionBadge({ state }: { state: boolean | null }) {
  if (state === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">
        Autenticado
      </span>
    );
  }
  if (state === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        Sem login
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
      ...
    </span>
  );
}
