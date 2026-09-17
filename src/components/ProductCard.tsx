'use client';

import React, { useState } from 'react';
import { ExternalLink, Copy, Check, TrendingUp, Tag, Trash2, Video, Loader2, Download } from 'lucide-react';
import { Product, ProductStatus } from '@/types/product';

interface ProductCardProps {
  product: Product;
  onStatusChange: (id: string, newStatus: ProductStatus) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onSearchVideo?: (id: string) => Promise<void>;
  onDownloadVideo?: (id: string) => Promise<void>;
  onPipelineVideo?: (id: string) => Promise<void>;
  videoProcessing?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onStatusChange,
  onDelete,
  onSearchVideo,
  onDownloadVideo,
  onPipelineVideo,
  videoProcessing,
}) => {
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [imgError, setImgError] = useState(false);

  const searching = Boolean(videoProcessing);
  const videoAvailable = product.videoStatus === 'downloaded' && product.videoPath;
  const canSearch = onSearchVideo && (!product.tikTokUrl && product.videoStatus === 'none');
  const canDownload = onDownloadVideo && product.tikTokUrl && !videoAvailable && product.videoStatus !== 'failed';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(product.productUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link', err);
    }
  };

  const handleStatusSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as ProductStatus;
    setUpdating(true);
    try {
      await onStatusChange(product.id, newStatus);
    } finally {
      setUpdating(false);
    }
  };

  const statusConfig = {
    pending: {
      label: 'Pendente',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
    },
    published: {
      label: 'Vídeo Publicado',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
    },
    discarded: {
      label: 'Descartado',
      bg: 'bg-gray-100',
      text: 'text-gray-600',
      border: 'border-gray-200',
    },
  };

  const currentConfig = statusConfig[product.status] || statusConfig.pending;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition duration-200 overflow-hidden flex flex-col justify-between group">
      <div>
        {/* Card Header with Image */}
        <div className="relative aspect-square w-full bg-gray-100 overflow-hidden">
          {product.imageUrl && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-4 text-center">
              <TrendingUp className="w-10 h-10 mb-2 stroke-1 text-gray-300" />
              <span className="text-xs">Foto indisponível</span>
            </div>
          )}

          {/* Sales badge overlay */}
          <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
            <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
            <span>{product.salesCount} vendas</span>
          </div>

          {/* Status badge overlay */}
          <div className="absolute top-3 right-3">
            <span
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border shadow-sm ${currentConfig.bg} ${currentConfig.text} ${currentConfig.border}`}
            >
              {currentConfig.label}
            </span>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-4 space-y-3">
          {product.searchTerm && (
            <div className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
              <Tag className="w-3 h-3 text-[#EE4D2D]" />
              <span className="truncate">Busca em alta: <strong>{product.searchTerm}</strong></span>
            </div>
          )}

          <h3
            className="font-medium text-gray-900 text-sm line-clamp-2 leading-snug group-hover:text-[#EE4D2D] transition-colors"
            title={product.title}
          >
            {product.title}
          </h3>

          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-[#EE4D2D]">
              {product.price.startsWith('R$') ? product.price : `R$ ${product.price}`}
            </span>
          </div>
        </div>
      </div>

      {/* Card Footer & Actions */}
      <div className="p-4 pt-0 border-t border-gray-100 bg-gray-50/50 flex flex-col gap-2.5">
        {/* Status Dropdown */}
        <div className="flex items-center justify-between gap-2 pt-3">
          <label className="text-xs font-medium text-gray-500">Status:</label>
          <select
            value={product.status}
            onChange={handleStatusSelect}
            disabled={updating}
            className="text-xs font-medium bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-700"
          >
            <option value="pending">Pendente</option>
            <option value="published">Vídeo Publicado</option>
            <option value="discarded">Descartado</option>
          </select>
        </div>

        {/* Video Status Badge */}
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-gray-500">Vídeo:</label>
          <span
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
              product.videoStatus === 'downloaded'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : product.videoStatus === 'searched'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : product.videoStatus === 'failed'
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-gray-100 text-gray-500 border-gray-200'
            }`}
          >
            {product.videoStatus === 'downloaded' && 'Baixado'}
            {product.videoStatus === 'searched' && 'Pesquisado'}
            {product.videoStatus === 'failed' && 'Falhou'}
            {product.videoStatus === 'none' && 'Sem vídeo'}
          </span>
        </div>

        {/* Buttons */}
        <div className="space-y-2">
          {onPipelineVideo && onSearchVideo && onDownloadVideo && (
            <>
              {videoAvailable ? (
                <>
                  <a
                    href={`/api/video/file?id=${product.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 w-full text-xs font-semibold py-2 px-2.5 bg-black hover:bg-gray-800 text-white rounded-xl transition shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar / ver vídeo</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                  <video
                    src={`/api/video/file?id=${product.id}`}
                    controls
                    muted
                    playsInline
                    className="w-full max-h-44 rounded-xl bg-gray-900 border border-gray-200"
                  />
                </>
              ) : product.tikTokUrl ? (
                <button
                  type="button"
                  onClick={() => onDownloadVideo(product.id)}
                  disabled={searching}
                  className="inline-flex items-center justify-center gap-1.5 w-full text-xs font-semibold py-2 px-2.5 bg-[#EE4D2D] hover:bg-[#D03E1F] text-white rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {searching ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Baixando...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>{product.videoStatus === 'failed' ? 'Tentar baixar novamente' : 'Baixar vídeo (HD)'}</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onPipelineVideo(product.id)}
                  disabled={searching}
                  className="inline-flex items-center justify-center gap-1.5 w-full text-xs font-semibold py-2 px-2.5 bg-black hover:bg-gray-800 text-white rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {searching ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Buscando e baixando...</span>
                    </>
                  ) : (
                    <>
                      <Video className="w-3.5 h-3.5" />
                      <span>Buscar e Baixar Vídeo</span>
                    </>
                  )}
                </button>
              )}
            </>
          )}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-2.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl transition shadow-sm"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600" />
                <span className="text-green-600 font-semibold">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-gray-500" />
                <span>Copiar</span>
              </>
            )}
          </button>

          <a
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1 text-xs font-medium py-2 px-2.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#EE4D2D] rounded-xl transition shadow-sm font-semibold"
          >
            <span>Shopee</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(product.id)}
              className="p-2 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 text-gray-400 hover:text-red-500 rounded-xl transition shadow-sm"
              title="Excluir produto"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};
