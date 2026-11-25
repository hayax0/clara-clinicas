# Sistema de design

## Identidade da Clara

A interface usa a fonte sem serifa do sistema. A landing usa Georgia em itálico como contraste editorial. A landing e o painel compartilham superfícies neutras quentes, bordas leves e verde para ações e estados selecionados. Os indicadores usam algarismos tabulares para ajudar na leitura. Os controles respeitam a preferência de movimento reduzido.

| Cor | Aplicação |
| --- | --- |
| `#11675F` | Ação principal e ênfase. |
| `#168A80` | Destaques em verde-petróleo. |
| `#E8F5F1` | Fundos suaves de destaque. |
| `#F7FAF9` | Fundo claro da aplicação. |
| `#172B32` | Texto escuro. |

## Padrões da interface

- Use hierarquia visual clara, fundo neutro, superfícies brancas e cor principal concentrada nas ações.
- Mantenha rótulos curtos em PT-BR e use as palavras da rotina da clínica, como Agenda, Pacientes e Tarefas.
- Dê destaque a uma ação principal por tela. Deixe ações menos frequentes próximas ao item a que se referem.
- Inclua rótulo textual em estados importantes. Use a cor como reforço.
- Dê prioridade ao conteúdo essencial em telas estreitas, mantendo formulários e navegação utilizáveis.

## Componentes e estados

| Elemento | Aplicação |
| --- | --- |
| Navegação | Identifica a área ativa e oferece acesso às operações frequentes. |
| Indicador | Mostra uma contagem operacional com rótulo direto e origem real. |
| Formulário | Expõe rótulos, campos obrigatórios, ajuda necessária e erro acionável. |
| Lista | Exibe os dados essenciais e as ações permitidas para cada item. |
| Estado vazio | Informa a ausência de dados e indica o cadastro relevante quando disponível. |
| Confirmação | Diferencia a ação de remoção ou suspensão de uma operação reversível comum. |

## Acessibilidade

Preserve foco visível, navegação por teclado, associação entre os campos e seus rótulos, além de contraste legível. Comunique erros e confirmações em texto. Considere redução de movimento nas transições.
