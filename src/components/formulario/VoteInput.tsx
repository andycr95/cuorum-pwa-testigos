/**
 * VoteInput - Input numérico premium estilo "contador electoral oficial"
 *
 * Características:
 * - Grande y táctil para uso en smartphone
 * - Animación de "stamp" al cambiar valor
 * - Feedback visual inmediato
 * - Estilo institucional CNE
 */

interface VoteInputProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  subtitle?: string;
  size?: 'normal' | 'large';
  variant?: 'candidate' | 'special';
}

export function VoteInput({
  value,
  onChange,
  label,
  subtitle,
  size = 'normal',
  variant = 'candidate',
}: VoteInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = parseInt(e.target.value) || 0;
    if (num >= 0 && num <= 9999) {
      onChange(num);
    }
  };

  const increment = () => {
    if (value < 9999) onChange(value + 1);
  };

  const decrement = () => {
    if (value > 0) onChange(value - 1);
  };

  const isLarge = size === 'large';
  const isSpecial = variant === 'special';

  return (
    <div className={`flex items-center gap-3 group ${isLarge ? 'mb-1' : ''}`}>
      {/* Label - Tipografía refinada */}
      <div className="flex-1 min-w-0">
        <p className={`font-bold text-editorial-black truncate leading-tight ${
          isLarge ? 'text-base' : 'text-sm'
        }`}>
          {label}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-500 truncate mt-0.5 font-medium">{subtitle}</p>
        )}
      </div>

      {/* Input Container - Premium Depth */}
      <div className="flex items-center gap-2">
        {/* Botón Decrementar - Con sombra */}
        <button
          type="button"
          onClick={decrement}
          disabled={value === 0}
          className={`flex items-center justify-center rounded-xl font-black transition-all active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed shadow-md hover:shadow-lg ${
            isLarge
              ? 'w-12 h-12 text-xl'
              : 'w-10 h-10 text-lg'
          } ${
            isSpecial
              ? 'bg-gradient-to-br from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 text-gray-700 border-2 border-gray-300 shadow-gray-200'
              : 'bg-gradient-to-br from-editorial-red/10 to-editorial-red/20 hover:from-editorial-red/20 hover:to-editorial-red/30 text-editorial-red border-2 border-editorial-red/40 shadow-red-100'
          }`}
        >
          −
        </button>

        {/* Display de Número - Efecto "Stamp" Premium */}
        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="9999"
            value={value || ''}
            onChange={handleChange}
            className={`text-center font-black border-3 rounded-2xl transition-all focus:outline-none focus:ring-4 shadow-lg ${
              isLarge
                ? 'w-24 h-12 text-3xl'
                : 'w-20 h-10 text-2xl'
            } ${
              value > 0
                ? isSpecial
                  ? 'border-gray-500 bg-gradient-to-br from-gray-50 to-gray-100 text-gray-900 shadow-gray-200 focus:ring-gray-200'
                  : 'border-editorial-red bg-gradient-to-br from-red-50 to-red-100 text-editorial-red shadow-red-200 focus:ring-editorial-red/30'
                : 'border-gray-300 bg-white text-gray-400 shadow-gray-100 focus:ring-gray-200'
            }`}
            placeholder="0"
            style={{
              WebkitAppearance: 'none',
              MozAppearance: 'textfield',
            }}
          />
          {/* Efecto glow al tener valor */}
          {value > 0 && (
            <div className={`absolute -inset-1 rounded-2xl pointer-events-none blur-sm ${
              isSpecial ? 'bg-gray-300' : 'bg-editorial-red'
            } opacity-20 animate-pulse`}></div>
          )}
        </div>

        {/* Botón Incrementar - Con sombra */}
        <button
          type="button"
          onClick={increment}
          disabled={value >= 9999}
          className={`flex items-center justify-center rounded-xl font-black transition-all active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed shadow-md hover:shadow-lg ${
            isLarge
              ? 'w-12 h-12 text-xl'
              : 'w-10 h-10 text-lg'
          } ${
            isSpecial
              ? 'bg-gradient-to-br from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 text-gray-700 border-2 border-gray-300 shadow-gray-200'
              : 'bg-gradient-to-br from-editorial-red/10 to-editorial-red/20 hover:from-editorial-red/20 hover:to-editorial-red/30 text-editorial-red border-2 border-editorial-red/40 shadow-red-100'
          }`}
        >
          +
        </button>
      </div>
    </div>
  );
}
