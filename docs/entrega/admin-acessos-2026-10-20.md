# Administração de acessos e cobrança — 20/10/2026

## Fluxo implementado

1. Pessoa cria e confirma a conta, escolhe Criador ou Studio e solicita acesso temporário. A solicitação não inicia checkout nem concede benefícios.
2. O administrador geral consulta Conta e assinatura → Abrir administração, busca a pessoa e revisa plano, prazo e motivo antes de confirmar.
3. O servidor concede benefícios até o instante indicado. A assinatura paga permanece separada; a cortesia nunca reduz ou cancela um contrato válido.
4. Uma mensagem persistente na fila existente acompanha cada revisão da liberação. A fila permite atraso máximo de 24 horas, então períodos longos reagendam a próxima verificação diariamente. Não depende de login do usuário ou de painel aberto.
5. Avisos persistidos no painel e enviados via Resend: solicitação nova, 3 dias antes do vencimento e no vencimento. Liberações mais curtas geram o aviso de proximidade imediatamente. Repetições da fila usam a mesma chave de idempotência; uma revisão antiga não encerra a nova liberação.
6. Ao vencer, o servidor aplica o plano gratuito ou a assinatura válida, mesmo se o agendamento falhar. O administrador pode prorrogar, trocar o plano temporário, encerrar ou indicar um plano para assinatura.
7. Indicar assinatura encerra a cortesia e registra o plano sugerido. O usuário deve confirmar a contratação no canal permitido. O administrador não debita cartões, não inicia recorrência e não cancela contratos ao editar uma cortesia.

## Segurança e dados

Administrador geral definido por UID Firebase em `ADMIN_USER_IDS`, somente com e-mail verificado. Administrador de workspace não recebe poder sobre cobrança ou usuários de outras equipes. Rotas protegidas no servidor, entradas validadas, busca paginada e auditoria transacional de ator, alvo, motivo, antes/depois e horário. Revisão esperada impede sobrescrever alterações concorrentes. Sem remoção de roteiros ao expirar.

Migração aditiva `0010_admin_access.sql` aplicada no D1 principal; tabelas de solicitações, liberações, histórico e notificações. Não concede acesso a clientes existentes. Os segredos de envio e UID administrativo ficam no Worker e no arquivo local ignorado `.dev.vars.admin-mail`, nunca no app.

Resend: remetente `AlvoPrompter <avisos@mail.alvorecerstudio.com.br>`, domínio confirmado como verificado na conta do titular. Chave exclusiva, somente envio e restrita a esse domínio, criada e copiada pelo titular. Destinatário administrativo configurado no servidor, não aceito do cliente.

Falha no agendamento deixa a liberação marcada como pendente e emite aviso; reabrir/atualizar o painel tenta recuperar. Falhas permanentes de infraestrutura exigem intervenção. Estado de e-mail "enviado ao provedor" significa aceite da API, não confirmação de leitura/entrega na caixa.

## Revisão da cobrança

Asaas de produção configurado. Nenhuma falha de checkout registrada no D1 na revisão inicial. Dois eventos de pagamento pendentes, de 16/10, não indicam checkout do aplicativo; preservados para investigação, sem atrelar cliente ou cobrança por suposição. Endpoint administrativo de diagnóstico consulta somente `GET /myAccount/status`, retorna indicadores permitidos e não cria cobrança.

Adicionada reserva atômica de intenção antes da chamada ao Asaas: dois pedidos simultâneos de checkout criam somente uma intenção/contrato. Resultado incerto do provedor bloqueia nova tentativa por até o prazo de validade do checkout (1 hora), evitando cobrança duplicada.

Web: Asaas. iOS: StoreKit com restauração/gerenciamento Apple. Android: sem compra até homologação Google Play Billing; não direcionar para Asaas dentro do app. Liberação por cortesia não se transforma automaticamente em compra em qualquer plataforma.

## Validação e limites

284 testes em 32 arquivos aprovados; TypeScript app/Workers e build web aprovados. Lint apenas com aviso anterior do harness de gravação. Scanner de 405 arquivos sem correspondências privadas nos padrões examinados.

Testes novos: acesso anônimo/comum/admin de equipe negado; solicitação sem liberação/cobrança; verificação de e-mail; datas inválidas; limite mensal efetivo; expiração exata; assinatura paga preservada; concorrência de revisão; rollback; avisos antes/no vencimento; timer antigo após prorrogação; recuperação de fila indisponível; destinatário fixo; deduplicação de e-mail; checkout concorrente; diagnóstico Asaas estritamente de leitura, sem dados privados do provedor na resposta.

Prévia local usa o componente real com dados fictícios e transporte isolado. Testados liberação/revisão/confirmar, notificações e formulário com 390 px sem rolagem horizontal. Capturas desta revisão: `artifacts/billing-admin-20261020/`. Sem envio de dados fictícios ou cobrança real em produção.

A interface nova exige um próximo build nativo. O build 1.6.4 (22) enviado anteriormente não contém os controles novos; a aplicação web administrativa pode ser usada independentemente. Não reenviar build 22. Homologação física de gravação e compras Apple continua necessária antes de publicação pública.

## Publicação e verificação de 20/10

- Commit funcional: `52fc0ba`, enviado a `origin/main`.
- Worker: release `1.6.4-admin-access-20261020`, versão `8513004d-c606-4e34-a386-453ca14fa810`.
- Pages: https://cdb66ebc.alvoprompter.pages.dev; domínio https://app.alvoprompter.com.br.
- Health HTTP 200: Asaas configurado em produção, e-mail administrativo e fila configurados. Rotas `/admin/overview`, `/admin/billing-status` e `/account` sem token retornam 401; origem não autorizada retorna 403.
- E-mail real enviado ao titular usando a função `sendAdminEmail` compilada do código do Worker, com armazenamento de validação local. Resend confirmou **delivered**, e o titular enviou imagem da mensagem na caixa de entrada. Isso valida a chave, o remetente e o envio; não equivale a testar um vencimento futuro pela fila em produção. Timer, idempotência e recuperação foram testados automaticamente com relógio controlado.
- Sessão autenticada da conta administrativa ainda pendente no Chrome: a janela Google ficou branca e o app continuou sem login. Não foi contornado o login, extraído token de sessão ou concedido acesso real a outras pessoas para testar. A consulta autenticada `Verificar conexão Asaas sem cobrar` e a tela do painel com dados reais aguardam essa sessão. A saúde pública informa presença das credenciais, não aceite da chave pelo Asaas.

## Evidências da revisão de fluxo

1. Conta e planos publicados: tela acessível, preços e recorrência descritos; login necessário para operações administrativas. Captura `01-conta-atual.png`.
2. Administração de cortesia: componente real verificado em prévia local com dados fictícios. Revisão explícita antes de confirmar; formulário focado/rolado até a edição. Capturas `02-admin-desktop.png`, `03-revisao-liberacao.png`, `04-admin-mobile.png`. Em 390 px, largura do documento igual à janela, sem rolagem horizontal. Contraste, leitores de tela e teclado móvel físico não foram certificados.
3. Aviso de vencimento: central e estado de envio visíveis na prévia; expiração exata e supressão de timers antigos cobertas pelos testes.
4. E-mail: entrega real confirmada pelo Resend e pela imagem do titular; captura `05-email-delivered.png` e `06-email-na-caixa.png`.
5. Diagnóstico autenticado Asaas e administração com dados reais: pendentes do login do titular no aplicativo. Não houve compra, débito ou troca de contrato durante a verificação.

Referências consultadas: [Asaas — situação da conta](https://docs.asaas.com/reference/consultar-situacao-cadastral-da-conta), [Cloudflare — atraso e reenvio de mensagens](https://developers.cloudflare.com/queues/configuration/batching-retries/), [Resend — idempotência](https://resend.com/changelog/idempotency-keys), [Apple — compras e assinaturas](https://developer.apple.com/app-store/review/guidelines/), [Google Play — política de pagamentos](https://support.google.com/googleplay/android-developer/answer/10281818?hl=pt-BR).
