import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';

import type { EstadoSync } from '@/data/sincronizacao';

import { RelatosProvider } from './relatos';

const mockOuvintes: ((estado: EstadoSync) => void)[] = [];
const mockMeusRelatos = jest.fn(() => []);

jest.mock('@/data/db', () => ({ abrirBanco: () => ({}) }));

jest.mock('@/data/outbox', () => ({
  meusRelatos: () => mockMeusRelatos(),
  enfileirar: jest.fn(),
  marcarEnviado: jest.fn(),
  marcarRejeitado: jest.fn(),
  registrarFalha: jest.fn(),
  contarPendentes: () => 0,
  marcarEncerrado: jest.fn(),
  cancelarPendente: jest.fn(),
}));

jest.mock('@/data/sincronizacao', () => ({
  Sincronizador: class {
    ouvir(cb: (estado: EstadoSync) => void) {
      mockOuvintes.push(cb);
      return () => {
        const indice = mockOuvintes.indexOf(cb);
        if (indice >= 0) mockOuvintes.splice(indice, 1);
      };
    }
    iniciar() {}
    parar() {}
    estado(): EstadoSync {
      return { online: true, pendentes: 0, enviando: false, ultimoEnvio: null };
    }
    sincronizarAgora() {
      return Promise.resolve();
    }
  },
}));

jest.mock('@/api/cliente', () => ({
  enviarRelato: jest.fn(async () => undefined),
}));

jest.mock('@/data/aparelho', () => ({ idAparelho: () => 'aparelho-1' }));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => () => undefined) },
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => 'cliente-1' }));

async function montar() {
  const clienteQuery = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidar = jest.spyOn(clienteQuery, 'invalidateQueries');

  await render(
    <QueryClientProvider client={clienteQuery}>
      <RelatosProvider>
        <></>
      </RelatosProvider>
    </QueryClientProvider>,
  );

  return { invalidar };
}

async function notificar(estado: EstadoSync) {
  await act(async () => {
    for (const ouvinte of [...mockOuvintes]) {
      ouvinte(estado);
    }
  });
}

beforeEach(() => {
  mockOuvintes.length = 0;
  mockMeusRelatos.mockClear();
});

describe('RelatosProvider · estado do sincronizador', () => {
  it('só invalida as ocorrências quando o último envio muda', async () => {
    const { invalidar } = await montar();
    expect(mockOuvintes).toHaveLength(1);

    await notificar({ online: true, pendentes: 1, enviando: false, ultimoEnvio: null });
    expect(invalidar).not.toHaveBeenCalled();

    // Mesmo estado: não relê a lista nem invalida nada.
    const leiturasAntes = mockMeusRelatos.mock.calls.length;
    await notificar({ online: true, pendentes: 1, enviando: false, ultimoEnvio: null });
    expect(mockMeusRelatos).toHaveBeenCalledTimes(leiturasAntes);
    expect(invalidar).not.toHaveBeenCalled();

    // Mudou só a contagem: relê a lista, mas não invalida ocorrências.
    const leiturasAntesDaContagem = mockMeusRelatos.mock.calls.length;
    await notificar({ online: true, pendentes: 0, enviando: false, ultimoEnvio: null });
    expect(mockMeusRelatos).toHaveBeenCalledTimes(leiturasAntesDaContagem + 1);
    expect(invalidar).not.toHaveBeenCalled();

    // Último envio mudou: invalida o mapa exatamente uma vez.
    await notificar({ online: true, pendentes: 0, enviando: false, ultimoEnvio: 1234 });
    expect(invalidar).toHaveBeenCalledTimes(1);
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['ocorrencias'] });

    // O mesmo ultimoEnvio não invalida de novo.
    await notificar({ online: true, pendentes: 0, enviando: false, ultimoEnvio: 1234 });
    expect(invalidar).toHaveBeenCalledTimes(1);
  });
});
