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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!testigoData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md">
          <h1 className="text-xl font-bold text-gray-800 mb-4">Error de Autenticación</h1>
          <p className="text-gray-600">
            No se pudo cargar la información del testigo. Por favor, inicia sesión nuevamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* Header */}
      <div className="bg-blue-600 text-white py-4 px-4 mb-6 shadow-md">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold">PolTech Testigos</h1>
          <p className="text-sm text-blue-100 mt-1">
            {testigoData.testigo.nombres} {testigoData.testigo.apellidos} • Mesa #{testigoData.mesa.numero}
          </p>
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
