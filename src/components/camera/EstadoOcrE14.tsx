import type { CuorumDB } from '../../db/indexeddb';

type OcrJobEntry = CuorumDB['e14OcrJobs']['value'];

interface EstadoOcrE14Props {
  jobs: OcrJobEntry[];
  onRetry?: () => void;
  onSync?: () => void;
  syncing?: boolean;
}

const ESTADO_CONFIG = {
  PENDIENTE: {
    label: 'En cola (sin conexión)',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    spinning: false,
    pulse: false,
  },
  SUBIENDO: {
    label: 'Subiendo fotos al servidor...',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    spinning: true,
    pulse: true,
  },
  PROCESANDO: {
    label: 'Analizando con IA...',
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    spinning: true,
    pulse: true,
  },
  COMPLETADO: {
    label: 'Acta procesada correctamente',
    color: 'bg-green-50 text-green-700 border-green-200',
    spinning: false,
    pulse: false,
  },
  ERROR: {
    label: 'Error al procesar',
    color: 'bg-red-50 text-red-700 border-red-200',
    spinning: false,
    pulse: false,
  },
};

export function EstadoOcrE14({ jobs, onRetry, onSync, syncing = false }: EstadoOcrE14Props) {
  if (jobs.length === 0) return null;

  const pendientes = jobs.filter(j => j.estado === 'PENDIENTE' || j.estado === 'ERROR').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-editorial-red rounded-full" />
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Envios OCR ({jobs.length})
          </p>
        </div>
        {pendientes > 0 && onSync && (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-editorial-red text-white text-xs font-bold rounded-lg disabled:opacity-50 active:scale-95 transition-all"
          >
            {syncing ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>↑</span>
            )}
            {syncing ? 'Sincronizando...' : `Sincronizar (${pendientes})`}
          </button>
        )}
      </div>

      {jobs.map(job => {
        const cfg = ESTADO_CONFIG[job.estado];
        return (
          <div
            key={job.id}
            className={`border rounded-xl px-3 py-2.5 flex items-center justify-between transition-all ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`}
          >
            <div className="flex items-center gap-2.5">
              {cfg.spinning ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
              ) : job.estado === 'COMPLETADO' ? (
                <span className="text-base flex-shrink-0">✓</span>
              ) : job.estado === 'ERROR' ? (
                <span className="text-base flex-shrink-0">!</span>
              ) : (
                <span className="text-base flex-shrink-0">·</span>
              )}
              <div>
                <p className="text-xs font-bold leading-tight">{cfg.label}</p>
                <p className="text-[10px] opacity-70 mt-0.5">
                  {job.fotos.length} foto{job.fotos.length !== 1 ? 's' : ''} · {new Date(job.capturedAt).toLocaleTimeString()}
                </p>
                {job.estado === 'ERROR' && job.lastSyncError && (
                  <p className="text-[10px] text-red-600 font-medium mt-0.5 leading-tight">
                    {job.lastSyncError}
                  </p>
                )}
              </div>
            </div>
            {job.estado === 'ERROR' && onRetry && (
              <button type="button" onClick={onRetry} className="text-xs font-bold underline flex-shrink-0 ml-2">
                Reintentar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
