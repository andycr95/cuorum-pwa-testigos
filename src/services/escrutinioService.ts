/**
 * Servicio API para Testigos de Escrutinio (solo lectura)
 *
 * Consume los endpoints /api/testigos/escrutinio/* para obtener
 * resultados, fotos E14, incidencias y consolidados con filtros geográficos.
 */

import { api } from './api';
import { authService } from './authService';

export interface FiltrosEscrutinio {
  departamentoId?: string;
  municipioId?: string;
  puestoVotacionId?: string;
  eleccionId?: string;
  page?: number;
  limit?: number;
}

export interface FiltrosConsolidadoEscrutinio {
  eleccionId: string;
  departamentoId?: string;
  municipioId?: string;
  puestoVotacionId?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ResultadoEscrutinio {
  id: string;
  mesaId: string;
  candidato: string;
  partido: string;
  votos: number;
  votosBlanco: number;
  votosNulos: number;
  votosNoMarcados: number;
  totalVotosMesa: number;
  alertaFraude: boolean;
  alertaEstado: string;
  eleccionId?: string;
  candidatoId?: string;
  tipoVoto?: string;
  capturedAt: string;
  createdAt: string;
  mesa: {
    numero: number;
    puestoVotacion: {
      nombre: string;
      municipio: {
        nombre: string;
        departamento?: { nombre: string };
      };
    };
  };
  testigo: { nombres: string; apellidos: string; cedula: string };
}

export interface FotoE14Escrutinio {
  id: string;
  imagenUrl: string;
  imagenBytes?: number;
  capturedAt: string;
  syncedAt?: string;
  createdAt: string;
  mesa: {
    numero: number;
    puestoVotacion: {
      nombre: string;
      municipio?: { nombre: string };
    };
  };
}

export interface IncidenciaEscrutinio {
  id: string;
  tipo: string;
  descripcion: string;
  fotoUrl?: string | null;
  fotoBytes?: number | null;
  deviceId: string;
  capturedAt: string;
  syncedAt?: string;
  createdAt: string;
  mesa: {
    numero: number;
    puestoVotacion: {
      nombre: string;
      municipio?: { nombre: string };
    };
  };
  testigo: { nombres: string; apellidos: string; cedula: string; telefono: string };
}

export interface ConsolidadoEscrutinio {
  eleccionId: string;
  candidatos: Array<{
    candidato: string;
    partido: string;
    candidatoId: string | null;
    tipoVoto: string;
    votos: number;
    mesasReportadas: number;
    porcentaje: string;
  }>;
  totales: {
    totalVotosValidos: number;
    totalBlancos: number;
    totalNulos: number;
    totalNoMarcados: number;
    mesasReportadas: number;
    totalMesas: number;
  };
  cobertura: string;
  ultimaActualizacion: string;
}

export interface PuestoVotacion {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string;
  _count: { mesas: number };
}

function cleanParams(params: Record<string, unknown>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      clean[key] = String(value);
    }
  }
  return clean;
}

class EscrutinioService {

  async getResultados(filtros: FiltrosEscrutinio): Promise<PaginatedResponse<ResultadoEscrutinio>> {
    const response = await api.get(`/testigos/escrutinio/resultados`, {
      params: cleanParams(filtros as Record<string, unknown>),
    });
    return response.data;
  }

  async getFotosE14(filtros: FiltrosEscrutinio): Promise<PaginatedResponse<FotoE14Escrutinio>> {
    const response = await api.get(`/testigos/escrutinio/fotos-e14`, {
      params: cleanParams(filtros as Record<string, unknown>),
    });
    return response.data;
  }

  async getIncidencias(filtros: FiltrosEscrutinio): Promise<PaginatedResponse<IncidenciaEscrutinio>> {
    const response = await api.get(`/testigos/escrutinio/incidencias`, {
      params: cleanParams(filtros as Record<string, unknown>),
    });
    return response.data;
  }

  async getConsolidado(filtros: FiltrosConsolidadoEscrutinio): Promise<ConsolidadoEscrutinio> {
    const response = await api.get(`/testigos/escrutinio/consolidado`, {
      params: cleanParams(filtros as unknown as Record<string, unknown>),
    });
    return response.data;
  }

  async getPuestos(municipioId: string): Promise<PuestoVotacion[]> {
    const response = await api.get(`/testigos/escrutinio/geo/puestos`, {
      params: { municipioId },
    });
    return response.data;
  }

  async getDepartamentos(): Promise<Array<{ id: string; nombre: string }>> {
    const response = await api.get(`/geo/departamentos`);
    return response.data;
  }

  async getMunicipios(departamentoId: string): Promise<Array<{ id: string; nombre: string }>> {
    const response = await api.get(`/geo/departamentos/${departamentoId}/municipios`);
    return response.data;
  }

  async getElecciones(): Promise<Array<{ id: string; nombre: string }>> {
    // Uses the elecciones already stored in auth data, no extra endpoint needed
    const data = authService.getTestigoData();
    return data?.elecciones?.map(e => ({ id: e.id, nombre: e.nombre })) ?? [];
  }
}

export const escrutinioService = new EscrutinioService();
