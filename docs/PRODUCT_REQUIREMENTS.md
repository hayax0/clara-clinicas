# Requisitos do produto

## Modelo de entrega

A venda é por preço fixo. A implantação inclui a configuração inicial e a entrega de acessos à equipe. Checkout, cobrança recorrente e planos de assinatura ficam fora do escopo. O cadastro descrito na fundação é o fluxo de desenvolvimento usado para validar acesso e configuração. O provisionamento comercial é uma entrega da implantação.

## Fundação

| Módulo | Comportamento esperado |
| --- | --- |
| Acesso | Criar conta, iniciar sessão e sair. |
| Clínica | Criar uma organização, selecionar a clínica ativa e editar suas configurações com permissão. |
| Cadastros | Manter unidades, serviços, profissionais, contatos e pacientes. |
| Agenda | Escolher paciente, profissional, serviço, unidade e intervalo. Impedir sobreposição para o mesmo profissional ou paciente e atualizar a situação do compromisso. |
| CRM | Vincular uma oportunidade a um contato da clínica e movê-la pelas etapas do funil. |
| Tarefas | Registrar pendências com prazo opcional e concluir a execução. |
| Dashboard | Exibir contagens calculadas pelo backend a partir dos registros da organização ativa. |
| Equipe | Controlar o acesso à clínica com perfis de acesso. |
| Administração | Administrar o estado das organizações com uma identidade de plataforma autorizada. |

## Critérios de aceite

- Uma pessoa nova cria a conta, configura a clínica e registra um agendamento visível no painel.
- Oportunidades e tarefas mantêm a situação após recarregar a página.
- Um perfil de leitura consegue consultar a clínica autorizada, com gravações recusadas no backend.
- Registros de uma clínica ficam inacessíveis às demais, inclusive pelo acesso direto à API.
- A interface orienta o usuário sobre entradas inválidas e exibe estados de carregamento e ausência de registros.
- A Fase 1 funciona sem credenciais de IA. Os contratos de agente preparam a integração futura com Gemini.

Os testes e o que ainda precisa de validação ficam no [status da implementação](IMPLEMENTATION_STATUS.md).
