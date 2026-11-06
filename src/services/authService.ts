/**
 * Servicio de Autenticación para Testigos Electorales
 *
 * Maneja login, logout, verificación de token y persistencia de sesión
 */

import { api } from './api';
import * as idbModule from '../db/indexeddb';
import { clearLastSyncTime, clearLastSyncError, cancelarSincronizacion } from './syncService';

export interface MesaData {
  id: string;
  numero: number;
  totalSufragantes: number;
  puesto: {
    id: string;
    nombre: string;
    direccion: string;
  } | null;
}

export interface TestigoData {
  testigo: {
    id: string;
    cedula: string;
    nombres: string;
    apellidos: string;
    telefono: string;
    email: string | null;
  };
  tipoTestigo: 'ELECTORAL' | 'ESCRUTINIO';
  mesa: MesaData; // Mesa actual (para compatibilidad)
  mesas?: MesaData[]; // Array de mesas (para el selector)
  elecciones: Array<{
    id: string;
    nombre: string;
    tipoEleccion: string;
    tipoCargo: 'UNINOMINAL' | 'LISTA' | 'LISTA_CON_PREFERENTE';
    votoPreferente: boolean;
    candidatos: Array<{
      id: string;
      nombre: string;
      partido: string;
      numero: number | null;
    }>;
    listas?: Array<{
      id: string;
      nombre: string;
      partido: string;
      tipoLista: 'CERRADA' | 'PREFERENTE';
      candidatos: Array<{
        id: string;
        nombre: string;
        partido: string;
        numero: number | null;
      }>;
    }>;
  }>;
  deviceId: string;
}

export interface LoginResponse {
  token: string;
  tipoTestigo: 'ELECTORAL' | 'ESCRUTINIO';
  testigo: TestigoData['testigo'];
  mesa: TestigoData['mesa'];
  elecciones: TestigoData['elecciones'];
  deviceId: string;
  campana: {
    id: string;
    nombre: string;
    candidatoId: string | null;
    listaId: string | null;
  };
}

export interface CampanaLoginOpcion {
  id: string;
  nombre: string;
}

export interface ElegirCampanaResponse {
  codigo: 'ELEGIR_CAMPANA';
  error?: string;
  campanas: CampanaLoginOpcion[];
}

export type LoginResult = LoginResponse | ElegirCampanaResponse;

export function esElegirCampana(res: unknown): res is ElegirCampanaResponse {
  return (
    typeof res === 'object' &&
    res !== null &&
    (res as { codigo?: unknown }).codigo === 'ELEGIR_CAMPANA' &&
    Array.isArray((res as { campanas?: unknown }).campanas)
  );
}

import { mapearErrorAuth, AUTH_NOTICE_KEY, extraerMensajeSesion401 } from './authErrors';

export { mapearErrorAuth, AUTH_NOTICE_KEY, extraerMensajeSesion401 };

class AuthService {
  private readonly TOKEN_KEY = 'cuorum_testigo_token';
  private readonly DATA_KEY = 'cuorum_testigo_data';
  private readonly CAMPANA_KEY = 'cuorum_testigo_campana';
  private readonly ELECCION_KEY = 'cuorum_testigo_eleccion';
  private readonly ELECCION_DATA_KEY = 'cuorum_testigo_eleccion_data';

  /**
   * Inicia sesión con cédula y PIN (y campanaId cuando el testigo elige entre varias campañas)
   */
  async login(cedula: string, pin: string, campanaId?: string): Promise<LoginResult> {
    try {
      const payload = campanaId ? { cedula, pin, campanaId } : { cedula, pin };
      const response = await api.post<LoginResult>(
        `/auth/testigos/login`,
        payload,
      );

      const data = response.data;
      if (esElegirCampana(data)) {
        return {
          codigo: 'ELEGIR_CAMPANA',
          ...(data.error ? { error: data.error } : {}),
          campanas: data.campanas,
        };
      }

      // Guardar token y datos en localStorage
      localStorage.removeItem(AUTH_NOTICE_KEY);
      localStorage.setItem(this.TOKEN_KEY, data.token);
      localStorage.setItem(this.DATA_KEY, JSON.stringify({
        testigo: data.testigo,
        tipoTestigo: data.tipoTestigo || 'ELECTORAL',
        mesa: data.mesa,
        elecciones: data.elecciones,
        deviceId: data.deviceId,
        campana: data.campana,
      }));
      localStorage.setItem(this.CAMPANA_KEY, data.campana.id);
      localStorage.setItem(this.ELECCION_KEY, data.elecciones.length > 0 ? data.elecciones[0].id : '');
      localStorage.setItem(this.ELECCION_DATA_KEY, JSON.stringify(data.elecciones));

      return data;
    } catch (error) {
      const resp = (error as { response?: { status?: number; data?: unknown } })?.response;
      if (resp?.status === 409 && esElegirCampana(resp.data)) {
        return {
          codigo: 'ELEGIR_CAMPANA',
          ...(resp.data.error ? { error: resp.data.error } : {}),
          campanas: resp.data.campanas,
        };
      }
      const mensaje = mapearErrorAuth(error);
      throw new Error(mensaje);
    }
  }

  /**
   * Verifica si el token sigue siendo válido
   */
  async verifyToken(): Promise<boolean> {
    const token = this.getToken();
    if (!token) return false;

    try {
      await api.get(`/auth/testigos/verify`);

      return true;
    } catch (error) {
      const status =
        (error as { response?: { status?: number }; status?: number })?.response?.status ??
        (error as { status?: number })?.status;
      if (status === 401 || status === 403) {
        if (status === 401) {
          try {
            localStorage.setItem(AUTH_NOTICE_KEY, extraerMensajeSesion401(error));
          } catch {
            // Entorno sin almacenamiento
          }
        }
        await this.logout();
        return false;
      }
      // Si no hay internet, asumir que el token es válido (modo offline)
      console.warn('[Auth] Error al verificar token, asumiendo válido para modo offline:', error);
      return true;
    }
  }

  /**
   * Cierra sesión: revoca el token vigente en el servidor antes de borrar el almacenamiento local.
   * Si la llamada falla (sin red, timeout o 401), la salida local sigue igual sin bloquear al testigo.
   */
  async logout(): Promise<void> {
    cancelarSincronizacion();
    const token = this.getToken();
    if (token) {
      try {
        await api.post(
          '/auth/logout',
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 3000,
          },
        );
      } catch {
        // Si la llamada falla (sin red, timeout o 401), la salida local sigue igual
      }
    }
    const tokenActual = localStorage.getItem(this.TOKEN_KEY);
    if (!token || tokenActual === null || tokenActual === token) {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.DATA_KEY);
      localStorage.removeItem(this.CAMPANA_KEY);
      localStorage.removeItem(this.ELECCION_KEY);
      localStorage.removeItem(this.ELECCION_DATA_KEY);
    }
    clearLastSyncTime();
    clearLastSyncError();
    idbModule.clearEscrutinioCache?.().catch(() => {});
  }

  /**
   * Obtiene el aviso de sesión vencida/revocada pendiente de mostrar en el login
   */
  getAuthNotice(): string | null {
    return localStorage.getItem(AUTH_NOTICE_KEY);
  }

  /**
   * Limpia el aviso de sesión vencida/revocada
   */
  clearAuthNotice(): void {
    localStorage.removeItem(AUTH_NOTICE_KEY);
  }

  /**
   * Obtiene el token guardado
   */
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Obtiene el ID de la campaña activa   
   */
  getCampanaId(): string | null {
    return localStorage.getItem(this.CAMPANA_KEY);
  }

  /**
   * Obtiene el candidatoId vinculado a la campaña (si existe)
   */
  getCandidatoId(): string | null {
    const data = this.getTestigoData();
    return (data as any)?.campana?.candidatoId || null;
  }

  /**
   * Obtiene el listaId vinculado a la campaña (si existe)
   */
  getListaId(): string | null {
    const data = this.getTestigoData();
    return (data as any)?.campana?.listaId || null;
  }

  /**
   * Obtiene el ID de la elección activa
   */
  getEleccionId(): string | null {
    return localStorage.getItem(this.ELECCION_KEY);
  }

  /**
   * Obtiene los datos de las elecciones (para el selector)
   */
  getEleccionesData(): TestigoData['elecciones'] {
    const data = localStorage.getItem(this.ELECCION_DATA_KEY);
    if (!data) return [];
    try {
      const parsed = JSON.parse(data) as TestigoData['elecciones'];
      console.log(parsed);

      return parsed;
    } catch {
      return [];
    }
  }

  /**
   * Obtiene los datos del testigo guardados
   */
  getTestigoData(): TestigoData | null {
    const data = localStorage.getItem(this.DATA_KEY);
    if (!data) return null;

    try {
      const parsed = JSON.parse(data) as TestigoData;

      // Normalizar tipoCargo para sesiones cacheadas que tengan el valor del backend (COLEGIADO)
      if (parsed.elecciones) {
        parsed.elecciones = parsed.elecciones.map((e) => ({
          ...e,
          tipoCargo:
            (e.tipoCargo as string) === 'COLEGIADO'
              ? (e.votoPreferente ? 'LISTA_CON_PREFERENTE' : 'LISTA')
              : e.tipoCargo,
        }));
      }

      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Obtiene el tipo de testigo (ELECTORAL o ESCRUTINIO)
   */
  getTipoTestigo(): 'ELECTORAL' | 'ESCRUTINIO' {
    const data = this.getTestigoData();
    return data?.tipoTestigo || 'ELECTORAL';
  }

  /**
   * Verifica si hay una sesión activa
   */
  isAuthenticated(): boolean {
    return this.getToken() !== null && this.getTestigoData() !== null;
  }
}

export const authService = new AuthService();
