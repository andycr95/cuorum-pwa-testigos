import axios from 'axios';
import * as idbModule from '../db/indexeddb';
import * as syncModule from './syncService';
import { AUTH_NOTICE_KEY, MENSAJE_SESION_VENCIDA, extraerMensajeSesion401 } from './authErrors';

export { AUTH_NOTICE_KEY, MENSAJE_SESION_VENCIDA, extraerMensajeSesion401 };

export const api = axios.create({
    // baseURL: '/api-v1',
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' },
});

const TOKEN_KEY = 'cuorum_testigo_token';
const DATA_KEY = 'cuorum_testigo_data';
const CAMPANA_KEY = 'cuorum_testigo_campana';
const ELECCION_KEY = 'cuorum_testigo_eleccion';
const ELECCION_DATA_KEY = 'cuorum_testigo_eleccion_data';

// Interceptor: inyectar JWT y campanaId
api.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    // Inyectar campana activa para multi-tenancy
    const campanaId = localStorage.getItem(CAMPANA_KEY);
    if (campanaId) {
        config.headers['X-Campana-Id'] = campanaId;
    }

    return config;
});

/**
 * Interceptor: manejar 401 en cualquier llamada autenticada.
 *
 * Cubre las causas de revocación o vencimiento del testigo desde CUO-2410
 * (PIN cambiado, testigo desactivado o movido de mesa, o token expirado):
 * - Ignora 401 en `/auth/testigos/login` (credenciales inválidas al entrar)
 *   y en `/auth/logout` (salida voluntaria cuando el token ya estaba vencido).
 * - Guarda en `cuorum_testigo_auth_notice` el mensaje claro del servidor
 *   (por defecto «Sesión de testigo vencida. Inicia sesión de nuevo.») para
 *   mostrarlo en `LoginPage`.
 * - Cancela la sincronización en vuelo, limpia el almacenamiento local de sesión
 *   y la caché de escrutinio (conservando intacta la cola offline en IndexedDB),
 *   emite `cuorum:unauthorized` y redirige al login (`/`).
 */
api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const url = error.config?.url || '';
        if (
            error.response?.status === 401 &&
            !url.includes('/auth/testigos/login') &&
            !url.includes('/auth/logout')
        ) {
            const mensaje = extraerMensajeSesion401(error);
            try {
                localStorage.setItem(AUTH_NOTICE_KEY, mensaje);
            } catch {
                // Entorno sin almacenamiento
            }
            syncModule.cancelarSincronizacion?.();
            syncModule.clearLastSyncTime?.();
            syncModule.clearLastSyncError?.();
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(DATA_KEY);
            localStorage.removeItem(CAMPANA_KEY);
            localStorage.removeItem(ELECCION_KEY);
            localStorage.removeItem(ELECCION_DATA_KEY);
            await idbModule.clearEscrutinioCache?.();
            if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
                window.dispatchEvent(new CustomEvent('cuorum:unauthorized', { detail: { mensaje } }));
            }
            try {
                if (typeof window !== 'undefined' && window.location) {
                    window.location.href = '/';
                }
            } catch {
                // Entorno sin navegación
            }
        }
        return Promise.reject(error);
    },
);
