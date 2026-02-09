import { useState } from 'react';
import { guardarResultado } from '../../db/indexeddb';
import { sincronizar } from '../../services/syncService';

/**
 * FormularioMesa - Captura de resultados electorales por mesa
 *
 * Validación crítica:
 * Total Votos Mesa <= Total Sufragantes
 * Si total votos > sufragantes → ALERTA VISUAL DE FRAUDE
 *
 * Funciona 100% offline: guarda en IndexedDB
 */

interface Candidato {
  nombre: string;
  partido: string;
}

interface FormularioMesaProps {
  mesaId: string;
  testigoId: string;
  mesaNumero: number;
  totalSufragantes: number;
  candidatos: Candidato[];
  deviceId: string;
}

export function FormularioMesa({
  mesaId,
  testigoId,
  mesaNumero,
  totalSufragantes,
  candidatos,
  deviceId,
}: FormularioMesaProps) {
  const [votos, setVotos] = useState<Record<string, number>>(
    Object.fromEntries(candidatos.map(c => [c.nombre, 0]))
  );
  const [votosBlanco, setVotosBlanco] = useState(0);
  const [votosNulos, setVotosNulos] = useState(0);
  const [votosNoMarcados, setVotosNoMarcados] = useState(0);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalVotos = Object.values(votos).reduce((sum, v) => sum + v, 0)
    + votosBlanco + votosNulos + votosNoMarcados;

  const hayAlertaFraude = totalVotos > totalSufragantes;

  const handleVotoChange = (candidato: string, valor: string) => {
    const num = parseInt(valor) || 0;
    if (num < 0) return;
    setVotos(prev => ({ ...prev, [candidato]: num }));
    setGuardado(false);
  };

  const handleGuardar = async () => {
    setError(null);

    try {
      // Guardar cada candidato como registro individual
      for (const candidato of candidatos) {
        await guardarResultado({
          id: `${mesaId}_${candidato.nombre}_${Date.now()}`,
          mesaId,
          testigoId,
          candidato: candidato.nombre,
          partido: candidato.partido,
          votos: votos[candidato.nombre] || 0,
          votosBlanco,
          votosNulos,
          votosNoMarcados,
          totalVotosMesa: totalVotos,
          capturedAt: new Date().toISOString(),
          deviceId,
        });
      }

      setGuardado(true);

      // Intentar sincronizar si hay conexión
      if (navigator.onLine) {
        await sincronizar();
      }
    } catch (err) {
      setError('Error al guardar. Los datos se reintentarán automáticamente.');
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-white rounded-xl shadow-lg p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">Mesa #{mesaNumero}</h2>
          <p className="text-sm text-gray-500">
            Sufragantes habilitados: <span className="font-semibold">{totalSufragantes}</span>
          </p>
        </div>

        {/* Alerta de fraude */}
        {hayAlertaFraude && (
          <div className="mb-4 p-4 bg-red-50 border-2 border-red-500 rounded-lg animate-pulse">
            <div className="flex items-center gap-2">
              <span className="text-2xl">!!</span>
              <div>
                <p className="font-bold text-red-700">ALERTA DE FRAUDE</p>
                <p className="text-sm text-red-600">
                  Total votos ({totalVotos}) SUPERA sufragantes ({totalSufragantes})
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Votos por candidato */}
        <div className="space-y-3 mb-6">
          {candidatos.map((candidato) => (
            <div key={candidato.nombre} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {candidato.nombre}
                </p>
                <p className="text-xs text-gray-500">{candidato.partido}</p>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={votos[candidato.nombre] || ''}
                onChange={(e) => handleVotoChange(candidato.nombre, e.target.value)}
                className="w-20 px-3 py-2 border-2 border-gray-300 rounded-lg text-center text-lg font-bold focus:border-blue-500 focus:outline-none"
                placeholder="0"
              />
            </div>
          ))}
        </div>

        {/* Separador */}
        <hr className="my-4 border-gray-200" />

        {/* Votos especiales */}
        <div className="space-y-3 mb-6">
          {[
            { label: 'Votos en blanco', value: votosBlanco, setter: setVotosBlanco },
            { label: 'Votos nulos', value: votosNulos, setter: setVotosNulos },
            { label: 'No marcados', value: votosNoMarcados, setter: setVotosNoMarcados },
          ].map(({ label, value, setter }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{label}</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={value || ''}
                onChange={(e) => {
                  setter(parseInt(e.target.value) || 0);
                  setGuardado(false);
                }}
                className="w-20 px-3 py-2 border-2 border-gray-300 rounded-lg text-center text-lg font-bold focus:border-blue-500 focus:outline-none"
                placeholder="0"
              />
            </div>
          ))}
        </div>

        {/* Total */}
        <div className={`p-3 rounded-lg text-center mb-4 ${
          hayAlertaFraude ? 'bg-red-100 border-2 border-red-400' : 'bg-gray-100'
        }`}>
          <span className="text-sm text-gray-600">Total votos: </span>
          <span className={`text-2xl font-bold ${
            hayAlertaFraude ? 'text-red-600' : 'text-gray-800'
          }`}>
            {totalVotos}
          </span>
          <span className="text-sm text-gray-500"> / {totalSufragantes}</span>
        </div>

        {/* Botón guardar */}
        <button
          onClick={handleGuardar}
          disabled={guardado}
          className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${
            guardado
              ? 'bg-green-500'
              : hayAlertaFraude
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {guardado ? 'Guardado' : hayAlertaFraude ? 'Guardar con Alerta' : 'Guardar Resultados'}
        </button>

        {/* Estado de conexión */}
        <div className="mt-3 text-center">
          <span className={`inline-flex items-center gap-1.5 text-xs ${
            navigator.onLine ? 'text-green-600' : 'text-orange-500'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              navigator.onLine ? 'bg-green-500' : 'bg-orange-400'
            }`} />
            {navigator.onLine ? 'En línea — sincronización automática' : 'Sin conexión — guardado local'}
          </span>
        </div>

        {error && (
          <p className="mt-2 text-xs text-red-500 text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
