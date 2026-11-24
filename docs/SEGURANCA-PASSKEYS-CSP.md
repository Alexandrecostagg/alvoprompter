# Chaves de acesso e política do navegador

O Worker inicia com `PASSKEY_ENABLED=false`. Antes de ativar em homologação, configure `PASSKEY_RP_ID` e `PASSKEY_ORIGINS` com o domínio e a lista JSON de origens HTTPS exatas. Configure o endpoint correspondente no cliente e valide a identidade da conta de serviço do Firebase indicada no Worker. Use um projeto Firebase de homologação e contas sintéticas.

Teste cadastro após reautenticação, entrada, remoção, recuperação e as permissões do usuário. Em dispositivos nativos, valide as associações do domínio com o ID e a assinatura do app. A CSP inicial é aplicada em modo de observação. Confirme o header no host que serve o HTML e valide os fluxos existentes antes de habilitar bloqueio.
