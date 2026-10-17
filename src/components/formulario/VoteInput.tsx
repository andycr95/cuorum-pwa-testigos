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
  disabled?: boolean;
}

export function VoteInput({
  value,
  onChange,
  label,
  subtitle,
  size = 'normal',
  variant = 'candidate',
  disabled = false,
}: VoteInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const num = parseInt(e.target.value) || 0;
    if (num >= 0 && num <= 9999) {
      onChange(num);
    }
  };

  const increment = () => {
    if (disabled || value >= 9999) return;
    onChange(value + 1);
  };

  const decrement = () => {
    if (disabled || value <= 0) return;
    onChange(value - 1);
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
          <p className="text-xs text-gray-600 truncate mt-0.5 font-medium">{subtitle}</p>
        )}
      </div>

      {/* Input Container - Premium Depth */}
      <div className="flex items-center gap-2">
        {/* Botón Decrementar */}
        <button
          type="button"
          onClick={decrement}
          disabled={disabled || value === 0}
          aria-label={`Disminuir votos de ${label}`}
          className={`flex items-center justify-center rounded-xl font-black transition-all active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed shadow-md hover:shadow-lg min-w-[44px] min-h-[44px] ${
            isLarge
              ? 'w-12 h-12 text-xl'
              : 'w-11 h-11 text-lg'
          } ${
            isSpecial
              ? 'bg-gray-100 hover:bg-gray-200 text-gray-800 border-2 border-gray-300 shadow-gray-200'
              : 'bg-red-50 hover:bg-red-100 text-editorial-red border-2 border-editorial-red/40 shadow-red-100'
          }`}
        >
          −
        </button>

        {/* Display de Número */}
        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="9999"
            value={value || ''}
            onChange={handleChange}
            disabled={disabled}
            aria-label={`Votos de ${label}`}
            className={`text-center font-black border-3 rounded-2xl transition-all focus:outline-none focus:ring-4 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed ${
              isLarge
                ? 'w-24 h-12 text-3xl'
                : 'w-20 h-11 text-2xl'
            } ${
              value > 0
                ? isSpecial
                  ? 'border-gray-500 bg-gray-100 text-gray-900 shadow-gray-200 focus:ring-gray-200'
                  : 'border-editorial-red bg-red-50 text-editorial-red shadow-red-200 focus:ring-editorial-red/30'
                : 'border-gray-300 bg-white text-gray-600 shadow-gray-100 focus:ring-gray-200'
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

        {/* Botón Incrementar */}
        <button
          type="button"
          onClick={increment}
          disabled={disabled || value >= 9999}
          aria-label={`Aumentar votos de ${label}`}
          className={`flex items-center justify-center rounded-xl font-black transition-all active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed shadow-md hover:shadow-lg min-w-[44px] min-h-[44px] ${
            isLarge
              ? 'w-12 h-12 text-xl'
              : 'w-11 h-11 text-lg'
          } ${
            isSpecial
              ? 'bg-gray-100 hover:bg-gray-200 text-gray-800 border-2 border-gray-300 shadow-gray-200'
              : 'bg-red-50 hover:bg-red-100 text-editorial-red border-2 border-editorial-red/40 shadow-red-100'
          }`}
        >
          +
        </button>
      </div>
    </div>
  );
}
