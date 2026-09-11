'use client';

import React from 'react';
import { ShoppingBag, Video, Sparkles } from 'lucide-react';

interface NavbarProps {
  totalCount: number;
  pendingCount: number;
  publishedCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  totalCount,
  pendingCount,
  publishedCount,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#EE4D2D] to-orange-400 flex items-center justify-center shadow-md shadow-orange-500/20 text-white">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-gray-900 text-lg leading-tight">
                Shopee Video Finder
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-orange-100 text-[#EE4D2D] border border-orange-200">
                Afiliados
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Mineração de oportunidades em alta na Shopee
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg font-medium">
              Total: <strong>{totalCount}</strong>
            </span>
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-medium flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Pendentes: <strong>{pendingCount}</strong>
            </span>
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-medium flex items-center gap-1">
              <Video className="w-3.5 h-3.5" /> Publicados: <strong>{publishedCount}</strong>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
