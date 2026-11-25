# Internacionalização global da Clara

Atualizado em 25/11/2026. Este documento define o escopo para preparar o produto para clínicas no Brasil, Portugal, Espanha e Estados Unidos, mantendo o inglês como idioma internacional disponível. Internacionalização inclui formatos, fluxos e regras locais; trocar apenas os textos não é suficiente.

## Mercados iniciais

| Mercado | Idioma da interface | Moeda padrão | Fuso inicial sugerido | Dados locais a considerar |
| --- | --- | --- | --- | --- |
| Brasil | `pt-BR` | BRL | `America/Sao_Paulo` | telefone `+55`, CEP, estado, CPF/CNPJ apenas quando necessários |
| Portugal | `pt-PT` | EUR | `Europe/Lisbon` | telefone `+351`, código postal, distrito/concelho, NIF quando necessário; Açores e Madeira têm fusos próprios |
| Espanha | `es-ES` | EUR | `Europe/Madrid` | telefone `+34`, código postal, província, NIF/NIE quando necessário; Ilhas Canárias têm fuso próprio |
| Estados Unidos | `en-US` (inglês internacional nesta fase) | USD | escolhido por clínica | telefone `+1`, estado, ZIP code, EIN; não solicitar SSN sem necessidade legal validada |

Esses valores são sugestões iniciais. País, idioma, moeda e fuso precisam ser campos separados: clínicas podem operar em outro fuso, preferir outro idioma ou usar outra moeda. O idioma global da conta também não deve ficar preso ao país da clínica. Para equipes multilíngues, a preferência de interface deve poder ser individual por usuário, enquanto dados e operações continuam no contexto da clínica.

## Detalhes que precisam ser localizados

1. **Todo texto visível**: títulos, botões, caixas de diálogo, menus e seletores, placeholders, dicas, validações, mensagens da API, estados vazios, confirmações, notificações, acessibilidade (`aria-label`), onboarding, administração, ajuda e documentação do produto.
2. **Vocabulário regional**: português do Brasil e de Portugal precisam de revisão própria; espanhol da Espanha não pode cair em português por um `isEn` binário. Padronizar termos de saúde, agenda, pagamento e atendimento com revisão nativa.
3. **Datas e calendário**: exibir conforme o locale; persistir datas/instantes em formato canônico; interpretar datas digitadas no locale e no fuso da clínica; definir primeiro dia da semana, nomes dos meses e horários de verão. A agenda e lembretes devem continuar corretos nas mudanças de DST.
4. **Números e dinheiro**: separadores decimal e de milhar, símbolo e posição da moeda, arredondamento e precisão por moeda. Nunca inferir moeda pelo símbolo `$`; exibir o código ISO em contexto financeiro ambíguo. Não converter moedas automaticamente. Se houver conversão futura, guardar moeda original, taxa, fonte e data da cotação.
5. **Formulários e listas**: telefone, endereço, código postal, identificadores fiscais, máscaras, exemplos, mensagens de erro, filtros de data/valor, ordenação e busca com acentos e regras locais. Não guardar dados fiscais sensíveis sem necessidade definida.
6. **Arquivos e documentos**: CSV, relatórios, nomes de arquivo, cabeçalhos, datas, moeda, PDF e impressão precisam refletir locale e clínica. Testar abertura e reimportação em Excel, Google Sheets e LibreOffice.
7. **Mensagens e integrações**: formatos internacionais E.164, código de país, modelos de lembrete no idioma do paciente, opt-in e revogação, canal disponível em cada região, remetente e regras do provedor. A equipe precisa poder revisar o conteúdo antes do envio manual.
8. **IA**: instruções e exemplos por locale; resposta no idioma do profissional ou preferência de comunicação definida; interpretação de datas e moeda explícita; minimizar dados clínicos enviados; testar nomes, datas ambíguas e linguagem natural regional.
9. **Acessibilidade e interface**: textos maiores, pluralização, expansão de botões/menus, navegação por teclado, foco de diálogos, leitores de tela e aparência em celular. Localizar também mensagens de erro e estados de carregamento, não só a tela principal.
10. **Operação por região**: moeda de cobrança do serviço, emissão fiscal, contratos, retenção e exclusão de dados, hospedagem/região, cópias de segurança, suporte e análise local de privacidade e regras de saúde. LGPD, GDPR e regras aplicáveis nos EUA exigem matriz e revisão profissional por mercado; esta lista não representa certificação ou parecer jurídico.

## CSV financeiro: correção necessária antes de vender fora do Brasil

O export atual é brasileiro: cabeçalhos e estados em português, data `DD/MM/AAAA`, separador `;`, decimal com vírgula e coluna fixa `Valor (R$)`. Também inclui BOM UTF-8 e proteção contra fórmulas em células de texto. Isso pode rotular ou interpretar incorretamente valores de uma clínica configurada com outra moeda/idioma.

Critérios para a versão localizada:

- Cabeçalhos e rótulos no idioma selecionado; coluna identificada com o código da moeda da clínica (por exemplo, `Valor (EUR)`).
- Formato numérico e delimitador coerentes com o locale, com escape correto de aspas, quebras de linha e do delimitador; preservar proteção contra CSV injection.
- Datas legíveis no locale ou ISO `AAAA-MM-DD` consistente, sem datas ambíguas silenciosas.
- BOM UTF-8 para compatibilidade com planilhas; nome do arquivo seguro e previsível; documentar o dialeto exportado.
- Cenários de aceite em BRL/`pt-BR`, EUR/`pt-PT`, EUR/`es-ES` e USD/`en-US`, incluindo acentos, nomes com vírgula/ponto e textos que parecem fórmulas de planilha.

## Situação encontrada no código em 25/11/2026

- A organização agora guarda `countryCode` (`BR`, `PT`, `ES`, `US`) separado de `timezone`, `currency` e `locale`; contas têm `uiLocale` próprio opcional.
- Cadastro e provisionamento usam perfis de país com defaults independentes e editáveis. Os defaults atuais são BR → `pt-BR`/BRL/São Paulo, PT → `pt-PT`/EUR/Lisboa, ES → `es-ES`/EUR/Madrid e US → `en-US`/USD/Nova Iorque. Para clínicas PT/ES, o idioma padrão da IA pode ser nativo, enquanto a interface individual recorre ao inglês até haver cobertura completa.
- A API aceita `pt-BR`, `pt-PT`, `es-ES` e `en-US`; a preferência de interface individual continua limitada a `pt-BR` e `en-US`. Moedas atuais: BRL, USD, EUR e GBP.
- O dicionário central ainda traduz somente navegação, status e ações comuns; várias telas usam texto fixo ou condições binárias português/inglês. Ainda não há cobertura completa `pt-PT` e `es-ES`.
- Os formatadores de datas, percentuais e dinheiro aceitam locale, e entradas monetárias convertem os separadores locais para centavos. Ainda há telas e textos internos que precisam adotar catálogo e formatos por locale.
- A exportação CSV agora escolhe cabeçalhos, status, moeda, datas, separador e decimal para `pt-BR`, `pt-PT`, `es-ES` e `en-US`, mantendo BOM UTF-8 e proteção contra CSV injection. A abertura real em planilhas e a experiência ponta a ponta ainda precisam de validação.
- Respostas determinísticas do assistente para agenda, resumo diário, cadastro/consulta de pacientes, tarefas, oportunidades, serviços e resumo financeiro passaram a considerar os quatro locales. O fluxo de marcação/cadastro também localiza perguntas, confirmações, conflitos e resultado; FAQs de ajuda têm variantes em inglês, espanhol e português europeu.
- Integrações de lembrete oferecem links para WhatsApp, SMS e e-mail; isso não garante normalização correta de números nem disponibilidade/compliance de cada canal em cada país. O texto padrão do lembrete agora é um modelo local por idioma, sem chamada Gemini para essa ação determinística.
- A migração `20261125000200_global_market_profiles` foi aplicada ao PostgreSQL local (25/11/2026). O calendário começa a semana conforme o país (domingo nos EUA, segunda-feira nos demais mercados) e o parser de datas começou a aceitar ordem `MM/DD` para `en-US`, ISO e expressões relativas em espanhol.

**Conclusão atual:** a base por mercado está em andamento, mas a plataforma ainda não está pronta para comercialização global. Respostas determinísticas comuns do chat já usam os quatro locales; a interface continua limitada a português do Brasil e inglês, e mensagens gerais de erro, formulários e fluxos por país ainda precisam de revisão. Não anunciar cobertura comercial completa de PT/ES/US até fechar a sequência e o critério de pronto abaixo. O trabalho restante está acompanhado na [issue 25](https://github.com/hayax0/clara-clinicas/issues/25).

## Sequência recomendada

1. **Perfis de mercado**: adicionar país ISO e defaults sugeridos sem acoplar país a idioma, fuso ou moeda; aplicar no cadastro e provisionamento, permitindo ajustes explícitos.
2. **Catálogo completo de locales**: traduzir as telas ainda disponíveis apenas em `pt-BR`/`en-US`, centralizar todas as strings e pluralizações em catálogo, eliminar condições binárias nas telas e exibir progresso/chaves faltantes no desenvolvimento.
3. **Formatadores e entradas**: centralizar data, hora, número, percentual e moeda; revisar entrada de dinheiro, filtro, agenda, datas por extenso e collation de busca.
4. **CSV e documentos**: implementar dialect por locale e moeda, traduzir rótulos, manter proteção contra fórmula e validar abertura em planilhas.
5. **Contatos e integrações**: validar telefones E.164, idiomas de comunicação e regras/canais disponíveis; manter confirmação humana no envio.
6. **Pacote de aceite por mercado**: executar o fluxo completo de criar clínica, profissional, paciente, agenda, financeiro, exportar e preparar lembrete em cada locale; incluir desktop/mobile, leitor de tela, mudança de DST, permissões, isolamento entre clínicas e consentimento.
7. **Entrada em cada região**: revisar requisitos legais, tributários, contratos, hospedagem e suporte com especialistas locais antes de armazenar dados reais de pacientes.

## Critério de pronto para um mercado

Um país não é considerado pronto só por aparecer no seletor. Todos os fluxos relevantes têm tradução revisada; API, IA, mensagens, datas, números, moeda, CSV e erros usam as configurações corretas; permissões e isolamento permanecem iguais; testes cobrem um percurso de ponta a ponta; e operação e privacidade foram revisadas para aquele mercado.
