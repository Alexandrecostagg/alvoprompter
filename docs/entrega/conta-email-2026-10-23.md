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
