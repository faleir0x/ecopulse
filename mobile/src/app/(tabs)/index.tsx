import { View } from 'react-native';

import { T } from '@/components';

// Placeholder: a tela de verdade entra nas etapas 4.3 a 4.6
export default function AgoraScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <T estilo="title" cor="textSecondary">
        Agora
      </T>
    </View>
  );
}
