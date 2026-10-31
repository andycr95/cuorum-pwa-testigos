import React from 'react';

export interface AccionEstado {
  texto: string;
  onClick?: () => void;
  href?: string;
  ariaLabel?: string;
}

export interface EstadoVacioProps {
  titulo: string;
  mensaje: string;
  tipo?: 'vacio' | 'error' | 'advertencia' | 'info';
  iconoPersonalizado?: React.ReactNode;
  accionPrincipal: AccionEstado;
  accionSecundaria?: AccionEstado;
  detalleEstado?: string;
  className?: string;
}

export function EstadoVacio({
  titulo,
  mensaje,
  tipo = 'vacio',
  iconoPersonalizado,
  accionPrincipal,
  accionSecundaria,
  detalleEstado,
  className = '',
}: EstadoVacioProps) {
  const renderIcono = () => {
    if (iconoPersonalizado) return iconoPersonalizado;
    if (tipo === 'error') {
      return (
        <div className="w-16 h-16 rounded-card bg-err-50 dark:bg-[#450A0A] border border-red-200 dark:border-[#7F1D1D] flex items-center justify-center text-err-700 dark:text-[#FCA5A5]">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
      );
    }
    if (tipo === 'advertencia') {
      return (
        <div className="w-16 h-16 rounded-card bg-warn-50 dark:bg-[#451A03] border border-amber-200 dark:border-[#78350F] flex items-center justify-center text-warn-700 dark:text-[#FCD34D]">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      );
    }
    if (tipo === 'info') {
      return (
        <div className="w-16 h-16 rounded-card bg-info-50 dark:bg-[#172554] border border-blue-200 dark:border-[#1E3A8A] flex items-center justify-center text-info-700 dark:text-[#93C5FD]">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
        </div>
      );
    }
    return (
      <div className="w-16 h-16 rounded-card bg-app-elevated border border-app-line flex items-center justify-center text-app-muted">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
    );
  };

  const btnClasePrimaria = "w-full min-h-[48px] py-3.5 px-6 rounded-btn font-bold text-white uppercase tracking-wide text-xs bg-editorial-red hover:bg-brand-700 transition-colors flex items-center justify-center gap-2";
  const btnClaseSecundaria = "w-full min-h-[48px] py-3 px-6 rounded-btn font-bold text-app-fg text-xs border border-app-line bg-app-surface hover:bg-app-elevated transition-colors flex items-center justify-center gap-2";

  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`w-full bg-app-surface border border-app-line rounded-card p-6 text-center font-sans ${className}`}>
      <div className="flex justify-center mb-4">{renderIcono()}</div>
      <h3 className="text-xl font-bold text-app-fg leading-tight mb-2 tracking-tight">{titulo}</h3>
      <p className="text-sm font-medium text-app-muted mb-6 leading-relaxed max-w-sm mx-auto">{mensaje}</p>
      {detalleEstado && (
        <div className="mb-6 px-3.5 py-2.5 bg-app-elevated border border-app-line rounded-btn text-xs font-semibold text-app-fg flex items-center justify-center gap-2">
          <svg className="w-4 h-4 text-ok-700 dark:text-[#86EFAC] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <span>{detalleEstado}</span>
        </div>
      )}
      <div className="space-y-3">
        {accionPrincipal.href ? (
          <a href={accionPrincipal.href} aria-label={accionPrincipal.ariaLabel || accionPrincipal.texto} className={btnClasePrimaria}>{accionPrincipal.texto}</a>
        ) : (
          <button type="button" onClick={accionPrincipal.onClick} aria-label={accionPrincipal.ariaLabel || accionPrincipal.texto} className={btnClasePrimaria}>{accionPrincipal.texto}</button>
        )}
        {accionSecundaria && (
          accionSecundaria.href ? (
            <a href={accionSecundaria.href} aria-label={accionSecundaria.ariaLabel || accionSecundaria.texto} className={btnClaseSecundaria}>{accionSecundaria.texto}</a>
          ) : (
            <button type="button" onClick={accionSecundaria.onClick} aria-label={accionSecundaria.ariaLabel || accionSecundaria.texto} className={btnClaseSecundaria}>{accionSecundaria.texto}</button>
          )
        )}
      </div>
    </div>
  );
}

export const ErrorAccion = EstadoVacio;
