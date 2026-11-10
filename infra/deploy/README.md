# Deploy numa VPS (24/7, sem túnel)

A stack inteira roda numa VPS com Docker. O Caddy recebe o HTTPS (certificado automático do Let's Encrypt) e repassa para a API e o realtime; banco, broker e cache ficam só no `127.0.0.1` da VPS. As imagens vêm do GHCR (publicadas pelo workflow CD a cada push na `main`), então a VPS não compila nada.

Testado para: 2 vCPU, 4 GB de RAM, 50 GB de disco. A stack usa ~0,5 GB de RAM parada (1–1,5 GB em pico) e ~4 GB de disco entre imagens e volumes.

> Os 3 nós de RabbitMQ, os 6 de Redis e os 2 de PostgreSQL numa máquina só demonstram a arquitetura distribuída, mas a VPS em si é um ponto único de falha.

## 1. DNS

No painel do domínio, dois registros `A` apontando para o IP da VPS, **sem proxy** (no Cloudflare, nuvem cinza "DNS only"; o Caddy precisa receber a conexão direto para emitir o certificado):

| Nome | Tipo | Valor |
|---|---|---|
| `api` | A | IP da VPS |
| `rt` | A | IP da VPS |

Mantendo `api.faleir0x.com` e `rt.faleir0x.com`, o APK já publicado continua funcionando sem gerar outro.

## 2. Preparar a VPS (Ubuntu 24.04)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # saia e entre de novo
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

O `ufw` não protege portas publicadas pelo Docker, mas aqui só o Caddy publica portas (80/443); o resto está em `127.0.0.1`.

## 3. Código e segredos

```bash
git clone https://github.com/faleir0x/ecopulse.git && cd ecopulse/infra
cp .env.example .env && chmod 600 .env
```

No `.env`: descomente e preencha `API_HOST`, `RT_HOST`, `ACME_EMAIL`, `ECOPULSE_TAG=main`, a chave `ECOPULSE_ORS_API_KEY` (rotas) e o que mais o `.env.example` pede.

Firebase (push): copie a conta de serviço para `infra/secrets/firebase.json` com dono = o usuário que roda o notifier (`ECOPULSE_UID`, padrão 1000):

```bash
mkdir -p secrets && chmod 700 secrets
# do seu computador: scp infra/secrets/firebase.json vps:~/ecopulse/infra/secrets/
chmod 600 secrets/firebase.json
```

Imagens privadas no GHCR: entre com um token (classic) só com `read:packages`:

```bash
echo "<token>" | docker login ghcr.io -u faleir0x --password-stdin
```

(Ou torne os 5 pacotes `ecopulse-*` públicos em github.com/faleir0x?tab=packages e pule o login.)

## 4. Subir

```bash
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml -f docker-compose.prod.yml up -d
docker compose ps
curl https://api.faleir0x.com/health
```

Na primeira subida o Caddy leva alguns segundos para emitir os certificados.

## 5. Atualizar (depois de cada push na main)

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml -f docker-compose.prod.yml up -d
```

O serviço `migrate` aplica migrações novas do banco sozinho antes dos serviços subirem.

## 6. Backup diário do banco

```bash
mkdir -p ~/backups
( crontab -l 2>/dev/null; echo '0 4 * * * cd ~/ecopulse/infra && docker compose exec -T postgres pg_dump -U ecopulse -Fc ecopulse > ~/backups/ecopulse-$(date +\%F).dump && find ~/backups -name "*.dump" -mtime +14 -delete' ) | crontab -
```

Restaurar: `docker compose exec -T postgres pg_restore -U ecopulse -d ecopulse --clean < arquivo.dump`.

## Cenários de falha na VPS

Os scripts de `infra/demo/` rodam na própria VPS. Como lá a API só responde pelo domínio, informe a URL e os arquivos do compose:

```bash
export COMPOSE_FILE=docker-compose.yml:docker-compose.ghcr.yml:docker-compose.prod.yml
export ECOPULSE_API=https://api.faleir0x.com
cd ~/ecopulse/infra && demo/falha-postgres.sh
```
