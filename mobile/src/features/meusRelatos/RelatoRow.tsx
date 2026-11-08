import { StyleSheet, View } from 'react-native';

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
import { MiniaturaMidia } from './MiniaturaMidia';

export const STATUS_RELATO: Record<StatusRelato, { rotulo: string; icone: NomeIcone }> = {
  pendente: { rotulo: 'Na fila', icone: 'history' },
  enviado: { rotulo: 'Enviado', icone: 'cloud-check' },
  encerrado: { rotulo: 'Encerrado', icone: 'check-circle' },
  rejeitado: { rotulo: 'Rejeitado', icone: 'cloud-cross' },
};

export type RelatoRowProps = {
  relato: RelatoLocal;
  onEncerrar: (clientId: string) => void;
  onAbrirMidia: (midias: MidiaLocal[], indice: number) => void;
};

export function RelatoRow({ relato, onEncerrar, onAbrirMidia }: RelatoRowProps) {
  const { cor, sev } = useTema();
  const status = STATUS_RELATO[relato.status];
  const podeEncerrar = relato.status === 'pendente' || relato.status === 'enviado';

  return (
    <View style={styles.linha}>
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
          <Icon name={status.icone} tamanho={14} cor={cor.textTertiary} />
          <T estilo="caption" cor="textTertiary" numberOfLines={1}>
            {status.rotulo}
          </T>
        </View>

        {relato.status === 'rejeitado' && relato.ultimo_erro ? (
          <T estilo="caption" cor="textTertiary" numberOfLines={2}>
            {relato.ultimo_erro}
          </T>
        ) : null}

        {relato.midias.length > 0 ? (
          <View style={styles.midias}>
            {relato.midias.map((midia, indice) => (
              <MiniaturaMidia
                key={`${midia.uri}-${indice}`}
                midia={midia}
                indice={indice}
                onPress={() => onAbrirMidia(relato.midias, indice)}
              />
            ))}
          </View>
        ) : null}
      </View>

      {podeEncerrar ? (
        <Pill rotulo="Já passou" onPress={() => onEncerrar(relato.client_id)} />
      ) : null}
    </View>
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
