# Staging da Clara na VPS que já roda o bot

Este guia prepara um ambiente de teste isolado na VPS existente. O `bot-disparo` continua dono das portas públicas 80/443 por meio do Nginx que já usa. A Clara publica somente o frontend em uma porta local do servidor (`127.0.0.1:14310` por padrão); API e PostgreSQL permanecem acessíveis apenas na rede privada dos containers. O banco usa volume próprio e começa vazio. Use somente dados fictícios.

## O que foi preparado

- `Dockerfile`: imagens de API e web separadas; o runtime inclui apenas dependências de produção. O Next.js usa o modo standalone.
- `.github/workflows/build-staging-images.yml`: publica imagens `linux/amd64` privadas no GitHub Container Registry, evitando compilar no disco limitado da VPS.
- `compose.staging.yaml`: PostgreSQL persistente e privado, API privada, web ligada a uma porta local e migrações executadas separadamente.
- `infra/nginx-clara.example.conf`: exemplo de site Nginx para encaminhar um subdomínio à porta local da Clara. É um modelo e não altera a configuração atual.
- `.env.staging.example`: valores de exemplo; o `.env.staging` real fica fora do Git.

O fluxo pressupõe que o Nginx do bot roda no próprio host. Se ele estiver dentro de um container, a ligação precisa usar a rede daquele container e este modelo de proxy deve ser ajustado antes de habilitar o site.

## Antes de publicar

O checkout local ainda precisa de um commit inicial e de conexão com o repositório privado `hayax0/clara-clinicas`. O workflow só publica as imagens depois que o código chegar à branch `main`. Nenhuma imagem foi enviada ao GitHub e nenhuma alteração foi feita na VPS.

Depois do primeiro push, confirme que o workflow **Build staging images** terminou e que os pacotes `clara-clinicas-api` e `clara-clinicas-web` aparecem como privados no GitHub. A VPS precisa de um token do GitHub com `read:packages` para baixar esses pacotes; crie-o no GitHub e digite-o no prompt de senha do Docker, sem colocar o token em arquivos ou nesta conversa:

```sh
docker login ghcr.io -u SEU_USUARIO_GITHUB
```

## Configurar a VPS

1. Escolha um subdomínio de staging e aponte o DNS para o IP da VPS. Confirme com o responsável pela hospedagem que o Nginx ativo é do host e que `127.0.0.1:14310` está livre.
2. Copie o código para a VPS sem `.env`, dumps, backups ou banco local. No diretório do projeto, crie o ambiente:

   ```sh
   cp .env.staging.example .env.staging
   chmod 600 .env.staging
   openssl rand -hex 32
   ```

3. Edite `.env.staging`: defina `PUBLIC_DOMAIN`, `CLARA_WEB_BIND_PORT`, `POSTGRES_PASSWORD` e o mesmo valor da senha na `DATABASE_URL`. Mantenha `GEMINI_API_KEY` vazia enquanto a IA não for necessária; para qualquer teste do Gemini, use dados sintéticos.
4. Baixe as imagens já compiladas para a arquitetura Xeon e suba somente o banco vazio:

   ```sh
   docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml pull api web migrate
   docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml up -d postgres
   docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml run --rm migrate
   docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml up -d api web
   ```

5. Copie `infra/nginx-clara.example.conf` para um arquivo novo de site do Nginx, troque `staging.example.com` pelo domínio e ajuste a porta se alterou `CLARA_WEB_BIND_PORT`. Teste com `sudo nginx -t` antes de recarregar. Não sobrescreva o site do bot. Depois, configure o certificado HTTPS pelo procedimento já usado nessa VPS.
6. Confira `docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml ps` e abra `https://SEU_SUBDOMINIO/api/health`.
7. Crie o primeiro Super Admin. O terminal pede nome, e-mail e senha; a senha não aparece enquanto é digitada:

   ```sh
   docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml exec api node dist/create-admin.js
   ```

## Backups e espaço em disco

O banco da Clara está no volume `clara_staging_postgres_data`, separado dos dados do bot. Faça um backup antes de migrações ou atualizações, e nunca use `docker compose down -v`.

```sh
umask 077
mkdir -p "$HOME/clara-staging-backups"
docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$HOME/clara-staging-backups/staging.dump"
```

As imagens são montadas no GitHub Actions para `linux/amd64` e a VPS apenas as baixa; isso evita o pico de uso de disco e memória de uma compilação no servidor. Ainda assim, monitore o espaço e deixe margem para o banco, atualizações e backups.

## Limites desta preparação

O projeto ainda não foi commitado/enviado ao GitHub e a VPS não foi alterada. Ainda faltam validar o domínio, o processo real do Nginx, login e provisionamento no staging, backups externos com restauração testada, MFA e revisão de segurança/privacidade. Não usar pacientes reais nem considerar o sistema pronto para produção clínica.
