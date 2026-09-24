# Login e perfil — preparação da próxima entrega

Implementação local, sem commit ou ativação dos provedores. Incluída nos pacotes 1.4.0/código 14; a assinatura Apple foi preparada com a equipe LCN99JS59U. A ativação de Google/Apple descrita abaixo continua pendente. Consulte [a entrega 1.4.0](versao-1.4.0.md).

## O que foi implementado

- Um formulário compartilhado entre boas-vindas e Conta: login, cadastro, recuperação de senha, mostrar/ocultar senha, autocomplete e gerenciadores de senhas.
- Cadastro por e-mail: nome completo, e-mail, senha e confirmação. Login aceita a senha já existente sem aplicar a política de novas senhas.
- Perfil complementar após entrar: nome completo, telefone e organização, sendo os dois últimos opcionais. Funciona também para contas criadas com provedores sociais.
- `PATCH /account/profile`: identidade exclusivamente do token Firebase validado; não aceita trocar identidade, e-mail ou permissões pelo corpo. A consulta de conta retorna somente o próprio perfil. Migração `0005_account_profiles.sql`, CORS com PATCH, validação no servidor e opção de apagar os campos opcionais.
- Google/Apple web: popup oficial do Firebase. Não há vinculação automática de contas por coincidência de e-mail.
- Android/iOS: biblioteca `@capacitor-firebase/authentication` 8.5.2, interface nativa do provedor e autenticação Firebase JS com a credencial retornada. Apple iOS valida a presença do nonce. Sessão persistente em IndexedDB, sem copiar tokens para armazenamento próprio. Sair limpa a sessão JS mesmo se o logout nativo falhar.
- O plugin nativo só é incluído quando existe o arquivo Firebase daquela plataforma, para evitar crash na inicialização Android sem configuração. `skipNativeAuth: true`; suporte Google habilitado no Gradle; SPM usa somente o trait Google quando configurado. Callback Google preparado no SceneDelegate.
- Apple permanece explicitamente indisponível até `VITE_AUTH_APPLE_ENABLED=true`. Não simular disponibilidade antes da configuração real. Em builds sem plugin, ambos os provedores nativos ficam indisponíveis com explicação e alternativa por e-mail.

## Situação externa verificada em 23/09/2026

Consulta somente de leitura no Firebase `alvoprompt`:

- Apenas aplicativo web registrado; Android e iOS ainda não cadastrados.
- Google habilitado e com client ID.
- Apple marcado como habilitado, mas sem client ID configurado.
- Domínios autorizados: localhost, alvoprompt.firebaseapp.com e alvoprompt.web.app. Falta app.alvoprompter.com.br.

Isso impede afirmar que Google/Apple já funcionam na versão publicada. Nenhuma configuração remota foi alterada nesta rodada.

## Ativação junto da entrega final

1. Firebase Authentication: autorizar `app.alvoprompter.com.br` e os domínios reais de homologação utilizados. Evitar autorizar domínios de terceiros ou previews descartáveis indiscriminadamente.
2. Android: cadastrar `com.alvoprompt.app`, registrar SHA-1 e SHA-256 do certificado de desenvolvimento quando aplicável, do upload e do **App Signing do Google Play**. Obter `google-services.json` e colocá-lo em `android/app/`. Conferir o client OAuth web gerado, necessário ao SDK. O certificado de upload não substitui o certificado que assina o app instalado pelo Play.
3. iOS: cadastrar o bundle ID real do projeto, obter `GoogleService-Info.plist` em `ios/App/App/` e adicioná-lo aos recursos do target App. Adicionar `REVERSED_CLIENT_ID` desse arquivo aos URL Types do target; não inventar o valor. Ativar Sign in with Apple no identificador Apple e no target, com perfil de provisionamento atualizado. O SPM do plugin exige Xcode com Swift 6.1 ou superior.
4. Apple web/Android: configurar Service ID, Team ID, Key ID e chave privada no Firebase. Registrar o callback `https://alvoprompt.firebaseapp.com/__/auth/handler` e o domínio do fluxo. Configurar também o relay de e-mail privado da Apple quando usado. A chave `.p8` fica no provedor, nunca em `VITE_`, no repositório ou na conversa.
5. Só após validar a configuração, habilitar `VITE_AUTH_APPLE_ENABLED=true` nos ambientes web e capacitor. `VITE_AUTH_GOOGLE_ENABLED=false` permite suspender Google em um ambiente sem remover o login por e-mail.
6. Aplicar a migração D1 0005 antes de publicar o servidor e a interface que usam o perfil. Publicar também a página de privacidade atualizada nesta rodada e revisar as declarações de coleta nas lojas para refletir telefone/organização opcionais.
7. Gerar os arquivos nativos com `npm run cap:sync`; conferir plugin, resources, URL Types, entitlement Apple e configuração Firebase em cada plataforma antes do pacote final.

## Verificação pendente com os provedores reais

Em domínio autorizado, Android instalado via Play interno e iPhone real: primeiro cadastro e entrada recorrente por Google/Apple; cancelar o seletor; e-mail privado Apple; conta existente por outro provedor; fechar/reabrir o app; sair; recuperação e confirmação por e-mail. O fluxo de troca de app no Android também deve ser testado após interrupção do processo pelo sistema. Os testes locais usam credenciais simuladas; não substituem essa homologação.

## Referências oficiais

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/apple
- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://github.com/capawesome-team/capacitor-firebase/tree/main/packages/authentication
- https://github.com/capawesome-team/capacitor-firebase/blob/main/packages/authentication/docs/firebase-js-sdk.md
- https://github.com/capawesome-team/capacitor-firebase/blob/main/packages/authentication/docs/setup-google.md
- https://github.com/capawesome-team/capacitor-firebase/blob/main/packages/authentication/docs/setup-apple.md
