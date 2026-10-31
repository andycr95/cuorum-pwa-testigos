import { useState, useEffect } from 'react';
import { getEstadoSync, sincronizar } from '../../services/syncService';

/**
 * SyncStatus - Indicador de estado de sincronización
 * Muestra items pendientes y permite sync manual
 */

interface SyncState {
  online: boolean;
  syncEnProgreso: boolean;
  pendientes: { resultados: number; fotos: number; total: number };
}

export function SyncStatus() {
  const [estado, setEstado] = useState<SyncState>({
    online: navigator.onLine,
    syncEnProgreso: false,
    pendientes: { resultados: 0, fotos: 0, total: 0 },
  });
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    const actualizar = async () => {
      const e = await getEstadoSync();
      setEstado(e);
    };

    actualizar();
    const interval = setInterval(actualizar, 5000);

    const handleOnline = () => setEstado(prev => ({ ...prev, online: true }));
    const handleOffline = () => setEstado(prev => ({ ...prev, online: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSyncManual = async () => {
    const result = await sincronizar();
    if (result.success) {
      setLastSync(new Date().toLocaleTimeString('es-CO'));
    }
    const e = await getEstadoSync();
    setEstado(e);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-app-surface text-app-fg border-t border-app-line px-4 py-2 font-sans">
      <div className="flex items-center justify-between max-w-md mx-auto">
        {/* Estado de conexión */}
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${
            estado.online ? 'bg-green-600 dark:bg-green-400' : 'bg-editorial-red animate-pulse'
          }`} />
          <span className="text-sm font-medium text-app-fg">
            {estado.online ? 'En línea' : 'Sin conexión'}
          </span>
        </div>

        {/* Pendientes */}
        {estado.pendientes.total > 0 && (
          <span className="px-2 py-0.5 bg-warn-50 text-warn-700 dark:bg-[#451A03] dark:text-[#FCD34D] text-xs rounded-full font-medium">
            {estado.pendientes.total} pendiente{estado.pendientes.total !== 1 ? 's' : ''}
          </span>
        )}

        {/* Botón sync */}
        <button
          onClick={handleSyncManual}
          disabled={!estado.online || estado.syncEnProgreso || estado.pendientes.total === 0}
          className="min-h-[44px] px-3 py-1.5 text-xs font-bold bg-editorial-red hover:bg-brand-700 text-white rounded-btn disabled:opacity-40"
        >
          {estado.syncEnProgreso ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      </div>

      {lastSync && (
        <p className="text-center text-xs text-app-muted mt-1">
          Última sincronización: {lastSync}
        </p>
      )}
    </div>
  );
}
