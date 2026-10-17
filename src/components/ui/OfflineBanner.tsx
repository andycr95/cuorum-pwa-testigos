/**
 * OfflineBanner - Delegado a BarraEstadoEnvio (CUO-207)
 *
 * Reemplaza el antiguo banner fixed top-0 que tapaba la cabecera por la
 * barra de estado fija bajo la cabecera, unificando los tres estados y "Sin internet".
 */
export { BarraEstadoEnvio as OfflineBanner, BarraEstadoEnvio } from '../sync/BarraEstadoSync';
