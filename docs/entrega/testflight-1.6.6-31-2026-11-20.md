# TestFlight 1.6.6 (31) — 20/11/2026

Build iOS gerado e enviado com Xcode 26.4 (17E192), usando a assinatura automática existente da equipe LCN99JS59U e bundle ID `com.alvoprompt.app`.

## Conteúdo e validação

Inclui as correções de gravação/compartilhamento e o novo painel Ajustes descritos nos relatórios desta data. A preparação compilou o bundle nativo e sincronizou os sete plugins Capacitor do iOS. O archive Release terminou com `ARCHIVE SUCCEEDED`. A assinatura foi verificada com `codesign --verify --deep --strict` fora do sandbox, com sucesso. Os 55 arquivos web do archive conferem com os hashes do bundle esperado; manifesto de privacidade presente.

Os testes anteriores do código comum passaram: 446 testes em 50 arquivos, TypeScript e build. A validação de câmera, áudio e compartilhamento em iPhone físico ainda deve ser feita com o build instalado pelo TestFlight.

## Numeração e envio

A primeira tentativa, 1.6.5 (30), foi recusada pela validação da Apple porque a versão 1.6.5 já estava aprovada e fechada para novos envios. O archive e o log foram preservados. A versão foi incrementada para **1.6.6 (31)** em `package.json`, lockfile e metadados nativos. O preparo também atualizou os metadados Android no código; os pacotes Android 1.6.5 (30) entregues anteriormente continuam preservados.

O segundo envio terminou em **20/11/2026 às 21:15:48 UTC (18:15:48 em Belém)**, com `Upload succeeded` e `EXPORT SUCCEEDED`. O App Store Connect confirmou o recebimento e iniciou o processamento.

Depois do processamento, a compilação ficou disponível para associação a grupos. As notas em português foram salvas e o build foi vinculado ao grupo interno existente **Equipe AlvoPrompter**, com **1 tester**. A tela final confirmou `1.6.6 (31)`, notas `Salvo` e `Grupo (1): Equipe AlvoPrompter / Interno / 1`. Nenhum grupo externo foi adicionado e não houve envio à revisão pública da App Store.

Página do build: https://appstoreconnect.apple.com/teams/edfbb59a-11c0-4346-af77-6588b90d2ec5/apps/6815460612/testflight/ios/bb5ad56c-fb2d-43cd-8bc6-70791c558dea

Evidências locais, ignoradas pelo Git:

- `artifacts/AlvoPrompter-1.6.6-31.xcarchive`
- `artifacts/release-1.6.6-31/archive.log`
- `artifacts/release-1.6.6-31/upload.log`
- `artifacts/release-1.6.6-31/bundle-verification.json`
- `artifacts/release-1.6.6-31/expected-web-assets.json`
- `artifacts/release-1.6.6-31/test-notes.txt`
- `artifacts/release-1.6.6-31/testflight-confirmacao.jpg`

## Espaço em disco

O volume Data tinha aproximadamente **11 GiB livres** no início. Após os archives e o envio, a medição mostrou **3,8 GiB livres (99% ocupado)**. Foi usada uma tarefa de compilação por vez e reutilizado o cache do primeiro archive no segundo. Nenhuma limpeza ou exclusão manual foi executada nesta etapa; arquivos pessoais, projetos e archives foram preservados.

O aviso de SDK emitido pela Apple não bloqueou o envio: a exigência de iOS 27/Xcode 27 começa em abril de 2027. O build atual usa o SDK iOS 26.4 aceito nesta data.
