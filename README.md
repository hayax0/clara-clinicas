# Clara

Clara é um sistema de gestão vendido por preço fixo e implantado para cada clínica. A página inicial apresenta o produto e dá acesso ao sistema. O projeto começa com agenda, pacientes, contatos, CRM, tarefas e gestão de equipe por organização.

Para continuar o desenvolvimento, comece pela [passagem de contexto](docs/PASSAGEM_DE_CONTEXTO.md).

## Executar localmente

Você precisa de Node.js 24 LTS (a partir da versão 24.11), pnpm 12.14 e Docker Compose com o serviço Docker ativo. Na raiz do repositório, execute:

```sh
cp .env.example .env
docker compose up -d --wait
pnpm install
pnpm db:migrate
pnpm dev
```

No ambiente de desenvolvimento, abra o [cadastro de teste da Clara](http://localhost:4310/clinica?cadastro=1), crie uma conta e configure a primeira clínica. O fluxo de provisionamento comercial será tratado na [issue de implantação](https://github.com/hayax0/clara-clinicas/issues/6). Cadastre uma unidade, um profissional, um serviço e um paciente antes de criar o primeiro compromisso. A API local atende na porta `4311`. O PostgreSQL do Compose usa a porta `55432` e mantém os dados no volume `clinic_data`.

Se já tiver PostgreSQL disponível, configure `DATABASE_URL` em `.env` para um banco de desenvolvimento preparado para a extensão `btree_gist` e execute os comandos pnpm a partir da instalação. O exemplo traz credenciais para uso local. Use um banco dedicado ao executar testes.

## Segurança do acesso

Em hospedagem, o painel exige conta autenticada; mantenha `CLARA_LOCAL_DEMO=false` e `NODE_ENV=production`. No desenvolvimento, o login pode mostrar **Explorar demonstração local** quando a API confirma que `CLARA_LOCAL_DEMO=true`, o host é loopback e o ambiente não é produtivo. A opção cria uma sessão técnica de demonstração e não é disponibilizada em VPS/produção.

## Administração de plataforma

Em desenvolvimento local, cadastre uma conta pela tela de teste e conceda o papel administrativo:

```sh
pnpm --filter @clinicas/api build
pnpm --filter @clinicas/api admin:promote gestor@example.com
```

Em uma instalação nova de staging/produção, crie a conta inicial pelo comando interativo `admin:create`; ele não exibe a senha e cria o Super Admin sem vínculo com clínica. Cadastro público permanece fechado em produção. A administração da plataforma gerencia as organizações e provisiona o acesso dos clientes.

## Staging na nuvem

A configuração de referência para VPS com Docker Compose e HTTPS automático está em [Preparar staging](docs/STAGING_DEPLOY.md). Ela inicia um banco vazio e privado; **não restaure o banco local de desenvolvimento** para staging.

## Verificações

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Os testes de integração usam a API em execução. A URL padrão é `http://127.0.0.1:4311/api`. Para outro endereço local de testes, configure `APP_TEST_URL`.

## Assistente

O sistema funciona sem credencial de IA. O adaptador Gemini usa `GEMINI_API_KEY` no backend. Para verificar a conexão com dados sintéticos, configure a chave no `.env`, compile a API e rode `pnpm --filter @clinicas/api ai:smoke`. Para usar as consultas de leitura, acesse Meu Assistente com um perfil de proprietário, gestor ou equipe. Use `GEMINI_DAILY_CALL_LIMIT` e `GEMINI_DAILY_TOKEN_LIMIT` para ajustar os limites diários de cada clínica.

- [Prompt mestre](PROMPT-MESTRE-CLINICAS.txt)
- [Status de implementação](docs/IMPLEMENTATION_STATUS.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Arquitetura de IA](docs/AI_ARCHITECTURE.md)
