# Arquitetura

A primeira fase usa um monorepo com pnpm workspaces e Turborepo. A interface Next.js e a API NestJS são executadas separadamente. A interface acessa o prefixo `/api` na mesma origem durante o desenvolvimento. O servidor web encaminha as requisições para a API. O backend persiste os dados no PostgreSQL via Prisma e aplica sessão, contexto de organização, validação e permissões.

| Componente | Responsabilidade |
| --- | --- |
| `apps/web` | Landing page, autenticação, seleção da clínica e fluxo de trabalho da equipe. |
| `apps/api` | Contas, sessões, organizações, administração, regras de negócio e persistência. |
| `packages/ai-core` | Contratos TypeScript para inferência, execução com escopo e uso de ferramentas. |

## Limites de execução

- Web em `http://localhost:4310` e API em `http://localhost:4311` no desenvolvimento.
- A API resolve o ator pela sessão. O identificador da clínica na URL só seleciona uma organização dentro das permissões da sessão.
- O banco guarda registros e relacionamentos com escopo organizacional. Chaves estrangeiras compostas restringem referências à mesma clínica. Restrições de exclusão impedem conflitos simultâneos de paciente e profissional.
- As datas dos compromissos representam instantes. A apresentação deve usar o fuso configurado pela clínica.

## Próximas fases

A Fase 2 acrescenta ao backend o adaptador Gemini, montagem de contexto e execução do Agente Principal. A Fase 3 acrescenta a delegação a subagentes. Filas e workers entram quando as automações e integrações assíncronas exigirem execução persistente.
