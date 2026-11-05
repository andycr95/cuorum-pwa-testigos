import { useState, useEffect, useCallback } from 'react';
import {
  escrutinioService,
  type ResultadoEscrutinio,
  type FotoE14Escrutinio,
  type IncidenciaEscrutinio,
  type ConsolidadoEscrutinio,
  type ActaOcrEscrutinio,
  type E14OficialEscrutinio,
  type DivulgacionData,
  type PaginatedResponse,
} from '../../services/escrutinioService';
import { authService, TestigoData } from '../../services/authService';
import {
  cacheEscrutinioData,
  getCachedEscrutinioData,
  cacheGeoData,
  getCachedGeoData,
} from '../../db/indexeddb';

type TabActiva = 'consolidado' | 'resultados' | 'actas' | 'fotos' | 'novedades' | 'e14oficial' | 'divulgacion';

interface Props {
  testigoData: TestigoData;
  onLogout: () => void;
}

const INCIDENCIA_LABELS: Record<string, { label: string; color: string }> = {
  MATERIALES_FALTANTES: { label: 'Materiales faltantes', color: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30' },
  INTIMIDACION:         { label: 'Intimidaci\u00f3n',    color: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30' },
  VIOLENCIA:            { label: 'Violencia',            color: 'bg-red-500/15 text-red-800 dark:text-red-300 border border-red-500/30' },
  JURADO_AUSENTE:       { label: 'Jurado ausente',       color: 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-500/30' },
  IRREGULARIDAD_ACTA:   { label: 'Irregularidad en acta', color: 'bg-editorial-red/15 text-app-accent-fg border border-editorial-red/30' },
  OTRO:                 { label: 'Otro',                  color: 'bg-app-elevated text-app-fg border border-app-line' },
};

export function EscrutinioDashboard({ testigoData, onLogout }: Props) {
  // Elecciones — auto-seleccionada desde auth
  const elecciones = authService.getEleccionesData();
  const [eleccionId, setEleccionId] = useState<string>(
    authService.getEleccionId() || (elecciones.length > 0 ? elecciones[0].id : ''),
  );
  const campanaId = authService.getCampanaId();
  const miCandidatoId = authService.getCandidatoId();
  const miListaId = authService.getListaId();

  // Filtros geo (colapsables)
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [departamentoId, setDepartamentoId] = useState('');
  const [municipioId, setMunicipioId] = useState('');
  const [puestoVotacionId, setPuestoVotacionId] = useState('');

  // Geo data
  const [departamentos, setDepartamentos] = useState<Array<{ id: string; nombre: string }>>([]);
  const [municipios, setMunicipios] = useState<Array<{ id: string; nombre: string }>>([]);
  const [puestos, setPuestos] = useState<Array<{ id: string; nombre: string }>>([]);

  // Tab
  const [tabActiva, setTabActiva] = useState<TabActiva>('consolidado');

  // Data states
  const [consolidado, setConsolidado] = useState<ConsolidadoEscrutinio | null>(null);
  const [resultados, setResultados] = useState<PaginatedResponse<ResultadoEscrutinio> | null>(null);
  const [actas, setActas] = useState<PaginatedResponse<ActaOcrEscrutinio> | null>(null);
  const [fotos, setFotos] = useState<PaginatedResponse<FotoE14Escrutinio> | null>(null);
  const [incidencias, setIncidencias] = useState<PaginatedResponse<IncidenciaEscrutinio> | null>(null);
  const [e14oficial, setE14oficial] = useState<PaginatedResponse<E14OficialEscrutinio> | null>(null);
  const [divulgacion, setDivulgacion] = useState<DivulgacionData | null>(null);

  // UI states
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isCached, setIsCached] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Nombre de la elección activa
  const eleccionActiva = elecciones.find(e => e.id === eleccionId);

  // Conteo de filtros geo activos (para badge)
  const filtrosActivos = [departamentoId, municipioId, puestoVotacionId].filter(Boolean).length;

  // Online/Offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load geo data (departamentos) — solo cuando se abren los filtros
  useEffect(() => {
    if (!filtrosAbiertos || departamentos.length > 0) return;
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
  }, [filtrosAbiertos]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [departamentoId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setIsCached(false);
    const filtros = buildFiltros();
    const storeName = `escrutinio-${tabActiva === 'novedades' ? 'incidencias' : tabActiva === 'e14oficial' ? 'e14oficial' : tabActiva === 'divulgacion' ? 'divulgacion' : tabActiva}` as const;
    const cacheKey = { tab: tabActiva, ...filtros, page };

    try {
      let freshData: unknown;
      if (tabActiva === 'consolidado') {
        if (!eleccionId) { setLoading(false); return; }
        freshData = await escrutinioService.getConsolidado({ eleccionId, ...filtros });
      } else if (tabActiva === 'resultados') {
        freshData = await escrutinioService.getResultados({ ...filtros, page, limit: 50 });
      } else if (tabActiva === 'actas') {
        freshData = await escrutinioService.getActasOcr({ ...filtros, page, limit: 20 });
      } else if (tabActiva === 'fotos') {
        freshData = await escrutinioService.getFotosE14({ ...filtros, page, limit: 50 });
      } else if (tabActiva === 'e14oficial') {
        freshData = await escrutinioService.getE14Oficial({ ...filtros, page, limit: 30 });
      } else if (tabActiva === 'divulgacion') {
        const [estado, resultadosRes] = await Promise.all([
          escrutinioService.getDivulgacionEstado(eleccionId || undefined),
          escrutinioService.getDivulgacionResultados({
            ...(departamentoId && { departamentoId }),
            ...(municipioId && { municipioId }),
            ...(puestoVotacionId && { puestoVotacionId }),
          }),
        ]);
        freshData = { estado, resultados: resultadosRes };
      } else {
        freshData = await escrutinioService.getIncidencias({ ...filtros, page, limit: 50 });
      }
      applyData(tabActiva, freshData);
      setIsCached(false);
      setLastUpdate(new Date().toISOString());
      await cacheEscrutinioData(storeName, cacheKey, freshData);
    } catch {
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
  }, [tabActiva, buildFiltros, page, eleccionId, departamentoId, municipioId, puestoVotacionId]);

  function applyData(tab: TabActiva, data: unknown) {
    if (tab === 'consolidado') setConsolidado(data as ConsolidadoEscrutinio | null);
    else if (tab === 'resultados') setResultados(data as PaginatedResponse<ResultadoEscrutinio> | null);
    else if (tab === 'actas') setActas(data as PaginatedResponse<ActaOcrEscrutinio> | null);
    else if (tab === 'fotos') setFotos(data as PaginatedResponse<FotoE14Escrutinio> | null);
    else if (tab === 'e14oficial') setE14oficial(data as PaginatedResponse<E14OficialEscrutinio> | null);
    else if (tab === 'divulgacion') setDivulgacion(data as DivulgacionData | null);
    else setIncidencias(data as PaginatedResponse<IncidenciaEscrutinio> | null);
  }

  // Trigger fetch on filter/tab/page change
  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset page on filter/tab change
  useEffect(() => { setPage(1); }, [tabActiva, departamentoId, municipioId, puestoVotacionId, eleccionId]);

  const handleLogout = () => {
    if (confirm('\u00bfEst\u00e1s seguro de que deseas cerrar sesi\u00f3n?')) {
      onLogout();
    }
  };

  const limpiarFiltros = () => {
    setDepartamentoId('');
    setMunicipioId('');
    setPuestoVotacionId('');
  };

  return (
    <div className="min-h-screen bg-app-canvas text-app-fg">
      {/* Header */}
      <header className="bg-app-surface text-app-fg border-b border-app-line">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                <img src="/logo.svg" alt="Cuorum" className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Cuorum Testigos</h1>
                <p className="text-app-muted text-xs">
                  {testigoData.testigo.nombres} {testigoData.testigo.apellidos}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-editorial-red/10 text-app-accent-fg border border-editorial-red/30 rounded-md text-xs font-semibold">
                Escrutinio
              </span>
              <button
                onClick={handleLogout}
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-app-muted hover:text-app-fg hover:bg-app-elevated rounded-lg transition-colors"
                title="Cerrar sesión" aria-label="Cerrar sesión"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>

          {/* Elecci\u00f3n activa — info contextual en el header */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {elecciones.length <= 1 ? (
              // Una sola elecci\u00f3n — mostrar como chip informativo
              <span className="px-3 py-1 bg-app-elevated border border-app-line rounded-lg text-sm font-medium text-app-fg">
                {eleccionActiva?.nombre || 'Sin elecci\u00f3n'}
              </span>
            ) : (
              // M\u00faltiples elecciones — selector compacto
              <select
                value={eleccionId}
                onChange={(e) => setEleccionId(e.target.value)}
                className="px-3 py-1 bg-app-elevated rounded-lg text-sm font-medium text-app-fg border border-app-line focus:ring-2 focus:ring-editorial-red/40 focus:outline-none appearance-none cursor-pointer"
              >
                {elecciones.map(e => (
                  <option key={e.id} value={e.id} className="bg-app-surface text-app-fg">{e.nombre}</option>
                ))}
              </select>
            )}
            {eleccionActiva && (
              <span className="text-app-muted text-xs">
                {eleccionActiva.tipoEleccion.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Barra de estado + filtros toggle */}
      <div className="bg-app-surface border-b border-app-line">
        <div className="max-w-4xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            {/* Estado + filtros toggle */}
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${isOnline ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-300'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-orange-500'}`} />
                {isOnline ? 'En l\u00ednea' : 'Sin conexi\u00f3n'}
              </span>
              {isCached && (
                <span className="text-amber-800 dark:text-amber-300 text-xs font-medium">Datos en cach\u00e9</span>
              )}

              {/* Bot\u00f3n de filtros */}
              <button
                onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[44px] rounded-lg text-xs font-semibold transition-colors ${
                  filtrosAbiertos || filtrosActivos > 0
                    ? 'bg-editorial-red/10 text-app-accent-fg border border-editorial-red/30'
                    : 'bg-app-elevated text-app-muted hover:text-app-fg border border-app-line'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filtrar
                {filtrosActivos > 0 && (
                  <span className="w-4 h-4 bg-editorial-red text-white rounded-full text-xs flex items-center justify-center">
                    {filtrosActivos}
                  </span>
                )}
              </button>
            </div>

            {/* Refresh + timestamp */}
            <div className="flex items-center gap-2">
              {lastUpdate && (
                <span className="text-xs text-app-muted">
                  {new Date(lastUpdate).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                onClick={fetchData}
                disabled={loading}
                aria-label="Actualizar datos" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-app-muted hover:text-app-accent-fg hover:bg-editorial-red/10 transition-colors disabled:opacity-40"
                title="Actualizar datos"
              >
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Filtros geo colapsables */}
          {filtrosAbiertos && (
            <div className="mt-2 pb-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={departamentoId}
                  onChange={(e) => {
                    setDepartamentoId(e.target.value);
                    setMunicipioId('');
                    setPuestoVotacionId('');
                  }}
                  className="text-sm border border-app-line rounded-btn px-3 py-2 bg-app-elevated text-app-fg focus:ring-2 focus:ring-editorial-red focus:border-editorial-red"
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
                  className="text-sm border border-app-line rounded-btn px-3 py-2 bg-app-elevated text-app-fg disabled:opacity-40 focus:ring-2 focus:ring-editorial-red focus:border-editorial-red"
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
                  className="text-sm border border-app-line rounded-btn px-3 py-2 bg-app-elevated text-app-fg disabled:opacity-40 focus:ring-2 focus:ring-editorial-red focus:border-editorial-red"
                >
                  <option value="">Todos los puestos</option>
                  {puestos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              {filtrosActivos > 0 && (
                <button
                  onClick={limpiarFiltros}
                  className="mt-2 text-xs text-app-accent-fg font-semibold hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-app-surface border-b border-app-line">
        <div className="max-w-4xl mx-auto px-4">
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {([
              { key: 'consolidado', label: 'Consolidado' },
              { key: 'resultados', label: 'Resultados' },
              { key: 'actas', label: 'Actas OCR' },
              { key: 'fotos', label: 'Fotos E14' },
              { key: 'e14oficial', label: 'E-14 Oficial' },
              { key: 'divulgacion', label: 'Divulgación' },
              { key: 'novedades', label: 'Novedades' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setTabActiva(tab.key)}
                className={`px-4 py-3 min-h-[44px] text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  tabActiva === tab.key
                    ? 'border-editorial-red text-app-accent-fg'
                    : 'border-transparent text-app-muted hover:text-app-fg hover:border-app-line'
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
            <div className="animate-spin w-8 h-8 border-4 border-app-line border-t-editorial-red rounded-full" />
          </div>
        )}

        {!loading && !isOnline && !isCached && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-card p-6 text-center">
            <p className="text-amber-800 dark:text-amber-300 font-semibold">Sin conexi\u00f3n</p>
            <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">No hay datos en cach\u00e9 para estos filtros. Con\u00e9ctate a internet para cargar datos.</p>
          </div>
        )}

        {tabActiva === 'consolidado' && (
          <TabConsolidado consolidado={consolidado} loading={loading && !isCached} miCandidatoId={miCandidatoId} miListaId={miListaId} />
        )}
        {tabActiva === 'resultados' && (
          <TabResultados data={resultados} loading={loading && !isCached} page={page} onPageChange={setPage} miCandidatoId={miCandidatoId} />
        )}
        {tabActiva === 'actas' && (
          <TabActas data={actas} loading={loading && !isCached} page={page} onPageChange={setPage} />
        )}
        {tabActiva === 'fotos' && (
          <TabFotos data={fotos} loading={loading && !isCached} page={page} onPageChange={setPage} />
        )}
        {tabActiva === 'novedades' && (
          <TabNovedades data={incidencias} loading={loading && !isCached} page={page} onPageChange={setPage} />
        )}
        {tabActiva === 'e14oficial' && (
          <TabE14Oficial data={e14oficial} loading={loading && !isCached} page={page} onPageChange={setPage} />
        )}
        {tabActiva === 'divulgacion' && (
          <TabDivulgacion data={divulgacion} loading={loading && !isCached} miCandidatoId={miCandidatoId} miListaId={miListaId} />
        )}
      </div>
    </div>
  );
}

// ─── Tab: Consolidado ──────────────────────────────────────────

function TabConsolidado({ consolidado, loading, miCandidatoId, miListaId }: {
  consolidado: ConsolidadoEscrutinio | null;
  loading: boolean;
  miCandidatoId: string | null;
  miListaId: string | null;
}) {
  const [expandedPartidos, setExpandedPartidos] = useState<Set<string>>(new Set());

  if (loading || !consolidado) return null;

  const { candidatos, totales, cobertura } = consolidado;
  const maxVotos = candidatos.length > 0 ? Math.max(...candidatos.map(c => c.votos)) : 1;

  // Agrupar por partido
  const partidosMap: Record<string, typeof candidatos> = {};
  for (const c of candidatos) {
    const key = c.partido || 'Sin partido';
    if (!partidosMap[key]) partidosMap[key] = [];
    partidosMap[key].push(c);
  }
  // Determinar el partido propio (del candidato o lista vinculada a la campaña)
  const miPartido = miCandidatoId
    ? candidatos.find(c => c.candidatoId === miCandidatoId)?.partido
    : miListaId
      ? candidatos.find(c => c.listaNombre)?.partido // lista match via partido grouping
      : null;

  // Ordenar: partido propio primero
  const entries = Object.entries(partidosMap).sort(([a], [b]) => {
    if (miPartido) {
      if (a === miPartido) return -1;
      if (b === miPartido) return 1;
    }
    return 0;
  });
  const multiPartido = entries.length > 1;

  const toggle = (partido: string) => {
    if (!multiPartido) return;
    setExpandedPartidos((prev) => {
      const next = new Set(prev);
      if (next.has(partido)) next.delete(partido); else next.add(partido);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-app-surface rounded-card p-4 border border-app-line">
          <p className="text-xs text-app-muted uppercase font-semibold">Mesas</p>
          <p className="text-2xl font-bold text-app-fg">{totales.mesasReportadas}/{totales.totalMesas}</p>
          <p className="text-xs text-app-accent-fg font-semibold">{cobertura} cobertura</p>
        </div>
        <div className="bg-app-surface rounded-card p-4 border border-app-line">
          <p className="text-xs text-app-muted uppercase font-semibold">Votos válidos</p>
          <p className="text-2xl font-bold text-app-fg">{totales.totalVotosValidos.toLocaleString('es-CO')}</p>
        </div>
        <div className="bg-app-surface rounded-card p-4 border border-app-line">
          <p className="text-xs text-app-muted uppercase font-semibold">Blancos</p>
          <p className="text-2xl font-bold text-app-fg">{totales.totalBlancos.toLocaleString('es-CO')}</p>
        </div>
        <div className="bg-app-surface rounded-card p-4 border border-app-line">
          <p className="text-xs text-app-muted uppercase font-semibold">Nulos</p>
          <p className="text-2xl font-bold text-app-fg">{totales.totalNulos.toLocaleString('es-CO')}</p>
        </div>
      </div>

      {/* Ranking agrupado por partido */}
      {candidatos.length === 0 ? (
        <div className="bg-app-surface rounded-card p-8 text-center text-app-muted text-sm border border-app-line">
          Sin datos de candidatos para estos filtros
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(([partido, rows]) => {
            const totalVotos = rows.reduce((s, c) => s + c.votos, 0);
            const isExpanded = !multiPartido || expandedPartidos.has(partido);
            const esPartidoPropio = miPartido ? partido === miPartido : false;
            return (
              <div key={partido} className={`bg-app-surface rounded-card border border-app-line overflow-hidden ${esPartidoPropio ? 'ring-2 ring-editorial-red' : ''}`}>
                {/* Cabecera del partido */}
                <button
                  type="button"
                  onClick={() => toggle(partido)}
                  className={`w-full flex items-center justify-between px-4 py-3 bg-app-elevated border-b border-app-line text-left ${multiPartido ? 'cursor-pointer active:bg-app-surface' : 'cursor-default'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {multiPartido && (
                      <svg className={`w-4 h-4 text-app-muted flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                      </svg>
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${esPartidoPropio ? 'bg-editorial-red text-white' : 'bg-editorial-red/10 text-app-accent-fg border border-editorial-red/30'}`}>{partido}</span>
                    {esPartidoPropio && <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 rounded text-xs font-bold flex-shrink-0">MI</span>}
                    {rows[0]?.listaNombre && rows[0].listaNombre !== partido ? (
                      <span className="text-sm font-semibold text-app-fg truncate">{rows[0].listaNombre}</span>
                    ) : rows.length === 1 ? (
                      <span className="text-sm font-semibold text-app-fg truncate">{rows[0].candidato}</span>
                    ) : (
                      <span className="text-xs text-app-muted">{rows.length} candidatos</span>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-bold text-app-accent-fg">{totalVotos.toLocaleString('es-CO')}</p>
                    <p className="text-xs text-app-muted">{rows.reduce((s, c) => s + parseFloat(c.porcentaje), 0).toFixed(1)}%</p>
                  </div>
                </button>

                {/* Candidatos del partido */}
                {isExpanded && (
                  <div className="divide-y divide-app-line">
                    {rows.map((c, i) => {
                      const esMiCandidato = miCandidatoId ? c.candidatoId === miCandidatoId : false;
                      return (
                      <div key={`${c.candidatoId || c.candidato}-${i}`} className={`px-4 py-3 ${esMiCandidato ? 'bg-editorial-red/5' : ''}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            {rows.length > 1 && <span className="text-xs font-bold text-app-muted w-5 flex-shrink-0">#{i + 1}</span>}
                            <p className={`text-sm font-semibold truncate ${esMiCandidato ? 'text-app-accent-fg' : 'text-app-fg'}`}>{c.candidato}</p>
                            {esMiCandidato && <span className="px-1.5 py-0.5 bg-editorial-red/15 text-app-accent-fg border border-editorial-red/30 rounded text-xs font-bold flex-shrink-0">MI</span>}
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <p className="text-sm font-bold text-app-fg">{c.votos.toLocaleString('es-CO')}</p>
                            <p className="text-xs text-app-muted">{c.porcentaje}%</p>
                          </div>
                        </div>
                        <div className="w-full bg-app-elevated rounded-full h-1.5">
                          <div
                            className="bg-editorial-red h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${maxVotos > 0 ? (c.votos / maxVotos) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Resultados ──────────────────────────────────────────

function TabResultados({ data, loading, page, onPageChange, miCandidatoId }: {
  data: PaginatedResponse<ResultadoEscrutinio> | null;
  loading: boolean;
  page: number;
  onPageChange: (p: number) => void;
  miCandidatoId: string | null;
}) {
  if (loading || !data) return null;

  return (
    <div className="space-y-3">
      {data.data.map((r) => {
        const esMiCandidato = miCandidatoId ? r.candidatoId === miCandidatoId : false;
        return (
        <div key={r.id} className={`bg-app-surface rounded-card p-4 border border-app-line ${esMiCandidato ? 'ring-2 ring-editorial-red bg-editorial-red/5' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold bg-app-elevated text-app-fg border border-app-line px-2 py-1 rounded">
                Mesa #{r.mesa.numero}
              </span>
              {r.alertaFraude && (
                <span className="text-xs font-bold bg-red-500/15 text-red-800 dark:text-red-300 border border-red-500/30 px-2 py-1 rounded">
                  Alerta
                </span>
              )}
            </div>
            <span className="text-xs text-app-muted">
              {new Date(r.capturedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <p className={`text-sm font-semibold ${esMiCandidato ? 'text-app-accent-fg' : 'text-app-fg'}`}>{r.candidato}</p>
            {esMiCandidato && <span className="px-1.5 py-0.5 bg-editorial-red/15 text-app-accent-fg border border-editorial-red/30 rounded text-xs font-bold">MI</span>}
          </div>
          <p className="text-xs text-app-muted">{r.partido}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-app-muted">
            <span className="text-app-fg"><strong>{r.votos}</strong> votos</span>
            <span>Blancos: {r.votosBlanco}</span>
            <span>Nulos: {r.votosNulos}</span>
            <span>Total mesa: {r.totalVotosMesa}</span>
          </div>
          <p className="text-xs text-app-muted mt-1">
            {r.mesa.puestoVotacion.nombre} — {r.mesa.puestoVotacion.municipio?.nombre}
            {r.mesa.puestoVotacion.municipio?.departamento ? `, ${r.mesa.puestoVotacion.municipio.departamento.nombre}` : ''}
          </p>
          <p className="text-xs text-app-muted">
            Testigo: {r.testigo.nombres} {r.testigo.apellidos}
          </p>
        </div>
        );
      })}

      {data.data.length === 0 && (
        <div className="bg-app-surface rounded-card p-8 text-center text-app-muted text-sm border border-app-line">
          Sin resultados para estos filtros
        </div>
      )}

      <Pagination page={page} totalPages={data.totalPages} total={data.total} onPageChange={onPageChange} />
    </div>
  );
}

// ─── Tab: Actas OCR ──────────────────────────────────────────

function TabActas({ data, loading, page, onPageChange }: {
  data: PaginatedResponse<ActaOcrEscrutinio> | null;
  loading: boolean;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading || !data) return null;

  return (
    <div className="space-y-3">
      {data.data.map((acta) => {
        const ocr = (acta.resultadoOcr ?? {}) as Record<string, number>;
        const candidatosMap = acta.candidatosMap ?? {};
        const isExpanded = expandedId === acta.id;

        // Separate entries
        const listaEntries = Object.entries(ocr).filter(([k]) => k.startsWith('_lista:'));
        const candidatoEntries = Object.entries(ocr).filter(([k]) => !k.startsWith('_'));
        const circEntries = Object.entries(ocr).filter(([k]) => k.startsWith('_circ:'));
        const allVotes = [...listaEntries, ...candidatoEntries].sort(([a], [b]) => {
          const pa = candidatosMap[a]?.partido || '';
          const pb = candidatosMap[b]?.partido || '';
          if (pa !== pb) return pa.localeCompare(pb);
          return (candidatosMap[a]?.posicion ?? -1) - (candidatosMap[b]?.posicion ?? -1);
        });

        // Parse resumen vs otras constancias vs alertas
        let resumenRaw = acta.resumenOcr || '';
        let constancias: string | undefined;
        let alertasTexto: string | undefined;
        const idxAlertas = resumenRaw.indexOf('--- ALERTAS ---');
        if (idxAlertas >= 0) {
          alertasTexto = resumenRaw.slice(idxAlertas + '--- ALERTAS ---'.length).trim();
          resumenRaw = resumenRaw.slice(0, idxAlertas).trim();
        }
        const idxConst = resumenRaw.indexOf('--- OTRAS CONSTANCIAS ---');
        if (idxConst >= 0) {
          constancias = resumenRaw.slice(idxConst + '--- OTRAS CONSTANCIAS ---'.length).trim();
          resumenRaw = resumenRaw.slice(0, idxConst).trim();
        }
        const resumen = resumenRaw;
        const alertasCriticas = ocr['_alertasCriticas'] ?? 0;
        const alertasAdvertencia = ocr['_alertasAdvertencia'] ?? 0;
        const totalAlertasOcr = alertasCriticas + alertasAdvertencia + (ocr['_alertasInfo'] ?? 0);
        const alertaLines = alertasTexto?.split('\n').filter(l => l.trim()) ?? [];

        return (
          <div key={acta.id} className="bg-app-surface rounded-card border border-app-line overflow-hidden">
            {/* Header — always visible */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : acta.id)}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-xs font-bold bg-app-elevated text-app-fg border border-app-line px-2 py-0.5 rounded">
                    Mesa #{acta.mesa.numero}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${acta.estado === 'CONFIRMADO' ? 'bg-green-500/15 text-green-800 dark:text-green-300 border border-green-500/30' : 'bg-green-500/15 text-green-800 dark:text-green-300 border border-green-500/30'}`}>
                    {acta.estado}
                  </span>
                  {alertasCriticas > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/15 text-red-800 dark:text-red-300 border border-red-500/30">{alertasCriticas} alerta{alertasCriticas !== 1 ? 's' : ''}</span>
                  )}
                  {alertasCriticas === 0 && alertasAdvertencia > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">{alertasAdvertencia} advertencia{alertasAdvertencia !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <p className="text-xs text-app-muted truncate">
                  {acta.mesa.puestoVotacion.nombre}
                  {acta.mesa.puestoVotacion.municipio ? ` — ${acta.mesa.puestoVotacion.municipio.nombre}` : ''}
                </p>
                <p className="text-xs text-app-muted mt-0.5">
                  {acta.eleccion.nombre} · {acta.testigo.nombres} {acta.testigo.apellidos}
                </p>
              </div>
              <span className="text-app-muted text-lg ml-2">{isExpanded ? '−' : '+'}</span>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-app-line px-4 py-3 space-y-3">
                {/* Photos */}
                {acta.fotos.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {acta.fotos.map(f => (
                      <img key={f.id} src={f.url} alt={`Pag ${f.orden}`}
                        className="w-20 h-20 object-cover rounded-lg border border-app-line flex-shrink-0" loading="lazy" />
                    ))}
                  </div>
                )}

                {/* Resumen IA */}
                {resumen && (
                  <div className="bg-app-elevated rounded-lg px-3 py-2 border border-app-line">
                    <p className="text-xs font-bold text-app-muted uppercase mb-1">Analisis IA</p>
                    <p className="text-xs text-app-fg leading-relaxed">{resumen}</p>
                  </div>
                )}

                {/* Alertas de consistencia */}
                {totalAlertasOcr > 0 && (
                  <div className={`rounded-lg px-3 py-2 space-y-1.5 border ${alertasCriticas > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                    <div className="flex items-center justify-between">
                      <p className={`text-xs font-bold uppercase ${alertasCriticas > 0 ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>Alertas</p>
                      <div className="flex gap-1">
                        {alertasCriticas > 0 && <span className="px-1.5 py-0.5 bg-red-500/20 text-red-800 dark:text-red-300 rounded text-xs font-bold">{alertasCriticas}</span>}
                        {alertasAdvertencia > 0 && <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded text-xs font-bold">{alertasAdvertencia}</span>}
                      </div>
                    </div>
                    {alertaLines.map((line, i) => (
                      <p key={i} className={`text-xs leading-relaxed ${
                        line.includes('[CRITICO]') ? 'text-red-800 dark:text-red-300 font-semibold' :
                        line.includes('[ADVERTENCIA]') ? 'text-amber-800 dark:text-amber-300' :
                        'text-app-muted'
                      }`}>{line}</p>
                    ))}
                  </div>
                )}

                {/* Otras constancias */}
                {constancias && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase mb-1">Otras constancias</p>
                    <p className="text-xs text-app-fg leading-relaxed italic">{constancias}</p>
                  </div>
                )}

                {/* Nivelacion */}
                {(ocr['_totalVotosUrna'] != null || ocr['_totalVotosIncinerados'] != null) && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 space-y-1">
                    <p className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase">Nivelacion de la mesa</p>
                    {[
                      { label: 'Sufragantes (E-11)', value: ocr['_totalVotosMesa'] },
                      { label: 'Votos en la urna', value: ocr['_totalVotosUrna'] },
                      { label: 'Votos incinerados', value: ocr['_totalVotosIncinerados'] },
                    ].map(({ label, value }) => value != null ? (
                      <div key={label} className="flex justify-between text-xs">
                        <span className="text-app-muted">{label}</span>
                        <span className="font-bold text-app-fg tabular-nums">{value}</span>
                      </div>
                    ) : null)}
                    {ocr['_huboRecuento'] === 1 && (
                      <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mt-1">Hubo recuento de votos</p>
                    )}
                  </div>
                )}

                {/* Votes by partido */}
                {allVotes.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-app-muted uppercase mb-1">Votos por candidato</p>
                    <div className="space-y-0.5 max-h-60 overflow-y-auto">
                      {(() => {
                        let lastPartido = '';
                        // Compute partido totals
                        const partidoTotals: Record<string, number> = {};
                        for (const [id, v] of allVotes) {
                          const p = candidatosMap[id]?.partido || '';
                          if (p) partidoTotals[p] = (partidoTotals[p] || 0) + v;
                        }
                        return allVotes.map(([id, v]) => {
                          const info = candidatosMap[id];
                          const partido = info?.partido || '';
                          const showHeader = partido !== lastPartido;
                          lastPartido = partido;
                          const isLista = id.startsWith('_lista:');
                          return (
                            <div key={id}>
                              {showHeader && partido && (
                                <div className="bg-app-elevated px-2 py-0.5 rounded mt-1 flex justify-between border border-app-line">
                                  <span className="text-xs font-black text-app-muted uppercase">
                                    {info?.listaNombre || partido} ({partido})
                                  </span>
                                  <span className="text-xs font-black text-app-fg tabular-nums">{partidoTotals[partido] ?? 0}</span>
                                </div>
                              )}
                              <div className={`flex justify-between px-2 py-0.5 ${isLista ? 'bg-blue-500/10 rounded' : ''}`}>
                                <span className={`text-xs truncate ${isLista ? 'text-blue-800 dark:text-blue-300 font-bold' : 'text-app-muted'}`}>
                                  {!isLista && info?.posicion != null ? `${info.posicion}. ` : ''}
                                  {isLista ? (info?.nombre || 'Agrupacion') : (info?.nombre || id.slice(0, 8))}
                                </span>
                                <span className={`text-xs font-bold tabular-nums ${isLista ? 'text-blue-800 dark:text-blue-300' : 'text-app-fg'}`}>{v}</span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {/* Circunscripciones + totales */}
                <div className="border-t border-app-line pt-2 space-y-1">
                  {circEntries.length > 0 && (
                    <div className="bg-app-elevated rounded-lg px-2 py-1.5 space-y-0.5 border border-app-line">
                      {circEntries.map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-app-muted">{k.replace('_circ:', '')}</span>
                          <span className="font-bold text-app-fg tabular-nums">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {[
                    { label: 'Votos en blanco', value: ocr['_votosBlanco'] },
                    { label: 'Votos nulos', value: ocr['_votosNulos'] },
                    { label: 'No marcados', value: ocr['_votosNoMarcados'] },
                  ].map(({ label, value }) => value != null ? (
                    <div key={label} className="flex justify-between text-xs px-1">
                      <span className="text-app-muted">{label}</span>
                      <span className="font-bold text-app-fg tabular-nums">{value}</span>
                    </div>
                  ) : null)}
                </div>

                {/* Serial */}
                {acta.serialE14 && (
                  <p className="text-xs text-app-muted border-t border-app-line pt-2">
                    Serie: <span className="font-mono font-bold text-app-fg">{acta.serialE14}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {data.data.length === 0 && (
        <div className="bg-app-surface rounded-card p-8 text-center text-app-muted text-sm border border-app-line">
          Sin actas OCR procesadas para estos filtros
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
          <div key={f.id} className="bg-app-surface rounded-card border border-app-line overflow-hidden">
            {f.imagenUrl && (
              <img
                src={f.imagenUrl}
                alt={`E14 Mesa ${f.mesa.numero}`}
                className="w-full h-48 object-cover bg-app-elevated"
                loading="lazy"
              />
            )}
            <div className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold bg-app-elevated text-app-fg border border-app-line px-2 py-1 rounded">
                  Mesa #{f.mesa.numero}
                </span>
                <span className="text-xs text-app-muted">
                  {new Date(f.capturedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <p className="text-xs text-app-muted mt-1">
                {f.mesa.puestoVotacion.nombre}
                {f.mesa.puestoVotacion.municipio ? ` — ${f.mesa.puestoVotacion.municipio.nombre}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>

      {data.data.length === 0 && (
        <div className="bg-app-surface rounded-card p-8 text-center text-app-muted text-sm border border-app-line">
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
          <div key={inc.id} className="bg-app-surface rounded-card p-4 border border-app-line">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-1 rounded ${config.color}`}>
                  {config.label}
                </span>
                <span className="text-xs font-bold bg-app-elevated text-app-fg border border-app-line px-2 py-1 rounded">
                  Mesa #{inc.mesa.numero}
                </span>
              </div>
              <span className="text-xs text-app-muted">
                {new Date(inc.capturedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>
            <p className="text-sm text-app-fg">{inc.descripcion}</p>
            {inc.fotoUrl && (
              <img
                src={inc.fotoUrl}
                alt="Evidencia"
                className="mt-2 w-full h-32 object-cover rounded-lg bg-app-elevated"
                loading="lazy"
              />
            )}
            <p className="text-xs text-app-muted mt-2">
              {inc.mesa.puestoVotacion.nombre}
              {inc.mesa.puestoVotacion.municipio ? ` — ${inc.mesa.puestoVotacion.municipio.nombre}` : ''}
            </p>
            <p className="text-xs text-app-muted">
              Testigo: {inc.testigo.nombres} {inc.testigo.apellidos} — CC {inc.testigo.cedula}
            </p>
          </div>
        );
      })}

      {data.data.length === 0 && (
        <div className="bg-app-surface rounded-card p-8 text-center text-app-muted text-sm border border-app-line">
          Sin novedades para estos filtros
        </div>
      )}

      <Pagination page={page} totalPages={data.totalPages} total={data.total} onPageChange={onPageChange} />
    </div>
  );
}

// ─── Tab: Divulgación Oficial (Registraduría) ──────────────────────

function TabDivulgacion({ data, loading, miCandidatoId, miListaId }: {
  data: DivulgacionData | null;
  loading: boolean;
  miCandidatoId: string | null;
  miListaId: string | null;
}) {
  if (loading || !data) return null;

  const { estado, resultados } = data;

  // Aggregate results by candidate
  const candidatoMap = new Map<string, { nombre: string; partido: string; candidatoId: string | null; listaId: string | null; votos: number }>();
  let totalBlancos = 0;
  let totalNulos = 0;
  let totalNoMarcados = 0;

  for (const r of resultados.resultados) {
    const tipo = (r.tipoVoto || '').toUpperCase();
    if (tipo === 'BLANCO' || tipo === 'VOTO_BLANCO') {
      totalBlancos += r.votos;
      continue;
    }
    if (tipo === 'NULO' || tipo === 'VOTO_NULO') {
      totalNulos += r.votos;
      continue;
    }
    if (tipo === 'NO_MARCADO' || tipo === 'VOTO_NO_MARCADO') {
      totalNoMarcados += r.votos;
      continue;
    }

    const key = r.candidatoId || r.listaId || r.candidato?.nombre || r.lista?.nombre || 'Desconocido';
    const existing = candidatoMap.get(key);
    if (existing) {
      existing.votos += r.votos;
    } else {
      candidatoMap.set(key, {
        nombre: r.candidato?.nombre || r.lista?.nombre || 'Desconocido',
        partido: r.candidato?.partido || r.lista?.partido || '',
        candidatoId: r.candidatoId,
        listaId: r.listaId,
        votos: r.votos,
      });
    }
  }

  const candidatos = Array.from(candidatoMap.values()).sort((a, b) => b.votos - a.votos);
  const maxVotos = candidatos.length > 0 ? candidatos[0].votos : 1;
  const totalVotos = resultados.total;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-app-surface rounded-card p-4 border border-app-line">
          <p className="text-xs text-app-muted uppercase font-semibold">Cobertura</p>
          <p className="text-2xl font-bold text-app-fg">{estado.coberturaPct}%</p>
          <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold">{estado.mesasConResultadoOficial} mesas</p>
        </div>
        <div className="bg-app-surface rounded-card p-4 border border-app-line">
          <p className="text-xs text-app-muted uppercase font-semibold">Total votos</p>
          <p className="text-2xl font-bold text-app-fg">{totalVotos.toLocaleString('es-CO')}</p>
          {resultados.boletinNumero != null && (
            <p className="text-xs text-app-muted">Boletín #{resultados.boletinNumero}</p>
          )}
        </div>
        <div className="bg-app-surface rounded-card p-4 border border-app-line">
          <p className="text-xs text-app-muted uppercase font-semibold">Comparadas</p>
          <p className="text-2xl font-bold text-app-fg">{estado.mesasConAmbos}</p>
          <p className="text-xs text-app-muted">testigo + oficial</p>
        </div>
        <div className="bg-app-surface rounded-card p-4 border border-app-line">
          <p className="text-xs text-app-muted uppercase font-semibold">Discrepancias</p>
          <p className={`text-2xl font-bold ${estado.mesasConDiscrepancia > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {estado.mesasConDiscrepancia}
          </p>
          <p className="text-xs text-app-muted">&gt;5% diferencia</p>
        </div>
      </div>

      {/* Last sync */}
      {estado.ultimaSincronizacion && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-card p-3 flex items-center gap-2">
          <span className="text-blue-700 dark:text-blue-300 text-xs font-bold uppercase">Sync</span>
          <p className="text-xs text-blue-800 dark:text-blue-300">
            Última sincronización:{' '}
            <span className="font-semibold">
              {new Date(estado.ultimaSincronizacion).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </p>
        </div>
      )}

      {/* Candidate ranking */}
      {candidatos.length === 0 && totalBlancos === 0 && totalNulos === 0 ? (
        <div className="bg-app-surface rounded-card p-8 text-center text-app-muted text-sm border border-app-line">
          Sin resultados oficiales de divulgación para estos filtros
        </div>
      ) : (
        <div className="bg-app-surface rounded-card border border-app-line overflow-hidden">
          <div className="px-4 py-3 bg-app-elevated border-b border-app-line">
            <h3 className="text-sm font-bold text-app-fg">Resultados oficiales por candidato</h3>
          </div>
          <div className="divide-y divide-app-line">
            {candidatos.map((c, i) => {
              const pct = totalVotos > 0 ? ((c.votos / totalVotos) * 100).toFixed(1) : '0.0';
              const barWidth = maxVotos > 0 ? (c.votos / maxVotos) * 100 : 0;
              const esMio = (miCandidatoId && c.candidatoId === miCandidatoId)
                || (miListaId && c.listaId === miListaId);

              return (
                <div key={c.candidatoId || c.listaId || i} className={`px-4 py-3 ${esMio ? 'bg-editorial-red/5' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-app-muted w-5 flex-shrink-0">#{i + 1}</span>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${esMio ? 'text-app-accent-fg' : 'text-app-fg'}`}>
                          {c.nombre}
                        </p>
                        {c.partido && (
                          <p className="text-xs text-app-muted truncate">{c.partido}</p>
                        )}
                      </div>
                      {esMio && (
                        <span className="px-1.5 py-0.5 bg-editorial-red/15 text-app-accent-fg border border-editorial-red/30 rounded text-xs font-bold flex-shrink-0">MI</span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-sm font-bold text-app-fg">{c.votos.toLocaleString('es-CO')}</p>
                      <p className="text-xs text-app-muted">{pct}%</p>
                    </div>
                  </div>
                  <div className="h-2 bg-app-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${esMio ? 'bg-editorial-red' : 'bg-blue-500'}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Special vote types */}
            {(totalBlancos > 0 || totalNulos > 0 || totalNoMarcados > 0) && (
              <div className="px-4 py-3 bg-app-elevated">
                <p className="text-xs font-semibold text-app-muted uppercase mb-2">Otros votos</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  {totalBlancos > 0 && (
                    <span className="text-app-fg">Blancos: <strong>{totalBlancos.toLocaleString('es-CO')}</strong></span>
                  )}
                  {totalNulos > 0 && (
                    <span className="text-app-fg">Nulos: <strong>{totalNulos.toLocaleString('es-CO')}</strong></span>
                  )}
                  {totalNoMarcados > 0 && (
                    <span className="text-app-fg">No marcados: <strong>{totalNoMarcados.toLocaleString('es-CO')}</strong></span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: E-14 Oficial (Registraduría) ──────────────────────

function TabE14Oficial({ data, loading, page, onPageChange }: {
  data: PaginatedResponse<E14OficialEscrutinio> | null;
  loading: boolean;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);

  const handleVerPdf = async (mesaId: string, disposition: 'inline' | 'attachment' = 'inline') => {
    setLoadingUrl(mesaId);
    try {
      const url = await escrutinioService.getE14OficialUrl(mesaId, disposition);
      window.open(url, '_blank');
    } catch {
      // silently fail — button re-enables
    }
    setLoadingUrl(null);
  };

  if (loading || !data) return null;

  return (
    <div className="space-y-3">
      {data.total > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-card p-3 flex items-center gap-2">
          <span className="text-blue-700 dark:text-blue-300 text-xs font-bold uppercase">PDF</span>
          <div>
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">{data.total} actas E-14 oficiales disponibles</p>
            <p className="text-xs text-blue-700 dark:text-blue-300">Documentos descargados del portal de divulgación de la Registraduría Nacional</p>
          </div>
        </div>
      )}

      {data.data.map((acta) => {
        const kb = Math.round(acta.tamanoBytes / 1024);
        const depto = acta.mesa.puestoVotacion.municipio.departamento?.nombre;
        const muni = acta.mesa.puestoVotacion.municipio.nombre;
        const puesto = acta.mesa.puestoVotacion.nombre;
        const isLoading = loadingUrl === acta.mesaId;

        return (
          <div key={acta.id} className="bg-app-surface rounded-card p-4 border border-app-line">
            {/* Header: Mesa + location */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-editorial-red/10 text-app-accent-fg border border-editorial-red/30 px-2 py-1 rounded">
                  Mesa #{acta.mesa.numero}
                </span>
                <span className="text-xs font-medium bg-green-500/15 text-green-800 dark:text-green-300 border border-green-500/30 px-2 py-1 rounded">
                  PDF oficial
                </span>
              </div>
              <span className="text-xs text-app-muted">
                {new Date(acta.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>

            {/* Location info */}
            <div className="text-xs text-app-muted mb-3 space-y-0.5">
              <p className="font-medium text-app-fg">{puesto}</p>
              <p>{muni}{depto ? ` — ${depto}` : ''}</p>
              <p className="text-app-muted">{kb} KB</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleVerPdf(acta.mesaId, 'inline')}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-semibold bg-editorial-red text-white rounded-btn hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isLoading ? (
                  <div className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>👁️ Ver E-14</>
                )}
              </button>
              <button
                onClick={() => handleVerPdf(acta.mesaId, 'attachment')}
                disabled={isLoading}
                className="flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-semibold bg-app-elevated text-app-fg border border-app-line rounded-btn hover:bg-app-surface disabled:opacity-50 transition-colors"
              >
                ⬇️ Descargar
              </button>
            </div>
          </div>
        );
      })}

      {data.data.length === 0 && (
        <div className="bg-app-surface rounded-card p-8 text-center border border-app-line">
          <p className="text-app-muted text-sm">No hay actas E-14 oficiales para estos filtros</p>
          <p className="text-app-muted text-xs mt-1">Las actas se importan desde el portal de divulgación de la Registraduría</p>
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
      <span className="text-xs text-app-muted">{total} registros</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 min-h-[44px] text-xs font-semibold bg-app-surface text-app-fg border border-app-line rounded-btn disabled:opacity-40 hover:bg-app-elevated"
        >
          Anterior
        </button>
        <span className="text-xs text-app-muted">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 min-h-[44px] text-xs font-semibold bg-app-surface text-app-fg border border-app-line rounded-btn disabled:opacity-40 hover:bg-app-elevated"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
