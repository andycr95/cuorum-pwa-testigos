import axios from 'axios';
import * as idbModule from '../db/indexeddb';
import * as syncModule from './syncService';

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

// Interceptor: manejar 401
api.interceptors.response.use(
    (res) => res,
    async (error) => {
        if (error.response?.status === 401 && !error.config?.url?.includes('/auth/testigos/login')) {
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
                window.dispatchEvent(new CustomEvent('cuorum:unauthorized'));
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
