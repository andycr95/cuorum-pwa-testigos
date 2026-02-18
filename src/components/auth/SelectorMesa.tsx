import { MesaData } from '../../services/authService';

interface SelectorMesaProps {
  mesas: MesaData[];
  onSelect: (mesaId: string) => void;
  testigoNombre: string;
}

export function SelectorMesa({ mesas, onSelect, testigoNombre }: SelectorMesaProps) {
  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-black text-gray-900 leading-tight uppercase tracking-tight">
          ¡Hola, {testigoNombre.split(' ')[0]}!
        </h2>
        <p className="text-gray-500 text-sm mt-1 font-medium">
          Selecciona la mesa que vas a reportar en este momento:
        </p>
      </div>

      <div className="space-y-4">
        {mesas.map((mesa) => (
          <button
            key={mesa.id}
            onClick={() => onSelect(mesa.id)}
            className="w-full text-left bg-white border-2 border-gray-100 rounded-2xl p-5 shadow-sm hover:border-editorial-red hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-editorial-red transition-colors">
                  Mesa de Votación
                </p>
                <p className="text-3xl font-black text-gray-900 group-hover:text-editorial-red transition-colors">
                  #{mesa.numero}
                </p>
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-bold text-gray-700 truncate">
                    {mesa.puesto?.nombre || 'Puesto no especificado'}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {mesa.puesto?.direccion || 'Sin dirección'}
                  </p>
                </div>
              </div>
              
              <div className="ml-4 bg-gray-50 p-3 rounded-xl group-hover:bg-red-50 transition-colors">
                <svg className="w-6 h-6 text-gray-300 group-hover:text-editorial-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            
            {/* Stats rápidos de la mesa */}
            <div className="mt-4 pt-4 border-t border-gray-50 flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                  {mesa.totalSufragantes} Potenciales
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wide">Reporte Pendiente</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-12 p-6 bg-red-50 rounded-2xl border-2 border-red-100">
        <p className="text-[11px] text-editorial-red font-black uppercase tracking-widest text-center">
          ⚠️ RECUERDA
        </p>
        <p className="text-xs text-red-800 text-center mt-2 leading-relaxed font-medium">
          Solo puedes reportar los datos oficiales del acta E-14 una vez haya finalizado el conteo en la mesa.
        </p>
      </div>
    </div>
  );
}
