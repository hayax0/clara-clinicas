# Segurança

## Fundação

- As senhas são derivadas com scrypt e salt individual. O login aplica limite de tentativas em memória na fase local.
- A sessão usa token opaco e revogável, enviado por cookie HttpOnly e SameSite Lax. O banco guarda o digest e a validade, com revogação após a saída.
- A API resolve o acesso com vínculo e papel por organização, inclusive para registros associados em uma mutação.
- As rotas administrativas exigem identidade de plataforma autorizada.
- O frontend não recebe chaves de fornecedores nem credenciais do banco.
- Dê preferência a mensagens de erro acionáveis para o usuário e a eventos técnicos sem senhas, tokens ou conteúdo sensível.

## Operação

Use TLS em produção e configure os cookies para o ambiente de implantação. Restrinja credenciais e acesso ao banco. A entrada em produção com dados reais deve ter controles e políticas de retenção, auditoria, backups e restauração verificados. MFA para perfis privilegiados e monitoramento operacional estão na trilha de produção.

## IA

O backend autentica e autoriza a operação proposta antes da execução de ferramentas. A política de dados precisa impedir conteúdo proibido no payload de saída. A avaliação de uso comercial e de dados reais antecede a habilitação da integração em produção. [Termos da Gemini API](https://aistudio.google.com/docs/terms)
