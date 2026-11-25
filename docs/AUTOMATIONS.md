# Automações

A Fase 1 organiza os registros que alimentarão as automações. O fluxo de tarefas permite que a equipe registre e acompanhe pendências diretamente.

## Primeiras regras previstas

| Evento | Condição | Ação |
| --- | --- | --- |
| Consulta se aproxima | Compromisso permanece ativo e possui canal autorizado. | Enviar lembrete pelo conector configurado. |
| Compromisso alterado | Horário, cancelamento ou situação mudaram. | Cancelar o envio anterior e recalcular a próxima ação. |
| Oportunidade sem retorno | Prazo da regra comercial expirou. | Criar uma tarefa para a equipe. |

O worker deve receber o identificador da organização e do registro, recarregar o estado atual, verificar a regra e executar com chave de idempotência. Registre estados, cancelamentos e falhas recuperáveis. O agendamento de lembretes e disparos programados usa apenas regras determinísticas.
