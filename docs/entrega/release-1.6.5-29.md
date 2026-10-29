# AlvoPrompter 1.6.5 (29) — login Apple no iOS

## Motivo e correção

A Apple rejeitou o build 28 em 29/10/2026 pela diretriz 4.8 (Login Services). O revisor usou iPad Air 11-inch (M3); a captura de Conta e assinatura mostrava Google e não mostrava Apple. Submissão rejeitada: `22ccc1c6-a888-48b1-9b0e-c153a42f3d86`.

O módulo de autenticação efetivamente embarcado no archive 28 retornava `apple: false`: dependia da variável opcional `VITE_AUTH_APPLE_ENABLED`, ausente na geração daquele pacote. A integração nativa e a capacidade Sign in with Apple já existiam.

No iOS, a disponibilidade de Apple passa a ser padrão quando Firebase e o plugin nativo estão presentes. A opção de build continua controlando o login Apple na web e no Android. A mesma correção alcança o formulário compartilhado de entrada/cadastro e Conta e assinatura. Não foram alterados os provedores de IA, os planos ou as cobranças.

O transporte continua solicitando somente nome/e-mail, passando o nonce nativo ao Firebase e recusando credenciais incompletas. Nenhuma validação de identidade foi removida.

## Verificação concluída

- Quatro casos reproduziram a regressão antes da correção; os novos testes passaram depois dela.
- Suíte isolada completa: 437 testes aprovados, sem chamadas de rede. Tipagem aprovada; lint com o aviso preexistente do harness de fluxo.
- Conferência visual do AuthForm real com CSS do build, em 393×852 (iPhone) e 834×1194 (iPad), usando renderização local sem contas. Google e Apple visíveis com o mesmo estilo; entrada e cadastro conferidos. Essa conferência visual não realiza OAuth nativo.
- Scanner de segredos: 464 arquivos, sem correspondências privadas nos padrões examinados.
- Versão comercial 1.6.5 mantida; maior build conferido na Apple era 28. Contador atualizado para 29.
- Build nativo, sincronização iOS e archive Xcode concluídos com um job. Assinatura verificada fora do sandbox: valid on disk / satisfies its Designated Requirement. Permissão assinada `com.apple.developer.applesignin = [Default]` presente.
- Archive confirma bundle `com.alvoprompt.app`, versão 1.6.5 (29), plugin FirebaseAuthentication e provedores Apple/Google. Os 54 arquivos web do archive correspondem por SHA-256 aos arquivos gerados, sem divergências. O módulo compilado contém a condição de ativação Apple no iOS.

Evidências locais ignoradas pelo Git: `artifacts/apple-login-20261029/`. Archive: `artifacts/AlvoPrompter-1.6.5-29.xcarchive`.

Upload oficial concluído em 29/10/2026 às 10h01 (Belém), com `Upload succeeded` e `EXPORT SUCCEEDED`. A interface do TestFlight confirmou 1.6.5 (29) em Processando.

Processamento concluído na mesma manhã. Instruções de teste salvas e build 29 associado ao grupo interno existente Equipe AlvoPrompter, com um tester. Evidência: `artifacts/apple-login-20261029/testflight-29-grupo.png`. Teste real do titular solicitado, ainda pendente.

## Dependência sinalizada pela integração contínua

O CI do commit `02b6689` passou pelas verificações de código e falhou na auditoria de dependências: o alerta [GHSA-gg6h-894w-4m9c](https://github.com/advisories/GHSA-gg6h-894w-4m9c), publicado na base em 28/10, passou a alcançar re2js 2.8.6, transitivo do Firestore. O lockfile foi atualizado somente para re2js 2.9.1, versão fora da faixa afetada. Não há importação de Firestore/re2js no código do app.

Reteste: 437 testes isolados aprovados, novo build Capacitor aprovado e todos os 54 arquivos resultantes idênticos por SHA-256 aos do build 29 enviado. A atualização não exige substituir esse pacote. Auditoria passou com zero alertas altos/críticos; permanecem quatro alertas baixos na cadeia de ferramentas PWA/deepmerge, sem versão corrigida indicada pelo fornecedor. Não se aplicou o downgrade incompatível sugerido por `audit fix --force`.

## Pendências antes do reenvio público

1. No build 29, testar Continuar com Apple na entrada inicial e em Conta e assinatura, incluindo Ocultar meu e-mail quando a Apple oferecer a escolha; fechar e reabrir para conferir a sessão.
2. Selecionar o build 29 e reenviar o app com Criador, Studio e grupo de assinaturas após a validação nativa. A rejeição não foi respondida nem reenviada nesta preparação.

O sucesso do archive e dos testes simulados não comprova, sozinho, a entrada real na Apple ou a aprovação da loja.
