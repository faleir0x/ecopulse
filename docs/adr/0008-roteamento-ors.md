# ADR 0008: Roteamento preventivo com OpenRouteService

**Status:** aceito

## Contexto
A proposta pede "roteamento preventivo de pedestres e condutores". O app precisa funcionar fora de São Paulo e o laptop de desenvolvimento não comporta um motor de rotas próprio (Valhalla exigiria um extrato OSM de ~380 MB só para SP).

## Decisão
`GET /v1/rotas` chama o OpenRouteService (hospedado, cobertura mundial) duas vezes em paralelo: com `avoid_polygons` (círculos de 16 lados em volta das ocorrências ativas moderadas ou piores) e sem, para comparar com a rota direta. A chave fica só na API (`ECOPULSE_ORS_API_KEY`), nunca no app.

## Consequências
- Plano gratuito: 2.000 rotas/dia. Cache de 5 min no Redis por (modo, geohash7 de origem e destino, ids das zonas) e balde próprio por IP (10, +1 a cada 30 s) poupam a cota.
- Zona que contém origem ou destino não entra no `avoid` (o ORS falharia) e vira aviso; sem caminho possível, devolve a direta com aviso.
- ORS fora do ar → 503 com `Retry-After`; o resto do sistema não depende dele.
