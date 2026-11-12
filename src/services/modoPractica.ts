import type { AlertaValidacion } from './jornadaService';

export const MESA_PRACTICA = {
  id: 'mesa-practica-ficticia',
  numero: 1,
  totalSufragantes: 100,
  puesto: {
    nombre: 'Puesto de práctica',
    direccion: 'Simulacro de capacitación — sin validez electoral',
  },
} as const;

export const ELECCIONES_PRACTICA = [
  {
    id: 'eleccion-practica-alcaldia',
    nombre: 'Alcaldía (Simulacro)',
    tipoEleccion: 'ALCALDIA',
    tipoCargo: 'UNINOMINAL' as const,
    votoPreferente: false,
    candidatos: [
      { id: 'cand-practica-1', nombre: 'Candidato de prueba 1', partido: 'Movimiento de Prueba A', numero: 1 },
      { id: 'cand-practica-2', nombre: 'Candidato de prueba 2', partido: 'Movimiento de Prueba B', numero: 2 },
      { id: 'cand-practica-3', nombre: 'Candidato de prueba 3', partido: 'Movimiento de Prueba C', numero: 3 },
    ],
  },
];

export interface ResultadoAritmeticaPractica {
  cuadra: boolean;
  excede: boolean;
  diferencia: number;
  resumen: string;
  alertas: AlertaValidacion[];
}

export function evaluarAritmeticaPractica(totalVotos: number, totalSufragantes: number): ResultadoAritmeticaPractica {
  const diferencia = totalVotos - totalSufragantes;
  if (totalVotos > totalSufragantes) {
    const mensaje = `Total de votos (${totalVotos}) SUPERA sufragantes habilitados (${totalSufragantes})`;
    return { cuadra: false, excede: true, diferencia, resumen: mensaje, alertas: [{ tipo: 'SUMA_NO_COINCIDE', severidad: 'error', mensaje }] };
  }
  if (totalVotos !== totalSufragantes) {
    const mensaje = `La suma de votos individuales (${totalVotos}) no coincide con el total de votos de mesa (${totalSufragantes})`;
    return { cuadra: false, excede: false, diferencia, resumen: mensaje, alertas: [{ tipo: 'SUMA_NO_COINCIDE', severidad: 'warning', mensaje }] };
  }
  return {
    cuadra: true,
    excede: false,
    diferencia: 0,
    resumen: `La suma cuadra: ${totalVotos} votos coinciden con los ${totalSufragantes} sufragantes habilitados.`,
    alertas: [],
  };
}
