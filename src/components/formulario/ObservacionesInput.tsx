/**
 * Componente para capturar observaciones del testigo sobre la mesa
 */

interface ObservacionesInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ObservacionesInput({
  value,
  onChange,
  disabled = false,
}: ObservacionesInputProps) {
  const maxLength = 500;
  const remaining = maxLength - value.length;

  return (
    <div className="space-y-3">
      {/* Título de la sección */}
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-editorial-red rounded-full"></div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Observaciones (Opcional)
        </p>
      </div>

      {/* Textarea */}
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={maxLength}
          placeholder="Escribe cualquier observación sobre el conteo, irregularidades, incidentes, o comentarios adicionales..."
          rows={4}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-editorial-red focus:outline-none focus:ring-2 focus:ring-editorial-red/20 resize-none text-sm text-gray-800 placeholder-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        />

        {/* Contador de caracteres */}
        <div className="absolute bottom-3 right-3 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-md border border-gray-200">
          <p className={`text-xs font-bold ${
            remaining < 50 ? 'text-orange-600' : 'text-gray-500'
          }`}>
            {remaining} / {maxLength}
          </p>
        </div>
      </div>

      {/* Ejemplos de observaciones */}
      {!value && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-600 font-semibold mb-2">
            📝 Ejemplos de observaciones:
          </p>
          <ul className="text-xs text-gray-600 space-y-1 ml-3">
            <li>• "Conteo realizado sin novedad"</li>
            <li>• "Demora en inicio del escrutinio"</li>
            <li>• "Inconsistencia en el número de votantes"</li>
            <li>• "E-14 con tachaduras o correcciones"</li>
          </ul>
        </div>
      )}
    </div>
  );
}
