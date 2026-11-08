import Constants from 'expo-constants';

export type Endpoints = { api: string; ws: string };

type Fonte = {
  apiUrl?: string;
  wsUrl?: string;
  apiPort?: string;
  wsPort?: string;
  /** host:porta do Metro, ex.: "192.168.0.12:8081" (o celular alcança o laptop por ele) */
  hostUri?: string | null;
};

const API_PORT_PADRAO = '8000';
const WS_PORT_PADRAO = '8002';

/**
 * URLs explícitas vencem. Sem elas, usa o IP do laptop que serve o Metro, que é o mesmo que
 * roda o docker compose, com as portas da API e do realtime.
 */
export function resolverEndpoints(fonte: Fonte): Endpoints {
  const host = fonte.hostUri?.split(':')[0] || 'localhost';
  const api = fonte.apiUrl || `http://${host}:${fonte.apiPort || API_PORT_PADRAO}`;
  const ws = fonte.wsUrl || `ws://${host}:${fonte.wsPort || WS_PORT_PADRAO}`;
  return { api: api.replace(/\/+$/, ''), ws: ws.replace(/\/+$/, '') };
}

// process.env.EXPO_PUBLIC_* precisa ser lido de forma estática para o Metro embutir o valor
export const endpoints = resolverEndpoints({
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  wsUrl: process.env.EXPO_PUBLIC_WS_URL,
  apiPort: process.env.EXPO_PUBLIC_API_PORT,
  wsPort: process.env.EXPO_PUBLIC_WS_PORT,
  hostUri: Constants.expoConfig?.hostUri,
});
