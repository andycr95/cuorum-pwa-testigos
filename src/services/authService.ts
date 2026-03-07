/**
 * Servicio de Autenticación para Testigos Electorales
 *
 * Maneja login, logout, verificación de token y persistencia de sesión
 */

import { api } from './api';

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

class AuthService {
  private readonly TOKEN_KEY = 'cuorum_testigo_token';
  private readonly DATA_KEY = 'cuorum_testigo_data';
  private readonly CAMPANA_KEY = 'cuorum_testigo_campana';
  private readonly ELECCION_KEY = 'cuorum_testigo_eleccion';
  private readonly ELECCION_DATA_KEY = 'cuorum_testigo_eleccion_data';

  /**
   * Inicia sesión con cédula y PIN
   */
  async login(cedula: string, pin: string): Promise<LoginResponse> {
    try {
      const response = await api.post<LoginResponse>(
        `/auth/testigos/login`,
        { cedula, pin },
      );

      const data = response.data;

      // Guardar token y datos en localStorage
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
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Error de conexión. Verifica tu internet.');
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
      // Si no hay internet, asumir que el token es válido (modo offline)
      console.warn('[Auth] Error al verificar token, asumiendo válido para modo offline:', error);
      return true;
    }
  }

  /**
   * Cierra sesión y limpia datos
   */
  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.DATA_KEY);
    localStorage.removeItem(this.CAMPANA_KEY);
    localStorage.removeItem(this.ELECCION_KEY);
    localStorage.removeItem(this.ELECCION_DATA_KEY);
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
