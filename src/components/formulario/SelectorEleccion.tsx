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
      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3.5 mb-4">
        <p className="text-sm font-semibold text-amber-900">
          No hay elecciones configuradas para esta mesa
        </p>
      </div>
    );
  }

  if (elecciones.length === 1) {
    const eleccion = elecciones[0];
    return (
      <div className="bg-red-50/50 border-2 border-editorial-red/30 rounded-2xl p-4 mb-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-11 h-11 bg-editorial-red rounded-xl flex items-center justify-center text-white shadow-sm">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-editorial-red uppercase tracking-wider mb-1">
              Tarjetón Electoral
            </p>
            <p className="text-base font-black text-gray-900 leading-snug mb-2">
              {eleccion.nombre}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block px-2.5 py-1 bg-white rounded-lg text-xs font-bold text-editorial-red uppercase border border-editorial-red/20">
                {eleccion.tipoEleccion}
              </span>
              <span className="inline-block px-2.5 py-1 bg-editorial-red text-white rounded-lg text-xs font-bold uppercase">
                {eleccion.tipoCargo === 'UNINOMINAL' ? 'Uninominal' : 'Colegiado'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-1.5 h-4 bg-editorial-red rounded-full" />
        <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
          Seleccione Tarjetón
        </label>
      </div>
      <div className="space-y-2">
        {elecciones.map((eleccion) => {
          const seleccionada = eleccionActual === eleccion.id;
          return (
            <button
              key={eleccion.id}
              type="button"
              onClick={() => onCambiar(eleccion.id)}
              className={`relative w-full text-left p-3.5 rounded-2xl border-2 transition-all min-h-[56px] flex items-center justify-between gap-3 ${
                seleccionada
                  ? 'border-editorial-red bg-red-50/50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm sm:text-base font-black mb-1.5 leading-snug ${
                  seleccionada ? 'text-gray-900' : 'text-gray-800'
                }`}>
                  {eleccion.nombre}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold uppercase ${
                    seleccionada
                      ? 'bg-white text-editorial-red border border-editorial-red/20'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {eleccion.tipoEleccion}
                  </span>
                  <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold uppercase ${
                    seleccionada
                      ? 'bg-editorial-red text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}>
                    {eleccion.tipoCargo === 'UNINOMINAL' ? 'Uninominal' : 'Colegiado'}
                  </span>
                </div>
              </div>

              {seleccionada && (
                <div className="w-7 h-7 bg-editorial-red rounded-full flex items-center justify-center shadow-sm flex-shrink-0 text-white text-xs font-black">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
