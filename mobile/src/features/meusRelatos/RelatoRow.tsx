import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Pill } from '@/components/Pill';
import { T } from '@/components/T';
import { TypeIcon } from '@/components/TypeIcon';
import type { MidiaLocal, RelatoLocal, StatusRelato } from '@/data/outbox';
import { ROTULO_SEVERIDADE, ROTULO_TIPO } from '@/domain/tipos';
import { tempoRelativo } from '@/features/mapa/tempo';
import type { NomeIcone } from '@/icons';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, raio } from '@/theme/tokens';

import { formatarCoordenadas } from './formato';
import { MediaThumb } from '@/features/relatar/MediaThumb';
import { useSituacaoRelato } from './useSituacaoRelato';

export const STATUS_RELATO: Record<StatusRelato, { rotulo: string; icone: NomeIcone }> = {
  pendente: { rotulo: 'Na fila', icone: 'history' },
  enviado: { rotulo: 'Enviado', icone: 'cloud-check' },
  encerrado: { rotulo: 'Encerrado', icone: 'check-circle' },
  rejeitado: { rotulo: 'Rejeitado', icone: 'cloud-cross' },
};

export type RelatoRowProps = {
  relato: RelatoLocal;
  /** ocorrenciaId: a ocorrência ativa em que o relato entrou (marca "Já passou" no servidor). */
  onEncerrar: (clientId: string, ocorrenciaId: number | null) => void;
  onAbrirMidia: (midias: MidiaLocal[], indice: number) => void;
  /** Abre o detalhe da ocorrência em que o relato entrou. */
  onAbrir: (ocorrenciaId: number) => void;
};

/** Depois disso, sem resposta do servidor o relato aparece como "Sem detalhes". */
export const JANELA_PROCESSAMENTO_MS = 2 * 60_000;

export function RelatoRow({ relato, onEncerrar, onAbrirMidia, onAbrir }: RelatoRowProps) {
  const { cor, sev } = useTema();
  const status = STATUS_RELATO[relato.status];
  const podeEncerrar = relato.status === 'pendente' || relato.status === 'enviado';
  const { data: situacao } = useSituacaoRelato(relato.client_id, relato.status);

  // O processor grava em segundos; 404 por mais tempo que isso não é "processando"
  const [abertoEm] = useState(() => Date.now());
  const recemEnviado = relato.enviado_em !== null && abertoEm - relato.enviado_em < JANELA_PROCESSAMENTO_MS;
  const processando = situacao === null && recemEnviado;
  const semDetalhes = situacao === null && !recemEnviado;
  const expirada = situacao?.status_ocorrencia === 'expirada';
  const ocorrenciaId = situacao?.ocorrencia_id ?? null;
  const podeAbrir =
    ocorrenciaId !== null &&
    situacao?.status_ocorrencia === 'ativa' &&
    relato.status !== 'pendente' &&
    relato.status !== 'rejeitado';

  const rotuloStatus = expirada
    ? STATUS_RELATO.encerrado.rotulo
    : processando
      ? 'Processando…'
      : semDetalhes
        ? 'Sem detalhes'
        : status.rotulo;
  const iconeStatus = expirada ? STATUS_RELATO.encerrado.icone : status.icone;
  const confirmacoes = situacao?.confirmacoes ?? null;
  const rotuloConfirmacoes =
    confirmacoes !== null && confirmacoes > 0
      ? `${confirmacoes} ${confirmacoes === 1 ? 'confirmação' : 'confirmações'}`
      : null;

  return (
    <Pressable
      onPress={() => {
        if (podeAbrir && ocorrenciaId !== null) onAbrir(ocorrenciaId);
      }}
      disabled={!podeAbrir}
      accessibilityRole="button"
      accessibilityLabel={`Relato de ${ROTULO_TIPO[relato.tipo]}`}
      style={({ pressed }) => [styles.linha, pressed && podeAbrir ? styles.pressionado : null]}
    >
      <View style={[styles.tile, { backgroundColor: cor.surfaceMuted }]}>
        <TypeIcon tipo={relato.tipo} />
      </View>

      <View style={styles.meio}>
        <T estilo="headline" cromo numberOfLines={1} style={styles.titulo}>
          {ROTULO_TIPO[relato.tipo]} ·{' '}
          <T estilo="headline" cromo corHex={sev.text[relato.severidade]}>
            {ROTULO_SEVERIDADE[relato.severidade]}
          </T>
        </T>

        <T estilo="caption" cor="textSecondary" numberOfLines={1}>
          {tempoRelativo(relato.registrado_em)} ·{' '}
          {formatarCoordenadas(relato.latitude, relato.longitude)}
        </T>

        <View style={styles.status}>
          <Icon name={iconeStatus} tamanho={14} cor={cor.textTertiary} />
          <T estilo="caption" cor="textTertiary" numberOfLines={1}>
            {rotuloStatus}
          </T>
          {rotuloConfirmacoes ? (
            <T estilo="caption" cor="textTertiary" numberOfLines={1}>
              {rotuloConfirmacoes}
            </T>
          ) : null}
        </View>

        {relato.status === 'rejeitado' && relato.ultimo_erro ? (
          <T estilo="caption" cor="textTertiary" numberOfLines={2}>
            {relato.ultimo_erro}
          </T>
        ) : null}

        {relato.midias.length > 0 ? (
          <View style={styles.midias}>
            {relato.midias.map((midia, indice) => (
              <MediaThumb
                key={`${midia.uri}-${indice}`}
                midia={midia}
                indice={indice}
                tamanho={48}
                removivel={false}
                onAbrir={() => onAbrirMidia(relato.midias, indice)}
              />
            ))}
          </View>
        ) : null}
      </View>

      {podeEncerrar ? (
        <Pill
          rotulo="Já passou"
          onPress={() =>
            onEncerrar(
              relato.client_id,
              situacao?.status_ocorrencia === 'ativa' ? ocorrenciaId : null,
            )
          }
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaco.md,
    paddingVertical: espaco.md,
    paddingHorizontal: espaco.gutter,
    minHeight: 64,
  },
  pressionado: {
    opacity: 0.7,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: raio.tile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  meio: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  titulo: {
    fontSize: 15,
    lineHeight: 20,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  midias: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
    marginTop: espaco.sm,
  },
});
