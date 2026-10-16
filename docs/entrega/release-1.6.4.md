# AlvoPrompter 1.6.4 (22) — 16/10/2026

## Código e deploy

- Commit funcional: `cdc5697378c7bcdfefaea369eae4dc4f8049e591`, enviado a `origin/main`.
- App web publicado: https://6936065f.alvoprompter.pages.dev, produção https://app.alvoprompter.com.br.
- API atual: release `1.6.4-billing-production-20261016`, versão Worker `c310e8ea-7cc9-4765-b177-81ba15359847`. Deploy inicial do editor: `6964343f-b1ee-43a8-b761-9192cbcc0f04`.
- Política de privacidade: Worker `cbea0f3c-07c3-4ec5-9508-316023df6c5a`, https://alvoprompt-privacy.alexandrecostagg.workers.dev. Atualizada para transcrição Groq/Cloudflare e armazenamento local de tomadas/edições.
- Deploys com `--keep-vars`; sem exposição de segredos. Token exclusivo do webhook Asaas sincronizado pelo arquivo local ignorado e salvo no painel pelo titular. Asaas configurado em produção; preços e participantes de teste preservados.

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

## Asaas real — configuração ativada

- Titular confirmou salvamento do webhook. Painel conferido: **AlvoPrompter – Produção**, ativo, fila ativa, API v3, envio não sequencial, token mascarado e zero eventos penalizados. Conta com situação cadastral geral aprovada. Outros webhooks preservados.
- Destino: `https://alvoprompt-api.alexandrecostagg.workers.dev/webhooks/asaas`. Eventos selecionados e persistidos: `CHECKOUT_PAID`, `CHECKOUT_CANCELED`, `CHECKOUT_EXPIRED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_INACTIVATED`, `SUBSCRIPTION_DELETED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`.
- `ASAAS_API_BASE=https://api.asaas.com/v3`, selecionando o segredo `ASAAS_PRODUCTION_API_KEY` já cadastrado. Worker publicado com `--keep-vars`: `c310e8ea-7cc9-4765-b177-81ba15359847`.
- Verificação após deploy: health HTTP 200, release `1.6.4-billing-production-20261016`, `billing.configured=true`, `billing.sandbox=false`. Mensagem vazia com token correto HTTP 400 (sem registro financeiro), token incorreto HTTP 401; checkout sem autenticação HTTP 401. Evidência: `artifacts/asaas-production-verification-20261016.json` e `artifacts/asaas-production-active-20261016.png`.
- Credencial local: `.dev.vars.asaas-production`, ignorada pelo Git e com permissão 600. Não versionar nem compartilhar valores.
- Isolamento corrigido no commit `3c176db`: `SUBSCRIPTION_CREATED` exige assinatura exata ou referência de checkout próprio pago; cliente compartilhado não basta. Fluxo legítimo por `payment.checkoutSession` preservado. 271 testes completos aprovados; revalidação de cobrança/checkout com 35 testes, TypeScript Worker e scanner de 399 arquivos aprovados após a troca de configuração.
- Checkout pago e conciliação já verificados no ambiente sandbox isolado em 5/10. Não foi criado checkout, pagamento ou assinatura real neste passo. O indicador de configuração confirma ambiente/segredos presentes; validade da chave perante o Asaas e um pagamento de ponta a ponta em produção ainda não foram exercitados. Primeiro pagamento real deve ser concluído pelo titular/cliente e conciliado com o webhook.
- Preços preservados: Criador R$ 29,90/mês; Studio R$ 79,90/mês. Asaas na web; iOS usa StoreKit; Android ainda sem compra no app. Alteração somente no servidor, sem necessidade de reenviar build 22.

## Pendências de homologação

Alto-falante e Bluetooth em iPhone/Android físicos, teclado/áreas seguras reais e exportação longa com fala humana ainda exigem teste nos aparelhos. Fluxo autenticado de transcrição pelo app atualizado também precisa ser confirmado. O titular autorizou os envios de teste para essa homologação; não houve submissão pública à App Store ou produção Google.
