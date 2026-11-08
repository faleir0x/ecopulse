/**
 * Sincronizador da outbox: envia os relatos pendentes quando há rede.
 * Dependências injetadas para testar sem rede/SQLite reais.
 */
import { ApiErro, type RelatoEnvio } from '@/api/cliente';

import type { RelatoLocal } from './outbox';

export type RepositorioOutbox = {
  prontos(agora: number): RelatoLocal[];
  marcarEnviado(clientId: string, agora: number): void;
  marcarRejeitado(clientId: string, erro: string): void;
  registrarFalha(clientId: string, erro: string, agora: number, retryAfterS: number | null): void;
  contarPendentes(): number;
};

export type EstadoSync = { online: boolean; pendentes: number; enviando: boolean; ultimoEnvio: number | null };

export type Deps = {
  repo: RepositorioOutbox;
  enviar: (relato: RelatoEnvio) => Promise<void>;
  /** Assina mudanças de conectividade; devolve a função para cancelar. */
  observarRede: (cb: (online: boolean) => void) => () => void;
  agora?: () => number;
  /** Intervalo de verificação de itens com backoff vencido. */
  intervaloMs?: number;
};

const INTERVALO_PADRAO_MS = 30_000;

export class Sincronizador {
  private online = true;
  private enviando = false;
  private ultimoEnvio: number | null = null;
  private rodada: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cancelarRede: (() => void) | null = null;
  private ouvintes = new Set<(estado: EstadoSync) => void>();

  constructor(private readonly deps: Deps) {}

  private obterAgora(): number {
    return (this.deps.agora ?? Date.now)();
  }

  /** Começa a observar a rede e o relógio. Ao ficar online, sincroniza na hora. */
  iniciar(): void {
    if (!this.cancelarRede) {
      this.cancelarRede = this.deps.observarRede((online) => {
        this.online = online;
        this.notificar();
        if (online) {
          void this.sincronizarAgora();
        }
      });
    }

    if (!this.timer) {
      this.timer = setInterval(() => {
        void this.sincronizarAgora();
      }, this.deps.intervaloMs ?? INTERVALO_PADRAO_MS);
    }
  }

  parar(): void {
    if (this.cancelarRede) {
      this.cancelarRede();
      this.cancelarRede = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Envia os prontos em ordem, um por vez (nunca duas rodadas em paralelo: chamadas
   * concorrentes reaproveitam a rodada em andamento). 202 → marcarEnviado; ApiErro
   * temporário → registrarFalha(retryAfterS) e PARA a rodada se status 0 (sem rede);
   * ApiErro definitivo → marcarRejeitado; outro erro → registrarFalha.
   * Offline: não tenta. Notifica os ouvintes a cada mudança de estado.
   */
  sincronizarAgora(): Promise<void> {
    if (this.rodada) {
      return this.rodada;
    }
    if (!this.online) {
      return Promise.resolve();
    }

    this.rodada = this.executarRodada().finally(() => {
      this.rodada = null;
    });
    return this.rodada;
  }

  private async executarRodada(): Promise<void> {
    this.enviando = true;
    this.notificar();

    try {
      const prontos = this.deps.repo.prontos(this.obterAgora());

      for (const relato of prontos) {
        if (!this.online) {
          break;
        }

        try {
          await this.deps.enviar(relato);
          const enviadoEm = this.obterAgora();
          this.deps.repo.marcarEnviado(relato.client_id, enviadoEm);
          this.ultimoEnvio = enviadoEm;
          this.notificar();
        } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : String(erro);
          const falhouEm = this.obterAgora();

          if (erro instanceof ApiErro && erro.temporario) {
            this.deps.repo.registrarFalha(
              relato.client_id,
              mensagem,
              falhouEm,
              erro.retryAfterS,
            );
            this.notificar();
            if (erro.status === 0) {
              break;
            }
          } else if (erro instanceof ApiErro) {
            this.deps.repo.marcarRejeitado(relato.client_id, mensagem);
            this.notificar();
          } else {
            this.deps.repo.registrarFalha(relato.client_id, mensagem, falhouEm, null);
            this.notificar();
          }
        }
      }
    } finally {
      this.enviando = false;
      this.notificar();
    }
  }

  estado(): EstadoSync {
    return {
      online: this.online,
      pendentes: Number(this.deps.repo.contarPendentes()) || 0,
      enviando: this.enviando,
      ultimoEnvio: this.ultimoEnvio,
    };
  }

  ouvir(cb: (estado: EstadoSync) => void): () => void {
    this.ouvintes.add(cb);
    return () => {
      this.ouvintes.delete(cb);
    };
  }

  private notificar(): void {
    const estado = this.estado();
    for (const ouvinte of [...this.ouvintes]) {
      ouvinte(estado);
    }
  }
}

export { ApiErro };
