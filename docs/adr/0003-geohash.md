# ADR 0003: GeoHash para particionamento geoespacial

**Status:** aceito

## Contexto
A proposta pede segmentação por quadrantes (GeoHash / H3) para sharding e balanceamento.

## Decisão
GeoHash calculado no PostGIS (`ST_GeoHash`):
- precisão 6 (~1,2 × 0,6 km) para células de ocorrência e assinatura de alertas;
- precisão 5 (~5 km) como chave de partição nas filas.

## Alternativas
- **H3:** hexágonos com vizinhança uniforme, mas exige biblioteca extra no banco e nos serviços.

## Consequências
- Células retangulares têm vizinhos a distâncias diferentes; o cliente assina a própria célula e as 8 vizinhas e confere a distância real.
- A ordem dos eventos é preservada por região.
