import type { CuorumDB } from '../../db/indexeddb';

type OcrJobEntry = CuorumDB['e14OcrJobs']['value'];

interface EstadoOcrE14Props {
  jobs: OcrJobEntry[];
  onRetry?: () => void;
}

const ESTADO_CONFIG = {
  PENDIENTE: { label: 'En cola (sin conexion)', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: '...' },
  SUBIENDO: { label: 'Subiendo fotos...', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '>>' },
  PROCESANDO: { label: 'Procesando con IA...', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '*' },
  COMPLETADO: { label: 'Acta procesada', color: 'bg-green-100 text-green-700 border-green-200', icon: 'OK' },
  ERROR: { label: 'Error al procesar', color: 'bg-red-100 text-red-700 border-red-200', icon: '!!' },
};

export function EstadoOcrE14({ jobs, onRetry }: EstadoOcrE14Props) {
  if (jobs.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-editorial-red rounded-full" />
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Envios OCR anteriores
        </p>
      </div>
      {jobs.map(job => {
        const cfg = ESTADO_CONFIG[job.estado];
        return (
          <div key={job.id} className={`border rounded-xl px-3 py-2.5 flex items-center justify-between ${cfg.color}`}>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs">[{cfg.icon}]</span>
              <div>
                <p className="text-xs font-bold">{cfg.label}</p>
                <p className="text-[10px] opacity-70">{job.fotos.length} foto{job.fotos.length !== 1 ? 's' : ''} · {new Date(job.capturedAt).toLocaleTimeString()}</p>
              </div>
            </div>
            {job.estado === 'ERROR' && onRetry && (
              <button type="button" onClick={onRetry} className="text-xs font-bold underline">
                Reintentar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
