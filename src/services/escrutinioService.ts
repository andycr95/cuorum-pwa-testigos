/**
 * Servicio API para Testigos de Escrutinio (solo lectura)
 *
 * Consume los endpoints /api/testigos/escrutinio/* para obtener
 * resultados, fotos E14, incidencias y consolidados con filtros geográficos.
 */

import { api } from './api';

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
  listaNombre?: string | null;
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

export interface ActaOcrEscrutinio {
  id: string;
  estado: 'COMPLETADO' | 'CONFIRMADO';
  serialE14?: string | null;
  resumenOcr?: string | null;
  resultadoOcr?: Record<string, number> | null;
  confirmedAt?: string | null;
  createdAt: string;
  mesa: {
    numero: number;
    puestoVotacion: {
      nombre: string;
      municipio?: { nombre: string };
    };
  };
  testigo: { nombres: string; apellidos: string };
  eleccion: { nombre: string };
  fotos: Array<{ id: string; orden: number; url: string }>;
  candidatosMap?: Record<string, { nombre: string; partido: string; posicion: number | null; listaNombre?: string }>;
}

export interface ConsolidadoEscrutinio {
  eleccionId: string;
  candidatos: Array<{
    candidato: string;
    partido: string;
    listaNombre?: string | null;
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

export interface E14OficialEscrutinio {
  id: string;
  mesaId: string;
  s3Key: string;
  tamanoBytes: number;
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
}

export interface DivulgacionEstado {
  ultimaSincronizacion: string | null;
  totalResultadosOficiales: number;
  mesasConResultadoOficial: number;
  mesasConResultadoTestigo: number;
  mesasConAmbos: number;
  mesasConDiscrepancia: number;
  coberturaPct: number;
}

export interface DivulgacionResultadoItem {
  id: string;
  votos: number;
  totalVotosMesa: number;
  porcentajeMesa: number;
  tipoVoto: string;
  boletinNumero: number | null;
  candidatoId: string | null;
  listaId: string | null;
  mesaId: string | null;
  candidato: { id: string; nombre: string; partido: string } | null;
  lista: { id: string; nombre: string; partido: string } | null;
  municipio: { id: string; nombre: string; departamento: { id: string; nombre: string } } | null;
}

export interface DivulgacionResultados {
  total: number;
  boletinNumero: number | null;
  resultados: DivulgacionResultadoItem[];
}

export interface DivulgacionData {
  estado: DivulgacionEstado;
  resultados: DivulgacionResultados;
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

  async getActasOcr(filtros: FiltrosEscrutinio): Promise<PaginatedResponse<ActaOcrEscrutinio>> {
    const response = await api.get(`/testigos/escrutinio/actas-ocr`, {
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

  async getDepartamentos(idCampana?: string): Promise<Array<{ id: string; nombre: string }>> {
    const response = await api.get(`/geo/departamentos/campana/${idCampana}`);
    return response.data;
  }

  async getMunicipios(departamentoId: string, idCampana?: string): Promise<Array<{ id: string; nombre: string }>> {
    const response = await api.get(`/geo/departamentos/${departamentoId}/municipios/campana/${idCampana}`);
    return response.data;
  }

  async getE14Oficial(filtros: FiltrosEscrutinio): Promise<PaginatedResponse<E14OficialEscrutinio>> {
    const response = await api.get(`/testigos/escrutinio/e14-oficial`, {
      params: cleanParams(filtros as Record<string, unknown>),
    });
    return response.data;
  }

  async getE14OficialUrl(mesaId: string, disposition: 'inline' | 'attachment' = 'inline'): Promise<string> {
    const response = await api.get<{ url: string }>(`/testigos/escrutinio/e14-oficial/${mesaId}/url`, {
      params: { disposition },
    });
    return response.data.url;
  }

  async getDivulgacionEstado(eleccionId?: string): Promise<DivulgacionEstado> {
    const response = await api.get('/testigos/divulgacion/estado-sync', {
      params: cleanParams({ eleccionId } as Record<string, unknown>),
    });
    return response.data;
  }

  async getDivulgacionResultados(filters?: { departamentoId?: string; municipioId?: string; puestoVotacionId?: string }): Promise<DivulgacionResultados> {
    const response = await api.get('/testigos/divulgacion/resultados-candidatos', {
      params: cleanParams((filters || {}) as Record<string, unknown>),
    });
    return response.data;
  }
}

export const escrutinioService = new EscrutinioService();
