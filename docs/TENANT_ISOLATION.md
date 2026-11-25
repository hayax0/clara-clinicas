# Isolamento entre clínicas

A organização é o limite de acesso dos cadastros, compromissos, tarefas e oportunidades. Uma mesma conta pode possuir vínculo com múltiplas clínicas. A seleção de organização na interface expressa intenção e o backend valida o vínculo autenticado.

## Aplicação no backend

- Resolva identidade e validade da sessão antes da consulta.
- Autorize leitura, escrita e gestão administrativa de acordo com o papel naquele vínculo.
- Escopie buscas e mutações pelo identificador autorizado. Ao vincular dois registros, valide que ambos pertencem à organização.
- Mantenha administração da plataforma separada da autorização para operar a clínica.
- Aplique o mesmo escopo a indicadores, listagens e consultas a registros individuais.

## Perfis

| Perfil | Operação |
| --- | --- |
| Proprietário (`OWNER`) | Lê, grava, atualiza configurações e gerencia a equipe, inclusive gerentes. |
| Gerente (`MANAGER`) | Lê, grava, atualiza configurações e gerencia colaboradores e perfis de leitura. |
| Colaborador (`STAFF`) | Lê e grava registros operacionais. |
| Leitura (`VIEWER`) | Consulta os recursos permitidos. |
| Administração de plataforma | Gerencia o estado das organizações. A operação da clínica requer vínculo próprio. |

Uma clínica suspensa fica indisponível para operações internas. A administração da plataforma mantém acesso à gestão do seu estado.

## Verificação

- Um membro de A acessa os recursos de A conforme seu papel.
- O mesmo membro não lê nem grava em B sem vínculo.
- Uma mutação em A que tenta vincular um identificador de B deve falhar.
- Um membro de leitura deve ter mutações recusadas.
- A suspensão deve ser verificada pelo backend a cada operação protegida.

Em fases futuras, inclua organização e escopo em jobs, memória, cache, métricas de IA e delegações. Cada ferramenta valida a organização novamente antes de consultar ou alterar dados.
