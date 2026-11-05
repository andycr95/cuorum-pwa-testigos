import { useState } from 'react';
import { jornadaService, JornadaMesa } from '../../services/jornadaService';
import { guardarJornada } from '../../db/indexeddb';
import { MesaData } from '../../services/authService';

interface Props {
  mesaData: MesaData;
  testigoId: string;
  campanaId: string;
  onCheckinComplete: (jornada: JornadaMesa) => void;
}

export function CheckinTestigo({ mesaData, testigoId, campanaId, onCheckinComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'getting' | 'denied' | 'done'>('idle');
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckin = async () => {
    setLoading(true);
    setError(null);
    setGpsStatus('getting');

    let lat = 0;
    let lng = 0;

    // Intentar obtener GPS
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      setGpsStatus('done');
    } catch {
      // GPS denied or failed — proceed with 0,0
      setGpsStatus('denied');
    }

    // Intentar enviar al servidor
    try {
      const jornada = await jornadaService.checkin(mesaData.id, lat, lng);

      // Guardar en IDB
      await guardarJornada({
        ...jornada,
        synced: 1,
        updatedAt: new Date().toISOString(),
      });

      setShowSuccess(true);
      setTimeout(() => onCheckinComplete(jornada), 1200);
    } catch {
      // Offline fallback — guardar localmente
      const localJornada: JornadaMesa = {
        id: `local_${mesaData.id}_${Date.now()}`,
        mesaId: mesaData.id,
        testigoId,
        campanaId,
        estado: 'CHECKIN',
        checkinAt: new Date().toISOString(),
        checkinLat: lat,
        checkinLng: lng,
      };

      try {
        await guardarJornada({
          ...localJornada,
          synced: 0,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // IDB failed too — continue anyway
      }

      setShowSuccess(true);
      setTimeout(() => onCheckinComplete(localJornada), 1200);
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
          <p className="text-xl font-black text-app-fg">Llegada confirmada</p>
          <p className="text-sm text-app-muted mt-2">Continuando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="bg-app-surface text-app-fg rounded-card overflow-hidden border border-app-line">
        {/* Header */}
        <div className="bg-app-elevated px-6 py-8 text-center border-b border-app-line">
          {/* Map Pin Icon */}
          <div className="w-20 h-20 mx-auto mb-6 bg-editorial-red/10 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-app-accent-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>

          <h2 className="text-2xl font-black text-app-fg mb-2">
            Confirma tu presencia
          </h2>
          <p className="text-sm text-app-muted font-medium">
            Registra tu llegada al puesto de votacion
          </p>
        </div>

        {/* Puesto Info */}
        <div className="px-6 py-5">
          {mesaData.puesto && (
            <div className="bg-app-elevated rounded-card p-4 mb-6 border border-app-line">
              <p className="text-xs font-black text-app-muted uppercase tracking-widest mb-1" style={{ letterSpacing: '0.15em' }}>
                Puesto de votacion
              </p>
              <p className="text-base font-black text-app-fg">
                {mesaData.puesto.nombre}
              </p>
              <p className="text-sm text-app-muted mt-1">
                {mesaData.puesto.direccion}
              </p>
            </div>
          )}

          <div className="bg-app-elevated rounded-card p-4 mb-6 border border-app-line">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-app-muted uppercase tracking-widest" style={{ letterSpacing: '0.15em' }}>
                  Mesa asignada
                </p>
                <p className="text-3xl font-black text-app-fg mt-1">
                  #{mesaData.numero}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-app-muted uppercase tracking-widest" style={{ letterSpacing: '0.15em' }}>
                  Sufragantes
                </p>
                <p className="text-3xl font-black text-app-accent-fg mt-1">
                  {mesaData.totalSufragantes}
                </p>
              </div>
            </div>
          </div>

          {/* GPS Status */}
          {gpsStatus === 'denied' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-card p-3 mb-4">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-800 dark:text-amber-300 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                  No se pudo obtener la ubicacion GPS. El check-in continuara sin coordenadas.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-card p-3 mb-4">
              <p className="text-xs text-red-800 dark:text-red-300 font-medium">{error}</p>
            </div>
          )}

          {/* Checkin Button */}
          <button
            onClick={handleCheckin}
            disabled={loading}
            className="relative w-full overflow-hidden rounded-btn py-5 font-black text-white uppercase tracking-widest text-base transition-all bg-editorial-red hover:bg-red-700 active:scale-[0.97] disabled:opacity-70 disabled:cursor-not-allowed min-h-[48px]"
            style={{ letterSpacing: '0.1em' }}
          >
            <span className="relative flex items-center justify-center gap-3">
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{gpsStatus === 'getting' ? 'Obteniendo ubicacion...' : 'Registrando...'}</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Confirmar llegada</span>
                </>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
