/** Constantes da aba Mapa (v6). Os valores vêm de tokens.v6.json / ajustes. */

import type { Coordenada } from '@/features/localizacao';

/** Raio padrão do alerta em metros (a tela Ajustes muda isso na etapa 4.5). */
export const RAIO_PADRAO_M = 1000;

/** Centro de São Paulo (fallback quando não há localização). */
export const CENTRO_SAO_PAULO: Coordenada = {
  latitude: -23.5613,
  longitude: -46.6565,
};

/** Zoom inicial do mapa (tokens map.camera.zoomDefault ≈ 15). */
export const ZOOM_PADRAO = 15;

/** Zoom ao focar uma ocorrência (tokens map.camera.zoomSelected ≈ 15.4). */
export const ZOOM_SELECIONADO = 15.4;
