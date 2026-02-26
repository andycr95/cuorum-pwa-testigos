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
  };
}

class AuthService {
  private readonly TOKEN_KEY = 'cuorum_testigo_token';
  private readonly DATA_KEY = 'cuorum_testigo_data';
  private readonly CAMPANA_KEY = 'cuorum_testigo_campana';

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
  }

  /**
   * Obtiene el token guardado
   */
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Obtiene los datos del testigo guardados
   */
  getTestigoData(): TestigoData | null {
    const data = localStorage.getItem(this.DATA_KEY);
    if (!data) return null;

    try {
      return JSON.parse(data);
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
