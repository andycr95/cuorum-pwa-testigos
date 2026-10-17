interface Eleccion {
  id: string;
  nombre: string;
  tipoEleccion: string;
  tipoCargo: 'UNINOMINAL' | 'LISTA' | 'LISTA_CON_PREFERENTE';
}

interface SelectorEleccionProps {
  elecciones: Eleccion[];
  eleccionActual: string;
  onCambiar: (eleccionId: string) => void;
}

export function SelectorEleccion({
  elecciones,
  eleccionActual,
  onCambiar,
}: SelectorEleccionProps) {
  if (elecciones.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-yellow-800">
          No hay elecciones configuradas para esta mesa
        </p>
      </div>
    );
  }

  if (elecciones.length === 1) {
    const eleccion = elecciones[0];
    return (
      <div className="relative overflow-hidden bg-red-50/50 border-2 border-editorial-red/30 rounded-xl p-4 mb-6 shadow-sm">
        <div className="relative">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-editorial-red rounded-lg flex items-center justify-center text-white shadow-sm">
              <span className="text-xl">🗳️</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-editorial-red uppercase tracking-wider mb-1">
                Tarjetón Electoral
              </p>
              <p className="text-base font-black text-editorial-black mb-1">
                {eleccion.nombre}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-block px-2 py-0.5 bg-white rounded-md text-xs font-bold text-editorial-red uppercase border border-editorial-red/20">
                  {eleccion.tipoEleccion}
                </span>
                <span className="inline-block px-2 py-0.5 bg-editorial-red text-white rounded-md text-xs font-bold uppercase">
                  {eleccion.tipoCargo === 'UNINOMINAL' ? 'Uninominal' : 'Colegiado'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-5 bg-editorial-red rounded-full"></div>
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Seleccione Tarjetón
        </label>
      </div>
      <div className="space-y-2">
        {elecciones.map((eleccion) => (
          <button
            key={eleccion.id}
            type="button"
            onClick={() => onCambiar(eleccion.id)}
            className={`relative w-full text-left p-4 rounded-xl border-2 transition-all overflow-hidden ${
              eleccionActual === eleccion.id
                ? 'border-editorial-red bg-red-50/60 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
            }`}
          >
            {/* Indicador de seleccionado */}
            {eleccionActual === eleccion.id && (
              <div className="absolute top-3 right-3 w-6 h-6 bg-editorial-red rounded-full flex items-center justify-center shadow-md">
                <span className="text-white text-xs font-bold">✓</span>
              </div>
            )}

            <div className="relative">
              <p className={`text-sm font-black mb-1 pr-8 ${
                eleccionActual === eleccion.id ? 'text-editorial-black' : 'text-gray-800'
              }`}>
                {eleccion.nombre}
              </p>
              <div className="flex items-center gap-2">
                <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold uppercase ${
                  eleccionActual === eleccion.id
                    ? 'bg-white text-editorial-red border border-editorial-red/20'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {eleccion.tipoEleccion}
                </span>
                <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold uppercase ${
                  eleccionActual === eleccion.id
                    ? 'bg-editorial-red text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}>
                  {eleccion.tipoCargo === 'UNINOMINAL' ? 'Uninominal' : 'Colegiado'}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
