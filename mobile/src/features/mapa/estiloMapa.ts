import type { MapStyleElement } from 'react-native-maps';

import { cores, mapa, type Esquema } from '@/theme/tokens';

/**
 * customMapStyle do Google (PROVIDER_GOOGLE) com as cores da v6: sem POI nem ícones; só os
 * nomes de cidade, bairro e rua, discretos (o Google escolhe quais mostrar pelo zoom).
 */
export function estiloMapa(esquema: Esquema): MapStyleElement[] {
  const c = mapa[esquema];
  const t = cores[esquema];
  return [
    // Rótulos: texto na paleta com contorno da cor do chão; sem ícones (escudos, POI)
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: t.textTertiary }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: c.land }, { weight: 3 }] },
    {
      featureType: 'administrative.locality',
      elementType: 'labels.text.fill',
      stylers: [{ color: t.textSecondary }],
    },
    {
      featureType: 'administrative.land_parcel',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'road',
      elementType: 'labels.text.stroke',
      stylers: [{ color: c.roadMinor }, { weight: 3 }],
    },
    { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
    { elementType: 'geometry', stylers: [{ color: c.land }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: c.land }] },
    {
      featureType: 'landscape.man_made',
      elementType: 'geometry',
      stylers: [{ color: c.building }],
    },
    {
      featureType: 'poi.park',
      elementType: 'geometry',
      stylers: [{ visibility: 'on' }, { color: c.park }],
    },
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
