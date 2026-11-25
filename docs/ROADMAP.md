# Roadmap

| Fase | Entrega | Evidência de aceite |
| --- | --- | --- |
| 1 | Fundação web, autenticação, clínicas, cadastros, agenda, CRM, tarefas e administração inicial. | Fluxos locais reproduzíveis, verificação de RBAC e isolamento, build e testes. |
| 2 | Agente Principal com Gemini, contexto administrativo autorizado, ferramentas de leitura, monitoramento de uso e aprovações. | Chamadas reais com dados sintéticos, saídas validadas, cotas e funcionamento com IA desabilitada. |
| 3 | Subagentes de Agenda, CRM e Operações. | Delegação limitada, execução rastreável e testes de permissões por ferramenta. |
| 4 | Caixa de entrada, repasse humano e preparação de lembretes para envio manual pela clínica. | Entrega auditável, transferência para humanos e deduplicação de jobs. |
| 5 | Captação, campanhas manuais autorizadas, acompanhamento comercial e relatórios por período. | Origem e conversão rastreáveis, fila de retornos, consentimento revogável, envio manual e acompanhamento de campanhas. |
| 6 | Financeiro básico, comissões e relatórios avançados. | Lançamentos conferíveis e permissões aplicadas a dados financeiros. |
| 7 | Implantação assistida, operação monitorada e produção. | Provisionamento de clínica, entrega de acessos, backups e restauração testados, suporte e validação de carga. |
| 8 | Globalização para Brasil, Portugal, Espanha e Estados Unidos. | Locale por usuário e clínica, país separado de moeda e fuso, interface e IA completas, formatos e CSV corretos, fluxo ponta a ponta aprovado por mercado e revisão operacional local. |

A priorização e a execução seguem o [prompt mestre](../PROMPT-MESTRE-CLINICAS.txt). O estado verificado fica no [status da implementação](IMPLEMENTATION_STATUS.md).
