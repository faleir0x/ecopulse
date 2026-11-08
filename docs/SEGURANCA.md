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
