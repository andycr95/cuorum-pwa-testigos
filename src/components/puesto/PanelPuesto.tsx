import { useCallback, useEffect, useState } from 'react';
import type { TestigoData } from '../../services/authService';
import {
  puestoService,
  type EstadoJornada,
  type MesaDelPuesto,
  type MesasDelPuesto,
} from '../../services/puestoService';
import { ControlTema } from '../ui/ControlTema';
import { EstadoVacio } from '../ui/EstadoVacio';

/** Cada cuánto se refresca el estado de las mesas con la app abierta y con red. */
export const INTERVALO_REFRESCO_PUESTO_MS = 60_000;

const ESTADOS: Record<EstadoJornada | 'SIN_JORNADA', { texto: string; clase: string }> = {
  SIN_JORNADA: { texto: 'Sin jornada', clase: 'bg-app-elevated text-app-muted border border-app-line' },
  PENDIENTE: { texto: 'Sin llegar', clase: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30' },
  CHECKIN: { texto: 'En el puesto', clase: 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-500/30' },
  ABIERTA: { texto: 'Mesa abierta', clase: 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-500/30' },
  EN_CONTEO: { texto: 'En conteo', clase: 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-500/30' },
  CERRADA: { texto: 'Cerrada', clase: 'bg-green-500/10 text-green-800 dark:text-green-300 border border-green-500/30' },
  FIRMADA: { texto: 'Firmada', clase: 'bg-green-500/10 text-green-800 dark:text-green-300 border border-green-500/30' },
};

const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—';

function Estado({ estado }: { estado: EstadoJornada | undefined }) {
  const { texto, clase } = ESTADOS[estado ?? 'SIN_JORNADA'];
  return <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${clase}`}>{texto}</span>;
}

interface Props {
  testigoData: TestigoData;
  onLogout: () => void;
}

/**
 * Vista del coordinador de puesto (CUO-4047): solo lectura de las mesas de su puesto. No hay check-in,
 * formulario ni cierre: el coordinador vigila, los titulares reportan.
 */
export function PanelPuesto({ testigoData, onLogout }: Props) {
  const [datos, setDatos] = useState<MesasDelPuesto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mesaId, setMesaId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<MesaDelPuesto | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await puestoService.mesas());
      setError(null);
    } catch {
      setError('No se pudo cargar el estado de las mesas. Revisa tu conexión.');
    }
  }, []);

  useEffect(() => {
    void cargar();
    const refrescar = () => {
      if (document.visibilityState !== 'hidden' && navigator.onLine !== false) void cargar();
    };
    const intervalo = window.setInterval(refrescar, INTERVALO_REFRESCO_PUESTO_MS);
    window.addEventListener('online', refrescar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('online', refrescar);
    };
  }, [cargar]);

  useEffect(() => {
    if (!mesaId) { setDetalle(null); return; }
    let cancelado = false;
    puestoService.mesa(mesaId)
      .then((d) => { if (!cancelado) setDetalle(d); })
      .catch(() => { if (!cancelado) setError('No se pudo cargar la mesa. Revisa tu conexión.'); });
    return () => { cancelado = true; };
  }, [mesaId]);

  const puesto = datos?.puesto ?? testigoData.puesto ?? null;

  return (
    <div className="min-h-screen bg-app-canvas text-app-fg font-sans" data-testid="panel-puesto">
      <header className="sticky top-0 z-50 bg-app-surface border-b border-app-line px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2 min-h-[48px]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 bg-white border border-app-line rounded-btn flex items-center justify-center">
              <img src="/logo.svg" alt="Cuorum" className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-app-fg font-bold text-base leading-tight">Coordinación de puesto</h1>
              <p className="text-xs font-semibold text-app-muted truncate">{puesto?.nombre ?? 'Tu puesto'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[48px] min-w-[48px] px-3 py-2 text-app-fg hover:bg-app-elevated text-xs font-bold uppercase tracking-wider rounded-btn border border-app-line transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-editorial-red/40"
            aria-label="Cerrar sesión"
          >
            Cerrar sesión
          </button>
        </div>
        <div className="max-w-md mx-auto mt-2.5 pt-2.5 border-t border-app-line flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-app-muted">Tema</span>
          <ControlTema />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-3">
        <p className="text-sm text-app-muted">
          {testigoData.testigo.nombres} {testigoData.testigo.apellidos} · Solo lectura: los testigos de cada mesa reportan.
        </p>

        {error && (
          <p role="alert" className="text-sm font-semibold text-app-accent-fg bg-editorial-red/10 border border-editorial-red/30 rounded-card p-3">
            {error}
          </p>
        )}

        {mesaId && detalle ? (
          <section data-testid="detalle-mesa-puesto" className="bg-app-surface border border-app-line rounded-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-black">Mesa #{detalle.mesa.numero}</h2>
              <Estado estado={detalle.jornada?.estado} />
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-app-muted">Llegada</dt><dd>{hora(detalle.jornada?.checkinAt)}</dd>
              <dt className="text-app-muted">Apertura</dt><dd>{hora(detalle.jornada?.aperturaAt)}</dd>
              <dt className="text-app-muted">Cierre</dt><dd>{hora(detalle.jornada?.cierreAt)}</dd>
              <dt className="text-app-muted">Firma</dt><dd>{hora(detalle.jornada?.firmadoAt)}</dd>
            </dl>
            <h3 className="text-sm font-bold">Resultados enviados</h3>
            {detalle.resultados.length === 0 ? (
              <p className="text-sm text-app-muted">Aún no hay resultados de esta mesa.</p>
            ) : (
              <ul className="divide-y divide-app-line text-sm">
                {detalle.resultados.map((r) => (
                  <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{r.candidato}{r.partido ? ` · ${r.partido}` : ''}</span>
                    <span className="font-bold tabular-nums">{r.votos}</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setMesaId(null)}
              className="w-full min-h-[48px] rounded-btn border border-app-line font-bold text-sm hover:bg-app-elevated"
            >
              Volver a las mesas
            </button>
          </section>
        ) : !datos && !error ? (
          <p className="text-sm font-semibold text-app-muted">Cargando mesas…</p>
        ) : datos && datos.mesas.length === 0 ? (
          <EstadoVacio
            titulo="Tu puesto no tiene mesas"
            mensaje="Cuando la campaña cargue las mesas del puesto, aparecerán aquí."
            accionPrincipal={{ texto: 'Actualizar', onClick: () => void cargar() }}
          />
        ) : datos ? (
          <ul className="space-y-2" aria-label="Mesas del puesto">
            {datos.mesas.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  data-testid={`mesa-puesto-${m.id}`}
                  onClick={() => setMesaId(m.id)}
                  className="w-full min-h-[48px] text-left bg-app-surface border border-app-line rounded-card p-3 hover:bg-app-elevated focus:outline-none focus:ring-2 focus:ring-editorial-red/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black tabular-nums">Mesa #{m.numero}</span>
                    <Estado estado={m.jornada?.estado} />
                  </div>
                  <p className="mt-1 text-xs text-app-muted">
                    {m.tieneTitular ? 'Con testigo' : 'Sin testigo asignado'} · {m.resultadosEnviados} resultados
                    {m.ultimoResultadoAt ? ` · último ${hora(m.ultimoResultadoAt)}` : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
