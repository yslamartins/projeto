'use client';

import React, { useState } from 'react';
import { ExternalLink, Copy, Check, TrendingUp, Tag, Trash2 } from 'lucide-react';
import { Product, ProductStatus } from '@/types/product';

interface ProductCardProps {
  product: Product;
  onStatusChange: (id: string, newStatus: ProductStatus) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onStatusChange,
  onDelete,
}) => {
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [imgError, setImgError] = useState(false);

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

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-3 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl transition shadow-sm"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600" />
                <span className="text-green-600 font-semibold">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-gray-500" />
                <span>Copiar Link</span>
              </>
            )}
          </button>

          <a
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#EE4D2D] rounded-xl transition shadow-sm font-semibold"
          >
            <span>Ver Shopee</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
