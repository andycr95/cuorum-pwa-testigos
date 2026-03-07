import { useState } from 'react';
import { usePendingSync } from '../../hooks/usePendingSync';

export function PendingSyncBadge() {
  const { pendingCount, breakdown } = usePendingSync();
  const [showPopover, setShowPopover] = useState(false);

  if (pendingCount === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPopover(p => !p)}
        className="relative p-2 hover:bg-white/10 rounded-lg transition-colors"
        title={`${pendingCount} pendiente(s) de sincronizar`}
      >
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-amber-400 text-red-950 text-[10px] font-black rounded-full flex items-center justify-center px-1 ring-2 ring-red-900">
          {pendingCount > 99 ? '99+' : pendingCount}
        </span>
      </button>

      {showPopover && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setShowPopover(false)} />
          <div className="absolute right-0 top-full mt-2 z-[61] bg-white rounded-xl shadow-2xl border border-gray-200 p-3 min-w-[180px]">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Pendientes de sync</p>
            {breakdown.resultados > 0 && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-gray-600">Resultados</span>
                <span className="text-xs font-black text-gray-900">{breakdown.resultados}</span>
              </div>
            )}
            {breakdown.ocrJobs > 0 && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-gray-600">Fotos OCR</span>
                <span className="text-xs font-black text-gray-900">{breakdown.ocrJobs}</span>
              </div>
            )}
            <div className="border-t border-gray-100 mt-1.5 pt-1.5 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">Total</span>
              <span className="text-xs font-black text-editorial-red">{pendingCount}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
