import { resolverEndpoints } from './endpoints';

describe('resolverEndpoints', () => {
  it('usa o IP do Metro com as portas padrão', () => {
    expect(resolverEndpoints({ hostUri: '192.168.0.12:8081' })).toEqual({
      api: 'http://192.168.0.12:8000',
      ws: 'ws://192.168.0.12:8002',
    });
  });

  it('respeita as portas configuradas', () => {
    expect(resolverEndpoints({ hostUri: '10.0.0.5:8081', apiPort: '8001' }).api).toBe(
      'http://10.0.0.5:8001',
    );
  });

  it('URLs explícitas vencem e perdem a barra final', () => {
    expect(
      resolverEndpoints({
        hostUri: '10.0.0.5:8081',
        apiUrl: 'https://api.exemplo.com/',
        wsUrl: 'wss://rt.exemplo.com/',
      }),
    ).toEqual({ api: 'https://api.exemplo.com', ws: 'wss://rt.exemplo.com' });
  });

  it('sem Metro cai em localhost', () => {
    expect(resolverEndpoints({ hostUri: null }).api).toBe('http://localhost:8000');
  });
});
