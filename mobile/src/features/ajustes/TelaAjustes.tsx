import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ALTURA_TAB_BAR,
  Card,
  MiniSegmented,
  SectionHeader,
  Switch,
  T,
  ThresholdRuler,
  TypeIcon,
  type MiniSegmentedOpcao,
} from '@/components';
import { ROTULO_TIPO, TIPOS_RISCO, type TipoRisco } from '@/domain/tipos';
import { Icon } from '@/icons/Icon';
import { RAIOS_M, useAjustes, type RaioM } from '@/state/ajustes';
import { useRelatos } from '@/state/relatos';
import { useTema, type PreferenciaTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

const OPCOES_RAIO: MiniSegmentedOpcao<RaioM>[] = RAIOS_M.map((valor) => ({
  valor,
  rotulo: valor === 500 ? '500 m' : `${valor / 1000} km`,
}));

const OPCOES_TEMA: MiniSegmentedOpcao<PreferenciaTema>[] = [
  { valor: 'sistema', rotulo: 'Sistema' },
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'escuro', rotulo: 'Escuro' },
];

type EstadoPermissao = 'verificando' | 'concedida' | 'negada';

export function TelaAjustes() {
  const insets = useSafeAreaInsets();
  const { cor, preferencia, definirPreferencia } = useTema();
  const { raioM, limiar, tiposAtivos, atualizar } = useAjustes();
  const { meus } = useRelatos();
  const [permissao, setPermissao] = useState<EstadoPermissao>('verificando');

  useEffect(() => {
    let ativo = true;
    Notifications.getPermissionsAsync()
      .then((resposta) => {
        if (ativo) setPermissao(resposta.granted ? 'concedida' : 'negada');
      })
      .catch(() => {
        if (ativo) setPermissao('negada');
      });
    return () => {
      ativo = false;
    };
  }, []);

  const alternarTipo = (tipo: TipoRisco) => {
    const ativo = tiposAtivos.includes(tipo);
    if (ativo && tiposAtivos.length === 1) return;
    const marcados = new Set(tiposAtivos);
    if (ativo) marcados.delete(tipo);
    else marcados.add(tipo);
    atualizar({ tiposAtivos: TIPOS_RISCO.filter((t) => marcados.has(t)) });
  };

  const ativarNotificacoes = async () => {
    try {
      const resposta = await Notifications.requestPermissionsAsync();
      if (resposta.granted) {
        setPermissao('concedida');
        return;
      }
      if (resposta.canAskAgain === false) {
        await Linking.openSettings();
        return;
      }
      setPermissao('negada');
    } catch {
      // Sem resposta do sistema a linha continua oferecendo "Ativar"
    }
  };

  const mostrarAvisoNotificacoes = permissao === 'negada';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: cor.background }}
      contentContainerStyle={{
        paddingTop: insets.top + espaco.sm,
        paddingHorizontal: espaco.gutter,
        paddingBottom: ALTURA_TAB_BAR + insets.bottom + espaco.xl,
      }}
    >
      <View style={styles.titulo}>
        <T estilo="large" cromo numberOfLines={1}>
          Ajustes
        </T>
      </View>

      <Card estilo={styles.card}>
        <Pressable
          onPress={() => router.push('/meus-relatos' as unknown as Href)}
          accessibilityRole="button"
          accessibilityLabel={`Meus relatos, ${meus.length}`}
          style={styles.linha}
        >
          <View style={[styles.tile, { backgroundColor: cor.surfaceMuted }]}>
            <Icon name="history" tamanho={tamanho.iconSm} cor={cor.textPrimary} />
          </View>
          <T estilo="body" numberOfLines={1} style={styles.rotulo}>
            Meus relatos
          </T>
          <T estilo="body" cor="textTertiary" tabular>
            {String(meus.length)}
          </T>
          <Icon name="alt-arrow-right" tamanho={18} cor={cor.textTertiary} />
        </Pressable>
      </Card>

      <SectionHeader titulo="Alertas" />
      <Card estilo={styles.card}>
        <View style={[styles.linha, styles.divisor, { borderBottomColor: cor.line }]}>
          <T estilo="body" numberOfLines={1} style={styles.rotulo}>
            Raio
          </T>
          <MiniSegmented
            opcoes={OPCOES_RAIO}
            valor={raioM}
            onChange={(valor) => atualizar({ raioM: valor })}
          />
        </View>

        <View style={[styles.bloco, styles.divisor, { borderBottomColor: cor.line }]}>
          <T estilo="body" numberOfLines={1} style={styles.rotulo}>
            Avisar a partir de
          </T>
          <ThresholdRuler valor={limiar} onChange={(valor) => atualizar({ limiar: valor })} />
        </View>

        {TIPOS_RISCO.map((tipo, indice) => {
          const ativo = tiposAtivos.includes(tipo);
          const ultimoAtivo = ativo && tiposAtivos.length === 1;
          const temDivisor = indice < TIPOS_RISCO.length - 1 || mostrarAvisoNotificacoes;

          return (
            <View
              key={tipo}
              style={[
                styles.linha,
                temDivisor && styles.divisor,
                temDivisor && { borderBottomColor: cor.line },
              ]}
            >
              <View style={[styles.tile, { backgroundColor: cor.surfaceMuted }]}>
                <TypeIcon tipo={tipo} ativo={ativo} />
              </View>
              <T estilo="body" numberOfLines={1} style={styles.rotulo}>
                {ROTULO_TIPO[tipo]}
              </T>
              <View
                pointerEvents={ultimoAtivo ? 'none' : 'auto'}
                accessibilityState={ultimoAtivo ? { disabled: true } : undefined}
                style={ultimoAtivo && styles.desabilitado}
              >
                <Switch
                  valor={ativo}
                  rotulo={ROTULO_TIPO[tipo]}
                  onChange={() => alternarTipo(tipo)}
                />
              </View>
            </View>
          );
        })}

        {mostrarAvisoNotificacoes ? (
          <Pressable
            onPress={() => void ativarNotificacoes()}
            accessibilityRole="button"
            accessibilityLabel="Ativar notificações"
            style={styles.linha}
          >
            <T estilo="caption" cor="textTertiary" numberOfLines={1} style={styles.rotulo}>
              Notificações desligadas · Ativar
            </T>
          </Pressable>
        ) : null}
      </Card>

      <SectionHeader titulo="Aparência" />
      <Card estilo={styles.card}>
        <View style={styles.linha}>
          <T estilo="body" numberOfLines={1} style={styles.rotulo}>
            Tema
          </T>
          <MiniSegmented
            opcoes={OPCOES_TEMA}
            valor={preferencia}
            onChange={(valor) => definirPreferencia(valor)}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  titulo: {
    minHeight: tamanho.touch,
    justifyContent: 'center',
    paddingHorizontal: espaco.xs,
  },
  card: {
    overflow: 'hidden',
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    minHeight: 56,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.sm,
  },
  bloco: {
    gap: espaco.md,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.md,
  },
  divisor: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: raio.tile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rotulo: {
    flex: 1,
    minWidth: 0,
  },
  desabilitado: {
    opacity: 0.45,
  },
});
