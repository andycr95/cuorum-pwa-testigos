import type { TestigoData } from './authService';

/**
 * Mesas asignadas al testigo. La sesión guardada al iniciar sesión trae `mesa`
 * sin `mesas`, así que el login y la recarga deben usar la misma regla.
 */
export function mesasDelTestigo(data: Pick<TestigoData, 'mesa' | 'mesas'>): TestigoData['mesa'][] {
  if (data.mesas && data.mesas.length > 0) return data.mesas;
  return data.mesa ? [data.mesa] : [];
}
