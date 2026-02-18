import { useState, useEffect } from 'react';
import { FormularioMesaMultiple } from './components/formulario/FormularioMesaMultiple';
import { LoginPage } from './components/auth/LoginPage';
import { SelectorMesa } from './components/auth/SelectorMesa';
import { authService, TestigoData } from './services/authService';

/**
 * PWA Testigos Electorales
 *
 * Aplicación offline-first para reporte de resultados desde las mesas
 */

export function App() {
  const [testigoData, setTestigoData] = useState<TestigoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedMesaId, setSelectedMesaId] = useState<string | null>(null);

  // Verificar autenticación al cargar la app
  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);

      // Verificar si hay sesión guardada
      if (!authService.isAuthenticated()) {
        setLoading(false);
        setIsAuthenticated(false);
        return;
      }

      // Verificar si el token sigue siendo válido
      const isValid = await authService.verifyToken();

      if (!isValid) {
        // Token expirado, limpiar sesión
        authService.logout();
        setLoading(false);
        setIsAuthenticated(false);
        return;
      }

      // Cargar datos del testigo
      const data = authService.getTestigoData();
      if (data) {
        setTestigoData(data);
        setIsAuthenticated(true);
        
        // Autoseleccionar si solo hay una mesa
        const listaMesas = data.mesas || [data.mesa];
        if (listaMesas.length === 1) {
          setSelectedMesaId(listaMesas[0].id);
        }
      } else {
        authService.logout();
        setIsAuthenticated(false);
      }

      setLoading(false);
    };

    checkAuth();
  }, []);

  // Manejar login exitoso
  const handleLoginSuccess = () => {
    const data = authService.getTestigoData();
    if (data) {
      setTestigoData(data);
      setIsAuthenticated(true);
      
      const listaMesas = data.mesas || [data.mesa];
      if (listaMesas.length === 1) {
        setSelectedMesaId(listaMesas[0].id);
      }
    }
  };

  // Manejar logout
  const handleLogout = () => {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      authService.logout();
      setTestigoData(null);
      setIsAuthenticated(false);
      setSelectedMesaId(null);
    }
  };

  // Volver al selector de mesa
  const handleBackToSelector = () => {
    setSelectedMesaId(null);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-editorial-red/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-editorial-red border-t-transparent animate-spin"></div>
          </div>
          <p className="text-sm font-semibold text-gray-700 tracking-wide">VERIFICANDO SESIÓN</p>
          <div className="mt-2 flex items-center justify-center gap-1">
            <div className="w-1.5 h-1.5 bg-editorial-red rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-1.5 h-1.5 bg-editorial-red rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-1.5 h-1.5 bg-editorial-red rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  // Mostrar login si no está autenticado
  if (!isAuthenticated || !testigoData) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Obtener mesa seleccionada
  const listaMesas = testigoData.mesas || [testigoData.mesa];
  const mesaSeleccionada = listaMesas.find(m => m.id === selectedMesaId);

  // Si no hay mesa seleccionada, mostrar el selector
  if (!selectedMesaId || !mesaSeleccionada) {
    return (
      <div className="min-h-screen bg-white">
        <div className="bg-editorial-red px-4 py-6 flex items-center justify-between">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
            <img src="/logo.svg" alt="Cuorum" className="w-6 h-6" />
          </div>
          <button onClick={handleLogout} className="text-white/80 text-xs font-bold uppercase tracking-wider">
            Cerrar Sesión
          </button>
        </div>
        <SelectorMesa 
          mesas={listaMesas} 
          onSelect={setSelectedMesaId} 
          testigoNombre={`${testigoData.testigo.nombres} ${testigoData.testigo.apellidos}`}
        />
      </div>
    );
  }

  // Mostrar app principal si está autenticado y tiene mesa seleccionada
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header Premium - Refinado */}
      <div className="sticky top-0 z-50 bg-gradient-to-br from-editorial-red via-red-700 to-red-900 shadow-2xl shadow-red-900/50 border-b-4 border-red-950">
        {/* Patrón de fondo más visible */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

        {/* Brillo superior */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>

        <div className="relative max-w-md mx-auto px-4 py-5">
          {/* Logo + Título */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-2xl shadow-red-950/50 ring-2 ring-white/20">
              <img src="/logo.svg" alt="Cuorum" className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-black text-white tracking-tight uppercase leading-tight" style={{ letterSpacing: '0.05em', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                Cuorum Testigos
              </h1>
              <p className="text-[11px] text-red-50 font-bold uppercase tracking-wider" style={{ letterSpacing: '0.1em' }}>
                Sistema Oficial de Reporte
              </p>
            </div>
            {/* Botón Volver al Selector (solo si hay más de una mesa) */}
            {(testigoData.mesas?.length || 0) > 1 && (
              <button
                onClick={handleBackToSelector}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors mr-1"
                title="Cambiar de mesa"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="ArrowLeftIcon" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            )}
            {/* Botón Logout */}
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Cerrar sesión"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>

          {/* Info del Testigo - Badge Premium */}
          <div className="bg-white/15 backdrop-blur-md border-2 border-white/30 rounded-2xl px-4 py-3 shadow-lg shadow-black/10">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-red-50 font-black uppercase tracking-widest mb-1" style={{ letterSpacing: '0.15em' }}>
                  Testigo Electoral
                </p>
                <p className="text-base font-black text-white truncate leading-tight">
                  {testigoData.testigo.nombres} {testigoData.testigo.apellidos}
                </p>
                <p className="text-[11px] text-red-50/90 mt-1 font-semibold">
                  CC {testigoData.testigo.cedula}
                </p>
              </div>
              <div className="text-right border-l-2 border-white/30 pl-4">
                <p className="text-[10px] text-red-50 font-black uppercase tracking-widest mb-1" style={{ letterSpacing: '0.15em' }}>
                  Mesa
                </p>
                <p className="text-3xl font-black text-white leading-none" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                  #{mesaSeleccionada.numero}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <FormularioMesaMultiple
        mesaId={mesaSeleccionada.id}
        testigoId={testigoData.testigo.id}
        mesaNumero={mesaSeleccionada.numero}
        totalSufragantes={mesaSeleccionada.totalSufragantes}
        elecciones={testigoData.elecciones}
        deviceId={testigoData.deviceId}
      />
    </div>
  );
}
