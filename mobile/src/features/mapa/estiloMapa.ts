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
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: c.park }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: c.water }] },
    { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: c.roadMinor }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: c.roadMid }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: c.roadMajor }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: c.rail }] },
  ];
}
