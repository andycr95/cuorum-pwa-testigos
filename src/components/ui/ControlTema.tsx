import { useCallback, useEffect, useState } from 'react';
import {
  type Theme,
  CLAVE_TEMA,
  CONSULTA_OSCURO,
  EVENTO_TEMA,
  TEMA_PREDETERMINADO,
  leerTemaGuardado,
  resolverTemaOscuro,
  aplicarTema,
} from './temaLogic';

export { type Theme, TEMA_PREDETERMINADO, leerTemaGuardado, resolverTemaOscuro, aplicarTema };

export function useTheme() {
  const [theme, setThemeEstado] = useState<Theme>(leerTemaGuardado);
  const [isDark, setIsDark] = useState<boolean>(() => resolverTemaOscuro(theme));

  const setTheme = useCallback((nuevo: Theme) => {
    setThemeEstado(nuevo);
    try { window.localStorage.setItem(CLAVE_TEMA, nuevo); } catch { /* bloqueado */ }
    const oscuro = resolverTemaOscuro(nuevo);
    setIsDark(oscuro);
    aplicarTema(oscuro);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_TEMA, { detail: nuevo }));
  }, []);

  useEffect(() => {
    const sync = () => {
      const actual = leerTemaGuardado();
      const oscuro = resolverTemaOscuro(actual);
      setThemeEstado(actual);
      setIsDark(oscuro);
      aplicarTema(oscuro);
    };
    sync();
    window.addEventListener(EVENTO_TEMA, sync);
    const mql = typeof window.matchMedia === 'function' ? window.matchMedia(CONSULTA_OSCURO) : null;
    mql?.addEventListener('change', sync);
    return () => { window.removeEventListener(EVENTO_TEMA, sync); mql?.removeEventListener('change', sync); };
  }, [theme]);

  return { theme, setTheme, isDark };
}

const OPCIONES: { valor: Theme; etiqueta: string }[] = [
  { valor: 'light', etiqueta: 'Claro' },
  { valor: 'dark', etiqueta: 'Oscuro' },
  { valor: 'system', etiqueta: 'Sistema' },
];

export function ControlTema({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div role="group" aria-label="Tema de apariencia" data-testid="control-tema" className={`inline-grid grid-cols-3 gap-1 p-1 bg-app-elevated border border-app-line rounded-card ${className}`}>
      {OPCIONES.map(({ valor, etiqueta }) => (
        <button key={valor} type="button" data-testid={`tema-${valor}`} onClick={() => setTheme(valor)} aria-pressed={theme === valor} className={`min-h-[44px] min-w-[44px] px-2.5 py-1.5 rounded-btn text-xs font-semibold transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-editorial-red/40 ${theme === valor ? 'bg-app-surface text-app-fg border border-app-line' : 'text-app-muted hover:text-app-fg border border-transparent'}`}>
          {etiqueta}
        </button>
      ))}
    </div>
  );
}
