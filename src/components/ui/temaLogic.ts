export type Theme = 'light' | 'dark' | 'system';
export const CLAVE_TEMA = 'theme';
export const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';
export const EVENTO_TEMA = 'cuorum:theme-change';
export const TEMA_PREDETERMINADO: Theme = 'system';

export function leerTemaGuardado(): Theme {
  try {
    const g = window.localStorage.getItem(CLAVE_TEMA);
    return g === 'light' || g === 'dark' || g === 'system' ? g : TEMA_PREDETERMINADO;
  } catch { return TEMA_PREDETERMINADO; }
}

export function resolverTemaOscuro(theme: Theme): boolean {
  if (theme !== 'system') return theme === 'dark';
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_OSCURO).matches;
}

export function aplicarTema(oscuro: boolean) {
  if (typeof window === 'undefined' || !window.document?.documentElement) return;
  window.document.documentElement.classList.toggle('dark', oscuro);
  window.document.documentElement.style.colorScheme = oscuro ? 'dark' : 'light';
}
