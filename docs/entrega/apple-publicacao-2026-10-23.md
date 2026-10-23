# Apple — preparação da publicação em 23/10/2026

O titular autorizou concluir e enviar somente a versão Apple por enquanto. Google Play permanece aguardando suporte; nenhuma configuração Google/Asaas foi alterada nesta etapa.

## Conferido

- API pública: Asaas configurado em produção; Apple configurada; Google desativado. Flag de configuração não comprova compra efetiva.
- Testes direcionados de compra Apple, restauração, validação e disponibilidade: 20 testes em 3 arquivos aprovados.
- App Store Connect autenticado pelo titular. Grupo de assinaturas AlvoPrompter Planos, ID 22442631, com Studio no nível 1 e Criador no nível 2.
- IDs dos produtos coincidem com app/servidor: com.alvoprompt.app.creator.monthly e com.alvoprompt.app.studio.monthly. Duração mensal, todos os países selecionados, localizações português e inglês e notas de revisão presentes.
- Preços brasileiros atuais lidos na interface: Criador R$29,90/mês; Studio R$79,90/mês. Nenhum preço, banco ou contrato alterado.
- Ambos os produtos estão em Preparar para envio e sem captura de revisão. A validação do Criador retornou: É necessário adicionar uma captura de tela com as informações de revisão. Não foram enviados produtos incompletos.
- Ficha pública estava com build 24. Substituído pelo build 26, versão 1.6.5, e salvo.
- Ação Adicionar para revisão da versão aceita: app 1.6.5 (26) agora Pronto para revisão em um rascunho de envio. O painel do rascunho contém somente o app. Enviar para revisão ainda não acionado, pois as assinaturas precisam compor o mesmo primeiro envio.
- Galeria anterior presente (3 imagens iPhone herdadas); novas artes da entrega anterior não foram reapresentadas nesta etapa. Não há afirmação de galeria nova aprovada.

## Pendências concretas

1. Obter captura real da tela de planos do TestFlight, mostrando o(s) plano(s) e o fluxo App Store, para anexar às informações de revisão de cada assinatura. Não usar mockup como prova de captura nativa.
2. Restauração Criador confirmada pelo titular e no servidor às 20h44 de 23/10: ativo, limite de 100 usos de IA e vínculo único na conta atual, em Sandbox. Studio e eventos de renovação/reembolso não foram homologados por esse teste. Nenhuma compra criada pelo agente.
3. Adicionar Criador, Studio e grupo à mesma submissão da versão 1.6.5 (26), conferir o conjunto e enviar para revisão após sanar as pendências.
4. Liberação pública está configurada como manual; não foi alterada. Rascunho pronto não equivale a envio ou publicação.

Evidência privada: artifacts/apple-publicacao-20261023/versao-26-pronta-revisao.jpg. O arquivo health.json registra apenas o resultado público do endpoint.

## Atualização após teste de restauração

O bloqueio da compra Criador foi diagnosticado e resolvido: a transação de teste mantinha um vínculo local com a conta do titular já cancelada e vencida. Consulta e remoção estritamente desse vínculo foram autorizadas separadamente. A restauração posterior criou o direito ativo pela validação Apple, sem concessão manual. Registro detalhado em conta-email-2026-10-23.md.

Antes do envio final, incorporar as correções recentes do cliente ao próximo build: consulta de conta com recuperação explícita, atualização da confirmação de e-mail ao retomar o app e proibição de informar ativação quando o servidor retorna direito expirado. O rascunho com build 26 ainda não é a entrega final dessas correções. Assinaturas e capturas de revisão seguem pendentes de conferência na sessão autenticada da Apple.

## Build corrigido enviado

Gerado archive 1.6.5 (27), com assinatura validada e os 53 arquivos de interface conferidos contra o build web. Xcode confirmou Upload succeeded / EXPORT SUCCEEDED às 20h51 de 23/10 (Belém). A Apple informou pacote em processamento; não houve associação ao grupo ou substituição do build no rascunho enquanto a sessão do navegador permanece expirada. O titular foi avisado para entrar na aba App Store Connect. Não houve envio público. Instruções do teste e evidências em release-1.6.5-27.md.
