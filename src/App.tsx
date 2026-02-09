import { useState, useEffect } from 'react';
import { FormularioMesaMultiple } from './components/formulario/FormularioMesaMultiple';

/**
 * PWA Testigos Electorales
 *
 * Aplicación offline-first para reporte de resultados desde las mesas
 */

export function App() {
  const [testigoData, setTestigoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Implementar autenticación y carga de datos del testigo
    // Por ahora, datos de demo
    const mockData = {
      testigo: {
        id: 'testigo-demo-001',
        nombres: 'Juan',
        apellidos: 'Pérez',
        cedula: '123456789'
      },
      mesa: {
        id: 'mesa-demo-001',
        numero: 101,
        totalSufragantes: 300
      },
      elecciones: [
        {
          id: 'eleccion-demo-2026',
          nombre: 'Alcaldía Bogotá 2026',
          tipoEleccion: 'ALCALDIA',
          tipoCargo: 'UNINOMINAL' as const,
          votoPreferente: false,
          candidatos: [
            {
              id: 'cand-001',
              nombre: 'Carlos Ramírez',
              partido: 'Partido Verde'
            },
            {
              id: 'cand-002',
              nombre: 'María González',
              partido: 'Alianza Centro'
            },
            {
              id: 'cand-003',
              nombre: 'José López',
              partido: 'Coalición Esperanza'
            }
          ]
        }
      ],
      deviceId: `device-${Date.now()}`
    };

    setTimeout(() => {
      setTestigoData(mockData);
      setLoading(false);
    }, 500);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-editorial-red/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-editorial-red border-t-transparent animate-spin"></div>
          </div>
          <p className="text-sm font-semibold text-gray-700 tracking-wide">CARGANDO DATOS</p>
          <div className="mt-2 flex items-center justify-center gap-1">
            <div className="w-1.5 h-1.5 bg-editorial-red rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-1.5 h-1.5 bg-editorial-red rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-1.5 h-1.5 bg-editorial-red rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (!testigoData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl shadow-red-100 p-8 max-w-md border-t-4 border-editorial-red">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-editorial-black text-center mb-3">
            ERROR DE AUTENTICACIÓN
          </h1>
          <p className="text-gray-600 text-center text-sm leading-relaxed">
            No se pudo cargar la información del testigo. Por favor, inicia sesión nuevamente para continuar.
          </p>
        </div>
      </div>
    );
  }

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
                  #{testigoData.mesa.numero}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <FormularioMesaMultiple
        mesaId={testigoData.mesa.id}
        testigoId={testigoData.testigo.id}
        mesaNumero={testigoData.mesa.numero}
        totalSufragantes={testigoData.mesa.totalSufragantes}
        elecciones={testigoData.elecciones}
        deviceId={testigoData.deviceId}
      />
    </div>
  );
}
