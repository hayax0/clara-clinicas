# Clara — passagem de contexto

Atualizado em 25/11/2026. A próxima pessoa deve começar por este documento, escolher uma issue e consultar as referências específicas antes de editar.

## Produto e decisões do proprietário

- O proprietário revogou as instruções anteriores de AGENTS.md em 23/11/2026. Siga o pedido mais recente no chat e este documento de passagem, sem aplicar as instruções revogadas.

- Sistema de gestão vendido por preço fixo, com implantação por clínica. A landing apresenta o produto e direciona ao acesso autenticado da plataforma. O modelo comercial é implantação assistida.
- Workspace atual no Mac: `~/Developer/software para clinicas`. Antes estava em `~/Documents/ChatGPT/software para clinicas`. O código está no workspace local. Na verificação de 22/11, o Git local ainda não tinha commit inicial. Para retomar em outra máquina, disponibilize o código atual por um meio autorizado. O link das issues por si só não transfere o projeto.
- Em VPS/nuvem, o acesso requer conta autenticada e vínculo/permissão na clínica; mantenha `CLARA_LOCAL_DEMO=false` e `NODE_ENV=production`. Em desenvolvimento, o login pode mostrar a demonstração local apenas se a API confirmar `CLARA_LOCAL_DEMO=true`, host loopback e ambiente não produtivo. Preserve a separação de contexto, memória, ferramentas, contatos e histórico por clínica.
- Gemini é o único provedor de IA. O backend usa o SDK oficial e lê GEMINI_API_KEY do ambiente. Preserve cotas, limites de tokens, preferência por modelos econômicos e registro de uso. Configure segredos no ambiente de destino; mantenha-os fora de commits, handoffs e issues.
- WhatsApp é operado pela equipe no aparelho ou navegador conectado ao número da clínica. A IA prepara o texto, a equipe revisa e envia. A decisão da [issue 17](https://github.com/hayax0/clara-clinicas/issues/17) substitui o conector da Meta, o webhook e o disparador das issues 15 e 16. Preserve migrações antigas já aplicadas.
- Use issues curtas para economizar contexto. A implementação validada é local. Deploy, push e comunicação externa dependem da autorização correspondente.

## O que já existe

| Área | Comportamento atual e referências |
| --- | --- |
| Fundação | Next.js no frontend, NestJS no backend, Prisma e PostgreSQL. Conta, seleção de clínica, papéis, suspensão e reativação. Agenda com prevenção de conflitos, pacientes, serviços, profissionais, unidades, tarefas, contatos e oportunidades. |
| Interface | Landing comercial, dashboard, demonstração sem login e chat com personagens do Principal, Agenda, CRM e Operações. Issues 5, 7 e 8. |
| Agentes | Integração Gemini, cotas, auditoria e ferramentas autorizadas no backend. Resumo do dia, preferências explícitas e respostas breves quando solicitado. Consultar issues 1–4, 9, 10 e 12. A delegação já atende fluxos específicos; linguagem livre e orquestração continuam limitadas. |
| Escrita pelo chat | Cadastro de paciente por nome, confirmação separada para agendamento, preservação de dia e hora, consulta no fuso da clínica e criação de tarefas com prazo. Issues 13 e 14. |
| Atendimento | Fila por clínica com atribuição, repasse humano, contato do CRM, anotação, histórico, conclusão e reabertura. Controle de concorrência e de acesso. Issue 11. |
| Lembretes | Fila de consultas autorizadas das próximas 24 horas; rascunho pelo Gemini com data e hora acrescentadas no backend. Abrir o WhatsApp mantém o item pendente até confirmação manual do envio. A recepção registra confirmações e remarcações. Issue 17. |

## Plano das próximas entregas

1. Fase 5, primeiro bloco ([issue 18](https://github.com/hayax0/clara-clinicas/issues/18)). Entregue localmente em 22/11. Atendimento → Contatos aceita origem opcional. Atendimento → Relatório comercial agrupa contatos por origem e conta cada contato com oportunidade ganha uma vez. Origem ausente aparece como “Não informada”. A migração foi aplicada no PostgreSQL local. Build da API, typecheck e lint passaram. Suíte padrão: 26 testes aprovados, quatro opcionais omitidos. O teste de integração cobriu duas oportunidades ganhas do mesmo contato, origem ausente e isolamento. O relatório usa o estado atual, sem recorte temporal.
2. Fase 5, sequência proposta. Formulário público entregue localmente ([issue 19](https://github.com/hayax0/clara-clinicas/issues/19)). Em Atendimento → Captação, escolher canal e copiar o link. A página /contato/[clinicId] solicita nome e telefone ou e-mail, grava o contato sem login e mantém a origem do link. Reenvios da mesma solicitação são idempotentes. Validados isolamento, clínica suspensa e envio no navegador móvel. Build da API, lint e typecheck passaram; 27 testes aprovados e 4 opcionais omitidos. Links locais exigem implantação em domínio público para divulgação externa. Personalização, consentimento e acompanhamento entregues localmente nas issues [20](https://github.com/hayax0/clara-clinicas/issues/20) e [21](https://github.com/hayax0/clara-clinicas/issues/21). Captação oferece quatro modelos, logo por URL HTTPS, cor, título, apresentação, botão e prévia móvel. Gestor ou proprietário publica no mesmo link. O opt-in opcional começa desmarcado. Contatos mostra autorização, revogação, situação do lead e data de retorno. Alterar telefone ou e-mail revoga autorização anterior. Validados isolamento de duas clínicas, permissões e prévia/publicação no navegador. Build API, lint e typecheck passaram; suíte padrão com 28 aprovados e quatro testes opcionais omitidos. Fila de retornos entregue na issue 23. Campanhas autorizadas e acompanhamento por período entregues na issue 24. Próxima fase principal: Fase 6, definir primeiro os registros financeiros e papéis que podem lançar, conferir e fechar caixa. Depois revisar pacotes, comissões e relatórios. Planejar ajudantes de Captação e Relacionamento depois de definir suas ferramentas. A autorização de lembrete de consulta é específica da consulta.
3. Fase 6. Bloco 1 (Financeiro básico, categorias, reconciliação e fechamento de caixa), Bloco 2 (Pacotes e sessões integrados ao Financeiro) e Bloco 4 (Relatórios financeiros avançados e exportação CSV) entregues localmente em 24/11. O Bloco 3 (Comissões por profissional) foi dispensado por hora para priorizar ferramentas úteis a 100% das clínicas.
4. Fase 7. Fundação operacional entregue localmente em 24/11 (issue #6): provisionamento assistido pelo Super Admin, monitoramento de consumo/custo de IA por clínica e scripts testados de backup/restauração/healthcheck. Próximo passo: primeira implantação assistida em ambiente de produção e validação de carga/domínio público.
5. Pendências da fase 4. Avaliar agentes específicos de Atendimento e Confirmações e automações internas compatíveis com envio manual pelo WhatsApp. Não retomar o conector antigo.

## Campanhas manuais autorizadas — issue 24

Atendimento → Campanhas permite selecionar contatos por origem com consentimento vigente, gerar rascunho Gemini sem contexto de pacientes, revisar e enviar individualmente pelo WhatsApp. O envio abre a conversa no dispositivo da clínica e depende de ação humana. A autorização e o telefone são consultados novamente antes da abertura e ao registrar o envio. Relatório por período resume envios e atividades de retorno. Até 5.000 destinatários por campanha e até 1.000 linhas detalhadas no painel. Em 24/11, a suíte automatizada foi executada e ampliada com teste de integração HTTP para campanhas (elegibilidade, revogação, troca de telefone, RBAC, isolamento e relatório por período). Não houve envio externo.

## Fase 6 — Financeiro básico, primeiro bloco

Entregue localmente em 24/11 com migração `20261124000100_finance_basic` (`FinanceCategory`, `FinanceEntry`, `CashClosing`), API em `apps/api/src/finance.ts` e interface **Financeiro** em `apps/web/app/clinica/finance.tsx` (abas Resumo, Lançamentos, Fechamento de caixa e Categorias).

- **Registros**: categorias de receita/despesa, contas a receber (`INCOME`), contas a pagar (`EXPENSE`), baixa manual com data de caixa (`DATE`) e forma de pagamento (`PIX`, `CARD`, `CASH`, `TRANSFER`, `OTHER`), vínculo opcional com paciente e profissional (preparando base para comissões), conferência/reconciliação, fechamento diário de caixa com snapshot conferível (`receivedCents`, `paidCents`, `netCents`, `reconciledCount`) e reabertura com motivo auditado. Todos os valores são inteiros em centavos e os registros são estritamente manuais (sem afirmação de processamento bancário automático).
- **Permissões por clínica (RBAC)**:
  - `VIEWER`: sem acesso ao módulo financeiro (oculto no menu e `403` na API).
  - `STAFF`: consulta resumo/lançamentos/fechamentos/categorias, cria e edita lançamentos em aberto e registra baixas manuais em dias ainda abertos.
  - `MANAGER`: tudo de `STAFF`, mais gestão de categorias, cancelamento de lançamentos em aberto, conferência/reconciliação de lançamentos liquidados e fechamento de caixa (exige que todos os lançamentos pagos/recebidos do dia estejam conferidos).
  - `OWNER`: tudo de `MANAGER`, e único papel autorizado a reabrir um caixa fechado (com motivo obrigatório registrado e auditado).
- **Validação**: `pnpm db:migrate`, `pnpm build` (monorepo completo), `pnpm typecheck`, `pnpm lint` e suíte automatizada `pnpm test` aprovada (32 testes aprovados na suíte padrão, 4 opcionais omitidos; sem chamadas externas ao Gemini).
- **Limitações**: ainda não inclui pacotes de sessões, cálculo/repasse de comissões, geração de lançamentos automáticos a partir de consultas nem consultas financeiras pelos agentes de IA.
- **Próximo passo**: avançar para a Fase 6 — Bloco 3 (comissões por profissional) e Bloco 4 (relatórios financeiros avançados), ou preparar a primeira implantação assistida (Fase 7 / issue #6).

## Fase 6 — Pacotes e sessões, segundo bloco (24/11)

Entregue localmente com migração `20261124000200_packages_sessions` (`ServicePackage`, `PatientPackage`, `PackageSessionUsage`), API em `apps/api/src/packages.ts` e aba **Financeiro → Pacotes** em `apps/web/app/clinica/packages.tsx`.

- **Fluxo**: `MANAGER`/`OWNER` cadastram modelos no catálogo (nome, serviço opcional, total de sessões, valor e validade em dias). `STAFF`/`MANAGER`/`OWNER` vinculam pacotes ativos a pacientes (com snapshot de preço/sessões, vínculo opcional com profissional e opção atômica de gerar conta a receber `INCOME`/`PENDING` no Financeiro) e registram sessões realizadas (com trava `FOR UPDATE`, conclusão automática ao zerar saldo e bloqueio de pacotes vencidos). `MANAGER`/`OWNER` podem estornar sessões registradas por engano (reativando pacote concluído se necessário) e cancelar pacotes ativos preservando o histórico. `VIEWER` permanece bloqueado (`403`).
- **Validação**: `pnpm db:migrate`, `pnpm build`, `pnpm typecheck`, `pnpm lint` e `pnpm test` (**34 testes aprovados**, 0 falhas, 4 opcionais omitidos), cobrindo RBAC, isolamento multi-clínica, conta a receber vinculada, consumo concorrente na última sessão (`201`/`409`), estorno, cancelamento e validade expirada.
- **Limitações**: vínculo de consulta (`appointmentId`) já suportado no backend mas ainda sem seleção automática na tela da Agenda; comissões sobre vendas/sessões ficam para o Bloco 3.

## Melhoria conversacional e modelo dos agentes — 24/11

- Modelo padrão trocado para `gemini-3.8-flash` (`apps/api/src/ai/gemini-provider.ts`), validado com `pnpm --filter @clinicas/api ai:smoke`.
- Adicionado fluxo confirmado/auditado para confirmar e cancelar agendamentos existentes pelo chat (`apps/api/src/ai/appointment-actions.ts`), além de extração do nome do paciente, frases naturais com saudação e cadastro guiado pelo chat de serviços, profissionais e unidades (avulso ou integrado ao agendamento em clínicas recém-criadas) em `apps/api/src/ai/booking.ts`.
- Adicionado cérebro conversacional com histórico recente sanitizado em `apps/api/src/ai/assistant-brain.ts` e respostas detalhadas para agenda do dia, tarefas, oportunidades, serviços e resumo financeiro do mês.
- Validação: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `ai:smoke` (`gemini-3.8-flash`) e `pnpm test` (**33 testes aprovados**, 0 falhas, 4 opcionais omitidos).

## Redesign visual sólido, GSAP e Agenda estilo Google Calendar — 24/11

- **Skills consultadas**: `high-end-visual-design`, `design-taste-frontend`, `anti-ui-slop`, `motion-design` e `emil-design-eng` em `~/Developer/Antigravity Skills/skills`.
- **Nova marca e tipografia**: criada logo autoral em SVG (`apps/web/app/brand-logo.tsx` e `apps/web/app/icon.svg`) aplicada em toda a plataforma; tipografia atualizada com `Plus Jakarta Sans` e `Instrument Serif` via `next/font/google` (`apps/web/app/layout.tsx`).
- **Landing page, Dashboard e App Shell**: estética clínica limpa e sólida (sem glassmorphism, removido a pedido do proprietário), cabeçalho fixo alinhado, cards organizados em grade de 3 colunas, demonstração interativa ampliada (Agenda visual, CRM, Financeiro/Pacotes, Assistentes) e animações GSAP suaves com `ScrollTrigger` e respeito a `prefers-reduced-motion` (`apps/web/app/landing-motion.tsx`, `apps/web/app/clinica/sections.tsx`, `apps/web/app/clinica/calendar.tsx`).
- **Agenda estilo Google Calendar (`apps/web/app/clinica/calendar.tsx`)**: visões Dia, Semana (07h–20h com linha de horário atual no fuso da clínica), Mês e Lista; filtros por profissional, unidade, status e busca; clique em horário vazio para agendar já com data/hora preenchidas e duração calculada pelo serviço; drawer lateral ao clicar na consulta mostrando ficha completa do paciente (contato, histórico recente, pacotes ativos com saldo) e ações rápidas conectadas (Confirmar, Concluir, Cancelar, Reagendar, Usar sessão de pacote com `appointmentId`, Lançar conta a receber no Financeiro, Lembretes 24h e atalho direto para o subagente Agenda).
- **Conexão com agentes e subagentes**: `apps/api/src/ai/assistant-brain.ts` e `apps/api/src/ai/assistant.ts` receberam as ferramentas `agenda_schedule` (amanhã, semana ou data específica) e `patient_overview` (ficha administrativa, agendamentos e pacotes ativos do paciente), além de botões de confirmação rápida no chat para confirmações/cancelamentos de consulta e cadastros guiados.
- **Validação**: `pnpm build`, `pnpm typecheck`, `pnpm lint` e `pnpm test` (**34 testes aprovados**, 0 falhas, 4 opcionais omitidos).

## Como retomar e validar

- [README](../README.md) descreve instalação, banco e variáveis. Em workspace existente, preserve o .env e o banco. Para instalação nova, use .env.example como referência. Node 24.11+ e pnpm 12.14. API em 4311, web em 4310 e banco local em 55432.
- Apps em apps/api e apps/web; contratos de IA em packages/ai-core. Esquema e migrações em apps/api/prisma. O banco e o histórico de demonstração ficam fora do repositório.
- Aplique as migrações do projeto com pnpm db:migrate. Rode pnpm build, pnpm typecheck e pnpm lint para o escopo alterado. Os testes HTTP de pnpm test precisam da API em execução apontando para um banco de desenvolvimento. Confira os testes opcionais antes de interpretar o total.
- [Status verificado](IMPLEMENTATION_STATUS.md), [roadmap](ROADMAP.md), [prompt mestre](../PROMPT-MESTRE-CLINICAS.txt) e [issues](https://github.com/hayax0/clara-clinicas/issues) complementam este resumo. Ao encerrar cada entrega, registre aqui resultado, validação, limitações e próximo passo.

## Correção da conversa de agendamento — issue 22

A Agenda interpreta DD/MM no calendário da clínica e horas como “às 14” ou “14h”. Após horário passado, guarda o paciente e a hora para aceitar a correção do dia. Durante a marcação, dizer que o paciente ainda não está cadastrado abre a coleta do nome. Testes com as frases dos prints, virada de ano, data inválida e integração HTTP até a consulta gravada. Suíte padrão com 29 aprovados e quatro opcionais omitidos. O fluxo de agendamento continua determinístico.

## Fase 5 — Retornos comerciais, issue 23

Atendimento → Retornos agrupa contatos com data marcada em atrasados (dias anteriores), hoje e próximos, no fuso da clínica. Registrar contato limpa a data e marca Contatado; concluir marca Concluído. Principal e CRM consultam a mesma fila. Remarcação por chat usa nome completo e confirmação explícita. Homônimos devem ser selecionados na interface. A equipe continua responsável pelo contato externo. Teste HTTP validou a passagem de Hoje para Próximos, controle de acesso e rejeição de atualizações desatualizadas. Build da API, typecheck e lint passaram. Suíte padrão com 30 testes aprovados e quatro opcionais omitidos.

## Fase 5 — Campanhas manuais e relatório, issue 24

Atendimento → Campanhas permite criar campanha por origem usando apenas contatos que aceitaram campanhas, mantêm autorização vigente e têm telefone. O Gemini prepara o texto com o objetivo da equipe, sem receber nomes, números nem lista de contatos. Proprietário ou gestor revisa e salva a campanha. A pessoa da equipe abre o WhatsApp com cada contato e confirma manualmente o envio. Cada clique de abertura valida novamente autorização e telefone; registrar o envio também valida e audita no backend. Revogação ou alteração do telefone bloqueia destinatários pendentes. O acompanhamento mostra envios, pendências, bloqueios e ações da fila de retornos no intervalo escolhido. Limite atual: até 5 mil destinatários por campanha e painel de até mil destinatários por campanha. Typecheck, lint, build da API e migração local passaram. A suíte de testes não foi executada nesta entrega. Não houve envio externo.

## Redesign visual editorial do frontend — 24/11/2026

A pedido do proprietário, a interface foi refinada em toda a aplicação para uma direção “rotina clínica editorial”: fundo marfim, superfícies sólidas, verde profundo e terracota, sem glassmorphism nem sombras decorativas. A marca foi simplificada para um monograma C com sinal de cuidado, aplicado no produto e no favicon.

Os estilos em `apps/web/app/editorial-system.css` cobrem landing, autenticação, shell, visão geral, agenda, financeiro, registros e Meu Assistente. A agenda exibe horário e nome primeiro nos cartões curtos. A tela dos agentes preserva os perfis ilustrados e usa cores alinhadas à identidade nova. Implementação visual local; fluxos de negócio não foram alterados.

Verificado com capturas de navegador em 1440 px e 390 px nas telas de landing, início, agenda, financeiro e assistente. Typecheck, lint e build do frontend passaram. Não foram executados testes automatizados; não houve deploy nem publicação.

## Fase 6 — Bloco 4: Relatórios financeiros avançados e exportação CSV (24/11/2026)

Entregue localmente sem necessidade de nova migração de banco (reaproveitando `FinanceEntry`, `FinanceCategory`, `CashClosing`, `Patient` e `Professional` com cálculos em centavos inteiros e respeito ao `organization.timezone`). O Bloco 3 (Comissões) foi dispensado por hora.

- **Backend (`apps/api/src/finance.ts`)**:
  - `GET /api/organizations/:orgId/finance/reports/breakdown?from=YYYY-MM-DD&to=YYYY-MM-DD`: agrega recebimentos liquidados por forma de pagamento (`PIX`, `CARD`, `CASH`, `TRANSFER`, `OTHER`) com percentual, receitas/despesas realizadas por categoria com participação %, faturamento por profissional com quantidade de atendimentos e ticket médio, fluxo diário com indicador de caixa fechado (`CashClosing`) e painel de contas vencidas em aberto (`dueDate < today`) com totais e os 5 maiores títulos em atraso.
  - `GET /api/organizations/:orgId/finance/reports/export.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&type=INCOME|EXPENSE|ALL`: gera download CSV compatível com Excel no Brasil (`text/csv; charset=utf-8`, BOM UTF-8 `\uFEFF`, separador `;`, valores decimais com vírgula e prevenção de CSV injection).
  - **RBAC e isolamento**: `VIEWER` bloqueado com `403`, clínica externa bloqueada com `404`; `STAFF`, `MANAGER` e `OWNER` liberados.
- **Frontend (`apps/web/app/clinica/finance-reports.tsx` e `apps/web/app/clinica/finance.tsx`)**:
  - Nova aba **Relatórios** na navegação do Financeiro (`[Resumo] [Lançamentos] [Pacotes] [Relatórios] [Fechamento de caixa] [Categorias]`) com atalhos rápidos de período ("Este mês", "Mês passado", "Últimos 30 dias"), seletor livre `De`/`Até`, botão de destaque "Exportar CSV", cards de resumo, tabelas de formas de pagamento, categorias, profissionais, painel de vencidos e extrato diário.
- **Assistente de IA (`apps/api/src/ai/assistant-brain.ts` e `apps/api/src/ai/assistant.ts`)**:
  - Ferramenta `finance_month` expandida com agregação por forma de pagamento (incluindo forma mais usada e total no Pix) e contas vencidas a receber/pagar, disponível para o Agente Principal e para o subagente Operações.
- **Validação**: `pnpm db:migrate`, `pnpm build`, `pnpm typecheck`, `pnpm lint` e `pnpm test` (**35 testes aprovados**, 0 falhas, 4 opcionais omitidos), incluindo novo teste de integração HTTP em `apps/api/test/inbox.test.mjs` cobrindo RBAC (`403`), isolamento (`404`), agregações por forma de pagamento/categoria/profissional/fluxo diário/vencidos e formato exato do CSV com BOM UTF-8.
- **Limitações**: exportação CSV limitada a até 5.000 lançamentos por requisição e períodos de até 366 dias; comissões por profissional seguem fora de escopo nesta fase.
- **Próximo passo**: avançar para a **Fase 7 — Implantação e Produção** (implantação assistida, backup/restauração, monitoramento e validação de carga — issue #6).

## Fase 7 — Implantação assistida, Super Admin & Operação em Produção (issue #6, 24/11/2026)

Entregue localmente a fundação operacional da Fase 7 sem expor dados clínicos de pacientes ao Super Admin e sem checkout público (modelo de preço fixo com implantação assistida):

- **Backend (`apps/api/src/organizations.ts` e `apps/api/src/auth.ts`)**:
  - `POST /api/admin/organizations/provision`: provisiona nova clínica e vincula o proprietário como `OWNER` em transação atômica. Se o e-mail já existir, vincula a conta existente; se for novo, cria a conta com senha inicial temporária segura (`scrypt`) e retorna `loginPath` (`/clinica`) para entrega assistida no pós-venda. Registra `AuditEvent` (`organization.provisioned`).
  - `GET /api/admin/organizations`: lista todas as clínicas com data de criação, total de membros, status (`ACTIVE`/`SUSPENDED`), última atividade e consumo mensal de IA.
  - `GET /api/admin/metrics/ai`: consolida chamadas, tokens e custo estimado (USD) por clínica no mês atual e no dia atual, destacando clínicas próximas da cota diária (`GEMINI_DAILY_CALL_LIMIT` / `GEMINI_DAILY_TOKEN_LIMIT`, alerta em ≥ 80%).
  - **RBAC**: todas as rotas `/api/admin/*` exigem `isAdmin = true` (usuários comuns `OWNER`, `STAFF` e `VIEWER` recebem `403`).
- **Frontend (`apps/web/app/clinica/admin.tsx`, `apps/web/app/clinica/clinic-app.tsx` e `apps/web/app/clinica/sections.tsx`)**:
  - Painel **Administração** reestruturado em duas abas: **Clínicas** (botão **"+ Provisionar nova clínica"**, modal de criação, modal de entrega de acesso com cópia rápida para WhatsApp/e-mail, suspensão/reativação e atalho para métricas de IA) e **Monitoramento de IA & Custos** (cards consolidados do mês e tabela por clínica com uso diário vs cota).
- **Scripts operacionais (`scripts/`)**:
  - `scripts/backup-db.sh`: valida conexão PostgreSQL, gera `pg_dump --format=custom` com timestamp e checksum SHA-256 (testado no PostgreSQL local).
  - `scripts/restore-db.sh`: valida checksum SHA-256, testa conexão com o banco de destino e exige confirmação interativa explícita (`RESTAURAR`) antes de executar `pg_restore --single-transaction`.
  - `scripts/health-check.sh`: verifica PostgreSQL, API (`/api/health` na porta 4311) e Web (porta 4310).
- **Validação**: `pnpm db:migrate`, `pnpm build`, `pnpm typecheck`, `pnpm lint` (0 erros, 0 warnings) e `pnpm test` (**36 testes aprovados**, 0 falhas, 4 opcionais omitidos), cobrindo bloqueio `403` de `OWNER`/`STAFF`/`VIEWER` em `/api/admin/*`, provisionamento atômico com usuário novo e existente, login com senha temporária, isolamento entre clínicas provisionadas, listagem enriquecida e métricas de IA.
- **Limitações**: deploy em servidor público, TLS/domínio e agendamento de backup externo (cron/storage remoto) dependem da infraestrutura de produção escolhida na implantação assistida.
- **Próximo passo**: configurar ambiente de produção (domínio HTTPS, variáveis de ambiente, backup agendado) e executar a primeira implantação assistida (issue #6).

## Internacionalização Global — Multi-moeda, i18n & IA Multilíngue (24/11/2026)

Entregue localmente a camada de internacionalização mantendo a mesma base de código e armazenamento em centavos inteiros:

- **Banco de dados e API (`apps/api/prisma/schema.prisma`, migração `20261125000100_i18n_multicurrency`, `organizations.ts`, `auth.ts`, `finance.ts`)**:
  - Adicionados `currency` (default `'BRL'`, suportando `BRL`, `USD`, `EUR`, `GBP`) e `locale` (default `'pt-BR'`, suportando `pt-BR`, `en-US`) ao model `Organization`.
  - `POST /api/organizations`, `PATCH /api/organizations/:orgId` (`OWNER`/`MANAGER`) e `POST /api/admin/organizations/provision` aceitam `currency` e `locale`; `/auth/me`, `/finance/summary` e `/finance/reports/breakdown` retornam `currency` e `locale` da clínica.
- **Frontend (`apps/web/app/i18n/translations.ts`, `data.ts`, `clinic-app.tsx`, `sections.tsx`, `finance.tsx`, `finance-reports.tsx`, `packages.tsx`, `calendar.tsx`, `components.tsx`, `reminders.tsx`)**:
  - Formatadores globais `formatMoney(cents, currency, locale)` e `formatDateLocale(date, timezone, locale, options)` aplicados em Financeiro, Relatórios, Pacotes, Agenda e tabelas de recursos (Serviços).
  - Dicionário leve de tradução `pt-BR`/`en-US` aplicado à navegação principal, status e ações comuns; seletores de **Moeda** e **Idioma** adicionados em **Configurações → Dados da clínica**.
  - Lembretes das próximas 24h (`reminders.tsx`) agora oferecem canais internacionais **WhatsApp**, **SMS (`sms:...`)** e **E-mail (`mailto:...`)**.
- **Assistentes de IA Multilíngues (`apps/api/src/ai/assistant-brain.ts`, `assistant.ts`, `booking.ts`, `appointment-actions.ts`, `chat-date.ts`)**:
  - `organization.locale` e `organization.currency` injetados nas instruções do Gemini 3.8 Flash e na ferramenta `finance_month` (formatando valores em USD/EUR/GBP/BRL e respondendo em inglês quando `en-US`).
  - Agendamento, confirmação/cancelamento e parser de datas/horas (`today`, `tomorrow`, `3pm`, `10:30am`, `schedule`, `book`, `confirm`, `cancel`, `patient`, `yes`) suportam comandos em português e inglês.
- **Validação**: `pnpm db:migrate` (16 migrações aplicadas), `pnpm build`, `pnpm typecheck`, `pnpm lint` (0 erros, 0 warnings) e `pnpm test` (**37 testes aprovados**, 0 falhas, 4 opcionais omitidos), incluindo teste de integração HTTP cobrindo clínica `USD`/`en-US`, `PATCH` de moeda/idioma, relatórios financeiros em dólar, agendamento e confirmação em inglês via chat e isolamento estrito frente a clínica brasileira `BRL`/`pt-BR`.
- **Limitações**: tradução completa de todos os rótulos internos de formulários secundários pode ser ampliada incrementalmente conforme demanda comercial.

### Preparação para Portugal, Espanha e Estados Unidos

O pedido de expansão internacional e a matriz de aceite estão em [Internacionalização global](INTERNACIONALIZACAO_GLOBAL.md). Primeiro bloco local implementado em 25/11: `Organization.countryCode` (`BR`, `PT`, `ES`, `US`), perfis com defaults editáveis em criação e provisionamento, preferência de interface `User.uiLocale` (`pt-BR`/`en-US`) separada do locale padrão da clínica, campos de país nas configurações e primeiros ajustes de formato. O CSV financeiro passou a usar cabeçalhos, moeda, datas, separador e rótulos para `pt-BR`, `pt-PT`, `es-ES` e `en-US`.

Migração `apps/api/prisma/migrations/20261125000200_global_market_profiles` aplicada com sucesso em 25/11/2026 depois de iniciar o serviço PostgreSQL do `compose.yaml`; `pnpm db:generate` também passou. O Docker Compose mantém `softwareparaclinicas-postgres-1` ativo na porta local 55432. Nenhum teste, build, lint ou typecheck foi executado nesta continuação.

## Continuação da internacionalização global — 25/11/2026

Foram iniciados os defaults por mercado na criação/provisionamento da API: BR → `pt-BR`/BRL/São Paulo, PT → `pt-PT`/EUR/Lisboa, ES → `es-ES`/EUR/Madrid e US → `en-US`/USD/Nova Iorque. Os quatro idiomas estão disponíveis para idioma padrão da clínica (IA/CSV); a preferência individual da interface continua limitada a `pt-BR` e `en-US`. Contas em Portugal/Espanha sem preferência explícita recebem a interface em inglês até a tradução nativa completa. Avisos do cadastro/configurações explicam essa distinção.

O calendário passou a escolher domingo para clínicas dos EUA e segunda-feira para os outros mercados; os horários visíveis usam o locale da conta, mantendo os valores do formulário em formato 24h. O parser do chat começou a aceitar datas ISO, a ordem mês/dia para `en-US` e expressões relativas em espanhol. Ações de confirmar/cancelar agendamento começaram a responder e formatar datas no idioma da clínica. A preparação de lembretes agora usa modelos locais por idioma e deixou de fazer uma chamada Gemini determinística.

**Continuação em 25/11 — [issue 25](https://github.com/hayax0/clara-clinicas/issues/25):** respostas determinísticas do assistente para agenda, pacientes, financeiro, tarefas, CRM, serviços e resumo diário agora usam `pt-BR`, `pt-PT`, `es-ES` ou `en-US`. O fluxo de marcação/cadastro do backend passou a localizar perguntas, confirmações, erros de parsing, conflitos, resumo da proposta e sucesso; datas exibem ano completo e horário segue 12h em `en-US`/24h nos restantes locales. Comandos básicos de confirmação/cancelamento e termos de marcação foram ampliados para espanhol e inglês. As respostas FAQ de ajuda para agenda, tarefas, pacientes, CRM, contatos, serviços, acessos, profissionais e unidades também têm variantes `pt-PT`, `es-ES` e `en-US`. A leitura de preço ao cadastrar serviço aceita símbolos/códigos de moeda e separadores decimais comuns nos quatro locales, mantendo o valor persistido em centavos.

**Estado e risco:** não declarar o produto pronto para comercialização global. A interface completa ainda está só em português do Brasil/inglês; erros gerais da API, formulários/endereço/telefone regionais, acessibilidade, revisão nativa e abertura do CSV em planilhas ainda precisam de trabalho. Não foram executados testes, build, lint ou typecheck nesta continuação, conforme o pedido para pausar sem verificações automatizadas. A migração `20261125000200_global_market_profiles` já está aplicada e não deve ser repetida.

**Próximo passo:** traduzir a interface completa e estados de validação para `pt-PT` e `es-ES`, centralizar as strings em catálogo em vez de manter condicionais por tela, e revisar todos os formatos visíveis de exportação/entrada. Depois, conduzir o aceite por país em uma etapa autorizada de verificação.

## Continuação — acesso local e idioma da interface (25/11/2026)

O idioma escolhido na landing agora persiste em `localStorage` (`clara-ui-locale`) e segue para o login, cadastro/configuração inicial e painel. Também há alternância PT/EN na entrada e no cabeçalho autenticado; o login, os formulários iniciais, a administração e a demonstração visual receberam os textos em inglês. Países e moedas nos formulários usam rótulos localizados. Essa correção não conclui toda a internacionalização: textos restantes, erros gerais e cobertura nativa `pt-PT`/`es-ES` continuam na [issue 25](https://github.com/hayax0/clara-clinicas/issues/25).

**Correção importante:** o fato de os e-mails das capturas não existirem no banco local consultado não prova que os cadastros de clínicas estavam ausentes. O mesmo PostgreSQL já continha “clinica do bem” e “Clínica Natural”, ambas com proprietários; “Clínica Natural” também tinha paciente, serviço, profissional e agendamento. A conclusão anterior de que os cadastros não existiam estava errada. O painel Super Admin continua implementado e lista organizações do banco.

Na intervenção anterior foi criada uma conta Super Admin local para o e-mail principal da captura, com preferência `en-US`, e concedido papel `OWNER` à clínica técnica “Clínica demonstração”. A senha temporária foi entregue na conversa e não deve ser guardada no repositório. Nenhuma clínica de cliente foi removida ou recriada. A conta nova é uma alteração local adicional, não recuperação da conta que o proprietário usava antes. Não mexer em outras contas ou vínculos até confirmar o ambiente original.

No login local, “Explorar demonstração local” aparece somente quando `GET /api/auth/demo` confirma que a rota está disponível; a API mantém as verificações de desenvolvimento, host loopback e `CLARA_LOCAL_DEMO=true`. Em produção, a opção não deve aparecer.

**Verificação:** cadastro local, preferência de idioma, promoção de Super Admin e vínculo `OWNER` aplicados no banco; `/clinica` e `/api/auth/demo` responderam HTTP 200. Nenhum teste automatizado, build, lint ou typecheck foi executado nesta continuação. Antes da próxima fase, revisar a cobertura restante da issue 25 e depois retomar a Fase 6 do roadmap.

## Correção da Agenda — erro de `locale` (25/11/2026)

A captura mais recente mostrou `ReferenceError: Cannot access 'locale' before initialization` em `apps/web/app/clinica/calendar.tsx:214`. O `useMemo` de filtragem referenciava `locale` em suas dependências antes de declarar a constante. A declaração foi movida para cima do hook. O servidor Next recompilou depois da correção. Não foram executados testes automatizados, build, lint ou typecheck.

## Continuação — aviso ESLint da landing e divergência entre bancos (25/11/2026)

A captura de `Problems` apontou `react-hooks/set-state-in-effect` em `apps/web/app/landing-content.tsx:299`: a landing lia o idioma do `localStorage` em um `useEffect` e chamava `setLang` sincronamente, provocando um segundo render. A inicialização agora usa `useSyncExternalStore`, com snapshot de servidor em português para hidratação consistente e assinatura das mudanças de idioma no navegador. O evento de alternância atualiza o idioma sem estado sincronizado manualmente em efeito. Verificação focada: `pnpm exec eslint app/landing-content.tsx` terminou com código 0. Não foram executados testes nem build.

O arquivo de resposta do outro agente relata dois clusters PostgreSQL independentes configurados para a mesma porta `55432`: a conta Super Admin original foi criada no PostgreSQL 17 do Homebrew (`/opt/homebrew/var/postgresql@17`), enquanto os dados de clínicas estão no PostgreSQL do Docker Compose. A verificação local da porta confirmou que, neste momento, o listener é o container `softwareparaclinicas-postgres-1`; o app em `localhost:4310` portanto está vendo o banco Docker configurado pelo `.env`. Isso explica a separação entre o acesso antigo e as clínicas, sem indicar que os dados foram apagados. O outro agente relata também um dump temporário anterior à criação da conta e à migração de moeda/idioma; ele não contém a conta original nem substitui backup atual. Nenhum banco foi trocado ou alterado nesta etapa.

**Recuperação de acesso concluída:** mantido o PostgreSQL Docker que contém as clínicas. Foi criado backup privado antes da alteração em `/Users/caiocampos021/.local/share/clara-clinicas/backups/clara-20261125-131534.dump` (diretório `700`, arquivo `600`). O cluster Homebrew foi iniciado temporariamente na porta `55433` apenas para ler o hash da conta Super Admin original e foi encerrado após a cópia. O hash de senha foi aplicado ao usuário de mesmo e-mail já existente no banco Docker; a consulta final confirmou `isAdmin=true`. Nenhuma clínica, paciente, vínculo ou outra conta foi alterada. Não armazenar a senha em documentação. O usuário pode entrar em `http://localhost:4310/clinica` com o e-mail original e a senha habitual e abrir **Administração** na navegação lateral. Ainda falta validar o login visualmente; não executar migrações ou trocar a porta ativa.

### Cadastro local restrito ao desenvolvimento (25/11/2026)

A tela de login já ocultava o link de cadastro fora de `localhost`/`127.0.0.1`, mas `POST /api/auth/register` não tinha uma validação correspondente no backend. Agora a rota de cadastro só aceita requests em ambiente não produtivo, com host de loopback e conexão de loopback; em produção ela responde como indisponível. Provisionamento assistido de clínicas pelo Super Admin continua disponível. A demonstração permanece com a proteção adicional de `CLARA_LOCAL_DEMO=true`, ambiente não produtivo, host local e origem de loopback. Verificação: `pnpm exec eslint src/auth.ts` passou; não foram executados testes nem build.

### Separação da conta Super Admin (25/11/2026)

Pedido do proprietário: a conta `caiocampos1009@gmail.com` é exclusivamente da plataforma; deve abrir o dashboard **Administração**, sem agenda, pacientes, inbox, financeiro, tarefas, configurações da clínica ou botão lateral **Criar clínica**. A criação de novas clínicas deve ocorrer no fluxo **Provisionar uma clínica** do painel Admin. A tela de sessão da API agora não retorna memberships para contas `isAdmin`; o frontend força a vista Admin, mostra apenas a navegação Admin e oculta o criador genérico de clínicas. A interface segue oferecendo idioma e logout na conta Super Admin.

No banco local, a conta tinha exatamente um vínculo `OWNER` com “Clínica demonstração”, adicionado na intervenção anterior. Após backup privado, foi removido somente esse vínculo; nenhuma organização, paciente ou outra membership foi apagada. Consulta final confirmou a conta como `isAdmin` e zero vínculos de clínica. ESLint focado em `apps/api/src/auth.ts` e `apps/web/app/clinica/clinic-app.tsx` passou. Não foram executados testes ou build. Para refletir a sessão sem memberships, recarregar o painel ou sair e entrar novamente.

## Parecer de prontidão para nuvem e implantação clínica (25/11/2026)

**Decisão atual: não publicar esta árvore em produção e não introduzir dados reais de pacientes ainda.** A verificação local encontrou: branch `main` sem commits, sem remote Git configurado e todos os arquivos do projeto ainda não rastreados; `.env` está ignorado corretamente, mas a primeira seleção de arquivos precisa revisão antes do commit. Não há pipeline de CI nem configuração de aplicação para deploy; `compose.yaml` inicia apenas PostgreSQL, a pasta `infra/` está vazia, e domínio/TLS, secrets de produção, banco persistente gerenciado, monitoramento e backup remoto agendado ainda precisam ser definidos.

Há dois clusters PostgreSQL locais independentes que foram usados alternadamente na porta `55432`; a fonte atual dos cadastros é o volume Docker e o serviço Homebrew foi encerrado. Antes de qualquer migração para nuvem, padronizar a fonte, criar backup externo e fazer um ensaio de restauração em staging. As mudanças recentes de sessão Super Admin, cadastro local e isolamento foram verificadas somente com ESLint focalizado; falta rodar lint, typecheck, build e testes em ambiente de teste isolado e fazer login/admin/provisionamento em navegador.

O documento de segurança ainda lista MFA para perfis privilegiados e procedimentos de resposta, retenção e recuperação como pendências. Dados de saúde são sensíveis na LGPD e categoria especial no GDPR; não enviar pacientes reais ao Gemini até confirmar a modalidade/termos contratados e os controles de tratamento. A página de preços do Gemini Developer API diferencia Free (conteúdo pode ser usado para melhoria) e Paid (conteúdo não usado para isso): o nível da chave atual não foi verificado. Rotacionar a senha do Super Admin antes de qualquer implantação porque ela foi compartilhada nesta conversa.

**Próximo passo recomendado:** preparar um ambiente de staging isolado, apontado a um único PostgreSQL vazio; fixar um primeiro commit/remote após revisar secrets e arquivos; provisionar TLS, secrets, backups externos, observabilidade e política de acesso; completar MFA e a revisão de proteção de dados; executar a suíte completa fora do banco usado pelo desenvolvimento; só então fazer um piloto assistido com dados sintéticos ou desidentificados. Iniciar um piloto com dados reais requer a revisão jurídica/contratual e controles específicos para o mercado e provedor de IA.

## Preparação local de staging (25/11/2026)

Para reaproveitar a VPS existente do bot sem ocupar as portas públicas de Nginx, a preparação foi alterada para publicar imagens pequenas por GitHub Actions e entregar somente a porta de loopback da web ao proxy que já existe. Os arquivos atuais são `Dockerfile` multi-stage, `compose.staging.yaml`, `.github/workflows/build-staging-images.yml`, `infra/nginx-clara.example.conf`, `.env.staging.example` e `docs/STAGING_DEPLOY.md`. A imagem Next usa standalone e as imagens API/web são separadas com dependências de produção; o workflow compila para `linux/amd64`. O PostgreSQL usa volume isolado; API e banco não expõem portas públicas. Cadastro e demo ficam desabilitados, com cookies seguros.

Foi movido `prisma` para dependências de runtime para executar migrações com o runtime menor; `@clinicas/ai-core` passou a dependência de desenvolvimento porque a API só usa seus tipos em build. O comando de bootstrap permanece `node dist/create-admin.js`, sem membership clínica. O GitHub Actions compilou e publicou imagens `linux/amd64` de web e API. Os tamanhos locais ARM64 foram 853 MB (API) e 406 MB (web). A VPS baixou as imagens sem token; o Nginx existente continua reservado ao bot.

**Estado atual do staging (25/11/2026):** commit `3d5559a` está em `main`; o workflow [Build staging images](https://github.com/hayax0/clara-clinicas/actions/runs/45644649565) passou e as imagens foram publicadas. O checkout está em `/opt/clara-staging` na VPS `79.182.128.34`. O volume novo `clara_staging_postgres_data` recebeu as 17 migrações; API, PostgreSQL e web estão saudáveis. A web responde HTTP 200 em `127.0.0.1:14310`, e a API responde HTTP 200 em `/api/health`. O `.env.staging` remoto está com modo 600; `.env` e chave Gemini não entraram no Git. Os containers `saas_bot_*` continuam em execução e nenhum vhost Nginx foi alterado.

`app.clara.com` não tem registro A/CNAME. A zona `clara.com` está delegada aos nameservers do Cloudflare, não ao Vercel. O próximo passo depende do proprietário criar um registro A `app` → `79.182.128.34` na zona Cloudflare autoritativa e avisar quando `app.clara.com` resolver. Com proxy Cloudflare ativado, `dig` pode retornar IPs Cloudflare; para emissão inicial do certificado, deixar DNS only e ativar Full (strict) se o proxy for ligado depois. Então criar vhost separado, emitir HTTPS, testar login e criar o primeiro Super Admin. Backup externo/restauração, MFA e revisão de segurança/privacidade continuam pendentes. Não usar pacientes reais; a VPS tinha 5,9 GB livres e cerca de 2,2 GB de memória disponível após iniciar staging.
