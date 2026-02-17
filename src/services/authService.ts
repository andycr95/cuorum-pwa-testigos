/**
 * Servicio de Autenticación para Testigos Electorales
 *
 * Maneja login, logout, verificación de token y persistencia de sesión
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://app.cuorum.co/api-v1';

export interface TestigoData {
  testigo: {
    id: string;
    cedula: string;
    nombres: string;
    apellidos: string;
    telefono: string;
    email: string | null;
  };
  mesa: {
    id: string;
    numero: number;
    totalSufragantes: number;
    puesto: {
      id: string;
      nombre: string;
      direccion: string;
    } | null;
  };
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
  testigo: TestigoData['testigo'];
  mesa: TestigoData['mesa'];
  elecciones: TestigoData['elecciones'];
  deviceId: string;
}

class AuthService {
  private readonly TOKEN_KEY = 'cuorum_testigo_token';
  private readonly DATA_KEY = 'cuorum_testigo_data';

  /**
   * Inicia sesión con cédula y PIN
   */
  async login(cedula: string, pin: string): Promise<LoginResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/testigos/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cedula, pin }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al iniciar sesión');
      }

      const data: LoginResponse = await response.json();

      // Guardar token y datos en localStorage
      localStorage.setItem(this.TOKEN_KEY, data.token);
      localStorage.setItem(this.DATA_KEY, JSON.stringify({
        testigo: data.testigo,
        mesa: data.mesa,
        elecciones: data.elecciones,
        deviceId: data.deviceId,
      }));

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
      const response = await fetch(`${API_BASE_URL}/auth/testigos/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
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
   * Verifica si hay una sesión activa
   */
  isAuthenticated(): boolean {
    return this.getToken() !== null && this.getTestigoData() !== null;
  }

  /**
   * Obtiene headers con autenticación para requests
   */
  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };
  }
}

export const authService = new AuthService();
