import { useState, useEffect } from 'react';
import { jornadaService, ProgresoElecciones as ProgresoData } from '../../services/jornadaService';
import { getResultadosByMesa } from '../../db/indexeddb';

interface Props {
  mesaId: string;
  elecciones: Array<{ id: string; nombre: string }>;
  eleccionActual: string;
  onSelectEleccion: (id: string) => void;
  refreshTrigger?: number;
}

export function ProgresoElecciones({
  mesaId,
  elecciones,
  eleccionActual,
  onSelectEleccion,
  refreshTrigger,
}: Props) {
  const [progreso, setProgreso] = useState<ProgresoData | null>(null);
  const [localReportadas, setLocalReportadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const fetchProgreso = async () => {
      // Try server first
      try {
        const data = await jornadaService.getProgreso(mesaId);
        if (!cancelled) setProgreso(data);
        return;
      } catch {
        // Offline — calculate from IDB
      }

      // Fallback: check IDB for which elections have results
      try {
        const locales = await getResultadosByMesa(mesaId);
        const reported = new Set<string>();
        for (const r of locales) {
          if (r.eleccionId) reported.add(r.eleccionId);
        }
        if (!cancelled) setLocalReportadas(reported);
      } catch {
        // IDB failed — no data
      }
    };

    fetchProgreso();
    return () => { cancelled = true; };
  }, [mesaId, refreshTrigger]);

  // Determine reported status per election
  const getReportado = (eleccionId: string): boolean => {
    if (progreso) {
      const e = progreso.elecciones.find((el) => el.id === eleccionId);
      return e?.reportado ?? false;
    }
    return localReportadas.has(eleccionId);
  };

  const reportadas = elecciones.filter((e) => getReportado(e.id)).length;
  const total = elecciones.length;
  const porcentaje = total > 0 ? Math.round((reportadas / total) * 100) : 0;

  return (
    <div className="mb-5">
      {/* Progress Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest" style={{ letterSpacing: '0.15em' }}>
          Progreso
        </p>
        <p className="text-xs font-bold text-gray-600">
          {reportadas} de {total} elecciones reportadas
        </p>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-editorial-red rounded-full transition-all duration-500 ease-out"
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      {/* Election Chips */}
      <div className="flex flex-wrap gap-2">
        {elecciones.map((eleccion) => {
          const reported = getReportado(eleccion.id);
          const isActive = eleccion.id === eleccionActual;

          return (
            <button
              key={eleccion.id}
              type="button"
              onClick={() => onSelectEleccion(eleccion.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
                isActive
                  ? 'bg-editorial-red text-white shadow-md shadow-red-200'
                  : reported
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-gray-100 text-gray-500 border border-gray-200'
              }`}
            >
              {reported ? (
                <svg className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-green-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className={`w-3.5 h-3.5 rounded-full border-2 ${
                  isActive ? 'border-white' : 'border-gray-300'
                }`} />
              )}
              <span className="truncate max-w-[100px]">
                {eleccion.nombre}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
