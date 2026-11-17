/**
 * Lectura del coordinador de puesto (CUO-4047): las mesas de su puesto con su jornada y los resultados que
 * envió su campaña. El backend toma el puesto del token; aquí no se envía ni se escribe nada.
 */

import { api } from './api';

export type EstadoJornada = 'PENDIENTE' | 'CHECKIN' | 'ABIERTA' | 'EN_CONTEO' | 'CERRADA' | 'FIRMADA';

export interface JornadaPuesto {
  estado: EstadoJornada;
  checkinAt: string | null;
  aperturaAt: string | null;
  cierreAt: string | null;
  firmadoAt: string | null;
  requiereSeguimiento: boolean;
  updatedAt: string;
}

export interface MesaPuesto {
  id: string;
  numero: number;
  totalSufragantes: number;
  tieneTitular: boolean;
  jornada: JornadaPuesto | null;
  resultadosEnviados: number;
  ultimoResultadoAt: string | null;
}

export interface MesasDelPuesto {
  puesto: { id: string; nombre: string; direccion: string; municipio: { nombre: string } | null };
  mesas: MesaPuesto[];
}

export interface ResultadoPuesto {
  id: string;
  eleccionId: string | null;
  candidato: string;
  partido: string;
  tipoVoto: string;
  votos: number;
  votosBlanco: number;
  votosNulos: number;
  votosNoMarcados: number;
  totalVotosMesa: number;
  capturedAt: string;
}

export interface MesaDelPuesto {
  mesa: { id: string; numero: number; totalSufragantes: number };
  jornada: JornadaPuesto | null;
  resultados: ResultadoPuesto[];
}

export const puestoService = {
  async mesas(): Promise<MesasDelPuesto> {
    return (await api.get<MesasDelPuesto>('/testigos/puesto/mesas')).data;
  },
  async mesa(mesaId: string): Promise<MesaDelPuesto> {
    return (await api.get<MesaDelPuesto>(`/testigos/puesto/mesas/${encodeURIComponent(mesaId)}`)).data;
  },
};
