import { act, renderHook } from '@testing-library/react-native';

import { useAcaoComDesfazer } from './useAcaoComDesfazer';

const JANELA_MS = 4_000;

describe('useAcaoComDesfazer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('efetiva a ação depois da janela', async () => {
    const efetivar = jest.fn();
    const { result } = await renderHook(() => useAcaoComDesfazer(JANELA_MS, efetivar));

    await act(() => result.current.agendar('confirmar'));
    expect(result.current.pendente).toBe('confirmar');
    expect(efetivar).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(JANELA_MS);
    });

    expect(efetivar).toHaveBeenCalledTimes(1);
    expect(efetivar).toHaveBeenCalledWith('confirmar');
    expect(result.current.pendente).toBeNull();
  });

  it('desfazer cancela sem efetivar', async () => {
    const efetivar = jest.fn();
    const { result } = await renderHook(() => useAcaoComDesfazer(JANELA_MS, efetivar));

    await act(() => result.current.agendar('resolver'));
    await act(() => result.current.desfazer());

    expect(result.current.pendente).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(JANELA_MS);
    });

    expect(efetivar).not.toHaveBeenCalled();
  });

  it('agendar de novo efetiva a pendente anterior', async () => {
    const efetivar = jest.fn();
    const { result } = await renderHook(() => useAcaoComDesfazer(JANELA_MS, efetivar));

    await act(() => result.current.agendar('primeira'));
    await act(() => result.current.agendar('segunda'));

    expect(efetivar).toHaveBeenCalledTimes(1);
    expect(efetivar).toHaveBeenCalledWith('primeira');
    expect(result.current.pendente).toBe('segunda');

    await act(async () => {
      jest.advanceTimersByTime(JANELA_MS);
    });

    expect(efetivar).toHaveBeenCalledTimes(2);
    expect(efetivar).toHaveBeenLastCalledWith('segunda');
  });

  it('efetiva agora quando pedido (fechar o detalhe)', async () => {
    const efetivar = jest.fn();
    const { result } = await renderHook(() => useAcaoComDesfazer(JANELA_MS, efetivar));

    await act(() => result.current.agendar('confirmar'));
    await act(() => result.current.efetivarAgora());

    expect(efetivar).toHaveBeenCalledWith('confirmar');
    expect(result.current.pendente).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(JANELA_MS);
    });

    expect(efetivar).toHaveBeenCalledTimes(1);
  });

  it('ao desmontar com pendente, efetiva', async () => {
    const efetivar = jest.fn();
    const { result, unmount } = await renderHook(() =>
      useAcaoComDesfazer(JANELA_MS, efetivar),
    );

    await act(() => result.current.agendar('resolver'));
    await act(async () => {
      await unmount();
    });

    expect(efetivar).toHaveBeenCalledTimes(1);
    expect(efetivar).toHaveBeenCalledWith('resolver');
  });
});
