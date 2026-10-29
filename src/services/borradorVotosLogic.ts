/**
 * Lógica para revisión de borrador de votos y conteo manual de respaldo (CUO-492).
 *
 * Tres caminos:
 * 1. Borrador aceptado sin cambios ('sin_cambios')
 * 2. Borrador corregido por el testigo ('corregido')
 * 3. Conteo manual de respaldo ('manual')
 */

export type OrigenResultadoVotos = 'sin_cambios' | 'corregido' | 'manual';

export type ModoRevisionVotos = 'borrador' | 'leyendo' | 'manual';

export interface DatosComparacionBorrador {
  votos: Record<string, number>;
  circValues?: Record<string, number>;
  votosBlanco: number;
  votosNulos: number;
  votosNoMarcados: number;
  totalVotosMesa: number;
  resultadoOcrOriginal?: Record<string, number | null> | null;
}

/**
 * Determina si el testigo modificó algún valor del borrador original.
 * Si todos los valores coinciden con el borrador -> 'sin_cambios'.
 * Si algún valor fue modificado o completado desde null -> 'corregido'.
 */
export function evaluarOrigenBorrador(datos: DatosComparacionBorrador): 'sin_cambios' | 'corregido' {
  const orig = datos.resultadoOcrOriginal ?? {};

  // Comparar votos de candidatos y listas
  for (const [id, val] of Object.entries(datos.votos)) {
    const origVal = orig[id];
    // Si en el borrador era null (baja confianza o casilla ilegible), cualquier valor asignado es corrección
    if (origVal === null) {
      return 'corregido';
    } else if (origVal === undefined) {
      if (val !== 0) return 'corregido';
    } else if (origVal !== val) {
      return 'corregido';
    }
  }

  // Comparar votos especiales y totales
  if (orig['_votosBlanco'] === null || datos.votosBlanco !== (orig['_votosBlanco'] ?? 0)) return 'corregido';
  if (orig['_votosNulos'] === null || datos.votosNulos !== (orig['_votosNulos'] ?? 0)) return 'corregido';
  if (orig['_votosNoMarcados'] === null || datos.votosNoMarcados !== (orig['_votosNoMarcados'] ?? 0)) return 'corregido';
  if (orig['_totalVotosMesa'] === null || datos.totalVotosMesa !== (orig['_totalVotosMesa'] ?? 0)) return 'corregido';

  // Comparar circunscripciones si existen
  if (datos.circValues) {
    for (const [k, v] of Object.entries(datos.circValues)) {
      if (orig[k] === null || (orig[k] ?? 0) !== v) return 'corregido';
    }
  }

  return 'sin_cambios';
}

/**
 * Identifica qué candidatos o casillas tienen baja confianza en la lectura del acta.
 * Una casilla es de baja confianza si:
 * - El valor en el borrador fue null o undefined (casilla ilegible, manchada o dudosa)
 * - O está señalada en alertas
 */
export function identificarBajaConfianza(
  resultadoOcr?: Record<string, number | null> | null,
  alertas?: Array<{ tipo: string; mensaje: string; severidad?: string }>,
): Set<string> {
  const bajaConfianza = new Set<string>();
  if (!resultadoOcr) return bajaConfianza;

  for (const [key, val] of Object.entries(resultadoOcr)) {
    if (val === null || val === undefined) {
      bajaConfianza.add(key);
    }
  }

  // Si hay alertas que mencionan candidatos o partidos
  if (alertas && Array.isArray(alertas)) {
    for (const alerta of alertas) {
      const msg = alerta.mensaje?.toLowerCase() || '';
      for (const key of Object.keys(resultadoOcr)) {
        if (msg.includes(key.toLowerCase())) {
          bajaConfianza.add(key);
        }
      }
    }
  }

  return bajaConfianza;
}

/**
 * Determina qué interfaz mostrar en el paso «2. Revisar votos».
 * - 'borrador': hay borrador listo (COMPLETADO o CONFIRMADO) y el usuario no forzó manual.
 * - 'leyendo': se están procesando fotos (PROCESANDO, SUBIENDO, PENDIENTE) y no forzó manual.
 * - 'manual': no hay borrador, falló (ERROR), sin conexión sin borrador previo, o usuario eligió contar a mano.
 */
export function determinarModoRevision(params: {
  estadoJob?: 'PENDIENTE' | 'SUBIENDO' | 'PROCESANDO' | 'COMPLETADO' | 'CONFIRMADO' | 'ERROR' | null;
  tieneResultadoOcr: boolean;
  forzarConteoManual: boolean;
  isOnline: boolean;
}): ModoRevisionVotos {
  if (params.forzarConteoManual) {
    return 'manual';
  }

  if (params.estadoJob === 'COMPLETADO' || params.estadoJob === 'CONFIRMADO') {
    if (params.tieneResultadoOcr) {
      return 'borrador';
    }
    return 'manual';
  }

  if (
    params.isOnline &&
    (params.estadoJob === 'PROCESANDO' ||
      params.estadoJob === 'SUBIENDO' ||
      params.estadoJob === 'PENDIENTE')
  ) {
    return 'leyendo';
  }

  return 'manual';
}
