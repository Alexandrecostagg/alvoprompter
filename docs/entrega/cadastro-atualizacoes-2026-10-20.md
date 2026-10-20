# Cadastro, exclusão e atualização por loja — 20/10/2026

## Cadastro e acesso

Cadastro inicial curto: nome, e-mail, senha e confirmação, ou login social configurado. Telefone e organização opcionais no perfil. CPF, endereço e dados financeiros somente quando necessários à cobrança, no provedor. Não associar contas automaticamente pela coincidência de e-mail.

Visitante pode escrever, ensaiar e gravar localmente. IA, mídia remota, sincronização, importação remota, B-roll e workspaces exigem autenticação validada no servidor e e-mail confirmado. Perfil e consulta da própria conta permanecem disponíveis para permitir reenviar a confirmação. Verificação de e-mail complementa cotas, limites de tentativas e autorização por usuário.

Google e Apple estão integrados no código. Firebase possui os aplicativos nativos de `com.alvoprompt.app`; SHA-1 do upload e dos certificados públicos de assinatura Play registrados. O titular criou e salvou a chave Apple no Firebase. App ID habilitado, Services ID `com.alvoprompt.web`, Team ID `LCN99JS59U`, domínios `alvoprompt.firebaseapp.com` e `app.alvoprompter.com.br`, retorno `https://alvoprompt.firebaseapp.com/__/auth/handler`. Nenhuma chave privada foi versionada.

A preparação nativa é reproduzível por `npm run native:prepare`: configurações públicas Firebase em `native/firebase-public.json`, versão e build em `native/release.json`. `cap:sync` prepara os recursos antes e depois da sincronização. Nesta entrega, frontend e recursos nativos compilados com `VITE_AUTH_APPLE_ENABLED=true`; novos builds devem preservar essa opção enquanto o provedor estiver habilitado. `xcode` e `simple-plist` são dependências diretas do preparo. O login em aparelhos reais ainda precisa da homologação do titular.

## Exclusão de conta

Conta e assinatura → Excluir minha conta. Exige revisão explícita, palavra EXCLUIR, reautenticação recente e confirmação final. Mostra espaços próprios que serão removidos e o aviso de renovação da Apple quando aplicável. Permite apagar também os arquivos de visitante deste aparelho mediante escolha explícita; a limpeza padrão preserva arquivos locais de outras contas e de visitante.

Pedido durável no D1 e processamento pela fila existente. Cancela renovação Asaas e checkouts pendentes antes da identidade; elimina Firebase, perfil, acessos, dados próprios e recursos KV/R2 identificados. Preserva conteúdo de equipes de outros titulares, removendo o vínculo de autoria. Credencial temporária cifrada com AES-GCM, apagada ao excluir a identidade ou vencer. Falha com credencial vencida solicita nova autenticação. Identificador derivado sem nome/e-mail impede recriação por token antigo.

Recuperação pela fila, consulta do andamento e visitas autenticadas à conta/admin, com cooldown. Não foi criado cron adicional: a conta Cloudflare gratuita já atingiu o limite. Se todas as tentativas da fila esgotarem, uma nova visita autenticada recupera o trabalho; não há promessa de prazo fixo. Sync legado sem vínculo identificável mantém expiração de até 90 dias. Não removemos entradas sem comprovação de propriedade.

Excluir a conta não cancela a renovação da App Store; o usuário recebe orientação e link para gerenciar a assinatura Apple. Registros próprios dos provedores financeiros seguem suas obrigações legais.

## Atualização obrigatória

Migração 0011 cria `app_policy` e auditoria. GET público `/app-policy?platform=ios|android` expõe somente regra da plataforma. Administração exige Firebase verificado e allowlist raiz; PUT exige revisão esperada, versão/build válidos e confirmação de disponibilidade na loja. Auditoria e atualização atômicas; conflito retorna 409.

`NativeUpdateGate` usa o build instalado via Capacitor App. Consulta ao abrir, voltar ao primeiro plano e a cada cinco minutos em primeiro plano. Bloqueia versões abaixo do mínimo com link fixo da loja e nova consulta. Consulta inicial limitada a oito segundos. Sem regra conhecida e sem rede, permite abrir; regra conhecida persiste offline. Corrupção do cache não apaga projetos. Regra recebida durante gravação/edição entra ao sair da tela, preservando o trabalho montado.

Produção segue com mínimo 0/revisão 0 nas duas plataformas. Após cada lançamento, confirmar download efetivo para o público/país correto antes de elevar o mínimo no painel. TestFlight, teste fechado e upload não comprovam disponibilidade pública. Rollback administrativo usa nova revisão e mínimo 0. Builds antigos sem verificador não recebem bloqueio retroativamente. Não existe instalação silenciosa ou descoberta automática de lançamentos nos consoles.

## Validação e publicação

- 311 testes em 36 arquivos aprovados. Cobrem política de atualização, autorização, exclusão, cifra, expiração, recuperação, cancelamento Asaas, isolamento entre equipes/recursos, repetição e limpeza local seletiva. TypeScript app/Workers e builds aprovados. Lint mantém apenas o aviso anterior de Fast Refresh no harness de gravação.
- Revisão visual simulada em 390×844: revisão/volta sem DELETE, confirmação final, acompanhamento e aviso de renovação Apple. Evidências `artifacts/release-1.6.5/delete-review-mobile.png` e `delete-apple-mobile.png`; simulação não comprova comportamento nativo.
- Após autorização específica do titular, criada e excluída uma única conta descartável em produção. Confirmados pedido 202, conclusão da fila, recusa de token antigo com 401 e identidade inexistente no Firebase. Nenhuma conta existente, cobrança ou assinatura utilizada. Credenciais transitórias do teste removidas; relatório `deletion-production-result.json`.
- Migrações 0011 e 0012 aplicadas. Segredo `ACCOUNT_DELETION_KEY` cadastrado. Worker release `1.6.5-account-deletion-20261020`, versão `ffd5b44a-a3f0-4894-bd88-430f4640b46f`. Segredos administrativos, e-mail Resend, Asaas e exclusão conferidos presentes por nome, sem exposição de valores. Scanner final: 430 arquivos, sem correspondências privadas nos padrões examinados.
- Frontend https://0a1ed48e.alvoprompter.pages.dev, produção https://app.alvoprompter.com.br, bundle `/assets/index-BRQJCO_y.js`. Privacidade publicada, Worker `2f0e6136-4529-4e21-b7ad-08779e3f9de0` em https://alvoprompt-privacy.alexandrecostagg.workers.dev.
- Pós-deploy: site atualizado também conferido na sessão administrativa existente, com exclusão disponível sem execução, painel e e-mail/agendamento configurados preservados. A primeira abertura recebeu bundle antigo do cache PWA; recarregamento após atualização do service worker carregou o bundle novo. Site 200, CSP e nosniff; API health 200, Asaas configurado em produção; operações protegidas sem autenticação recusadas. Regras mínimas continuam desligadas. Evidência `artifacts/release-1.6.5/post-deploy.json`.

## Pacotes de teste 1.6.5 (23)

Maior versão previamente conferida nas duas lojas: 1.6.4 (22). Android e Apple compilados separadamente, no máximo dois processos, após limpeza de caches recriáveis; fontes, certificados e archives preservados. Cerca de 8,6 GiB livres após compilação; 7,5 GiB na última conferência. O volume Data continua com pouco espaço, apesar da remoção de caches. Não interrompemos o Quadribox.

- Android: `artifacts/alvoprompter-1.6.5-code23.aab`, SHA-256 `3261bebf424f1d3d0502148ac94dd70e5bf1c91d7822818807a467e5da1e4b74`. Play processou 23 (1.6.5), sem perda de compatibilidade. Aviso de arquivo de desofuscação: projeto usa `minifyEnabled false`. Faixa fechada existente Dia 23 de Setembro 2026, lançamento 9; verificações automáticas concluídas e pacote pronto. A confirmação final de envio fecha o diálogo, mas a console continua em “Mudanças que ainda não foram enviadas para revisão”, inclusive após recarregar, sem erro visível; não há nova submissão na atividade de envio. Tentativas por controles semânticos e clique visível tiveram o mesmo resultado. Diálogo preparado para verificação manual do titular; não afirmar em análise/disponível aos testers. Evidência `artifacts/release-1.6.5/google-review-confirmation-pending.png`.
- Apple: `artifacts/AlvoPrompter-1.6.5-23.xcarchive`, versão/bundle/build conferidos, Firebase incluído e entitlement Sign in with Apple presente. Upload pelo Xcode, método TestFlight Internal Only, confirmado às 16h36 de Belém: App 1.6.5 (23) uploaded. Evidência `artifacts/release-1.6.5/ios-upload-1.6.5-23.png`. App Store Connect confirmou processamento e status **Em testes**, grupo interno **Equipe AlvoPrompter**, expiração em 90 dias. Evidência `artifacts/release-1.6.5/ios-1.6.5-23-testing.png`.

## Cobrança, repasses e homologação restante

Asaas continua na web; iOS usa StoreKit; Android não ganhou cobrança externa dentro do app. Administração e avisos por e-mail da entrega anterior preservados. Não foram criados pagamentos reais nesta rodada. Conferência autenticada no painel aceitou a chave de produção perante o Asaas e retornou conta APPROVED, zero falhas de checkout, e-mail configurado e agendamento ativo. Dois eventos de 16/10 (PAYMENT_CONFIRMED/PAYMENT_RECEIVED) permanecem pendentes: consulta somente de leitura confirmou nenhuma correspondência com assinatura ou checkout deste app. Origem não foi inferida; nenhum plano liberado por associação de cliente e nenhum evento descartado/conciliado à força. Evidências `billing-pending-metadata.json` e `billing-pending-ownership.json` no diretório de artefatos. Primeiro pagamento real próprio e conciliação ainda dependem de compra efetiva pelo titular/cliente.

Decisão do titular: manter repasses Apple na conta C6 Bird (5803), anteriormente conferida Ativa, Brasil/BRL, royalties USD; cobrança web permanece Asaas. Não alteramos bancos. A capacidade geral do C6 para receber câmbio não comprova recebimento individual: primeiro repasse continua sem homologação. Nova conferência autenticada em 20/10 confirmou acordo de apps pagos Ativo (20/10/2026 a 22/08/2027), apps gratuitos Ativo, formulários fiscais Ativos e conta C6 Bird (5803) Ativa. Não há mais pendência de aceite exibida; o agente não aceitou termos. Evidência `apple-business-active.png` no diretório de artefatos.

Ainda requerem aparelhos: login Apple/Google, revogação Apple na exclusão, alto-falante/Bluetooth, gravação/exportação com fala humana, teclado/áreas seguras e atualização obrigatória ao retornar da loja. Pacotes de teste servem para essa homologação; nenhuma submissão pública deve ser inferida.

Fontes oficiais: https://developer.apple.com/app-store/review/guidelines/#login-services ; https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage ; https://developer.apple.com/help/app-store-connect/manage-banking-information/enter-banking-information/ ; https://www.c6bank.com.br/blog/como-funciona-o-cambio-no-c6-bank .

Código funcional e documentação enviados a `origin/main` no commit `512890d`. Pacotes e evidências permanecem locais e ignorados no Git.
