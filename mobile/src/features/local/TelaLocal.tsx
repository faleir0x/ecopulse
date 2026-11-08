import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/components/T';
import { Entrada } from '@/features/agora/Entrada';
import { buscarLocais } from '@/api/cliente';
import {
  escolherLocal,
  pedirPermissao,
  ultimaPosicaoConhecida,
  type LocalEscolhido,
} from '@/features/localizacao';
import { Icon } from '@/icons/Icon';
import type { NomeIcone } from '@/icons';
import { familia } from '@/theme/fontes';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho, texto } from '@/theme/tokens';

import { acrescentarRecente, lerRecentes } from './recentes';

type Resultado = LocalEscolhido & { detalhe: string };

function LinhaLocal({
  icone,
  titulo,
  detalhe,
  onPress,
}: {
  icone: NomeIcone;
  titulo: string;
  detalhe?: string;
  onPress: () => void;
}) {
  const { cor } = useTema();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      style={({ pressed }) => [
        styles.linha,
        { borderBottomColor: cor.line, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.tile, { backgroundColor: cor.surfaceMuted }]}>
        <Icon name={icone} tamanho={tamanho.icon} cor={cor.textPrimary} />
      </View>
      <View style={styles.linhaTexto}>
        <T estilo="headline" cromo numberOfLines={1}>
          {titulo}
        </T>
        {detalhe ? (
          <T estilo="caption" cor="textSecondary" numberOfLines={1}>
            {detalhe}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Busca de bairro/endereço para usar no app inteiro quando o GPS não está disponível. */
export function TelaLocal() {
  const { cor } = useTema();
  const insets = useSafeAreaInsets();
  const [consulta, setConsulta] = useState('');
  const [focado, setFocado] = useState(false);
  // Resultado da última busca concluída e para qual texto; "buscando" é derivado
  const [busca, setBusca] = useState<{ texto: string; lista: Resultado[] }>({ texto: '', lista: [] });
  const [recentes, setRecentes] = useState<LocalEscolhido[]>(lerRecentes);

  const textoBusca = consulta.trim();
  const mostrarResultados = textoBusca.length >= 3;

  useEffect(() => {
    if (textoBusca.length < 3) return;
    let ativo = true;
    const timer = setTimeout(async () => {
      try {
        const encontrados = await buscarLocais(textoBusca, ultimaPosicaoConhecida());
        const lista = encontrados.map((local) => ({
          latitude: local.latitude,
          longitude: local.longitude,
          nome: local.nome,
          detalhe: local.detalhe ?? '',
        }));
        if (ativo) setBusca({ texto: textoBusca, lista });
      } catch {
        if (ativo) setBusca({ texto: textoBusca, lista: [] });
      }
    }, 400);
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [textoBusca]);

  const buscando = mostrarResultados && busca.texto !== textoBusca;
  const resultados = mostrarResultados && !buscando ? busca.lista : [];

  const voltar = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const escolher = (local: LocalEscolhido) => {
    escolherLocal(local);
    setRecentes(acrescentarRecente(local));
    voltar();
  };

  const usarMinhaLocalizacao = () => {
    escolherLocal(null);
    void pedirPermissao();
    voltar();
  };

  return (
    <View style={[styles.raiz, { backgroundColor: cor.background }]}>
      <View style={[styles.topo, { paddingTop: insets.top + espaco.sm }]}>
        <View style={styles.cabecalho}>
          <Pressable
            onPress={voltar}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            style={[styles.voltar, { backgroundColor: cor.surfaceMuted }]}
          >
            <Icon name="alt-arrow-left" tamanho={tamanho.icon} cor={cor.textPrimary} />
          </Pressable>
          <T estilo="title" cromo numberOfLines={1} style={styles.titulo}>
            Local
          </T>
        </View>

        <View
          style={[
            styles.campo,
            {
              backgroundColor: cor.surfaceMuted,
              borderColor: focado ? cor.ink : 'transparent',
            },
          ]}
        >
          <Icon name="magnifer" tamanho={tamanho.iconSm} cor={cor.textSecondary} />
          <TextInput
            value={consulta}
            onChangeText={setConsulta}
            onFocus={() => setFocado(true)}
            onBlur={() => setFocado(false)}
            placeholder="Bairro ou endereço"
            placeholderTextColor={cor.textTertiary}
            style={[styles.entrada, { color: cor.textPrimary }]}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Bairro ou endereço"
          />
          {consulta.length > 0 ? (
            <Pressable
              onPress={() => setConsulta('')}
              accessibilityRole="button"
              accessibilityLabel="Limpar"
              hitSlop={espaco.sm}
              style={styles.limpar}
            >
              <Icon name="close" tamanho={tamanho.iconSm} cor={cor.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.conteudo, { paddingBottom: insets.bottom + espaco.xl }]}
      >
        <LinhaLocal icone="gps" titulo="Minha localização" onPress={usarMinhaLocalizacao} />

        {mostrarResultados ? (
          <View>
            <T estilo="caption" cor="textTertiary" style={styles.secao}>
              Resultados
            </T>
            {buscando ? null : resultados.length === 0 ? (
              <View style={[styles.linha, { borderBottomColor: cor.line }]}>
                <T estilo="body" cor="textSecondary">
                  Nada encontrado
                </T>
              </View>
            ) : (
              resultados.map((resultado, indice) => (
                <Entrada
                  key={`${resultado.latitude}-${resultado.longitude}-${resultado.nome}-${indice}`}
                  indice={indice}
                >
                  <LinhaLocal
                    icone="map-point"
                    titulo={resultado.nome}
                    detalhe={resultado.detalhe}
                    onPress={() =>
                      escolher({
                        latitude: resultado.latitude,
                        longitude: resultado.longitude,
                        nome: resultado.nome,
                      })
                    }
                  />
                </Entrada>
              ))
            )}
          </View>
        ) : null}

        {recentes.length > 0 ? (
          <View>
            <T estilo="caption" cor="textTertiary" style={styles.secao}>
              Recentes
            </T>
            {recentes.map((recente) => (
              <LinhaLocal
                key={`${recente.latitude}-${recente.longitude}-${recente.nome}`}
                icone="history"
                titulo={recente.nome}
                onPress={() => escolher(recente)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  topo: {
    paddingHorizontal: espaco.gutter,
    paddingBottom: espaco.sm,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: tamanho.touch,
  },
  voltar: {
    width: tamanho.touch,
    height: tamanho.touch,
    borderRadius: raio.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titulo: {
    flexShrink: 1,
    minWidth: 0,
  },
  campo: {
    height: tamanho.button,
    borderRadius: raio.pill,
    borderWidth: 2,
    paddingHorizontal: espaco.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: espaco.md,
  },
  entrada: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontFamily: familia(texto.body),
    fontSize: texto.body.tamanho,
    lineHeight: texto.body.alturaLinha,
  },
  limpar: {
    width: 32,
    height: 32,
    borderRadius: raio.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conteudo: {
    paddingHorizontal: espaco.gutter,
    paddingTop: espaco.sm,
  },
  secao: {
    marginTop: espaco.sm,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tile: {
    width: tamanho.touch,
    height: tamanho.touch,
    borderRadius: raio.tile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  linhaTexto: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
