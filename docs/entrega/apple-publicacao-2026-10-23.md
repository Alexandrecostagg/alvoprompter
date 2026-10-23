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
2. Confirmar compra/restauração no TestFlight pelo titular; pergunta enviada. Nenhuma compra criada pelo agente.
3. Adicionar Criador, Studio e grupo à mesma submissão da versão 1.6.5 (26), conferir o conjunto e enviar para revisão após sanar as pendências.
4. Liberação pública está configurada como manual; não foi alterada. Rascunho pronto não equivale a envio ou publicação.

Evidência privada: artifacts/apple-publicacao-20261023/versao-26-pronta-revisao.jpg. O arquivo health.json registra apenas o resultado público do endpoint.
