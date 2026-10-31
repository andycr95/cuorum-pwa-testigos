import { MesaData } from '../../services/authService';
import { IconoAlerta } from '../ui/Iconos';

export interface SelectorMesaProps {
  mesas: MesaData[];
  onSelect: (mesaId: string) => void;
  testigoNombre: string;
  onLogout?: () => void;
}

export function SelectorMesa({ mesas, onSelect, testigoNombre, onLogout }: SelectorMesaProps) {
  return (
    <div className="max-w-md mx-auto px-4 py-8 font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-app-fg leading-tight uppercase tracking-tight">
          ¡Hola, {testigoNombre.split(' ')[0]}!
        </h1>
        <p className="text-app-muted text-sm mt-1 font-medium">
          Selecciona la mesa que vas a reportar en este momento:
        </p>
      </div>

      <div className="space-y-4">
        {mesas.map((mesa) => (
          <button
            key={mesa.id}
            type="button"
            onClick={() => onSelect(mesa.id)}
            className="w-full min-h-[48px] text-left bg-app-surface border border-app-line rounded-card p-5 hover:border-editorial-red transition-colors group focus:outline-none focus:ring-2 focus:ring-editorial-red/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs font-bold text-app-muted uppercase tracking-widest mb-1 group-hover:text-app-accent-fg transition-colors">
                  Mesa de Votación
                </p>
                <p className="text-3xl font-bold text-app-fg group-hover:text-app-accent-fg transition-colors tabular-nums">
                  #{mesa.numero}
                </p>
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-semibold text-app-fg truncate">
                    {mesa.puesto?.nombre || 'Puesto no especificado'}
                  </p>
                  <p className="text-xs text-app-muted truncate">
                    {mesa.puesto?.direccion || 'Sin dirección'}
                  </p>
                </div>
              </div>
              
              <div className="ml-4 bg-app-elevated border border-app-line p-3 rounded-btn group-hover:border-editorial-red/40 transition-colors">
                <svg className="w-6 h-6 text-app-muted group-hover:text-app-accent-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            
            {/* Stats rápidos de la mesa */}
            <div className="mt-4 pt-4 border-t border-app-line flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-green-600 dark:bg-green-400 rounded-full"></div>
                <span className="text-xs font-semibold text-app-muted uppercase tracking-wide">
                  {mesa.totalSufragantes} Potenciales
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-app-muted">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-xs font-semibold text-app-muted uppercase tracking-wide">Reporte Pendiente</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {onLogout && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[48px] min-w-[48px] px-6 py-3 text-xs font-bold text-app-fg hover:text-app-accent-fg uppercase tracking-wider rounded-btn border border-app-line bg-app-surface hover:border-editorial-red transition-colors inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-editorial-red/30"
          >
            Cerrar Sesión
          </button>
        </div>
      )}

      <div className="mt-10 p-5 bg-app-elevated rounded-card border border-app-line">
        <p className="text-xs text-app-accent-fg font-bold uppercase tracking-widest text-center flex items-center justify-center gap-1.5">
          <IconoAlerta className="w-4 h-4 text-app-accent-fg" />
          <span>RECUERDA</span>
        </p>
        <p className="text-xs text-app-fg text-center mt-2 leading-relaxed font-medium">
          Solo puedes reportar los datos del acta E-14 una vez haya finalizado el conteo en la mesa.
        </p>
      </div>
    </div>
  );
}
