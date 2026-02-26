import axios from 'axios';

export const api = axios.create({
    // baseURL: '/api-v1',
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' },
});

const TOKEN_KEY = 'cuorum_testigo_token';
const DATA_KEY = 'cuorum_testigo_data';
const CAMPANA_KEY = 'cuorum_testigo_campana';

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
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(DATA_KEY);
            localStorage.removeItem(CAMPANA_KEY);
            // AuthContext handles redirect — avoid full page reload
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    },
);
