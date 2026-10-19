import { useState, FormEvent } from 'react';
import { authService, mapearErrorAuth } from '../../services/authService';
import { IconoAlerta } from '../ui/Iconos';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [cedula, setCedula] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cedulaError, setCedulaError] = useState('');
  const [pinError, setPinError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setCedulaError('');
    setPinError('');

    const cleanCedula = cedula.trim();
    let hasValidationError = false;

    // Validación de cédula (longitud 5-15, sin recortar caracteres alfanuméricos)
    if (!cleanCedula) {
      setCedulaError('Por favor ingresa tu cédula');
      hasValidationError = true;
    } else if (cleanCedula.length < 5 || cleanCedula.length > 15) {
      setCedulaError('La cédula debe tener entre 5 y 15 caracteres');
      hasValidationError = true;
    }

    // Validación de PIN (6 dígitos numéricos)
    if (!pin) {
      setPinError('Por favor ingresa tu PIN');
      hasValidationError = true;
    } else if (pin.length !== 6) {
      setPinError('El PIN debe tener 6 dígitos');
      hasValidationError = true;
    }

    if (hasValidationError) {
      return;
    }

    setLoading(true);

    try {
      await authService.login(cleanCedula, pin);
      onLoginSuccess();
    } catch (err) {
      setError(mapearErrorAuth(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo y Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-editorial-red rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
            <img src="/logo.svg" alt="Cuorum" className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-black text-editorial-black tracking-tight uppercase" style={{ letterSpacing: '0.05em' }}>
            Cuorum Testigos
          </h1>
          <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider mt-2" style={{ letterSpacing: '0.1em' }}>
            Sistema Oficial de Reporte
          </p>
        </div>

        {/* Card de Login */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-100 p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Iniciar Sesión</h2>
            <p className="text-sm text-gray-500">
              Ingresa tus credenciales para acceder al sistema de reporte electoral.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Cédula */}
            <div>
              <label htmlFor="cedula" className="block text-sm font-bold text-gray-700 mb-2">
                Cédula de Ciudadanía
              </label>
              <input
                id="cedula"
                name="cedula"
                type="text"
                inputMode="text"
                autoComplete="username"
                value={cedula}
                onChange={(e) => {
                  setCedula(e.target.value.slice(0, 15));
                  if (cedulaError) setCedulaError('');
                  if (error) setError('');
                }}
                onBlur={() => {
                  const clean = cedula.trim();
                  if (clean.length > 0 && (clean.length < 5 || clean.length > 15)) {
                    setCedulaError('La cédula debe tener entre 5 y 15 caracteres');
                  }
                }}
                placeholder="Ej: 1234567890"
                className={`w-full min-h-[48px] px-4 py-3 border-2 rounded-xl focus:border-editorial-red focus:ring-2 focus:ring-red-100 outline-none transition-all text-base font-medium ${
                  cedulaError ? 'border-editorial-red bg-red-50/20' : 'border-gray-200'
                }`}
                disabled={loading}
                maxLength={15}
                aria-invalid={Boolean(cedulaError)}
                aria-describedby={cedulaError ? 'cedula-error' : undefined}
              />
              {cedulaError && (
                <p
                  id="cedula-error"
                  role="alert"
                  aria-live="polite"
                  className="text-xs text-editorial-red font-medium mt-1.5 flex items-center gap-1"
                >
                  <IconoAlerta className="w-4 h-4 text-editorial-red flex-shrink-0" />
                  <span>{cedulaError}</span>
                </p>
              )}
            </div>

            {/* PIN */}
            <div>
              <label htmlFor="pin" className="block text-sm font-bold text-gray-700 mb-2">
                PIN de Acceso
              </label>
              <input
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setPin(value);
                  if (pinError) setPinError('');
                  if (error) setError('');
                }}
                onBlur={() => {
                  if (pin.length > 0 && pin.length !== 6) {
                    setPinError('El PIN debe tener 6 dígitos');
                  }
                }}
                placeholder="••••••"
                className={`w-full min-h-[48px] px-4 py-3 border-2 rounded-xl focus:border-editorial-red focus:ring-2 focus:ring-red-100 outline-none transition-all text-center text-2xl font-black tracking-[0.5em] font-mono ${
                  pinError ? 'border-editorial-red bg-red-50/20' : 'border-gray-200'
                }`}
                disabled={loading}
                maxLength={6}
                aria-invalid={Boolean(pinError)}
                aria-describedby={pinError ? 'pin-error' : 'pin-ayuda'}
              />
              {pinError && (
                <p
                  id="pin-error"
                  role="alert"
                  aria-live="polite"
                  className="text-xs text-editorial-red font-medium mt-1.5 flex items-center gap-1 justify-center"
                >
                  <IconoAlerta className="w-4 h-4 text-editorial-red flex-shrink-0" />
                  <span>{pinError}</span>
                </p>
              )}
              <p id="pin-ayuda" className="text-xs text-gray-600 mt-2">
                El PIN de 6 dígitos fue enviado a tu email
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-3"
              >
                <IconoAlerta className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] bg-editorial-red hover:bg-red-700 text-white font-black py-4 px-6 rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-wider text-sm flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-red-200"
              style={{ letterSpacing: '0.1em' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Verificando...</span>
                </span>
              ) : (
                'Ingresar al Sistema'
              )}
            </button>
          </form>

          {/* Footer Info */}
          <div className="mt-6 pt-6 border-t-2 border-gray-100">
            <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4">
              <p className="text-xs text-blue-700 font-medium">
                <strong>¿No recibiste tu PIN?</strong><br />
                Contacta al coordinador de tu campaña para que te reenvíe las credenciales.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-600 mt-6">
          Sistema Seguro de Reporte Electoral • Cuorum {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
