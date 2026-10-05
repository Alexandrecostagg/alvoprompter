# Login e recuperação — 5/10/2026

## Entrega web

- Entrada mais compacta, com marca, exemplo visual de teleprompter e formulário adaptável ao celular.
- Métodos sociais só aparecem quando estão habilitados. Apple continua pendente de configuração; o botão desativado foi retirado.
- Recuperação tem uma etapa própria, mantém o endereço informado, mostra erros do provedor e só confirma a solicitação após a API responder. Reenvio tem intervalo de 60 segundos; falhas não são apresentadas como sucesso.
- “Usar sem conta” substitui “modo local” na entrada, com explicação de armazenamento no dispositivo e ausência de backup/sincronização.

## Diagnóstico remoto

A conta informada pelo titular existe, está ativa, verificada e vinculada a senha no Firebase `alvoprompt`. A proteção contra enumeração de e-mails está habilitada e foi mantida: uma resposta de sucesso da recuperação não prova a existência da conta nem a entrega na caixa postal.

Os domínios `app.alvoprompter.com.br` e `billing-test.alvoprompter.pages.dev` estavam ausentes nos domínios autorizados. Ambos foram adicionados, preservando os existentes. O idioma padrão das notificações foi ajustado para `pt-BR`; o cliente já solicitava esse idioma.

O Firebase recusou a personalização do template de recuperação com `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. A alteração de domínio/idioma foi realizada separadamente e confirmada. Não foi substituído o remetente nem desativada a proteção de contas.

Uma solicitação de recuperação feita pela nova interface para a conta do titular foi aceita pelo Firebase. A entrega depende da confirmação do titular; a consulta automatizada ao Gmail foi bloqueada pela revisão de segurança. Não há evidência suficiente para afirmar a causa da ausência do e-mail. A compra sandbox permanece pendente de autenticação e teste pelo titular.

## Validação

106 testes em 18 arquivos, build TypeScript/Vite e lint aprovados. Inclui propagação de falha de recuperação, normalização do endereço e mensagens de erro contextualizadas. Interface de login e recuperação inspecionada no Chrome, incluindo viewport de 390 px. Não foi alterada a senha do usuário.

As alterações desta entrega são web. Os binários iOS/Android 1.5.0 (15) anteriores não incluem esta revisão visual.

## Publicação

- Produção: https://9413eb0b.alvoprompter.pages.dev (domínio principal https://app.alvoprompter.com.br).
- Testes: https://a0b4139f.alvoprompter.pages.dev (alias https://billing-test.alvoprompter.pages.dev).
