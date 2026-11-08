import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { espaco } from '@/theme/tokens';

import type { RotaSeguraEstado } from './useRotaSegura';

export type RotaRodapeProps = {
  estado: RotaSeguraEstado;
  onSair: () => void;
};

/** Botões fixos no rodapé da MapSheet no modo rota. */
export function RotaRodape({ estado, onSair }: RotaRodapeProps) {
  if (estado.fase === 'destino') {
    return (
      <Button
        rotulo="Calcular rota"
        onPress={estado.calcular}
        desabilitado={!estado.destino}
        carregando={estado.calculando}
      />
    );
  }

  if (estado.fase === 'seguindo') {
    return (
      <Button
        rotulo="Encerrar"
        variante="secundario"
        onPress={onSair}
        estilo={styles.larguraTotal}
      />
    );
  }

  if (estado.rota?.sem_desvio) {
    return (
      <View style={styles.linha}>
        <Button
          rotulo="Trocar destino"
          variante="secundario"
          onPress={() => estado.setDestino(null)}
          estilo={styles.flex}
        />
        <Button rotulo="Seguir assim" onPress={estado.seguir} estilo={styles.flex} />
      </View>
    );
  }

  return (
    <View style={styles.linha}>
      <Button rotulo="Encerrar" variante="secundario" onPress={onSair} estilo={styles.flex} />
      <Button rotulo="Seguir rota" onPress={estado.seguir} estilo={styles.flex} />
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    gap: espaco.md,
  },
  flex: {
    flex: 1,
  },
  larguraTotal: {
    width: '100%',
  },
});
