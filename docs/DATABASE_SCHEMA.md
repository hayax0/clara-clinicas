# Modelo de dados da Fase 1

O [esquema Prisma](../apps/api/prisma/schema.prisma) descreve os nomes físicos, chaves e índices. A [migração inicial](../apps/api/prisma/migrations/20261121000100_clinic_foundation/migration.sql) também declara as restrições de agenda. O diagrama descreve os relacionamentos da aplicação.

~~~mermaid
erDiagram
  USER ||--o{ SESSION : inicia
  USER ||--o{ MEMBERSHIP : possui
  ORGANIZATION ||--o{ MEMBERSHIP : concede
  ORGANIZATION ||--o{ UNIT : possui
  ORGANIZATION ||--o{ SERVICE : oferece
  ORGANIZATION ||--o{ PROFESSIONAL : cadastra
  ORGANIZATION ||--o{ CONTACT : cadastra
  ORGANIZATION ||--o{ PATIENT : cadastra
  ORGANIZATION ||--o{ OPPORTUNITY : acompanha
  ORGANIZATION ||--o{ APPOINTMENT : agenda
  ORGANIZATION ||--o{ TASK : gerencia
  ORGANIZATION ||--o{ AUDIT_EVENT : registra
  CONTACT ||--o{ OPPORTUNITY : origina
  PATIENT ||--o{ APPOINTMENT : participa
  PROFESSIONAL ||--o{ APPOINTMENT : atende
  UNIT ||--o{ APPOINTMENT : recebe
  SERVICE ||--o{ APPOINTMENT : define
~~~

## Regras do domínio

- Contato e paciente têm ciclos próprios. A oportunidade aponta para um contato.
- A agenda registra início e fim e associa os recursos da clínica. O início do intervalo deve ser anterior ao fim. Restrições de exclusão do PostgreSQL impedem sobreposição para o mesmo profissional ou paciente na mesma clínica, inclusive sob concorrência. Compromissos cancelados deixam de bloquear o intervalo. Horários adjacentes são válidos.
- Valores de serviços usam centavos inteiros.
- Chaves estrangeiras compostas protegem os vínculos de oportunidade e agenda dentro da organização. A API também verifica o escopo das referências antes da mutação.
- A sessão tem prazo de validade e armazena o digest do segredo apresentado no cookie.

Conhecimento, memória, aprovações e execução dos agentes serão persistidos quando os respectivos fluxos estiverem disponíveis.
