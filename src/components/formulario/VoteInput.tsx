import React from 'react';

/**
 * VoteInput - Input numérico táctil y legible para conteo de mesa electoral
 *
 * Cumple con los criterios de diseño y accesibilidad de Cuorum:
 * - Botones táctiles − y + de 56×56 px (objetivo táctil ≥ 48 px)
 * - Valor numérico central grande (≥ 28 px, text-3xl font-black)
 * - Nombres completos legibles en dos líneas sin truncamiento
 * - Indicador de número de tarjetón (#) y partido
 * - Sin degradados, rojo de marca #DC2626 y contraste AA en todas las variantes
 */

export interface VoteInputProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  subtitle?: string;
  numero?: number | string | null;
  size?: 'normal' | 'large';
  variant?: 'candidate' | 'special';
  disabled?: boolean;
}

export function VoteInput({
  value,
  onChange,
  label,
  subtitle,
  numero,
  variant = 'candidate',
  disabled = false,
}: VoteInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const num = parseInt(e.target.value, 10);
    if (Number.isNaN(num)) {
      onChange(0);
      return;
    }
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

  const isSpecial = variant === 'special';

  return (
    <div
      data-testid="vote-input-row"
      className={`rounded-2xl border-2 transition-all p-3.5 shadow-sm bg-white ${
        value > 0
          ? isSpecial
            ? 'border-gray-400 bg-gray-50/60'
            : 'border-editorial-red/60 bg-red-50/30'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Cabecera: Número, nombre completo (en 2 líneas sin truncate) y partido */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {numero !== undefined && numero !== null && (
              <span
                data-testid="candidato-numero"
                className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-black bg-gray-100 text-gray-800 rounded-md border border-gray-300 flex-shrink-0"
              >
                #{numero}
              </span>
            )}
            <p
              data-testid="candidato-nombre"
              className="font-bold text-gray-900 text-base leading-snug break-words"
            >
              {label}
            </p>
          </div>
          {subtitle && (
            <p
              data-testid="candidato-partido"
              className="text-xs text-gray-600 font-medium break-words"
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Controles de conteo táctil: Botones de 56x56 px y valor central >= 28 px */}
      <div className="flex items-center justify-center gap-3 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={decrement}
          disabled={disabled || value === 0}
          aria-label={`Disminuir votos para ${label}`}
          data-testid="btn-decrement"
          className={`w-14 h-14 min-w-[56px] min-h-[56px] flex items-center justify-center rounded-2xl font-black text-2xl transition-all active:scale-90 border-2 select-none ${
            isSpecial
              ? 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-400 disabled:opacity-40 disabled:border-gray-200 disabled:text-gray-400 disabled:bg-gray-50'
              : 'bg-red-50 hover:bg-red-100 active:bg-red-200 text-editorial-red border-red-300 disabled:opacity-40 disabled:border-gray-200 disabled:text-gray-400 disabled:bg-gray-50'
          } disabled:cursor-not-allowed`}
        >
          −
        </button>

        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="9999"
            value={value || ''}
            onChange={handleChange}
            disabled={disabled}
            aria-label={`Votos para ${label}`}
            placeholder="0"
            data-testid="input-votos"
            className={`w-24 h-14 text-center text-3xl font-black rounded-2xl border-2 transition-all focus:outline-none focus:ring-2 tabular-nums ${
              value > 0
                ? isSpecial
                  ? 'border-gray-600 bg-white text-gray-900 focus:ring-gray-300'
                  : 'border-editorial-red bg-white text-editorial-red focus:ring-editorial-red/30'
                : 'border-gray-300 bg-white text-gray-900 focus:ring-gray-200 placeholder:text-gray-400'
            } disabled:opacity-75 disabled:cursor-not-allowed`}
          />
        </div>

        <button
          type="button"
          onClick={increment}
          disabled={disabled || value >= 9999}
          aria-label={`Aumentar votos para ${label}`}
          data-testid="btn-increment"
          className={`w-14 h-14 min-w-[56px] min-h-[56px] flex items-center justify-center rounded-2xl font-black text-2xl transition-all active:scale-90 border-2 select-none ${
            isSpecial
              ? 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-400 disabled:opacity-40 disabled:border-gray-200 disabled:text-gray-400 disabled:bg-gray-50'
              : 'bg-red-50 hover:bg-red-100 active:bg-red-200 text-editorial-red border-red-300 disabled:opacity-40 disabled:border-gray-200 disabled:text-gray-400 disabled:bg-gray-50'
          } disabled:cursor-not-allowed`}
        >
          +
        </button>
      </div>
    </div>
  );
}
