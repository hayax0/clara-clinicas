# Arquitetura de IA

A Fase 1 define os contratos em [@clinicas/ai-core](../packages/ai-core/src/index.ts). O estado inicial disponível no pacote é `unavailable/not_implemented`. Os módulos operacionais seguem o fluxo normal nesse estado.

## Meu Assistente

1. O backend autentica o ator e confirma o vínculo com a clínica e o papel de proprietário, gestor ou equipe.
2. O chat interpreta perguntas administrativas em português localmente e as associa a consultas predefinidas. O Gemini recebe uma instrução fixa sobre a categoria reconhecida ou sinais administrativos predefinidos para interpretar variações. Identificadores, nomes, registros, totais e texto digitado ficam fora dessa chamada.
3. O Agente Principal propõe uma ferramenta por saída estruturada. O backend aceita somente a ferramenta solicitada e sem parâmetros, verifica novamente o acesso e executa a consulta.
4. A ferramenta de indicadores fica com o Agente Principal. Agenda, CRM e Operações recebem as consultas de suas áreas. Cada execução tem uma delegação de leitura. O chat guarda o histórico por clínica, usuário e ajudante no PostgreSQL e mostra as últimas 30 interações dessa conversa.
5. A resposta exibida combina a consulta aprovada com totais calculados no próprio backend.

## Conversa, memória e tarefas

O chat responde a dúvidas sobre o uso da Clara e acompanha perguntas curtas sobre a última consulta. Preferências enviadas com um pedido explícito para lembrar são guardadas no PostgreSQL por clínica e usuário, com recuperação em qualquer ajudante daquela conta. A interface orienta a limitar a memória a preferências de trabalho. O Resumo do dia respeita o nível de detalhe pedido na mensagem atual. A preferência salva se aplica quando a mensagem não especifica o formato. O assunto anterior é reutilizado numa continuação como “mais curto”.

Principal e Operações podem preparar uma nova tarefa. A proposta expira em 15 minutos e exige confirmação na mesma conversa. A operação valida a autorização novamente e grava a tarefa, a auditoria e a resposta do chat na mesma transação. Dúvidas de uso, memória e criação confirmada funcionam localmente. Consultas assistidas continuam usando somente categorias predefinidas na chamada ao Gemini.

## Resumo do dia

O Agente Principal reúne horários de hoje a confirmar, oportunidades abertas e tarefas pendentes. A resposta traz os totais e até três exemplos por área. Os horários usam o fuso cadastrado na clínica. O backend consulta os registros em uma leitura consistente e salva a resposta no histórico, sem enviar horários, títulos ou totais ao Gemini.

## Cotas e custos

A reserva transacional no PostgreSQL serializa o consumo por clínica. Os limites padrão são 60 chamadas e 60 mil tokens por dia UTC. Configure `GEMINI_DAILY_CALL_LIMIT` e `GEMINI_DAILY_TOKEN_LIMIT` no backend. A execução reserva até três tentativas e 3.072 tokens. A conciliação reduz a reserva quando o consumo está disponível e houve uma tentativa. Com retentativas ou métricas ausentes, a reserva de tokens permanece conservadora.

A trilha interna registra agente, ferramenta, estado, modelo, latência e contagens fornecidas pela API. O custo é uma estimativa da tarifa padrão paga quando o modelo e o consumo são conhecidos, incluindo tokens de raciocínio e desconto de cache quando aplicável. [Preços da Gemini API](https://aistudio.google.com/docs/pricing)

## Adaptador Gemini

O backend registra um provedor interno com `@google/genai`. O modelo padrão atual é `gemini-3.8-flash` (tanto para o nível padrão quanto avançado). As variáveis `GEMINI_MODEL_STANDARD` e `GEMINI_MODEL_ADVANCED` permitem trocar os IDs no backend. [Flash](https://aistudio.google.com/docs/models/gemini-3.8-flash) · [Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)

O adaptador gera texto ou JSON e devolve latência, modelo e contagens de tokens fornecidas pela API. Aplica até três tentativas, com até oito segundos por chamada e prazo total de até 30 segundos. O prazo solicitado pode reduzir esse limite. A espera entre tentativas respeita `Retry-After` e `RetryInfo` quando informados. Erros permanentes encerram a execução com uma classificação genérica.

Sem `GEMINI_API_KEY`, o adaptador retorna `unavailable/missing_configuration`. Os módulos operacionais funcionam normalmente.

Depois de colocar a chave no `.env` local, compile o backend e execute `pnpm --filter @clinicas/api ai:smoke`. Esse comando envia somente uma instrução sintética e registra modelo e latência em caso de sucesso.

## Tratamento de dados

O assistente atua em rotinas administrativas e comerciais. Encaminhe questões clínicas para atendimento humano. Qualquer envio de dados reais de pacientes depende de avaliação técnica e jurídica da finalidade, condições de tratamento e plano contratado. Use dados sintéticos ou efetivamente anonimizados durante a validação. O fluxo atual envia somente instruções fixas e sinais administrativos predefinidos. O chat aceita texto para perguntas administrativas cobertas pelas ferramentas. A única escrita operacional habilitada é a criação de tarefa com confirmação. Questões clínicas recebem orientação para o atendimento adequado. [Termos da Gemini API](https://aistudio.google.com/docs/terms)
