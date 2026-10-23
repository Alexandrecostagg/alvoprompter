# Conta, confirmação de e-mail e assinatura — 23/10/2026

## Evidência e limites

O titular enviou capturas do TestFlight mostrando login inicialmente recusado, sessão posteriormente aberta, falha genérica ao consultar a conta, e-mail inicialmente pendente e preços localizados retornados pela App Store. A última tela não mostra o aviso de e-mail pendente, mas mantém Plano não carregado. Isso não comprova compra nem restauração.

A consulta ao cadastro específico foi bloqueada pela revisão automática por envolver dado pessoal presente em imagem. Foi solicitada autorização explícita, ainda pendente. Não acessar esse cadastro por via indireta. Consultas permitidas ao esquema, sem registros pessoais, confirmaram as tabelas usadas na consulta de conta e as migrações até 0012. A 0013 do Google permanece não aplicada; não aplicar no escopo Apple sem necessidade demonstrada. Nenhuma alteração no banco foi realizada.

## Correção já aplicada no Firebase

- Nome público confirmado na interface: AlvoPrompter, substituindo project-780602841031. Esse nome alimenta o marcador APP_NAME dos modelos, inclusive o assunto e a assinatura dos e-mails.
- Tentativa de editar nome do remetente e assunto foi recusada pelo próprio Firebase: atualizações de modelos de e-mail não estão disponíveis para este projeto. Não afirmar que remetente ou texto completo foram salvos.
- Nenhum e-mail real de validação foi disparado pelo agente nesta etapa; a identificação esperada decorre da configuração salva e ainda precisa ser vista em nova mensagem.
- Evidência local privada: artifacts/account-fix-20261023/firebase-nome-publico.png.

## Correções locais de código

- Confirmação de e-mail e consulta do plano tratadas separadamente. Uma indisponibilidade do serviço de conta não apaga a confirmação concluída.
- Ao retornar ao app nativo, recarrega o perfil de autenticação e o token antes da consulta do plano.
- Falha de conta oferece Recarregar plano e preserva arquivos locais.
- Contratação bloqueada enquanto a conta não foi carregada ou a consulta está em falha; não inferir plano grátis diante de erro.
- Reenvio informa que a mensagem é do AlvoPrompter e orienta conferir entrada e spam.

Validação: 366 testes em 41 arquivos aprovados, incluindo quatro casos de confirmação/recuperação. Tipagem aprovada. Lint apenas com aviso preexistente de Fast Refresh no harness. Scanner de segredos: 453 arquivos sem correspondências privadas nos padrões examinados. git diff --check aprovado.

As correções locais ainda não foram publicadas na web nem incorporadas a novo build TestFlight. Nenhuma nova versão foi enviada à revisão nesta etapa. A causa do erro da conta de produção e compra/restauração reais no TestFlight continuam pendentes; não declarar cobrança homologada.

## Diagnóstico autorizado e correção preparada

Após autorização explícita para a conta informada, a consulta do banco e o resultado filtrado do Firebase confirmaram dois UIDs distintos: o registro no banco é de setembro e o cadastro Firebase atual foi criado em 23/10. O registro antigo possui perfil, sem assinatura, checkout, workspace, membro de equipe ou liberação temporária. Não reproduzir dados pessoais/UIDs reais neste documento nem em testes.

O teste de regressão com identidades fictícias reproduziu HTTP 503: o INSERT do UID novo falha no UNIQUE do e-mail legado. O servidor ocultava corretamente o erro interno, mas isso impedia carregar a conta.

Correção preparada:

- Migração 0014 adiciona auth_email e índice de contato não único, copiando o contato atual. Mantém a tabela pai users e todas as chaves, perfis e assinaturas; não reconstrói nem remove users, evitando cascatas de exclusão no D1.
- A coluna email antiga fica como chave legada única; novas linhas usam firebase:UID nessa coluna. O contato real vem do token Firebase assinado e é salvo em auth_email. A sincronização faz upsert exclusivamente pelo UID e nunca vincula perfis por e-mail.
- Administração, avisos e exclusão de conta leem o contato real, com compatibilidade para linhas legadas. Administração passa a distinguir UID e última atividade, evitando confundir registros recriados com registros antigos.
- Testes provam isolamento do perfil, assinatura e workspace antigos, confirmação obrigatória, alteração de e-mail sem transferir identidade, contatos corretos no admin e preservação da migração com e sem esquema Google.
- 372 testes em 42 arquivos aprovados; tipagem, scanner e diff-check aprovados. Lint com o mesmo aviso preexistente. Dry-run do Worker aprovado, 197,75 KiB. RELEASE preparado: 1.6.5-26-account-identity-20261023.
- Ponto de recuperação D1 registrado em artefato privado d1-before-migration.json.

A aplicação da migração foi bloqueada pela revisão automática por falta de autorização específica para alterar produção. Nova pergunta enviada ao titular abrangendo migração 0014 e publicação da API. Não houve migração nem deploy da API nesta etapa. Não contornar a rejeição. A configuração temporária de migração contém somente 0014: não aplicar a 0013 Google no escopo Apple.

Após autorização: aplicar 0014 com a configuração isolada, confirmar o registro da migração, publicar a API e verificar health/RELEASE. O titular poderá fechar e reabrir Conta e assinatura no TestFlight 26 para repetir a consulta. A confirmação autenticada de funcionamento ainda depende dessa nova tentativa; testes locais não comprovam compra na App Store.

## Aplicado em produção após autorização específica

O titular autorizou explicitamente a migração 0014 e a publicação da API. Aplicação concluída em 23/10/2026:

- Apenas 0014 aplicada pela configuração isolada; quatro comandos em 1,10 ms. A migração consta em d1_migrations e a coluna auth_email existe. A 0013 Google não foi aplicada.
- PRAGMA foreign_key_check sem resultados. O registro antigo autorizado mantém o perfil e continua sem assinatura. Nenhuma transferência de titularidade, senha, plano ou cobrança foi realizada.
- Worker publicado: versão 83486c6a-e331-4b39-8fb4-d23fd2197948, release 1.6.5-26-account-identity-20261023.
- /health HTTP 200 confirma release, Apple configurada, Asaas em produção e Google desativado. Esses indicadores não comprovam compra efetiva.
- /account sem login retorna HTTP 401 e mensagem genérica. Preflight com origem capacitor://localhost retorna HTTP 200 e permite somente a origem solicitada autorizada.
- A primeira checagem via Python recebeu HTTP 403; a checagem posterior com curl retornou HTTP 200 e confirmou a versão publicada. Não atribuir esse 403 ao cadastro do usuário.
- Evidências privadas em artifacts/account-fix-20261023/: d1-after-migration.json, health-after-deploy.json, health-headers.txt, account-unauthenticated.json e native-preflight-headers.txt.

Solicitada nova tentativa no próprio TestFlight 1.6.5 (26), fechando/reabrindo Conta e assinatura e atualizando a confirmação de e-mail se necessário. A correção do servidor atende esse build instalado. As melhorias locais da interface e da administração ainda precisam integrar um novo build iOS; nenhum novo pacote foi gerado nesta etapa. Compra/restauração e captura válida da assinatura seguem pendentes de teste no aparelho. Não enviar à revisão enquanto o fluxo de assinatura apresentar falha.

## Retorno do teste no TestFlight

O titular enviou três capturas às 18h36–18h37 de 23/10: a folha nativa da Apple apresenta AlvoPrompter Criador por R$29,90/mês e declara compra de teste sem cobrança; outra imagem mostra Processo completo / compra realizada com sucesso. O painel do app ainda está em Aguarde nas imagens. Isso comprova sucesso na interface da loja, mas não entrega do direito de acesso pelo servidor.

Consulta de diagnóstico autorizada após as capturas confirmou o cadastro do UID atual no banco (correção de identidade em operação). Não havia linha de assinatura nem vínculo apple_subscriptions para essa conta no momento da conferência. Foi perguntado ao titular se, após tocar OK no alerta nativo, o painel mostra Criador, erro ou permanece aguardando. Não ativar plano manualmente para encobrir falha; aguardar esse resultado para distinguir alerta ainda aberto de falha de conclusão/validação.

O preço em dólares nos cartões vem de Product.displayPrice do StoreKit, conforme o código nativo do plugin instalado. A folha de compra está em reais. A documentação técnica oficial dos fornecedores RevenueCat/Purchasely registra essa divergência nos metadados do ambiente TestFlight/sandbox. Não substituir por preço BRL fixo nem afirmar que houve preço real em dólares. Fonte: https://production-docs.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store . A documentação Apple recomenda displayPrice e atualização dos produtos quando muda a storefront: https://developer.apple.com/documentation/storekit/storefront/updates .

Nenhuma nova compra, concessão de acesso, alteração de preços, geração de build ou submissão pública feita nesta conferência. Restauração ainda não comprovada.

## Compra aprovada na Apple, plano ainda gratuito

O titular confirmou que, após OK, o painel continuou no plano Grátis. Diagnóstico restrito à conta autorizada: existe sessão Apple criada às 21:35:48 UTC, mas ainda não há vínculo de transação em apple_subscriptions nem assinatura no momento da leitura. Não afirmar que a cobrança foi homologada.

A tentativa de observar logs gerais de produção foi bloqueada pela revisão automática porque receberia eventos de outros usuários antes de filtrar. Não iniciar esse tail nem contornar a restrição. Em vez disso, foi solicitada uma única restauração na mesma conta, sem nova contratação, e preparados diagnósticos públicos seguros.

Correções desta etapa:

- API distingue, com códigos públicos controlados, erro de credencial, transação ainda não disponível, indisponibilidade e timeout da Apple. Não retorna corpo privado, chave, token, UID ou detalhes do provedor. As mensagens orientam a não comprar novamente. Rejeições de titularidade continuam bloqueadas.
- Cliente preparado para conferir plan/status devolvidos pelo servidor antes de afirmar compra ativa; restauração de direito expirado não informa sucesso. Essa mudança de cliente ainda precisa entrar em novo build iOS, não está no 26 instalado.
- 378 testes em 42 arquivos aprovados, 22 direcionados à compra Apple. Tipagem aprovada; lint com aviso preexistente; scanner de 459 arquivos sem correspondências privadas examinadas.
- API publicada, sem nova migração ou ativação manual: release 1.6.5-26-apple-validation-20261023, Worker 51eaeb3e-7a9a-419e-b486-6fd1bb9c082c. /health HTTP 200 confirma a versão; evidência privada health-apple-validation.json.
- Aguarda mensagem exata de Restaurar compras no aparelho para distinguir validação recusada de transação ausente ou vínculo com outra conta. Não publicar o app na loja antes de comprovar o direito ativo e a restauração.

## Erro de vínculo após restaurar — diagnóstico restrito

O titular enviou captura de 20h25 com Esta compra não pertence à sua conta, conta atual ainda grátis. O erro anterior combinava falhas de bundle, produto, ambiente, decodificação e token da conta. A imagem não prova, sozinha, que existe outro titular.

A API agora distingue APPLE_PURCHASE_DATA_UNCONFIRMED, APPLE_ACCOUNT_TOKEN_MISMATCH, APPLE_ACCOUNT_TOKEN_MISSING e APPLE_STORED_OWNER_CONFLICT, mantendo todas as verificações de titularidade, bundle, produto e ambiente. Não usar Set App Account Token nem transferir uma assinatura para resolver o teste sem prova e autorização específicas.

Diagnóstico temporário preparado/publicado apenas para o hash do UID autorizado, com prazo de 30 minutos e retenção KV de 900 segundos. Guarda somente data, categoria e flags booleanas decoded/tokenPresent/tokenMatches/bundleMatches/environmentMatches/productMatches. Não guarda UID, recibo, JWS, ID da transação, e-mail ou tokens. O filtro é feito na origem; não há tail de logs gerais. A leitura deve ser somente da chave diagnostic:apple:HASH correspondente à conta autorizada, nunca listar ou ler outras chaves.

Worker publicado: e9936ab9-d11e-4db8-b6cb-9f9a7c9fd97e, release 1.6.5-26-apple-match-20261023. Health conferido em health-apple-match.json. A configuração privada temporária está em worker-scoped-diagnostic.toml; flags de seleção não são versionadas. O código normal fica com diagnóstico desativado por padrão e recusa prazo maior que uma hora. Após obter o resultado, publicar com a configuração normal para retirar as flags temporárias.

383 testes em 42 arquivos aprovados, incluindo não capturar outra conta, expiração do diagnóstico, omissão de dados privados e causas distintas sem liberação indevida. Tipagem e scanner aprovados; lint com aviso preexistente.

Solicitada uma nova tentativa de Restaurar compras após o deploy, sem nova contratação, para obter o diagnóstico exato. Não declarar causa específica nem compra/ativação homologada antes dessa evidência.

## Causa confirmada às 23h33 UTC

A tentativa solicitada registrou stored_owner_conflict. Decodificação, presença e correspondência do token da conta, bundle, ambiente e produto retornaram true. A nova captura de 20h33 confirma a mensagem específica de vínculo anterior e o plano Grátis. Portanto, a falha está na titularidade já persistida para a assinatura original no banco; não é falha de credencial da Apple nem divergência do token atual. Isso ainda não identifica a conta anterior nem autoriza transferir o acesso.

O titular autorizou consultar os vínculos de teste. A revisão automática recusou uma consulta limitada a 20 vínculos Sandbox porque poderia abranger pessoas sem relação com essa compra. A consulta não foi executada. Não repetir essa enumeração nem usar logs gerais.

Preparado um diagnóstico adicional, desativado por padrão, com APPLE_DIAGNOSTIC_SANDBOX_BINDING. Exige o mesmo hash de usuário e prazo curto, e só identifica a transação original que já passou nas verificações Apple dessa conta e encontrou conflito no ambiente Sandbox. Não identifica transações Production, não enumera compras e não inclui e-mail, UID, recibo ou token. Retenção de 900 segundos; dados nunca retornam ao cliente. Permite consultar posteriormente uma única linha pela transação exata autorizada. Não transfere vínculo nem ativa plano.

Publicado Worker bd46b149-35e3-477d-8ece-09492046473e, release 1.6.5-26-apple-link-20261023; health confirmado. Configuração privada válida por 30 minutos. 387 testes em 42 arquivos aprovados, tipagem e scanner aprovados; lint com o aviso preexistente. Solicitada restauração dessa compra existente para obter seu identificador exato, sem nova contratação. A conta anterior ainda não foi identificada; nenhuma alteração de titularidade ou assinatura foi feita.

## Vínculo antigo identificado na consulta exata

A tentativa de 23h39 UTC identificou a transação Sandbox específica; consultada somente essa linha, sem enumeração. O vínculo anterior pertence à conta do titular, com plano Criador Apple cancelado e período encerrado em 06/10/2026. Não é uma assinatura ativa de outro cliente. Identificadores e contatos permanecem somente nos artefatos privados.

Preparado SQL condicional para remover exclusivamente esse vínculo apple_subscriptions: exige ID original e UID exatos, ambiente Sandbox e assinatura Apple ainda cancelada com período já encerrado no instante da execução. Não remove users, apple_accounts ou subscriptions; não altera planos, arquivos nem cobranças. Sem a linha antiga, a restauração da conta atual continua sujeita a todas as verificações Apple e à validade do direito de acesso. Script privado release-stale-sandbox-link.sql não executado. Solicitada autorização específica para essa alteração; a autorização anterior era de consulta.

O SQL preparado passou em cinco cenários locais: remove o vínculo de teste cancelado e vencido; preserva assinatura ativa, período futuro, ambiente Production e outra transação. A linha subscriptions foi preservada em todos os casos. Captura temporária desativada após o diagnóstico pelo deploy normal c9eec7d5-ed97-43b5-bfd8-7439312707aa, sem as três flags de seleção.

## Remoção autorizada e aplicada

O titular autorizou explicitamente remover o vínculo de teste cancelado. Registrado novo ponto de recuperação D1 no artefato privado d1-before-stale-link-release.json; executado o SQL condicional preparado, sem modificar plano, cobrança ou cadastro.

O CLI terminou com código zero, mas sua saída não foi interpretável como JSON pelo wrapper. A operação não foi repetida: feita consulta exata de estado, que confirmou stale_link_count=0, prior_user_count=1 e a assinatura Apple anterior ainda Criador/canceled, com o mesmo encerramento de 06/10/2026. Evidência privada stale-link-status.json. Assim, a remoção do vínculo foi confirmada por leitura posterior e a assinatura cancelada permaneceu intacta.

Solicitada restauração da compra existente na conta atual pelo TestFlight. Não foi criado direito pago manualmente. A ativação e a restauração ainda dependem da validação Apple e da confirmação do teste no aparelho; não declarar assinatura homologada nem enviar a versão à revisão pública antes disso.
