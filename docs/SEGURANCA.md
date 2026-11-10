# Política de segurança da CI

| Verificação | Ferramenta | Bloqueia |
|---|---|---|
| Dependências Python | `pip-audit` (PyPI/OSV) | qualquer vulnerabilidade |
| Lockfiles, Dockerfiles, configuração e segredos no código | Trivy `fs` | alta e crítica com correção disponível |
| Moderadas nos lockfiles | Trivy `fs` | não (só relatório) |
| Imagens Docker | Trivy `image` | alta e crítica com correção disponível |
| Dependências do app mobile | `npm audit --omit=dev` | alta e crítica |
| Segredos no histórico do Git | gitleaks | qualquer achado |
| Análise estática | Semgrep (Python, Dockerfile, Compose) + regras Bandit no ruff | qualquer achado |
| Dockerfile | hadolint | qualquer achado |

Atualizações: Dependabot semanal para uv, npm, GitHub Actions e imagens Docker. As Actions são fixadas por SHA.

## Exceções conhecidas

- **Mobile, moderadas em `glob`, `minimatch` e `deepmerge`**: dependências transitivas das ferramentas de build do Expo SDK 58 (não entram no bundle do app). A correção exige `npm audit fix --force`, que rebaixa o Expo. Ficam no relatório da CI até o SDK atualizar.
- **Imagem final sem `pip`**: o pip da imagem base traz bibliotecas vendorizadas com CVEs e não é usado em runtime, então é removido no Dockerfile.

## Exposição e abuso (stack de demonstração)

- PostgreSQL, RabbitMQ (AMQP e painel) e Redis publicam portas só em `127.0.0.1`: as credenciais do compose são de desenvolvimento. Na rede local (e no túnel) ficam só a API e o realtime.
- A identidade é um UUID por aparelho escolhido pelo cliente, então os limites que importam são por IP (IPv6 pela rede /64): relatos, votos ("Ainda está"/"Já passou", balde próprio), consultas de ambiente, rotas, busca de locais, registro de aparelho e telemetria. O conjunto de células coletadas na Open-Meteo tem teto de 400.
- Um aparelho conta uma vez por ocorrência (confirmação repetida não estende a validade).
- Telemetria: a posição exata não sai da API; só a célula geohash6 (~1 km) vai para o broker e para o Redis, e expira em 15 min. Nada disso vai para o log.
