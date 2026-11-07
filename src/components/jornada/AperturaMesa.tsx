import { useState, type ReactNode } from 'react';
import { jornadaService, JornadaMesa } from '../../services/jornadaService';
import { guardarJornada, getJornadaByMesa, obtenerSesionActivaLocal } from '../../db/indexeddb';

interface Props {
  mesaId: string;
  mesaNumero: number;
  onAperturaComplete: (jornada: JornadaMesa) => void;
}

interface ChecklistItem {
  key: string;
  label: string;
  icon: ReactNode;
  required: boolean;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    key: 'urnaVacia',
    label: 'Urna vacia y sellada',
    required: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    key: 'tarjetones',
    label: 'Tarjetones completos',
    required: false,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    key: 'actaBlanco',
    label: 'Acta E-14 en blanco',
    required: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    key: 'juradosCompletos',
    label: '3 jurados presentes',
    required: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    key: 'tintaIndeleble',
    label: 'Tinta indeleble disponible',
    required: false,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
  {
    key: 'materialesCompletos',
    label: 'Kit de materiales completo',
    required: false,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    ),
  },
];

export function AperturaMesa({ mesaId, mesaNumero, onAperturaComplete }: Props) {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    urnaVacia: false,
    tarjetones: false,
    actaBlanco: false,
    juradosCompletos: false,
    tintaIndeleble: false,
    materialesCompletos: false,
  });
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const toggleItem = (key: string) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const requiredMet =
    checklist.urnaVacia && checklist.actaBlanco && checklist.juradosCompletos;

  const handleApertura = async () => {
    if (!requiredMet) return;
    setLoading(true);
    setError(null);

    try {
      const jornada = await jornadaService.apertura(
        mesaId,
        checklist,
        observaciones || undefined,
      );

      await guardarJornada({
        ...jornada,
        synced: 1,
        updatedAt: new Date().toISOString(),
      });

      setShowSuccess(true);
      setTimeout(() => onAperturaComplete(jornada), 1200);
    } catch {
      // Offline fallback
      const prev = await getJornadaByMesa(mesaId).catch(() => undefined);
      const sesion = obtenerSesionActivaLocal();
      const localJornada: JornadaMesa = {
        ...prev,
        id: prev?.id || `local_apertura_${Date.now()}`,
        mesaId,
        testigoId: prev?.testigoId || sesion?.testigoId || '',
        campanaId: prev?.campanaId || sesion?.campanaId || '',
        estado: 'ABIERTA',
        aperturaAt: new Date().toISOString(),
        aperturaChecklist: checklist,
        aperturaObservaciones: observaciones || undefined,
      };

      try {
        await guardarJornada({
          ...localJornada,
          synced: 0,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // IDB failed — continue anyway
      }

      setShowSuccess(true);
      setTimeout(() => onAperturaComplete(localJornada), 1200);
    }
  };

  if (showSuccess) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center bg-app-surface border border-app-line rounded-card p-8">
          <div className="w-24 h-24 mx-auto mb-6 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center animate-[scaleIn_0.3s_ease-out]">
            <svg className="w-12 h-12 text-green-800 dark:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xl font-black text-app-fg">Mesa abierta</p>
          <p className="text-sm text-app-muted mt-2">Iniciando reporte de resultados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="bg-app-surface text-app-fg rounded-card overflow-hidden border border-app-line">
        {/* Header */}
        <div className="bg-app-elevated px-6 py-6 border-b border-app-line">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-editorial-red/10 rounded-btn flex items-center justify-center">
              <svg className="w-6 h-6 text-app-accent-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-black text-app-fg">
                Apertura de Mesa #{mesaNumero}
              </h2>
              <p className="text-xs text-app-muted font-medium">
                Verifica las condiciones de la mesa
              </p>
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div className="px-6 py-5 space-y-3">
          {CHECKLIST_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => toggleItem(item.key)}
              className={`w-full flex items-center gap-4 p-4 rounded-card border transition-all active:scale-[0.98] min-h-[48px] ${
                checklist[item.key]
                  ? 'bg-green-500/10 border-green-500/40'
                  : 'bg-app-elevated border-app-line hover:bg-app-canvas'
              }`}
            >
              {/* Toggle */}
              <div
                className={`w-7 h-7 rounded-btn flex items-center justify-center flex-shrink-0 transition-all ${
                  checklist[item.key]
                    ? 'bg-green-700 text-white'
                    : 'bg-app-surface border border-app-line text-app-muted'
                }`}
              >
                {checklist[item.key] ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className={checklist[item.key] ? 'text-white' : 'text-app-muted'}>{item.icon}</span>
                )}
              </div>

              {/* Label */}
              <div className="flex-1 text-left">
                <p className={`text-sm font-bold ${
                  checklist[item.key] ? 'text-green-800 dark:text-green-300' : 'text-app-fg'
                }`}>
                  {item.label}
                </p>
                {item.required && !checklist[item.key] && (
                  <p className="text-xs text-app-accent-fg font-bold uppercase tracking-wider mt-0.5">
                    Requerido
                  </p>
                )}
              </div>

              {/* Icon */}
              <span className={checklist[item.key] ? 'text-green-800 dark:text-green-300' : 'text-app-muted'}>
                {item.icon}
              </span>
            </button>
          ))}

          {/* Observaciones */}
          <div className="pt-3">
            <label htmlFor="observaciones-apertura" className="block text-xs font-black text-app-muted uppercase tracking-widest mb-2" style={{ letterSpacing: '0.15em' }}>
              Observaciones (opcional)
            </label>
            <textarea id="observaciones-apertura"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value.slice(0, 500))}
              placeholder="Notas adicionales sobre el estado de la mesa..."
              rows={3}
              className="w-full px-4 py-3 rounded-card border border-app-line bg-app-elevated text-app-fg placeholder:text-app-muted text-sm focus:border-editorial-red focus:outline-none resize-none"
            />
            <p className="text-xs text-app-muted text-right mt-1">{observaciones.length}/500</p>
          </div>

          {error && (
            <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-card p-3">
              <p className="text-xs text-red-800 dark:text-red-300 font-medium">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleApertura}
            disabled={!requiredMet || loading}
            className={`relative w-full overflow-hidden rounded-btn py-5 font-black uppercase tracking-widest text-base transition-all min-h-[48px] ${
              requiredMet
                ? 'bg-editorial-red hover:bg-red-700 text-white active:scale-[0.97]'
                : 'bg-app-elevated border border-app-line text-app-muted cursor-not-allowed'
            } disabled:opacity-70 disabled:cursor-not-allowed`}
            style={{ letterSpacing: '0.1em' }}
          >
            <span className="relative flex items-center justify-center gap-3">
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Registrando apertura...</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span>Confirmar apertura</span>
                </>
              )}
            </span>
          </button>

          {!requiredMet && (
            <p className="text-center text-xs text-app-muted font-medium">Completa los items requeridos para continuar</p>
          )}
        </div>
      </div>
    </div>
  );
}
