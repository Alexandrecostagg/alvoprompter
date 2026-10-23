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
