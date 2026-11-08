import { Pressable, StyleSheet, View } from 'react-native';

import { InlineError } from '@/components/InlineError';
import { T } from '@/components/T';
import { nivel, type Severidade } from '@/domain/tipos';
import type { Coordenada } from '@/features/localizacao';
import { useEndereco } from '@/features/mapa/useEndereco';
import { Icon } from '@/icons/Icon';
import { distanciaM, formatarDistancia } from '@/lib/distancia';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

import { formatarDuracao, minutosExtras } from './formato';
import { LinhaRisco } from './LinhaRisco';
import { SeletorModo } from './SeletorModo';
import type { RotaSeguraEstado } from './useRotaSegura';

export type RotaConteudoProps = {
  estado: RotaSeguraEstado;
  origem: Coordenada;
  /** Voltar no cabeçalho: na fase "destino" sai do modo rota; nas outras, estado.voltar(). */
  onSair: () => void;
};


function Cabecalho({ estado, onSair }: RotaConteudoProps) {
  const { cor } = useTema();
  const semDesvio = estado.rota?.sem_desvio === true;
  const mostrarTitulo = estado.fase === 'destino' || semDesvio;

  return (
    <View style={styles.cabecalho}>
      <Pressable
        onPress={estado.fase === 'destino' ? onSair : estado.voltar}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        style={[styles.voltar, { backgroundColor: cor.surfaceMuted }]}
      >
        <Icon name="alt-arrow-left" tamanho={tamanho.icon} cor={cor.textPrimary} />
      </Pressable>
      {mostrarTitulo || !estado.rota ? (
        <T estilo="title">Rota segura</T>
      ) : (
        <View style={styles.modo}>
          <Icon
            name={estado.rota.modo === 'pedestre' ? 'walking' : 'car'}
            tamanho={18}
            cor={cor.textSecondary}
          />
          <T estilo="body" cor="textSecondary" numberOfLines={1}>
            Rota segura · {estado.rota.modo === 'pedestre' ? 'a pé' : 'de carro'}
          </T>
        </View>
      )}
    </View>
  );
}

function BlocoDestino({ estado, origem }: Pick<RotaConteudoProps, 'estado' | 'origem'>) {
  const { cor } = useTema();
  const endereco = useEndereco(estado.destino);
  const destino = estado.destino;
  const titulo = destino
    ? (endereco || `${destino.latitude.toFixed(4)}, ${destino.longitude.toFixed(4)}`)
    : 'Toque no mapa';
  const distancia = destino
    ? formatarDistancia(
        distanciaM(origem.latitude, origem.longitude, destino.latitude, destino.longitude),
      )
    : null;

  return (
    <>
      <View style={styles.destino}>
        <View style={[styles.tile, { backgroundColor: cor.surfaceMuted }]}>
          <Icon name="flag" tamanho={tamanho.icon} cor={cor.textPrimary} />
        </View>
        <View style={styles.destinoTexto}>
          <T
            estilo="headline"
            cromo
            numberOfLines={1}
            cor={destino ? 'textPrimary' : 'textSecondary'}
          >
            {titulo}
          </T>
          {distancia ? (
            <T estilo="caption" cor="textSecondary" numberOfLines={1}>
              {distancia}
            </T>
          ) : null}
        </View>
      </View>

      <SeletorModo valor={estado.modo} onChange={estado.setModo} />

      {estado.erro ? <InlineError onTentar={estado.calcular} /> : null}
    </>
  );
}

function LinhaBase({ estado }: { estado: RotaSeguraEstado }) {
  if (!estado.rota) return null;

  return (
    <View style={styles.base}>
      <T estilo="large" tabular>
        {formatarDuracao(estado.rota.duracao_s)}
      </T>
      <T estilo="title" cor="textSecondary" tabular style={styles.distancia}>
        {formatarDistancia(estado.rota.distancia_m)}
      </T>
    </View>
  );
}

function ResumoResultado({ estado }: { estado: RotaSeguraEstado }) {
  const { cor, sev } = useTema();
  const rota = estado.rota;
  if (!rota) return null;

  if (rota.sem_desvio) {
    const pior = rota.no_caminho.reduce<Severidade>(
      (atual, ocorrencia) => (nivel(ocorrencia.severidade) > nivel(atual) ? ocorrencia.severidade : atual),
      'baixo',
    );

    return (
      <>
        <View style={[styles.aviso, { backgroundColor: cor.surfaceMuted }]}>
          <Icon name="danger-triangle" tamanho={24} cor={sev.text[pior]} />
          <T estilo="headline" cromo style={styles.avisoTexto}>
            Sem desvio possível
          </T>
        </View>
        {rota.no_caminho.map((ocorrencia) => (
          <LinhaRisco key={ocorrencia.id} ocorrencia={ocorrencia} />
        ))}
      </>
    );
  }

  const riscos = rota.evitadas.length;
  const noCaminho = rota.no_caminho.length;
  const extras = minutosExtras(rota);
  // Sem nada evitado mas com zona no caminho (origem/destino dentro): o resumo é o alerta
  const alerta = riscos === 0 && noCaminho > 0;
  const desvio = alerta
    ? noCaminho === 1
      ? '1 risco no caminho'
      : `${noCaminho} riscos no caminho`
    : riscos === 0
      ? 'Sem riscos no caminho'
      : `${riscos === 1 ? 'Desvia de 1 risco' : `Desvia de ${riscos} riscos`}${
          extras > 0 ? ` · +${extras} min` : ''
        }`;
  const piorNoCaminho = rota.no_caminho.reduce<Severidade>(
    (atual, ocorrencia) => (nivel(ocorrencia.severidade) > nivel(atual) ? ocorrencia.severidade : atual),
    'baixo',
  );

  return (
    <>
      <LinhaBase estado={estado} />

      <View style={styles.desvio}>
        {alerta ? (
          <Icon name="danger-triangle" tamanho={20} cor={sev.text[piorNoCaminho]} />
        ) : (
          <Icon name="check-circle" tamanho={20} cor={cor.textPrimary} />
        )}
        <T estilo="body" style={styles.desvioTexto}>
          {desvio}
        </T>
      </View>

      {riscos > 0 ? (
        <View style={[styles.bloco, { backgroundColor: cor.surfaceMuted }]}>
          {rota.evitadas.map((ocorrencia) => (
            <LinhaRisco key={ocorrencia.id} ocorrencia={ocorrencia} />
          ))}
        </View>
      ) : null}

      {noCaminho > 0 ? (
        <>
          {alerta ? null : (
            <T estilo="caption" cor="textTertiary">
              No caminho
            </T>
          )}
          {rota.no_caminho.map((ocorrencia) => (
            <LinhaRisco key={ocorrencia.id} ocorrencia={ocorrencia} />
          ))}
        </>
      ) : null}

      {rota.direta && riscos > 0 ? (
        <View style={styles.legenda}>
          <View style={styles.itemLegenda}>
            <View style={[styles.tracoSeguro, { backgroundColor: cor.ink }]} />
            <T estilo="caption" cor="textSecondary">
              Segura
            </T>
          </View>
          <View style={styles.itemLegenda}>
            <View style={[styles.tracoDireto, { borderTopColor: cor.textTertiary }]} />
            <T estilo="caption" cor="textSecondary">
              Direta
            </T>
          </View>
        </View>
      ) : null}
    </>
  );
}

/** Conteúdo da MapSheet no modo rota (prancha: Rota-destino, Main, Rota-sem-alternativa). */
export function RotaConteudo({ estado, origem, onSair }: RotaConteudoProps) {
  return (
    <View style={styles.container}>
      <Cabecalho estado={estado} origem={origem} onSair={onSair} />
      {estado.fase === 'destino' ? (
        <BlocoDestino estado={estado} origem={origem} />
      ) : estado.fase === 'seguindo' ? (
        <LinhaBase estado={estado} />
      ) : (
        <ResumoResultado estado={estado} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: espaco.gutter,
    gap: 14,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
  },
  voltar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  modo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  destino: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: raio.tile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  destinoTexto: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  base: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  distancia: {
    fontFamily: 'RedHatDisplay_300Light',
  },
  desvio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  desvioTexto: {
    flex: 1,
    minWidth: 0,
  },
  bloco: {
    borderRadius: raio.card,
    paddingHorizontal: 14,
    paddingVertical: espaco.xs,
  },
  aviso: {
    borderRadius: raio.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
  },
  avisoTexto: {
    flex: 1,
    minWidth: 0,
  },
  legenda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  itemLegenda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tracoSeguro: {
    width: 18,
    height: 4,
    borderRadius: 2,
  },
  tracoDireto: {
    width: 18,
    height: 0,
    borderTopWidth: 3,
    borderStyle: 'dotted',
  },
});
