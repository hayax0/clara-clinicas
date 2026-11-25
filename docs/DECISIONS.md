# Decisões técnicas

| Decisão | Critério |
| --- | --- |
| Monorepo com web e API separados | Permite trabalhar com contratos de API, desenvolvimento local e regras de negócio centralizadas. |
| PostgreSQL com Prisma | Centraliza estado operacional e permite migrações versionadas. |
| Sessão opaca com digest | Permite revogação no servidor e reduz a exposição do segredo em caso de leitura do banco. |
| Clínica como limite de autorização | Permite à mesma pessoa trabalhar em várias clínicas mantendo o acesso vinculado a cada organização. |
| Agenda com instantes e fuso por clínica | Mantém os horários representáveis de forma consistente entre navegadores e organizações. |
| Gemini como provedor único na versão inicial | Concentra a integração, telemetria e limites no backend. Um contrato interno isola o SDK do orquestrador. |
| Contratos de IA na fundação | Permite definir escopo e ferramentas antes de habilitar o assistente com dados e permissões reais. |
| Financeiro básico manual e matriz de papéis por clínica | Valores em centavos inteiros e datas de caixa (`DATE`) no calendário da clínica. `VIEWER` não acessa dados financeiros. `STAFF` lança, edita em aberto e registra baixas manuais em dias abertos. `MANAGER` e `OWNER` gerenciam categorias, cancelam lançamentos em aberto, conferem/reconciliam baixas e fecham o caixa do dia (bloqueando novas baixas na data). Somente `OWNER` reabre caixa fechado, mediante motivo auditado. Não há integração bancária nem cobrança automática nesta entrega. |
| Pacotes e sessões integrados ao Financeiro | Catálogo (`ServicePackage`), contratação com snapshot de sessões/preço (`PatientPackage`) e histórico auditável de uso/estorno (`PackageSessionUsage`), com chaves estrangeiras compostas por clínica e trava transacional (`FOR UPDATE`) contra consumo acima do saldo. `VIEWER` bloqueado; `STAFF` vincula pacotes (com opção atômica de gerar conta a receber no Financeiro) e registra sessões; `MANAGER` e `OWNER` gerenciam catálogo, estornam sessões e cancelam pacotes. |
