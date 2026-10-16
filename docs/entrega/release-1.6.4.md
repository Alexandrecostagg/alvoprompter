# AlvoPrompter 1.6.4 (22) — 16/10/2026

## Código e deploy

- Commit funcional: `cdc5697378c7bcdfefaea369eae4dc4f8049e591`, enviado a `origin/main`.
- App web publicado: https://6936065f.alvoprompter.pages.dev, produção https://app.alvoprompter.com.br.
- API: release `1.6.4-editor-20261016`, versão Worker `6964343f-b1ee-43a8-b761-9192cbcc0f04`.
- Política de privacidade: Worker `cbea0f3c-07c3-4ec5-9508-316023df6c5a`, https://alvoprompt-privacy.alexandrecostagg.workers.dev. Atualizada para transcrição Groq/Cloudflare e armazenamento local de tomadas/edições.
- Deploys com `--keep-vars`; sem renovação ou exposição de segredos. Asaas continua em sandbox. Não foram alterados preços ou participantes de teste.

## Melhorias

Tomadas, original, edição, histórico e versões exportadas recuperáveis por conta/workspace no aparelho; lixeira com restauração; erros de armazenamento e nova tentativa; editor em Cortes, Legendas e Visual e áudio; prévia dos cortes com áudio e prévia final renderizada; transcrição Groq por palavra com alternativa Cloudflare; SRT correspondente aos cortes; proteção contra perda de palavras sobrepostas; liberação de captura antes da reprodução; ajustes de foco, teclado e áreas seguras.

## Validação

- 271 testes em 31 arquivos aprovados; tipagem do app/Workers, build web, sincronização nativa, Gradle e archive Xcode aprovados.
- Scanner de segredos: 399 arquivos examinados sem correspondências privadas nos padrões utilizados. Chaves locais e pacotes gerados ignorados no Git.
- Lint mantém um aviso anterior de Fast Refresh no harness local da gravação.
- Testes práticos no navegador: recuperar cortes/configurações/versões após reabrir; armazenamento cheio e nova tentativa; lixeira/restauração; exportação/cancelamento/repetição, incluindo arquivo de 60 s; composição com legendas, logo, abertura e trilha.
- Chamadas reais com as chaves existentes: texto Gemini e Groq, voz Gemini e transcrição Groq, HTTP 200. Teste de transcrição usou áudio sintético em português e preservou as 15 palavras retornadas.
- Pós-deploy: site HTTP 200 com `index-B5dfQO4n.js` do build, CSP e nosniff; health HTTP 200 com a release nova; account/transcribe/chat/media sem token HTTP 401; origem não autorizada HTTP 403, sem permissão CORS; política HTTP 200 com a atualização.
- Evidência de pós-deploy: `artifacts/deploy-verification-20261016.json`.
- Revisão de UX e limites: `audit/bigvu-2026-10-16/ux-final/resultado.html`.

## Android

- Nome da versão `1.6.4`; código `22`. Último pacote recebido na loja antes deste envio: `21 (1.6.3)`.
- AAB: `artifacts/alvoprompter-1.6.4-code22.aab`.
- SHA-256: `6dea1be66aaab38ffed4ad8443eda1f1a8996dc2c6fe745d73fab4882fc89f61`.
- Google aceitou/processou o pacote e confirmou **Alterações em análise** na faixa existente **Dia 23 de Setembro 2026**, lançamento `8`. Verificações rápidas em andamento antes da análise; ainda não afirmar disponível aos testadores.
- Sem perda de compatibilidade indicada. Um aviso: ausência do arquivo de desofuscação; o projeto usa `minifyEnabled false`.
- Comprovante: `artifacts/android-1.6.4-22-in-review.png`.

## Apple

- Archive: `artifacts/AlvoPrompter-1.6.4-22-reviewed.xcarchive`.
- Bundle `com.alvoprompt.app`, versão `1.6.4`, build `22`, confirmados no arquivo e no upload.
- Envio realizado pela interface do **Xcode**, método **TestFlight Internal Only**. Xcode confirmou **App 1.6.4 (22) uploaded**, com conclusão registrada em 16/10 às 11h03, horário de Belém.
- Comprovante: `artifacts/ios-upload-1.6.4-22.png`. Logs de distribuição do Xcode em `App_2026-10-16_10-53-16.275.xcdistributionlogs`, diretório temporário do usuário; não versionar logs que possam conter dados de autenticação.
- App Store Connect confirmou processamento e inclusão no grupo interno **Equipe AlvoPrompter**, com status **Em testes**, 1 tester e validade de 90 dias. Evidência: `artifacts/ios-1.6.4-22-testing.png`.

## Asaas real — pendência retomada

- Health atual: `billing.configured=false`, `billing.sandbox=true`.
- Nomes dos segredos confirmados no Worker, sem ler valores: `ASAAS_PRODUCTION_API_KEY` e `ASAAS_WEBHOOK_TOKEN` presentes; `ASAAS_API_KEY` sandbox ausente no Worker principal.
- Registro anterior confirma checkout sandbox pago, plano ativado, assinatura/cliente vinculados e zero eventos pendentes no ambiente isolado de testes. Não repetir uma cobrança real para diagnosticar configuração.
- Ainda conferir na conta Asaas: aptidão para recebimentos e webhook de produção em `https://alvoprompt-api.alexandrecostagg.workers.dev/webhooks/asaas`, com autenticação correspondente ao segredo e eventos suportados pelo código.
- Sessão autenticada pelo titular; situação cadastral geral, dados e documentos **Aprovados**. Não existia webhook AlvoPrompter. Formulário exclusivo preparado com API v3, envio não sequencial e 11 eventos suportados; aguarda entrada/salvamento do token pelo titular. Ambiente real ainda não ativado; sem cobrança real.
- Revisão removeu associação de `SUBSCRIPTION_CREATED` apenas pelo cliente compartilhado: exige assinatura exata ou referência de checkout próprio pago. Dois testes de regressão adicionados; fluxo real por `payment.checkoutSession` continua aprovado.
- Token de webhook preparado em arquivo local ignorado `.dev.vars.asaas-production`, com permissão 600, e sincronizado no Worker principal. Verificação com mensagem vazia: token correto HTTP 400 (evento inválido, sem gravação), incorreto HTTP 401. Nenhum dado financeiro enviado. Evidência: `artifacts/asaas-auth-check-20261016.json`.
- Correção do backend publicada com `--keep-vars`, versão `bfa56e2f-daaa-47a0-9f39-b7f55b6ffc04` antes da atualização do segredo. Sem nova versão de aplicativo necessária. Health mantém sandbox e cobrança desativada até o webhook ser salvo pelo titular.
- Preços atuais preservados: Criador R$ 29,90/mês; Studio R$ 79,90/mês. Asaas na web; iOS usa StoreKit; Android ainda sem compra no app.

## Pendências de homologação

Alto-falante e Bluetooth em iPhone/Android físicos, teclado/áreas seguras reais e exportação longa com fala humana ainda exigem teste nos aparelhos. Fluxo autenticado de transcrição pelo app atualizado também precisa ser confirmado. O titular autorizou os envios de teste para essa homologação; não houve submissão pública à App Store ou produção Google.
