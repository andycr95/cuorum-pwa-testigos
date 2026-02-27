import { useState, useEffect, useCallback } from 'react';
import {
  escrutinioService,
  type ResultadoEscrutinio,
  type FotoE14Escrutinio,
  type IncidenciaEscrutinio,
  type ConsolidadoEscrutinio,
  type PaginatedResponse,
} from '../../services/escrutinioService';
import { authService, TestigoData } from '../../services/authService';
import {
  cacheEscrutinioData,
  getCachedEscrutinioData,
  cacheGeoData,
  getCachedGeoData,
} from '../../db/indexeddb';

type TabActiva = 'consolidado' | 'resultados' | 'fotos' | 'novedades';

interface Props {
  testigoData: TestigoData;
  onLogout: () => void;
}

const INCIDENCIA_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  MATERIALES_FALTANTES: { label: 'Materiales faltantes', emoji: '📦', color: 'bg-yellow-100 text-yellow-800' },
  INTIMIDACION:         { label: 'Intimidación',          emoji: '⚠️',  color: 'bg-yellow-100 text-yellow-800' },
  VIOLENCIA:            { label: 'Violencia',             emoji: '🚨', color: 'bg-red-100 text-red-800' },
  JURADO_AUSENTE:       { label: 'Jurado ausente',        emoji: '👤', color: 'bg-blue-100 text-blue-800' },
  IRREGULARIDAD_ACTA:   { label: 'Irregularidad en acta', emoji: '📋', color: 'bg-purple-100 text-purple-800' },
  OTRO:                 { label: 'Otro',                   emoji: '📝', color: 'bg-gray-100 text-gray-800' },
};

export function EscrutinioDashboard({ testigoData, onLogout }: Props) {
  // Filtros
  const [departamentoId, setDepartamentoId] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [puestoVotacionId, setPuestoVotacionId] = useState('');
  const [eleccionId, setEleccionId] = useState<string | null>(authService.getEleccionId());
  const [eleccion, setEleccion] = useState<TestigoData['elecciones'] | null>();
  const [campanaId, setCampanaId] = useState<string | null>(authService.getCampanaId());

  // Geo data
  const [departamentos, setDepartamentos] = useState<Array<{ id: string; nombre: string }>>([]);
  const [municipios, setMunicipios] = useState<Array<{ id: string; nombre: string }>>([]);
  const [puestos, setPuestos] = useState<Array<{ id: string; nombre: string }>>([]);

  // Tab
  const [tabActiva, setTabActiva] = useState<TabActiva>('consolidado');

  // Data states
  const [consolidado, setConsolidado] = useState<ConsolidadoEscrutinio | null>(null);
  const [resultados, setResultados] = useState<PaginatedResponse<ResultadoEscrutinio> | null>(null);
  const [fotos, setFotos] = useState<PaginatedResponse<FotoE14Escrutinio> | null>(null);
  const [incidencias, setIncidencias] = useState<PaginatedResponse<IncidenciaEscrutinio> | null>(null);

  // UI states
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isCached, setIsCached] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Online/Offline detection
  useEffect(() => {
    setEleccion(authService.getEleccionesData());
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load geo data (departamentos, elecciones)
  useEffect(() => {
    const loadGeo = async () => {
      try {
        const deps = await escrutinioService.getDepartamentos(campanaId || '');
        setDepartamentos(deps);
        await cacheGeoData('departamentos', deps);
      } catch {
        const cachedDeps = await getCachedGeoData<Array<{ id: string; nombre: string }>>('departamentos');
        if (cachedDeps) setDepartamentos(cachedDeps);
      }
    };
    loadGeo();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load municipios when departamento changes
  useEffect(() => {
    if (!departamentoId) {
      setMunicipios([]);
      setMunicipioId('');
      setPuestos([]);
      setPuestoVotacionId('');
      return;
    }
    const loadMunicipios = async () => {
      const cacheKey = `municipios-${departamentoId}`;
      try {
        const munis = await escrutinioService.getMunicipios(departamentoId, campanaId || '');
        setMunicipios(munis);
        await cacheGeoData(cacheKey, munis);
      } catch {
        const cached = await getCachedGeoData<Array<{ id: string; nombre: string }>>(cacheKey);
        if (cached) setMunicipios(cached);
      }
    };
    loadMunicipios();
  }, [departamentoId]);

  // Load puestos when municipio changes
  useEffect(() => {
    if (!municipioId) {
      setPuestos([]);
      setPuestoVotacionId('');
      return;
    }
    const loadPuestos = async () => {
      const cacheKey = `puestos-${municipioId}`;
      try {
        const pts = await escrutinioService.getPuestos(municipioId);
        setPuestos(pts.map(p => ({ id: p.id, nombre: p.nombre })));
        await cacheGeoData(cacheKey, pts.map(p => ({ id: p.id, nombre: p.nombre })));
      } catch {
        const cached = await getCachedGeoData<Array<{ id: string; nombre: string }>>(cacheKey);
        if (cached) setPuestos(cached);
      }
    };
    loadPuestos();
  }, [municipioId]);

  // Build current filter object
  const buildFiltros = useCallback(() => ({
    ...(departamentoId && { departamentoId }),
    ...(municipioId && { municipioId }),
    ...(puestoVotacionId && { puestoVotacionId }),
    ...(eleccionId && { eleccionId }),
  }), [departamentoId, municipioId, puestoVotacionId, eleccionId]);

  // Fetch data — API-first, cache solo como fallback offline
  const fetchData = useCallback(async () => {
    setLoading(true);
    setIsCached(false);
    const filtros = buildFiltros();
    const storeName = `escrutinio-${tabActiva === 'novedades' ? 'incidencias' : tabActiva}` as const;
    const cacheKey = { tab: tabActiva, ...filtros, page };

    // 1. Intentar siempre el backend primero
    try {
      let freshData: unknown;
      if (tabActiva === 'consolidado') {
        if (!eleccionId) {
          setLoading(false);
          return;
        }
        freshData = await escrutinioService.getConsolidado({ eleccionId, ...filtros });
      } else if (tabActiva === 'resultados') {
        freshData = await escrutinioService.getResultados({ ...filtros, page, limit: 50 });
      } else if (tabActiva === 'fotos') {
        freshData = await escrutinioService.getFotosE14({ ...filtros, page, limit: 50 });
      } else {
        freshData = await escrutinioService.getIncidencias({ ...filtros, page, limit: 50 });
      }
      applyData(tabActiva, freshData);
      setIsCached(false);
      setLastUpdate(new Date().toISOString());
      // Guardar en cache para uso offline futuro
      await cacheEscrutinioData(storeName, cacheKey, freshData);
    } catch {
      // 2. Si falla (offline), intentar cache como fallback
      const cached = await getCachedEscrutinioData(storeName, cacheKey);
      if (cached) {
        applyData(tabActiva, cached.data);
        setIsCached(true);
        setLastUpdate(cached.timestamp);
      } else {
        applyData(tabActiva, null);
      }
    }
    setLoading(false);
  }, [tabActiva, buildFiltros, page, eleccionId]);

  function applyData(tab: TabActiva, data: unknown) {
    if (tab === 'consolidado') setConsolidado(data as ConsolidadoEscrutinio | null);
    else if (tab === 'resultados') setResultados(data as PaginatedResponse<ResultadoEscrutinio> | null);
    else if (tab === 'fotos') setFotos(data as PaginatedResponse<FotoE14Escrutinio> | null);
    else setIncidencias(data as PaginatedResponse<IncidenciaEscrutinio> | null);
  }

  // Trigger fetch on filter/tab/page change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page on filter/tab change
  useEffect(() => {
    setPage(1);
  }, [tabActiva, departamentoId, municipioId, puestoVotacionId, eleccionId]);

  const handleLogout = () => {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      onLogout();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-700 to-purple-900 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                <img src="/logo.svg" alt="Cuorum" className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Cuorum Testigos</h1>
                <p className="text-purple-200 text-xs">
                  {testigoData.testigo.nombres} {testigoData.testigo.apellidos}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 bg-purple-500/40 rounded-md text-xs font-semibold">
                Escrutinio
              </span>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Cerrar sesión"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select
              value={departamentoId}
              onChange={(e) => {
                setDepartamentoId(e.target.value);
                setMunicipioId('');
                setPuestoVotacionId('');
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">Todos los departamentos</option>
              {departamentos.map(d => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>

            <select
              value={municipioId}
              onChange={(e) => {
                setMunicipioId(e.target.value);
                setPuestoVotacionId('');
              }}
              disabled={!departamentoId}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white disabled:opacity-50 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">Todos los municipios</option>
              {municipios.map(m => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>

            <select
              value={puestoVotacionId}
              onChange={(e) => setPuestoVotacionId(e.target.value)}
              disabled={!municipioId}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white disabled:opacity-50 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">Todos los puestos</option>
              {puestos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>

            <input
              type="text"
              disabled
              value={eleccion ? eleccion[0].nombre : 'Cargando elecciones...'}
              className='text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500'
              placeholder='Filtro de elección (próximamente)'
            />
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 ${isOnline ? 'text-green-600' : 'text-orange-600'}`}>
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-orange-500'}`} />
                {isOnline ? 'En línea' : 'Sin conexión'}
              </span>
              {isCached && (
                <span className="text-orange-500 font-medium">Datos en caché</span>
              )}
            </div>
            {lastUpdate && (
              <span>
                Actualizado: {new Date(lastUpdate).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4">
          <nav className="flex gap-1 -mb-px">
            {([
              { key: 'consolidado', label: 'Consolidado' },
              { key: 'resultados', label: 'Resultados' },
              { key: 'fotos', label: 'Fotos E14' },
              { key: 'novedades', label: 'Novedades' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setTabActiva(tab.key)}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  tabActiva === tab.key
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        {loading && !isCached && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full" />
          </div>
        )}

        {!loading && !isOnline && !isCached && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 text-center">
            <p className="text-orange-800 font-semibold">Sin conexión</p>
            <p className="text-orange-600 text-sm mt-1">No hay datos en caché para estos filtros. Conéctate a internet para cargar datos.</p>
          </div>
        )}

        {/* Tab: Consolidado */}
        {tabActiva === 'consolidado' && (
          <TabConsolidado consolidado={consolidado} loading={loading && !isCached} eleccionId={eleccionId!} />
        )}

        {/* Tab: Resultados */}
        {tabActiva === 'resultados' && (
          <TabResultados data={resultados} loading={loading && !isCached} page={page} onPageChange={setPage} />
        )}

        {/* Tab: Fotos */}
        {tabActiva === 'fotos' && (
          <TabFotos data={fotos} loading={loading && !isCached} page={page} onPageChange={setPage} />
        )}

        {/* Tab: Novedades */}
        {tabActiva === 'novedades' && (
          <TabNovedades data={incidencias} loading={loading && !isCached} page={page} onPageChange={setPage} />
        )}
      </div>
    </div>
  );
}

// ─── Tab: Consolidado ──────────────────────────────────────────

function TabConsolidado({ consolidado, loading, eleccionId }: {
  consolidado: ConsolidadoEscrutinio | null;
  loading: boolean;
  eleccionId: string;
}) {
  if (!eleccionId) {
    return (
      <div className="bg-white rounded-xl p-6 text-center text-gray-500">
        Selecciona una elección para ver el consolidado.
      </div>
    );
  }

  if (loading || !consolidado) return null;

  const { candidatos, totales, cobertura } = consolidado;
  const maxVotos = candidatos.length > 0 ? Math.max(...candidatos.map(c => c.votos)) : 1;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <p className="text-xs text-gray-500 uppercase font-semibold">Mesas</p>
          <p className="text-2xl font-bold text-gray-900">{totales.mesasReportadas}/{totales.totalMesas}</p>
          <p className="text-xs text-purple-600 font-semibold">{cobertura} cobertura</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <p className="text-xs text-gray-500 uppercase font-semibold">Votos válidos</p>
          <p className="text-2xl font-bold text-gray-900">{totales.totalVotosValidos.toLocaleString('es-CO')}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <p className="text-xs text-gray-500 uppercase font-semibold">Blancos</p>
          <p className="text-2xl font-bold text-gray-900">{totales.totalBlancos.toLocaleString('es-CO')}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <p className="text-xs text-gray-500 uppercase font-semibold">Nulos</p>
          <p className="text-2xl font-bold text-gray-900">{totales.totalNulos.toLocaleString('es-CO')}</p>
        </div>
      </div>

      {/* Ranking */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-900">Ranking de candidatos</h3>
        </div>
        <div className="divide-y">
          {candidatos.map((c, i) => (
            <div key={`${c.candidatoId || c.candidato}-${i}`} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{c.candidato}</p>
                    <p className="text-xs text-gray-500">{c.partido}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{c.votos.toLocaleString('es-CO')}</p>
                  <p className="text-xs text-gray-500">{c.porcentaje}%</p>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${maxVotos > 0 ? (c.votos / maxVotos) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
          {candidatos.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              Sin datos de candidatos para estos filtros
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Resultados ──────────────────────────────────────────

function TabResultados({ data, loading, page, onPageChange }: {
  data: PaginatedResponse<ResultadoEscrutinio> | null;
  loading: boolean;
  page: number;
  onPageChange: (p: number) => void;
}) {
  if (loading || !data) return null;

  return (
    <div className="space-y-3">
      {data.data.map((r) => (
        <div key={r.id} className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-1 rounded">
                Mesa #{r.mesa.numero}
              </span>
              {r.alertaFraude && (
                <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded">
                  Alerta
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {new Date(r.capturedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-900">{r.candidato}</p>
          <p className="text-xs text-gray-500">{r.partido}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
            <span><strong>{r.votos}</strong> votos</span>
            <span>Blancos: {r.votosBlanco}</span>
            <span>Nulos: {r.votosNulos}</span>
            <span>Total mesa: {r.totalVotosMesa}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {r.mesa.puestoVotacion.nombre} — {r.mesa.puestoVotacion.municipio?.nombre}
            {r.mesa.puestoVotacion.municipio?.departamento ? `, ${r.mesa.puestoVotacion.municipio.departamento.nombre}` : ''}
          </p>
          <p className="text-xs text-gray-400">
            Testigo: {r.testigo.nombres} {r.testigo.apellidos}
          </p>
        </div>
      ))}

      {data.data.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm shadow-sm border">
          Sin resultados para estos filtros
        </div>
      )}

      <Pagination page={page} totalPages={data.totalPages} total={data.total} onPageChange={onPageChange} />
    </div>
  );
}

// ─── Tab: Fotos ──────────────────────────────────────────────

function TabFotos({ data, loading, page, onPageChange }: {
  data: PaginatedResponse<FotoE14Escrutinio> | null;
  loading: boolean;
  page: number;
  onPageChange: (p: number) => void;
}) {
  if (loading || !data) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.data.map((f) => (
          <div key={f.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {f.imagenUrl && (
              <img
                src={f.imagenUrl}
                alt={`E14 Mesa ${f.mesa.numero}`}
                className="w-full h-48 object-cover bg-gray-100"
                loading="lazy"
              />
            )}
            <div className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-1 rounded">
                  Mesa #{f.mesa.numero}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(f.capturedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {f.mesa.puestoVotacion.nombre}
                {f.mesa.puestoVotacion.municipio ? ` — ${f.mesa.puestoVotacion.municipio.nombre}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>

      {data.data.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm shadow-sm border">
          Sin fotos E14 para estos filtros
        </div>
      )}

      <Pagination page={page} totalPages={data.totalPages} total={data.total} onPageChange={onPageChange} />
    </div>
  );
}

// ─── Tab: Novedades ──────────────────────────────────────────

function TabNovedades({ data, loading, page, onPageChange }: {
  data: PaginatedResponse<IncidenciaEscrutinio> | null;
  loading: boolean;
  page: number;
  onPageChange: (p: number) => void;
}) {
  if (loading || !data) return null;

  return (
    <div className="space-y-3">
      {data.data.map((inc) => {
        const config = INCIDENCIA_LABELS[inc.tipo] || INCIDENCIA_LABELS.OTRO;
        return (
          <div key={inc.id} className="bg-white rounded-xl p-4 shadow-sm border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-1 rounded ${config.color}`}>
                  {config.emoji} {config.label}
                </span>
                <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-1 rounded">
                  Mesa #{inc.mesa.numero}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                {new Date(inc.capturedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>
            <p className="text-sm text-gray-800">{inc.descripcion}</p>
            {inc.fotoUrl && (
              <img
                src={inc.fotoUrl}
                alt="Evidencia"
                className="mt-2 w-full h-32 object-cover rounded-lg bg-gray-100"
                loading="lazy"
              />
            )}
            <p className="text-xs text-gray-400 mt-2">
              {inc.mesa.puestoVotacion.nombre}
              {inc.mesa.puestoVotacion.municipio ? ` — ${inc.mesa.puestoVotacion.municipio.nombre}` : ''}
            </p>
            <p className="text-xs text-gray-400">
              Testigo: {inc.testigo.nombres} {inc.testigo.apellidos} — CC {inc.testigo.cedula}
            </p>
          </div>
        );
      })}

      {data.data.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm shadow-sm border">
          Sin novedades para estos filtros
        </div>
      )}

      <Pagination page={page} totalPages={data.totalPages} total={data.total} onPageChange={onPageChange} />
    </div>
  );
}

// ─── Pagination ──────────────────────────────────────────────

function Pagination({ page, totalPages, total, onPageChange }: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-2">
      <span className="text-xs text-gray-500">{total} registros</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 text-xs font-semibold bg-white border rounded-lg disabled:opacity-40 hover:bg-gray-50"
        >
          Anterior
        </button>
        <span className="text-xs text-gray-600">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 text-xs font-semibold bg-white border rounded-lg disabled:opacity-40 hover:bg-gray-50"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
