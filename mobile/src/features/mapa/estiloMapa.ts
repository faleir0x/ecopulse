import type { MapStyleElement } from 'react-native-maps';

import { mapa, type Esquema } from '@/theme/tokens';

/** customMapStyle do Google (PROVIDER_GOOGLE) com as cores da v6: sem POI e sem rótulos. */
export function estiloMapa(esquema: Esquema): MapStyleElement[] {
  const c = mapa[esquema];
  return [
    { elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
    { elementType: 'geometry', stylers: [{ color: c.land }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: c.land }] },
    { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: c.building }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: c.park }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: c.water }] },
    // Fallback de toda rua: do zoom 17 em diante o Google desenha as ruas como áreas que não
    // casam com local/arterial/highway e herdavam a cor do chão (mapa "em branco")
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: c.roadMinor }] },
    { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: c.roadMinor }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: c.roadMid }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: c.roadMajor }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: c.rail }] },
  ];
}
