import { useState, FormEvent } from 'react';
import { authService } from '../../services/authService';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [cedula, setCedula] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Validaciones
    if (!cedula.trim()) {
      setError('Por favor ingresa tu cédula');
      return;
    }

    if (pin.length !== 6) {
      setError('El PIN debe tener 6 dígitos');
      return;
    }

    setLoading(true);

    try {
      await authService.login(cedula.trim(), pin);
      onLoginSuccess();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al iniciar sesión. Intenta nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo y Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-editorial-red to-red-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-red-900/30">
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
        <div className="bg-white rounded-2xl shadow-2xl shadow-gray-200 border-2 border-gray-100 p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Iniciar Sesión</h2>
            <p className="text-sm text-gray-500">
              Ingresa tus credenciales para acceder al sistema de reporte electoral.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Cédula */}
            <div>
              <label htmlFor="cedula" className="block text-sm font-bold text-gray-700 mb-2">
                Cédula de Ciudadanía
              </label>
              <input
                id="cedula"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={cedula}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setCedula(value);
                }}
                placeholder="Ej: 1234567890"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-editorial-red focus:ring-2 focus:ring-red-100 outline-none transition-all text-base font-medium"
                disabled={loading}
                autoComplete="off"
                maxLength={15}
              />
            </div>

            {/* PIN */}
            <div>
              <label htmlFor="pin" className="block text-sm font-bold text-gray-700 mb-2">
                PIN de Acceso
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setPin(value);
                }}
                placeholder="••••••"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-editorial-red focus:ring-2 focus:ring-red-100 outline-none transition-all text-center text-2xl font-black tracking-[0.5em] font-mono"
                disabled={loading}
                autoComplete="off"
                maxLength={6}
              />
              <p className="text-xs text-gray-500 mt-2">
                El PIN de 6 dígitos fue enviado a tu email
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-3">
                <span className="text-xl flex-shrink-0">⚠️</span>
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !cedula || pin.length !== 6}
              className="w-full bg-gradient-to-br from-editorial-red to-red-700 text-white font-black py-4 rounded-xl shadow-xl shadow-red-900/30 hover:shadow-2xl hover:shadow-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-wider text-sm"
              style={{ letterSpacing: '0.1em' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Verificando...
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
                <strong>📧 ¿No recibiste tu PIN?</strong><br />
                Contacta al coordinador de tu campaña para que te reenvíe las credenciales.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Sistema Seguro de Reporte Electoral • Cuorum {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
