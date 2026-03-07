/**
 * Servicio de Jornada Electoral
 *
 * Maneja el ciclo de vida de la jornada del testigo:
 * check-in -> apertura -> conteo -> cierre -> firma
 */

import { api } from './api';

export interface JornadaMesa {
  id: string;
  mesaId: string;
  testigoId: string;
  campanaId: string;
  estado: 'PENDIENTE' | 'CHECKIN' | 'ABIERTA' | 'EN_CONTEO' | 'CERRADA' | 'FIRMADA';
  checkinAt?: string;
  checkinLat?: number;
  checkinLng?: number;
  aperturaAt?: string;
  aperturaChecklist?: Record<string, boolean>;
  aperturaObservaciones?: string;
  cierreAt?: string;
  cierreObservaciones?: string;
  firmadoAt?: string;
  codigoVerificacion?: string;
}

export interface ProgresoElecciones {
  jornada: JornadaMesa;
  elecciones: Array<{
    id: string;
    nombre: string;
    tipoEleccion: string;
    reportado: boolean;
    totalVotos: number;
  }>;
  progreso: { reportadas: number; total: number; porcentaje: number };
}

export interface AlertaValidacion {
  tipo: string;
  mensaje: string;
  severidad: 'warning' | 'error';
}

export const jornadaService = {
  getJornada: (mesaId: string) =>
    api.get<JornadaMesa>('/testigos/jornada', { params: { mesaId } }).then((r) => r.data),

  checkin: (mesaId: string, lat: number, lng: number) =>
    api.post<JornadaMesa>('/testigos/jornada/checkin', { mesaId, lat, lng }).then((r) => r.data),

  apertura: (mesaId: string, checklist: Record<string, boolean>, observaciones?: string, foto?: Blob) => {
    const formData = new FormData();
    formData.append('mesaId', mesaId);
    formData.append('checklist', JSON.stringify(checklist));
    if (observaciones) formData.append('observaciones', observaciones);
    if (foto) formData.append('foto', foto, 'apertura.jpg');
    return api
      .post<JornadaMesa>('/testigos/jornada/apertura', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  getProgreso: (mesaId: string) =>
    api.get<ProgresoElecciones>('/testigos/jornada/progreso', { params: { mesaId } }).then((r) => r.data),

  validar: (mesaId: string, eleccionId: string) =>
    api
      .get<{ valido: boolean; alertas: AlertaValidacion[] }>(
        `/testigos/jornada/validar/${mesaId}`,
        { params: { eleccionId } },
      )
      .then((r) => r.data),

  cerrar: (mesaId: string, data: { observaciones?: string; firmaDataUrl?: string }) =>
    api.post<JornadaMesa>('/testigos/jornada/cerrar', { mesaId, ...data }).then((r) => r.data),

  cambiarEstado: (mesaId: string, estado: string) =>
    api.patch<JornadaMesa>('/testigos/jornada/estado', { mesaId, estado }).then((r) => r.data),
};
