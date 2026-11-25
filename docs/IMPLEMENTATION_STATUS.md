# Status da implementação

## Fase 1 disponível localmente

| Entrega | Situação |
| --- | --- |
| Página comercial, conta e clínica | Criação de conta, login, logout, onboarding e seleção de clínica implementados. |
| Rotina da clínica | Agenda, pacientes, contatos, oportunidades, tarefas, unidades, serviços e profissionais persistem no PostgreSQL. |
| Visão operacional | Indicadores consultam os registros da clínica. A agenda e as datas usam o fuso configurado. |
| Equipe e administração | Papéis de proprietário, gestor, equipe e leitura. O Super Admin lista, suspende e reativa organizações. |
| Isolamento | Verificação de vínculo e papel no backend, escopo nas consultas e chaves estrangeiras compostas para referências entre registros. |
| Agentes | Contratos definidos em `packages/ai-core`. A Fase 2 usa esses contratos no backend. |

## Verificação local

- Migração aplicada a um PostgreSQL 17 isolado. O Docker Compose está configurado e sua execução depende do Docker ativo.
- Lint, TypeScript, build e testes de integração passaram.
- Testes de integração cobriram conta, login, logout, permissões, isolamento, alteração de etapa no CRM, tarefas e conflitos de agenda sob concorrência.
- Super Admin verificado com suspensão e reativação. A conta administrativa precisou de vínculo para acessar registros da clínica.
- Teste de navegador em desktop e celular cobriu cadastro, criação de clínica, unidades, serviços, profissionais, pacientes, agendamento, tarefas e navegação do assistente.

## Fase 2 disponível localmente

- Gemini validado com dados sintéticos. Meu Assistente consulta agenda de hoje, tarefas abertas, oportunidades, indicadores e serviços.
- Agenda, CRM e Operações recebem consultas de leitura roteadas pelo Agente Principal. O histórico e as cotas são persistidos no PostgreSQL. Meu Assistente oferece um chat com perfis ilustrados do Principal, Agenda, CRM e Operações, com conversa separada por clínica, usuário e ajudante.
- Validados isolamento, bloqueio de entradas fora do contrato, restrição de perfil e concorrência nas reservas.

## Fase 3 em uso local

- O Agente Principal reúne Agenda, CRM e Operações no Resumo do dia. O chat reconhece variações do pedido e aplica o formato solicitado na mensagem ou na continuação da conversa.
- Os ajudantes respondem dúvidas de uso da Clara e recuperam preferências explícitas da mesma conta e clínica.
- Principal e Operações podem registrar uma tarefa depois de receber confirmação na mesma conversa. A ação aparece na lista da clínica e tem registro de auditoria.

- O Principal encaminha pedidos de marcação para Agenda e tarefas para Operações. A consulta usa o fuso da clínica, a duração do serviço e exige confirmação. Tarefas aceitam prazo com hoje, amanhã ou DD/MM/AAAA. [Issue #13](https://github.com/hayax0/clara-clinicas/issues/13).

## Fase 4 — Caixa de entrada local

Atendimento reúne filas abertas, atribuídas e concluídas, contato do CRM, repasse entre membros e histórico de anotações com autoria e horário. O teste de integração cobre isolamento, perfil de leitura e conflito de versão. O fluxo de abertura, atribuição, anotação e conclusão foi verificado no navegador. As anotações são internas. [Issue #11](https://github.com/hayax0/clara-clinicas/issues/11).

## Próximas fases

A ampliação da orquestração entre agentes, conectores, automações e implantação comercial segue no roadmap. A preparação da primeira implantação está na [issue #6](https://github.com/hayax0/clara-clinicas/issues/6).

## Cadastro por conversa e WhatsApp da clínica

Os quatro ajudantes cadastram pacientes pelo nome, após confirmação, na organização ativa. Durante o agendamento, a confirmação do cadastro e a confirmação da consulta são etapas independentes. O nome é processado no backend sem chamada ao modelo.

Na Agenda, a fila de lembretes mostra consultas autorizadas das próximas 24 horas. A equipe prepara o texto, revisa, abre o WhatsApp conectado ao número da clínica e registra manualmente o envio. O Gemini recebe apenas uma instrução genérica. A data e a hora são preenchidas localmente. Confirmações e remarcações são registradas pela recepção.

## Fase 5 — Primeira entrega comercial

Origem opcional em Contatos e relatório agregado por origem em Atendimento. Conversão conta contatos distintos com oportunidade ganha. Validado com banco local, cadastro sem origem, duas oportunidades do mesmo contato e isolamento entre clínicas. [Issue 18](https://github.com/hayax0/clara-clinicas/issues/18).

Atendimento → Captação gera links do formulário por canal. A página pública solicita nome e ao menos um meio de retorno; o backend vincula o contato à clínica da URL. Validados envio móvel sem sessão, origem persistida, repetição concorrente da mesma solicitação, isolamento e bloqueio após suspensão. [Issue 19](https://github.com/hayax0/clara-clinicas/issues/19).

Personalização publicada no mesmo link por gestor ou proprietário. Modelos de clínica geral, odontologia, psicologia e fisioterapia. Validação com duas clínicas e navegador móvel. Consentimento opcional para campanhas gravado com data e revogável, independente do pedido de retorno. A equipe registra situação do lead e próximo retorno em Contatos. [Issue 20](https://github.com/hayax0/clara-clinicas/issues/20) e [issue 21](https://github.com/hayax0/clara-clinicas/issues/21).
Agenda validada com correção DD/MM e hora sem sufixo, preservando o paciente após cadastro e a confirmação separada. [Issue 22](https://github.com/hayax0/clara-clinicas/issues/22).
Fila comercial disponível em Atendimento → Retornos, com consulta e remarcação confirmada pelo chat do Principal ou CRM. Validado fluxo de Hoje para Próximos e isolamento. [Issue 23](https://github.com/hayax0/clara-clinicas/issues/23).

## Campanhas manuais autorizadas

Atendimento → Campanhas prepara texto com Gemini usando objetivo, sem transmitir dados dos contatos. A equipe revisa, abre o WhatsApp e registra cada envio. O backend verifica consentimento vigente tanto antes de abrir o WhatsApp quanto ao registrar o envio. Alteração de telefone ou revogação bloqueia destinatário pendente. Relatório por datas mostra envios e atividades de retorno. Suíte automatizada validada com teste de integração cobrindo elegibilidade, revogação, alteração de telefone, RBAC, isolamento e relatório por período. [Issue 24](https://github.com/hayax0/clara-clinicas/issues/24).

## Fase 6 — Financeiro básico (primeiro bloco)

Módulo Financeiro disponível localmente com categorias de receita e despesa, contas a receber, contas a pagar, registro manual de recebimentos e pagamentos, revisão/reconciliação, fechamento diário de caixa com bloqueio da data, reabertura auditada pelo proprietário e visão financeira resumida por período e categoria. Permissões por clínica: `VIEWER` bloqueado; `STAFF` lança, edita em aberto e dá baixa manual em dias abertos; `MANAGER` e `OWNER` gerenciam categorias, cancelam em aberto, conferem/reconciliam e fecham caixa; somente `OWNER` reabre caixa fechado mediante motivo. Todos os registros são administrativos/manuais, sem processamento bancário automático. Validado com migração local, build completo, typecheck, lint e teste de integração HTTP (isolamento, RBAC, reconciliação obrigatória antes do fechamento, bloqueio de dia fechado e reabertura).

## Fase 6 — Pacotes e sessões (segundo bloco)

Aba **Pacotes** disponível dentro de **Financeiro** com catálogo de pacotes (serviço opcional, quantidade de sessões, validade em dias e valor), vínculo a pacientes com snapshot de sessões/valor e geração opcional de conta a receber no Financeiro na mesma transação, registro de sessões realizadas com controle de concorrência (`FOR UPDATE`), conclusão automática ao atingir o total, bloqueio de pacote vencido, histórico de sessões, estorno e cancelamento. Permissões por clínica: `VIEWER` bloqueado; `STAFF` consulta, vincula pacotes e registra sessões; `MANAGER` e `OWNER` gerenciam catálogo, estornam sessões e cancelam pacotes. Validado com migração `20261124000200_packages_sessions`, build completo, typecheck, lint e teste de integração HTTP (RBAC, isolamento, geração financeira atômica, concorrência na última sessão, estorno, cancelamento e validade expirada).

## Melhoria de conversa e orquestração dos agentes (24/11)

- Modelo padrão atualizado de `gemini-3.5-flash-lite` para `gemini-3.8-flash` em `apps/api/src/ai/gemini-provider.ts` (validado com `ai:smoke`), mantendo `GEMINI_MODEL_STANDARD` / `GEMINI_MODEL_ADVANCED` configuráveis.
- Novo cérebro conversacional (`apps/api/src/ai/assistant-brain.ts`) integrado ao `AssistantController` com histórico recente dos últimos 6 turnos sanitizado (mascarando CPF/CNPJ, e-mail e telefone), preferências salvas e saída estruturada para acionar ferramentas autorizadas (incluindo resumo financeiro do mês) ou responder de forma natural. Sem `GEMINI_API_KEY`, o chat continua operando pelo fluxo local sem simular IA.
- Novo fluxo confirmado e auditado de confirmação e cancelamento de agendamentos pelo chat (`apps/api/src/ai/appointment-actions.ts`), evitando que pedidos como “confirma a paciente Maria Julia” caiam em contadores genéricos.
- `apps/api/src/ai/booking.ts` aprimorado para entender saudações e variações naturais (“ola, quero fazer um agendamento para a paciente maria julia”), extrair e preservar o nome do paciente citado na própria mensagem (propondo cadastro separado quando novo) e aceitar confirmações naturais.
- Consultas de agenda de hoje, tarefas, oportunidades e serviços passam a listar os itens reais da clínica (mantendo modo breve quando solicitado).
- Validado com `pnpm build`, `pnpm typecheck`, `pnpm lint`, `ai:smoke` (`gemini-3.8-flash`) e `pnpm test` (33 testes aprovados, 4 opcionais omitidos).

## Redesign visual e Agenda estilo Google Calendar (24/11)

Nova marca SVG (`apps/web/app/brand-logo.tsx`, `apps/web/app/icon.svg`), tipografia `Plus Jakarta Sans` + `Instrument Serif`, acabamento clínico sólido e limpo (sem glassmorphism) em toda a plataforma e animações GSAP com `ScrollTrigger` respeitando `prefers-reduced-motion`. Agenda reescrita em formato visual estilo Google Calendar (`apps/web/app/clinica/calendar.tsx`) com visões Dia, Semana, Mês e Lista, filtros, clique em horários vazios e drawer lateral do paciente integrado a Pacotes, Financeiro, Lembretes 24h e ao subagente Agenda (que também ganhou ferramentas `agenda_schedule` para semana/amanhã/datas e `patient_overview` para ficha e pacotes do paciente). Validado com `pnpm build`, `pnpm typecheck`, `pnpm lint` e `pnpm test` (34 aprovados, 4 opcionais omitidos).

## Refinamento visual editorial do frontend (24/11)

Refinada a identidade de toda a interface em `apps/web/app/editorial-system.css`: superfícies foscas e sólidas em marfim, verde profundo e terracota, sem glassmorphism e sombras decorativas. Logotipo e favicon agora usam um monograma C com sinal de cuidado. Aplicado a landing, navegação, início, calendário, financeiro, formulários e chat dos agentes; os cartões da agenda priorizam horário e paciente. Capturas locais verificadas em 1440 px e 390 px. Typecheck, lint e build do frontend passaram; testes automatizados não foram executados nesta entrega.

## Fase 6 — Relatórios financeiros avançados e exportação CSV (quarto bloco)

Aba **Relatórios** disponível em **Financeiro** (`apps/web/app/clinica/finance-reports.tsx`) com atalhos de período ("Este mês", "Mês passado", "Últimos 30 dias" e seletor livre), breakdown consolidado (`GET /api/organizations/:orgId/finance/reports/breakdown`) por forma de pagamento, categoria (com participação %), profissional (total, atendimentos e ticket médio), fluxo diário com indicador de caixa fechado e painel de contas vencidas em aberto (`dueDate < today`, incluindo os 5 maiores títulos em atraso). Exportação direta em CSV (`GET /api/organizations/:orgId/finance/reports/export.csv`) com BOM UTF-8, delimitador `;` e valores em formato decimal brasileiro (`150,00`). Ferramenta `finance_month` do Assistente de IA expandida para o Agente Principal e o subagente Operações responderem sobre formas de pagamento e contas vencidas com dados reais. Validado com `pnpm db:migrate`, `pnpm build`, `pnpm typecheck`, `pnpm lint` e `pnpm test` (35 testes aprovados, 0 falhas, 4 opcionais omitidos), cobrindo RBAC (`VIEWER` 403), isolamento multi-clínica (`404`), agregações e formato do CSV. Próximo passo: Fase 7 — Implantação e Produção.

## Fase 7 — Implantação assistida, Super Admin & Operação em Produção (issue #6)

Painel **Administração** (`apps/web/app/clinica/admin.tsx`) e endpoints `/api/admin/*` (`apps/api/src/organizations.ts`) expandidos com provisionamento assistido de clínicas (`POST /api/admin/organizations/provision` criando vínculo `OWNER` atômico e senha temporária segura para novos usuários), listagem enriquecida de clínicas (`GET /api/admin/organizations` com membros, última atividade e consumo mensal de IA) e monitoramento de IA & custos (`GET /api/admin/metrics/ai` com chamadas, tokens, custo estimado em USD e alerta de cota diária). Scripts operacionais criados e executáveis em `scripts/backup-db.sh` (testado localmente com `pg_dump -Fc` + SHA-256), `scripts/restore-db.sh` (com validação de checksum e confirmação interativa) e `scripts/health-check.sh`. Validado com `pnpm db:migrate`, `pnpm build`, `pnpm typecheck`, `pnpm lint` e `pnpm test` (36 testes aprovados, 0 falhas, 4 opcionais omitidos), cobrindo bloqueio `403` para não-admins, provisionamento atômico, login com senha temporária, isolamento entre clínicas provisionadas e métricas de IA.

## Internacionalização — base inicial, globalização ainda pendente

Adicionados `currency` (`BRL`, `USD`, `EUR`, `GBP`) e `locale` (`pt-BR`, `en-US`) ao model `Organization` (migração `20261125000100_i18n_multicurrency`), configuráveis em **Configurações → Dados da clínica** e no provisionamento do Super Admin. Formatador universal `formatMoney(cents, currency, locale)` aplicado em Financeiro, Relatórios, Pacotes, Agenda e Serviços; dicionário leve `apps/web/app/i18n/translations.ts` aplicado à navegação e ações; lembretes 24h expandidos com links **WhatsApp**, **SMS (`sms:...`)** e **E-mail (`mailto:...`)**. Assistentes de IA (`assistant-brain.ts`, `assistant.ts`, `booking.ts`, `appointment-actions.ts`, `chat-date.ts`) adaptados para idioma/moeda da clínica, aceitando agendamento e confirmação em inglês (`tomorrow at 3pm`, `Confirm patient ...`, `yes`) e formatando resumo financeiro na moeda configurada. Validado com `pnpm db:migrate`, `pnpm build`, `pnpm typecheck`, `pnpm lint` e `pnpm test` (37 testes aprovados, 0 falhas, 4 opcionais omitidos).

**Limite para expansão:** esta camada ainda não completa a tradução das telas, não localiza todos os formatos e não valida a abertura do CSV em planilhas reais; não tratar PT/ES/US como mercados prontos para produção até fechar a cobertura descrita em [Internacionalização global](INTERNACIONALIZACAO_GLOBAL.md). A situação e a sequência estão também em [Passagem de contexto](PASSAGEM_DE_CONTEXTO.md).

## Preparação local para staging (25/11/2026)

Adicionados Dockerfile multi-stage com dependências de produção somente no runtime, Next.js standalone, Compose de staging com PostgreSQL isolado e persistente, proxy local para o Nginx existente, workflow que compila imagens `linux/amd64` no GitHub Actions e exemplo de variáveis sem segredos. O primeiro Super Admin continua sendo criado por comando interativo, sem associação a uma clínica. As imagens da web e da API ficam separadas; não publicam portas de banco/API.

Verificação local inicial: `docker compose ... config --quiet` e o build completo passaram, incluindo typecheck e criação das rotas Next. Os comandos de migração Prisma e bootstrap Super Admin estão nas imagens; os arquivos standalone do Next foram confirmados. As imagens ARM64 locais ficaram em 853 MB (API) e 406 MB (web), cerca de 64% menores em conjunto que a imagem unificada anterior de 3,5 GB.

## Staging iniciado na VPS (25/11/2026)

O commit `3d5559a` está em `main`; o workflow do GitHub Actions compilou e publicou as imagens `linux/amd64` da web e da API no GHCR. Na VPS `79.182.128.34`, o checkout está em `/opt/clara-staging`; um PostgreSQL novo usa o volume `clara_staging_postgres_data` e as 17 migrações Prisma foram aplicadas. API, banco e web estão saudáveis. A web responde HTTP 200 em `127.0.0.1:14310`; a API responde HTTP 200 em `/api/health`. O `.env.staging` está protegido com modo 600. O Nginx e os containers do `bot-disparo` não foram alterados.

DNS e HTTPS ainda pendentes: `clara.cmpx.tec.br` ainda não tem registro A. O domínio `cmpx.tec.br` usa os DNS autoritativos do Registro.br (`e.sec.dns.br` e `f.sec.dns.br`); crie somente o registro A `clara` → `79.182.128.34` na zona DNS do Registro.br. Preserve registros existentes da raiz e de e-mail; não altere os nameservers. Não configure o vhost nem emita certificado antes da propagação. O primeiro Super Admin e o backup externo/restauração ainda não foram verificados. Última medição: 5,9 GB livres e cerca de 2,2 GB de memória disponível. Usar somente dados sintéticos.

### Primeiro bloco dos perfis globais (25/11)

Adicionados `Organization.countryCode` (`BR`, `PT`, `ES`, `US`) e `User.uiLocale` opcional (`pt-BR`, `en-US`), com endpoint autenticado `PATCH /api/auth/preferences`. País/mercado foi incluído em cadastro, configurações, provisionamento e listagem do Super Admin; defaults editáveis: BR/`pt-BR`/BRL/São Paulo, PT/`pt-PT`/EUR/Lisboa, ES/`es-ES`/EUR/Madrid e US/`en-US`/USD/Nova Iorque. A exportação CSV adapta cabeçalhos, estados, métodos de pagamento, datas, separador decimal e código da moeda em quatro locales. O calendário considera domingo nos EUA e segunda-feira nos demais países; o parser de datas do chat começou a aceitar ordem `MM/DD` em `en-US`, ISO e expressões relativas em espanhol. Ação de agendamento começou a localizar mensagens e horários; lembretes passaram a usar modelos por idioma sem chamada Gemini. A interface da conta segue disponível em `pt-BR` e `en-US`; em Portugal/Espanha sem preferência individual, usa inglês até fechar a tradução nativa completa. Migração `20261125000200_global_market_profiles` aplicada em 25/11/2026. **Não foram executados testes, build, lint ou typecheck nesta continuação; revisar e validar antes de integrar.**

### Continuação dos fluxos multilíngues (25/11)

Respostas determinísticas da Agenda e dos ajudantes agora cobrem `pt-BR`, `pt-PT`, `es-ES` e `en-US` para consultas da agenda, resumo diário, ficha de pacientes, financeiro, tarefas, oportunidades, serviços e resumo da clínica. O fluxo de criação/cadastro pelo chat localiza perguntas de dados ausentes, confirmações, paciente duplicado/não encontrado, opções de agenda, conflito, data passada e conclusão; datas usam o padrão da clínica com ano completo e horas usam 12h nos EUA/24h nos outros mercados. Perguntas frequentes sobre Agenda, Tarefas, Pacientes, Atendimento/CRM, Serviços, Acessos, Profissionais e Unidades receberam traduções para `pt-PT`, `es-ES` e `en-US`. Foram ampliados comandos básicos de agendar, cadastrar, confirmar e cancelar em inglês/espanhol. Cadastro de serviço aceita símbolos/códigos de moeda e separadores locais na leitura do preço, mantendo centavos.

**Não verificado:** nenhum teste, build, lint, typecheck ou fluxo manual foi executado nesta continuação. Ainda faltam a interface nativa `pt-PT`/`es-ES`, catálogo central integral, mensagens gerais de validação/erro, revisão de formulários regionais e verificação da exportação em planilhas reais; nenhum dos quatro mercados deve ser anunciado como pronto para produção. O restante está na [issue 25](https://github.com/hayax0/clara-clinicas/issues/25).

### Acesso autenticado antes da hospedagem (25/11)

Removido o botão público de demonstração da landing page e mantida a demonstração condicionada pela API: só fica disponível no próprio login quando a API confirma desenvolvimento local, `CLARA_LOCAL_DEMO=true` e host loopback. Em VPS/nuvem, manter `CLARA_LOCAL_DEMO=false` e `NODE_ENV=production`. O servidor local foi iniciado para visualização em `http://localhost:4310`; testes e build não foram executados naquela alteração. A disponibilidade local foi reconectada na continuação abaixo.

### Continuação: autenticação local e idioma do painel (25/11)

Corrigida a passagem de idioma selecionado na landing para `/clinica`: a preferência PT/EN fica no `localStorage` (`clara-ui-locale`), é aplicada ao login e ao painel e pode ser alterada também na tela de acesso e no cabeçalho autenticado. Foram localizados para inglês a tela de login, o cadastro/configuração inicial da clínica, as principais telas do Super Admin, seletores de país/moeda e a demonstração visual da landing. A cobertura geral ainda não é integral; mensagens restantes e telas fora deste fluxo continuam na [issue 25](https://github.com/hayax0/clara-clinicas/issues/25).

**Correção de diagnóstico:** os e-mails mostrados nas capturas não existiam no banco local consultado e, antes da intervenção, nenhuma conta tinha `isAdmin=true`. Isso não significava que os cadastros de clínicas tinham sumido: o banco continha pelo menos as clínicas reais “clinica do bem” e “Clínica Natural”, ambas com proprietário e vínculos; “Clínica Natural” também tinha paciente, serviço, profissional e agendamento cadastrados. Minha conclusão anterior de que os cadastros não existiam foi incorreta. A tela Super Admin permanece implementada em `apps/web/app/clinica/admin.tsx` e lista as organizações do banco.

Na intervenção anterior foi criada uma conta Super Admin local para o e-mail principal da captura, definida a preferência `en-US` e concedido papel `OWNER` à clínica técnica “Clínica demonstração”. A senha temporária foi compartilhada nesta conversa e não deve ser armazenada no repositório. Nenhuma das clínicas de clientes foi excluída nem recriada. Evitar novas alterações de contas/vínculos até confirmar qual ambiente e credenciais o proprietário vinha usando.

A tela de login agora exibe “Explorar demonstração local” apenas quando o endpoint `/api/auth/demo` confirma disponibilidade e o host é `localhost`/`127.0.0.1`; a API continua exigindo `CLARA_LOCAL_DEMO=true`, host loopback e ambiente não produtivo. Isso deixa a demonstração acessível no desenvolvimento sem reabrir acesso anônimo em VPS/produção.

**Verificação desta continuação:** o cadastro, a preferência de idioma, a promoção Super Admin e o vínculo `OWNER` foram aplicados ao banco local; `/clinica` e `/api/auth/demo` responderam HTTP 200 e a API informou demonstração local disponível. Não foram executados testes automatizados, build, lint ou typecheck. A conta e a senha são apenas do banco local; não existem no ambiente remoto.

### Correção do erro de renderização da Agenda (25/11)

A captura posterior mostrou `ReferenceError: Cannot access 'locale' before initialization` em `apps/web/app/clinica/calendar.tsx`. O `useMemo` de filtragem usava `locale` em sua lista de dependências antes da declaração `const locale`. A declaração foi movida para antes do hook. O servidor Next recompilou os arquivos alterados sem novo erro de compilação. Nenhum teste automatizado foi executado.

### Aviso ESLint na landing e bancos locais divergentes (25/11)

O aviso `react-hooks/set-state-in-effect` em `landing-content.tsx` vinha da leitura do idioma salvo seguida de `setLang` síncrono dentro de um efeito. A leitura agora usa `useSyncExternalStore`, preserva o HTML inicial em português durante SSR/hidratação e reage a mudanças de `localStorage` sem `setState` no efeito. Verificação pontual do ESLint: `pnpm exec eslint app/landing-content.tsx` passou. Sem testes ou build.

O retorno do outro agente identificou que a conta Super Admin antiga foi criada no cluster PostgreSQL do Homebrew, enquanto as clínicas estão no cluster do Docker, ambos usando a porta local `55432` em momentos diferentes. O listener atual pertence ao Docker. Antes de restaurar acesso foi criado um backup privado em `/Users/caiocampos021/.local/share/clara-clinicas/backups/clara-20261125-131534.dump` (diretório `700`, arquivo `600`). O PostgreSQL Homebrew foi iniciado na porta temporária `55433`, e somente o hash de senha do usuário Super Admin original foi copiado para a conta de mesmo e-mail já existente no Docker. A consulta confirmou que ela segue `isAdmin=true`; nenhuma clínica, paciente, vínculo ou outra conta foi modificada. O serviço temporário foi parado. Acesso esperado em `http://localhost:4310/clinica`, com o e-mail e a senha habitual, e item **Administração** na navegação lateral. Login visual ainda não verificado.

O cadastro local agora também é bloqueado pelo backend fora de desenvolvimento em loopback. O link público já era ocultado no frontend, mas antes a rota `POST /api/auth/register` aceitava chamadas diretas; ela agora retorna indisponível em produção e fora de conexões locais. A criação de acessos de clínicas segue pelo provisionamento do Super Admin. ESLint focado em `apps/api/src/auth.ts` passou; sem testes ou build.

A conta Super Admin foi separada da área clínica: o endpoint de sessão não retorna memberships para `isAdmin`; a interface força a vista Administração, oculta agenda, pacientes, atendimento, financeiro, assistentes, tarefas, configurações de clínica e o botão lateral de criação genérica. Foi removido o único vínculo `OWNER` do usuário com a clínica de demonstração, preservando a organização e todos os cadastros. Banco confirmou `isAdmin=true` e zero memberships para essa conta. A criação de clientes continua em **Administração → Provisionar uma clínica**. ESLint nos dois arquivos alterados passou; falta o proprietário recarregar a sessão e confirmar visualmente. Nenhum teste ou build executado.

### Parecer de prontidão para produção (25/11)

**Não publicar nem usar pacientes reais no estado atual.** Há staging na VPS, mas somente em loopback e sem domínio público ou HTTPS. O commit está em `main` e o workflow publicou imagens `linux/amd64`; as migrações do banco vazio foram aplicadas e os serviços estão saudáveis. Faltam DNS, certificado, primeiro acesso Super Admin, backup externo com restauração comprovada, MFA, monitoração e revisão de segurança/privacidade por mercado. Após publicar `clara.cmpx.tec.br`, validar acesso autenticado com dados sintéticos antes de avaliar qualquer piloto.

Para o mercado de saúde, implementar controles de MFA, auditoria/retensão/recuperação e revisão das responsabilidades de tratamento antes de dados reais. Confirmar também o nível contratual da Gemini API: a documentação oficial diferencia o Free (conteúdo pode ser usado para melhorar produtos) do Paid (conteúdo não é usado para isso); o tier da chave atual é desconhecido. Próximo passo é staging isolado e piloto com dados sintéticos/desidentificados, seguido por revisão de segurança/privacidade por mercado e aceite operacional antes da implantação real.
