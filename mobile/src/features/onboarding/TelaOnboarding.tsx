import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, T } from '@/components';
import { pedirPermissao } from '@/features/localizacao';
import { Icon } from '@/icons/Icon';
import type { NomeIcone } from '@/icons';
import { useAjustes } from '@/state/ajustes';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

type Passo = 0 | 1;

type Conteudo = {
  icone: NomeIcone;
  titulo: string;
  linha: string;
  cta: string;
};

const CONTEUDO: Record<Passo, Conteudo> = {
  0: {
    icone: 'map-point',
    titulo: 'Riscos perto de você',
    linha: 'Alagamentos, calor, ar e rotas obstruídas.',
    cta: 'Permitir localização',
  },
  1: {
    icone: 'bell',
    titulo: 'Avisos na hora',
    linha: 'Receba um alerta quando um risco chegar perto.',
    cta: 'Permitir notificações',
  },
};

export function TelaOnboarding() {
  const insets = useSafeAreaInsets();
  const { cor, reduzirMovimento } = useTema();
  const { atualizar } = useAjustes();
  const [passo, setPasso] = useState<Passo>(0);
  const [ocupado, setOcupado] = useState(false);

  const irPara = (destino: Passo) => {
    if (destino === passo) return;
    setPasso(destino);
  };

  const concluir = () => {
    atualizar({ onboardingConcluido: true });
    router.replace('/(tabs)');
  };

  const permitirLocalizacao = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await pedirPermissao();
    } catch {
      // A resposta negada ou o erro também seguem para a próxima tela
    } finally {
      setOcupado(false);
      irPara(1);
    }
  };

  const permitirNotificacoes = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // Conclui mesmo sem resposta do sistema
    } finally {
      setOcupado(false);
      concluir();
    }
  };

  const agoraNao = () => {
    if (ocupado) return;
    if (passo === 0) irPara(1);
    else concluir();
  };

  const conteudo = CONTEUDO[passo];
  const entrada = reduzirMovimento
    ? FadeIn.duration(180)
    : SlideInRight.duration(340);

  return (
    <View
      style={[
        styles.tela,
        {
          backgroundColor: cor.background,
          paddingTop: insets.top + espaco.sm,
          paddingBottom: Math.max(insets.bottom, espaco.lg),
        },
      ]}
    >
      <View style={styles.marca}>
        <T estilo="caption" cromo cor="textTertiary">
          ecopulse
        </T>
      </View>

      <View style={styles.area}>
        <Animated.View key={passo} entering={entrada} style={styles.painel}>
          <View style={[styles.icone, { backgroundColor: cor.surface }]}>
            <Icon name={conteudo.icone} peso="bold" tamanho={56} cor={cor.textPrimary} />
          </View>
          <T estilo="large" cromo numberOfLines={2} style={styles.titulo}>
            {conteudo.titulo}
          </T>
          <T estilo="body" cor="textSecondary" numberOfLines={2} style={styles.linha}>
            {conteudo.linha}
          </T>
        </Animated.View>
      </View>

      <View style={styles.rodape}>
        <View
          accessible
          accessibilityLabel={`Passo ${passo + 1} de 2`}
          style={styles.passos}
        >
          {[0, 1].map((indice) => (
            <View
              key={indice}
              style={[
                styles.ponto,
                { backgroundColor: indice === passo ? cor.ink : cor.surfaceStrong },
              ]}
            />
          ))}
        </View>

        <Button
          rotulo={conteudo.cta}
          onPress={() =>
            void (passo === 0 ? permitirLocalizacao() : permitirNotificacoes())
          }
          carregando={ocupado}
          estilo={styles.botao}
        />

        <Pressable
          onPress={agoraNao}
          accessibilityRole="button"
          accessibilityLabel="Agora não"
          style={styles.agoraNao}
        >
          <T estilo="headline" cor="textSecondary" numberOfLines={1}>
            Agora não
          </T>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: {
    flex: 1,
    paddingHorizontal: espaco.xl,
  },
  marca: {
    minHeight: tamanho.touch,
    justifyContent: 'center',
  },
  area: {
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  painel: {
    alignItems: 'center',
  },
  icone: {
    width: 104,
    height: 104,
    borderRadius: raio.sheet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    marginTop: espaco.xl,
    textAlign: 'center',
  },
  linha: {
    marginTop: espaco.sm,
    textAlign: 'center',
  },
  rodape: {
    gap: espaco.sm,
  },
  passos: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: espaco.sm,
    marginBottom: espaco.sm,
  },
  ponto: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  botao: {
    width: '100%',
  },
  agoraNao: {
    minHeight: tamanho.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
