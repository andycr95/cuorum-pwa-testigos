import { useState } from 'react';
import { guardarResultado } from '../../db/indexeddb';
import { sincronizar } from '../../services/syncService';
import { SelectorEleccion } from './SelectorEleccion';

/**
 * FormularioMesaMultiple - Captura de resultados para múltiples tarjetones
 *
 * Soporta:
 * - Múltiples elecciones por mesa (Presidente + Senado + Cámara, etc.)
 * - Elecciones uninominales (un candidato elegido)
 * - Elecciones colegiadas (listas + voto preferente)
 * - Validación de fraude
 * - Modo offline (IndexedDB)
 */

interface Eleccion {
  id: string;
  nombre: string;
  tipoEleccion: string;
  tipoCargo: 'UNINOMINAL' | 'COLEGIADO';
  votoPreferente: boolean;
  candidatos?: Candidato[];
  listas?: Lista[];
}

interface Candidato {
  id: string;
  nombre: string;
  partido: string;
}

interface Lista {
  id: string;
  nombre: string;
  partido: string;
  tipoLista: 'CERRADA' | 'PREFERENTE';
  candidatos: Candidato[];
}

interface FormularioMesaMultipleProps {
  mesaId: string;
  testigoId: string;
  mesaNumero: number;
  totalSufragantes: number;
  elecciones: Eleccion[];
  deviceId: string;
}

export function FormularioMesaMultiple({
  mesaId,
  testigoId,
  mesaNumero,
  totalSufragantes,
  elecciones,
  deviceId,
}: FormularioMesaMultipleProps) {
  const [eleccionActual, setEleccionActual] = useState<string>(elecciones[0]?.id || '');
  const [votosUninominal, setVotosUninominal] = useState<Record<string, number>>({});
  const [votosLista, setVotosLista] = useState<Record<string, number>>({});
  const [votosPreferente, setVotosPreferente] = useState<Record<string, number>>({});
  const [votosBlanco, setVotosBlanco] = useState(0);
  const [votosNulos, setVotosNulos] = useState(0);
  const [votosNoMarcados, setVotosNoMarcados] = useState(0);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eleccion = elecciones.find((e) => e.id === eleccionActual);

  if (!eleccion) {
    return (
      <div className="max-w-md mx-auto p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error: Elección no encontrada</p>
        </div>
      </div>
    );
  }

  const calcularTotal = () => {
    if (eleccion.tipoCargo === 'UNINOMINAL') {
      return Object.values(votosUninominal).reduce((sum, v) => sum + v, 0)
        + votosBlanco + votosNulos + votosNoMarcados;
    } else {
      // Colegiado: sumar votos a listas + votos preferentes
      const totalListas = Object.values(votosLista).reduce((sum, v) => sum + v, 0);
      const totalPreferentes = Object.values(votosPreferente).reduce((sum, v) => sum + v, 0);
      return totalListas + totalPreferentes + votosBlanco + votosNulos + votosNoMarcados;
    }
  };

  const totalVotos = calcularTotal();
  const hayAlertaFraude = totalVotos > totalSufragantes;

  const handleGuardar = async () => {
    setError(null);

    try {
      if (eleccion.tipoCargo === 'UNINOMINAL') {
        // Guardar resultados uninominales
        for (const candidato of eleccion.candidatos || []) {
          await guardarResultado({
            id: `${mesaId}_${eleccionActual}_${candidato.id}_${Date.now()}`,
            mesaId,
            testigoId,
            eleccionId: eleccionActual,
            candidato: candidato.nombre,
            partido: candidato.partido,
            candidatoId: candidato.id,
            tipoVoto: 'CANDIDATO',
            votos: votosUninominal[candidato.id] || 0,
            votosBlanco,
            votosNulos,
            votosNoMarcados,
            totalVotosMesa: totalVotos,
            capturedAt: new Date().toISOString(),
            deviceId,
          });
        }
      } else {
        // Guardar resultados colegiados (listas)
        for (const lista of eleccion.listas || []) {
          // Votos a la lista (sin preferente)
          await guardarResultado({
            id: `${mesaId}_${eleccionActual}_lista_${lista.id}_${Date.now()}`,
            mesaId,
            testigoId,
            eleccionId: eleccionActual,
            candidato: lista.nombre,
            partido: lista.partido,
            listaId: lista.id,
            tipoVoto: 'LISTA',
            votos: votosLista[lista.id] || 0,
            votosBlanco,
            votosNulos,
            votosNoMarcados,
            totalVotosMesa: totalVotos,
            capturedAt: new Date().toISOString(),
            deviceId,
          });

          // Votos preferentes a candidatos de la lista
          if (eleccion.votoPreferente) {
            for (const candidato of lista.candidatos) {
              const votosPreferenteCand = votosPreferente[candidato.id] || 0;
              if (votosPreferenteCand > 0) {
                await guardarResultado({
                  id: `${mesaId}_${eleccionActual}_preferente_${candidato.id}_${Date.now()}`,
                  mesaId,
                  testigoId,
                  eleccionId: eleccionActual,
                  candidato: candidato.nombre,
                  partido: lista.partido,
                  candidatoId: candidato.id,
                  listaId: lista.id,
                  tipoVoto: 'CANDIDATO',
                  votos: votosPreferenteCand,
                  votosBlanco,
                  votosNulos,
                  votosNoMarcados,
                  totalVotosMesa: totalVotos,
                  capturedAt: new Date().toISOString(),
                  deviceId,
                });
              }
            }
          }
        }
      }

      // Guardar votos especiales (blanco, nulos, no marcados)
      for (const tipoVoto of ['BLANCO', 'NULO', 'NO_MARCADO'] as const) {
        const votos =
          tipoVoto === 'BLANCO' ? votosBlanco :
          tipoVoto === 'NULO' ? votosNulos :
          votosNoMarcados;

        if (votos > 0) {
          await guardarResultado({
            id: `${mesaId}_${eleccionActual}_${tipoVoto}_${Date.now()}`,
            mesaId,
            testigoId,
            eleccionId: eleccionActual,
            candidato: tipoVoto,
            partido: '',
            tipoVoto,
            votos,
            votosBlanco,
            votosNulos,
            votosNoMarcados,
            totalVotosMesa: totalVotos,
            capturedAt: new Date().toISOString(),
            deviceId,
          });
        }
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

  const limpiarFormulario = () => {
    setVotosUninominal({});
    setVotosLista({});
    setVotosPreferente({});
    setVotosBlanco(0);
    setVotosNulos(0);
    setVotosNoMarcados(0);
    setGuardado(false);
    setError(null);
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

        {/* Selector de Elección */}
        <SelectorEleccion
          elecciones={elecciones}
          eleccionActual={eleccionActual}
          onCambiar={(id) => {
            setEleccionActual(id);
            limpiarFormulario();
          }}
        />

        {/* Alerta de fraude */}
        {hayAlertaFraude && (
          <div className="mb-4 p-4 bg-red-50 border-2 border-red-500 rounded-lg animate-pulse">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-bold text-red-700">ALERTA DE FRAUDE</p>
                <p className="text-sm text-red-600">
                  Total votos ({totalVotos}) SUPERA sufragantes ({totalSufragantes})
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Formulario Uninominal */}
        {eleccion.tipoCargo === 'UNINOMINAL' && (
          <div className="space-y-3 mb-6">
            {eleccion.candidatos?.map((candidato) => (
              <div key={candidato.id} className="flex items-center gap-3">
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
                  value={votosUninominal[candidato.id] || ''}
                  onChange={(e) => {
                    const num = parseInt(e.target.value) || 0;
                    if (num >= 0) {
                      setVotosUninominal({ ...votosUninominal, [candidato.id]: num });
                      setGuardado(false);
                    }
                  }}
                  className="w-20 px-3 py-2 border-2 border-gray-300 rounded-lg text-center text-lg font-bold focus:border-blue-500 focus:outline-none"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        )}

        {/* Formulario Colegiado (Listas) */}
        {eleccion.tipoCargo === 'COLEGIADO' && (
          <div className="space-y-4 mb-6">
            {eleccion.listas?.map((lista) => (
              <div key={lista.id} className="border border-gray-200 rounded-lg p-3">
                {/* Votos a la Lista */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">
                      {lista.nombre}
                    </p>
                    <p className="text-xs text-gray-500">{lista.partido}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 mb-1">Votos a lista</p>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={votosLista[lista.id] || ''}
                      onChange={(e) => {
                        const num = parseInt(e.target.value) || 0;
                        if (num >= 0) {
                          setVotosLista({ ...votosLista, [lista.id]: num });
                          setGuardado(false);
                        }
                      }}
                      className="w-20 px-3 py-2 border-2 border-gray-300 rounded-lg text-center text-lg font-bold focus:border-blue-500 focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Voto Preferente */}
                {eleccion.votoPreferente && lista.tipoLista === 'PREFERENTE' && (
                  <div className="border-t border-gray-100 pt-3 space-y-2">
                    <p className="text-xs font-medium text-gray-600 mb-2">
                      Voto Preferente (opcional)
                    </p>
                    {lista.candidatos.map((candidato) => (
                      <div key={candidato.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 text-gray-700 truncate">
                          {candidato.nombre}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={votosPreferente[candidato.id] || ''}
                          onChange={(e) => {
                            const num = parseInt(e.target.value) || 0;
                            if (num >= 0) {
                              setVotosPreferente({ ...votosPreferente, [candidato.id]: num });
                              setGuardado(false);
                            }
                          }}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm font-semibold focus:border-blue-500 focus:outline-none"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

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
                  const num = parseInt(e.target.value) || 0;
                  if (num >= 0) {
                    setter(num);
                    setGuardado(false);
                  }
                }}
                className="w-20 px-3 py-2 border-2 border-gray-300 rounded-lg text-center text-lg font-bold focus:border-blue-500 focus:outline-none"
                placeholder="0"
              />
            </div>
          ))}
        </div>

        {/* Total */}
        <div
          className={`p-3 rounded-lg text-center mb-4 ${
            hayAlertaFraude ? 'bg-red-100 border-2 border-red-400' : 'bg-gray-100'
          }`}
        >
          <span className="text-sm text-gray-600">Total votos: </span>
          <span
            className={`text-2xl font-bold ${
              hayAlertaFraude ? 'text-red-600' : 'text-gray-800'
            }`}
          >
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
          {guardado ? '✓ Guardado' : hayAlertaFraude ? 'Guardar con Alerta' : 'Guardar Resultados'}
        </button>

        {/* Estado de conexión */}
        <div className="mt-3 text-center">
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${
              navigator.onLine ? 'text-green-600' : 'text-orange-500'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                navigator.onLine ? 'bg-green-500' : 'bg-orange-400'
              }`}
            />
            {navigator.onLine
              ? 'En línea — sincronización automática'
              : 'Sin conexión — guardado local'}
          </span>
        </div>

        {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
      </div>
    </div>
  );
}
