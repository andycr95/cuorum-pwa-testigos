import { useState, useRef, useEffect, useCallback } from 'react';
import { jornadaService, AlertaValidacion, ProgresoElecciones } from '../../services/jornadaService';
import { formatearErrorAmigable } from '../../utils/formatoError';

interface Props {
  mesaId: string;
  mesaNumero: number;
  elecciones: Array<{ id: string; nombre: string }>;
  sinFotoMotivo?: string;
  onCerrado: (codigoVerificacion: string) => void;
  onCancel: () => void;
}

interface EleccionValidacion {
  id: string;
  nombre: string;
  valido: boolean;
  alertas: AlertaValidacion[];
  loading: boolean;
}

export function WizardCierre({ mesaId, mesaNumero, elecciones, sinFotoMotivo, onCerrado, onCancel }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [validaciones, setValidaciones] = useState<EleccionValidacion[]>([]);
  const [progreso, setProgreso] = useState<ProgresoElecciones | null>(null);
  const [observaciones, setObservaciones] = useState('');
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codigoVerificacion, setCodigoVerificacion] = useState<string | null>(null);

  // Step 1: Fetch progreso + run validations
  useEffect(() => {
    if (step !== 1) return;

    // Fetch progreso to check which elections have results
    jornadaService.getProgreso(mesaId).then(setProgreso).catch(() => {});

    const initial: EleccionValidacion[] = elecciones.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      valido: true,
      alertas: [],
      loading: true,
    }));
    setValidaciones(initial);

    const validate = async () => {
      const updated = [...initial];
      for (let i = 0; i < elecciones.length; i++) {
        try {
          const result = await jornadaService.validar(mesaId, elecciones[i].id);
          updated[i] = {
            ...updated[i],
            valido: result.valido,
            alertas: result.alertas,
            loading: false,
          };
        } catch {
          updated[i] = { ...updated[i], loading: false };
        }
        setValidaciones([...updated]);
      }
    };

    validate();
  }, [step, mesaId, elecciones]);

  const handleCerrar = async () => {
    setLoading(true);
    setError(null);

    try {
      const jornada = await jornadaService.cerrar(mesaId, {
        observaciones: observaciones || undefined,
        firmaDataUrl: firmaDataUrl || undefined,
        sinFotoMotivo: sinFotoMotivo || undefined,
      });

      setCodigoVerificacion(jornada.codigoVerificacion || 'SIN-CODIGO');
      setStep(4);
    } catch (err: any) {
      const errData = err?.response?.data;
      let msg = '';
      if (
        errData?.codigo === 'E14_FOTO_REQUERIDA' ||
        String(errData?.error || '').includes('E14_FOTO_REQUERIDA') ||
        String(err?.message || '').includes('E14_FOTO_REQUERIDA')
      ) {
        msg = 'Se requiere la foto del acta E-14 como evidencia obligatoria, o justificar por qué no fue posible tomarla (mínimo 10 caracteres).';
      } else {
        msg = errData?.error || err?.message || 'No se pudo cerrar el acta. Verifica tu conexión e inténtalo de nuevo.';
      }
      setError(formatearErrorAmigable(err, msg));
    } finally {
      setLoading(false);
    }
  };

  const hasErrors = validaciones.some((v) => v.alertas.some((a) => a.severidad === 'error'));
  const allValidated = validaciones.every((v) => !v.loading);
  const eleccionesSinReportar = progreso?.elecciones.filter((e) => !e.reportado) || [];
  const canProceed = allValidated && eleccionesSinReportar.length === 0;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="w-full max-w-md bg-app-surface text-app-fg border border-app-line rounded-t-3xl sm:rounded-card max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="wizard-cierre-titulo">
        {/* Header */}
        <div className="sticky top-0 bg-app-elevated border-b border-app-line px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-card z-10">
          <div>
            <h3 id="wizard-cierre-titulo" className="text-lg font-black text-app-fg">Cerrar Acta</h3>
            <p className="text-xs text-app-muted">Mesa #{mesaNumero}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Step indicators */}
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    s === step ? 'bg-editorial-red scale-125' : s < step ? 'bg-green-500' : 'bg-app-line'
                  }`}
                />
              ))}
            </div>
            {step < 4 && (
              <button
                onClick={onCancel}
                aria-label="Cerrar asistente de cierre"
                className="min-w-[44px] min-h-[44px] p-2 hover:bg-app-surface rounded-btn transition-colors flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-app-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-5">
          {/* Step 1: Summary & Validations */}
          {step === 1 && (
            <div>
              <h4 className="text-sm font-black text-app-fg uppercase tracking-wider mb-4">
                Resumen de elecciones
              </h4>
              <div className="space-y-3">
                {validaciones.map((v) => (
                  <div
                    key={v.id}
                    className={`p-4 rounded-card border transition-all ${
                      v.loading
                        ? 'bg-app-elevated border-app-line'
                        : v.alertas.some((a) => a.severidad === 'error')
                        ? 'bg-red-500/10 border-red-500/30'
                        : v.alertas.length > 0
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-green-500/10 border-green-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-app-fg">{v.nombre}</p>
                      {v.loading ? (
                        <span className="w-4 h-4 border-2 border-app-line border-t-transparent rounded-full animate-spin" />
                      ) : v.alertas.length === 0 ? (
                        <svg className="w-5 h-5 text-green-800 dark:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-amber-800 dark:text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      )}
                    </div>
                    {v.alertas.map((alerta, i) => (
                      <p
                        key={i}
                        className={`text-xs font-medium mt-1 ${
                          alerta.severidad === 'error' ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {alerta.severidad === 'error' ? '!' : '!'} {alerta.mensaje}
                      </p>
                    ))}
                  </div>
                ))}
              </div>

              {eleccionesSinReportar.length > 0 && (
                <div role="alert" className="mt-4 bg-red-500/10 border border-red-500/30 rounded-card p-3">
                  <p className="text-xs text-red-800 dark:text-red-300 font-bold mb-1">
                    Faltan resultados por reportar:
                  </p>
                  <ul className="list-disc list-inside">
                    {eleccionesSinReportar.map((e) => (
                      <li key={e.id} className="text-xs text-red-800 dark:text-red-300">{e.nombre}</li>
                    ))}
                  </ul>
                </div>
              )}

              {hasErrors && allValidated && eleccionesSinReportar.length === 0 && (
                <div role="alert" className="mt-4 bg-red-500/10 border border-red-500/30 rounded-card p-3">
                  <p className="text-xs text-red-800 dark:text-red-300 font-bold">
                    Hay errores en la validacion. Revisa los resultados antes de cerrar.
                  </p>
                </div>
              )}

              <button
                onClick={() => setStep(2)}
                disabled={!canProceed}
                className="w-full mt-6 py-4 min-h-[48px] rounded-btn font-black text-white uppercase tracking-wide text-sm bg-editorial-red hover:bg-red-700 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {!allValidated ? 'Validando...' : eleccionesSinReportar.length > 0 ? 'Reporta todas las elecciones' : 'Continuar'}
              </button>
            </div>
          )}

          {/* Step 2: Observations */}
          {step === 2 && (
            <div>
              <h4 className="text-sm font-black text-app-fg uppercase tracking-wider mb-4">
                Observaciones finales
              </h4>
              <p className="text-xs text-app-muted mb-4">
                Agrega cualquier nota o comentario sobre la jornada electoral en esta mesa (opcional).
              </p>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value.slice(0, 1000))}
                placeholder="Escribe tus observaciones aqui..."
                rows={5}
                className="w-full px-4 py-3 rounded-card border border-app-line bg-app-elevated text-app-fg placeholder:text-app-muted text-sm focus:border-editorial-red focus:outline-none resize-none"
              />
              <p className="text-xs text-app-muted text-right mt-1">{observaciones.length}/1000</p>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-4 min-h-[48px] rounded-btn font-bold text-app-fg uppercase tracking-wide text-sm border border-app-line bg-app-elevated hover:bg-app-canvas transition-all"
                >
                  Atras
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-4 min-h-[48px] rounded-btn font-black text-white uppercase tracking-wide text-sm bg-editorial-red hover:bg-red-700 active:scale-[0.97] transition-all"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Signature */}
          {step === 3 && (
            <div>
              <h4 className="text-sm font-black text-app-fg uppercase tracking-wider mb-4">
                Firma digital
              </h4>
              <p className="text-xs text-app-muted mb-4">
                Dibuja tu firma en el recuadro para confirmar el cierre del acta.
              </p>

              <SignatureCanvas
                onSign={(dataUrl) => setFirmaDataUrl(dataUrl)}
              />

              {error && (
                <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-card p-3 mt-4">
                  <p className="text-xs text-red-800 dark:text-red-300 font-medium">{error}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-4 min-h-[48px] rounded-btn font-bold text-app-fg uppercase tracking-wide text-sm border border-app-line bg-app-elevated hover:bg-app-canvas transition-all"
                >
                  Atras
                </button>
                <button
                  onClick={handleCerrar}
                  disabled={loading}
                  className="flex-1 py-4 min-h-[48px] rounded-btn font-black text-white uppercase tracking-wide text-sm bg-editorial-red hover:bg-red-700 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Cerrando...
                    </span>
                  ) : (
                    'Confirmar cierre'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Confirmation */}
          {step === 4 && (
            <div className="text-center py-6">
              <div className="w-20 h-20 mx-auto mb-6 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-green-800 dark:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h4 className="text-xl font-black text-app-fg mb-2">
                Acta firmada exitosamente
              </h4>
              <p className="text-sm text-app-muted mb-6">
                Mesa #{mesaNumero} cerrada correctamente
              </p>

              {/* Verification Code */}
              <div className="bg-app-elevated border border-app-line rounded-card p-5 mb-6">
                <p className="text-xs font-black text-app-muted uppercase tracking-widest mb-2" style={{ letterSpacing: '0.15em' }}>
                  Codigo de verificacion
                </p>
                <p className="text-3xl font-black text-app-fg tracking-[0.3em] font-mono">
                  {codigoVerificacion}
                </p>
                <p className="text-xs text-app-muted mt-2">
                  Guarda este codigo como comprobante
                </p>
              </div>

              <button
                onClick={() => onCerrado(codigoVerificacion || '')}
                className="w-full py-4 min-h-[48px] rounded-btn font-black text-white uppercase tracking-wide text-sm bg-green-700 hover:bg-green-800 active:scale-[0.97] transition-all"
              >
                Finalizar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Signature Canvas Component ─────────────────────────────────

function SignatureCanvas({ onSign }: { onSign: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const getCoords = useCallback(
    (e: React.TouchEvent | React.MouseEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      if ('touches' in e) {
        const touch = e.touches[0];
        if (!touch) return null;
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [],
  );

  const startDrawing = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      const coords = getCoords(e);
      if (!coords) return;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
      setIsDrawing(true);
    },
    [getCoords],
  );

  const draw = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      if (!isDrawing) return;
      const coords = getCoords(e);
      if (!coords) return;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.lineTo(coords.x, coords.y);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      setHasSignature(true);
    },
    [isDrawing, getCoords],
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      onSign(canvas.toDataURL('image/png'));
    }
  }, [isDrawing, hasSignature, onSign]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // Setup canvas resolution
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  return (
    <div>
      <div className="relative border border-app-line rounded-card overflow-hidden bg-[#FFFFFF]">
        <canvas
          ref={canvasRef}
          className="w-full touch-none"
          style={{ height: '180px' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-[#57534E] font-medium">Firma aqui</p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={clearCanvas}
        className="mt-2 px-4 py-2 min-h-[44px] text-xs font-bold text-app-muted hover:text-app-accent-fg transition-colors inline-flex items-center"
      >
        Limpiar firma
      </button>
    </div>
  );
}
