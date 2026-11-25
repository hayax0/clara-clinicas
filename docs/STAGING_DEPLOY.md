# Staging da Clara na VPS que já roda o bot

Este ambiente de staging compartilha a VPS do bot-disparo e usa um banco PostgreSQL vazio, isolado por rede e volume Docker. A Clara não ocupa as portas públicas 80/443: a web está vinculada somente a 127.0.0.1:14310, para ser publicada pelo Nginx existente. Use somente dados sintéticos.

## Estado atual — 25/11/2026

- O repositório público hayax0/clara-clinicas está em main no commit 3d5559a. O arquivo .env e a chave do Gemini não foram enviados ao Git.
- GitHub Actions concluiu os jobs AMD64 da web e da API e publicou as imagens de staging no GHCR. A VPS baixou as duas imagens sem autenticação.
- O checkout está em /opt/clara-staging. O arquivo .env.staging está com modo 600 e contém uma senha de banco aleatória e a chave Gemini local; nunca exiba nem copie seus valores para issues, logs ou commits.
- O PostgreSQL usa o volume clara_staging_postgres_data. As 17 migrações do Prisma foram aplicadas ao banco novo.
- API, PostgreSQL e web estão saudáveis. A web responde HTTP 200 em http://127.0.0.1:14310/; a API responde HTTP 200 em /api/health dentro do container.
- O bot-disparo continua ativo. O Nginx existente e os sites abordai.cmpx.tec.br e botdisparo.cmpx.tec.br não foram alterados.
- O primeiro Super Admin ainda não foi criado. O painel não está publicado na internet; não há vhost Clara nem certificado HTTPS.
- Depois do pull das imagens e da criação do banco, havia 5,9 GB livres e cerca de 2,2 GB de memória disponível. Reavalie o espaço antes de atualizações e backups.

## DNS e HTTPS pendentes

O hostname escolhido é app.clara.com. No momento da verificação, ele não tinha registros A ou CNAME. A zona clara.com está delegada aos nameservers jacqueline.ns.cloudflare.com e garrett.ns.cloudflare.com, portanto o DNS atual é administrado no Cloudflare, não no Vercel. O Vercel CLI não está instalado nem autenticado neste Mac.

No painel que administra a zona DNS atual, crie este registro para o subdomínio:

    Tipo: A
    Nome: app
    Endereço IPv4: 79.182.128.34
    Proxy: DNS only / sem proxy inicialmente
    TTL: Auto

Não altere os registros da raiz clara.com nem os registros de e-mail. Aguarde a propagação do DNS. Com DNS only, este comando deve retornar 79.182.128.34:

    dig +short app.clara.com

Se o registro estiver com proxy Cloudflare ativado, o comando pode retornar IPs da Cloudflare; isso também é esperado. Para a configuração inicial, mantenha DNS only até o certificado HTTPS do origin ser emitido e validado. Depois, se ativar o proxy Cloudflare, configure o modo SSL/TLS como Full (strict). Prossiga com o Nginx e certbot quando o registro já estiver resolvendo para o VPS:

1. Use infra/nginx-clara.example.conf como base e crie um arquivo separado em /etc/nginx/sites-available/clara-staging para app.clara.com.
2. Ative somente esse novo arquivo em sites-enabled. Não edite nem substitua a configuração default do bot.
3. Rode nginx -t. Se passar, solicite o certificado com certbot --nginx -d app.clara.com e rode nginx -t novamente antes de systemctl reload nginx.
4. Teste https://app.clara.com/ e https://app.clara.com/api/health.

O Nginx do host deve continuar sendo o único serviço nas portas 80/443. O proxy deve encaminhar a web para 127.0.0.1:14310. A API e o PostgreSQL devem permanecer na rede privada do Compose.

## Operação do staging

A configuração e os containers já estão em execução. Para conferir:

    cd /opt/clara-staging
    docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml ps

Antes de futuras migrações, faça backup. Para atualizar as imagens já publicadas:

    docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml pull api web migrate
    docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml run --rm migrate
    docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml up -d --wait api web

O volume clara_staging_postgres_data é separado dos dados do bot. Nunca execute docker compose down -v neste projeto. O banco está vazio além do schema e não contém dados da clínica local.

Depois de HTTPS estar funcionando, crie o primeiro Super Admin pelo comando interativo abaixo. Ele pede nome, e-mail e senha; a senha não aparece durante a digitação:

    cd /opt/clara-staging
    docker compose --env-file .env.staging -p clara-staging -f compose.staging.yaml exec api node dist/create-admin.js

Confirme o acesso ao painel e o provisionamento com dados sintéticos. Não reutilize a senha que foi compartilhada na conversa para o ambiente local.

## Imagens e Gemini

O workflow .github/workflows/build-staging-images.yml compila e publica imagens linux/amd64. A VPS baixa as imagens; não compile no disco limitado do servidor. Os modelos configurados no staging são gemini-3.5-flash-lite para tarefas econômicas e gemini-3.8-flash para tarefas mais complexas, ambos listados na documentação atual da Gemini API: https://ai.google.dev/gemini-api/docs/models.

A chave Gemini foi copiada do .env local diretamente para /opt/clara-staging/.env.staging via SSH e tem permissões restritas. Não rode smoke tests do Gemini sem dados sintéticos e sem necessidade; chamadas podem consumir quota/custo.

## Backups e limites

O banco de staging está no volume clara_staging_postgres_data. Faça backup externo antes de migrações ou atualizações e teste restauração em uma instância isolada. Um backup no mesmo disco da VPS não protege contra falha do servidor. Monitore o espaço e mantenha margem para atualização das imagens.

Este é um staging inicial: DNS, HTTPS, Super Admin, backup externo com restauração comprovada, MFA e revisão de segurança/privacidade ainda estão pendentes. Não use pacientes reais nem trate o sistema como pronto para implantação clínica em produção.
