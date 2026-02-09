interface Eleccion {
  id: string;
  nombre: string;
  tipoEleccion: string;
  tipoCargo: 'UNINOMINAL' | 'COLEGIADO';
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
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <p className="text-xs text-blue-600 font-medium mb-1">Tarjetón</p>
        <p className="text-sm font-bold text-blue-900">{eleccion.nombre}</p>
        <p className="text-xs text-blue-600 mt-1">
          {eleccion.tipoEleccion} • {eleccion.tipoCargo === 'UNINOMINAL' ? 'Uninominal' : 'Colegiado'}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Selecciona el Tarjetón
      </label>
      <div className="space-y-2">
        {elecciones.map((eleccion) => (
          <button
            key={eleccion.id}
            type="button"
            onClick={() => onCambiar(eleccion.id)}
            className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
              eleccionActual === eleccion.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className={`text-sm font-bold ${
              eleccionActual === eleccion.id ? 'text-blue-900' : 'text-gray-800'
            }`}>
              {eleccion.nombre}
            </p>
            <p className={`text-xs mt-1 ${
              eleccionActual === eleccion.id ? 'text-blue-600' : 'text-gray-500'
            }`}>
              {eleccion.tipoEleccion} • {eleccion.tipoCargo === 'UNINOMINAL' ? 'Uninominal' : 'Colegiado'}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
