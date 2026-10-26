# Apple — preparação da publicação em 23/10/2026

O titular autorizou concluir e enviar somente a versão Apple por enquanto. Google Play permanece aguardando suporte; nenhuma configuração Google/Asaas foi alterada nesta etapa.

**Situação atual — 26/10/2026: rejeitado por falta do link EULA na descrição; link corrigido e salvo. Rascunho Pronto para revisão, ainda não reenviado, durante a revisão de privacidade solicitada pelo titular.** A submissão reúne a versão 1.6.5 (27), Criador Mensal, Studio Mensal e o grupo AlvoPrompter Planos. Os registros abaixo são cronológicos; as pendências iniciais de capturas e inclusão dos produtos foram concluídas na atualização final.

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

## Conferência autenticada em 24/10

- Build 27 processado. Instruções de teste salvas e associação concluída ao grupo interno Equipe AlvoPrompter, com um tester. A tabela de Compilações do grupo confirma Em testes. Evidência privada testflight-27-em-testes.png em artifacts/apple-publicacao-20261024/.
- O titular atualizou o TestFlight, restaurou a compra e confirmou que Criador permaneceu após fechar/reabrir o app. Não foi solicitada nova compra.
- O item com build 26 foi retirado do rascunho anterior, e a seleção do 27 foi aplicada e salva na ficha da versão. Não foram alteradas nem copiadas as credenciais de revisão.
- Galeria iPhone atualizada com cinco JPEGs reais de marketing da interface, em 1206×2622: início, IA, editor, prompter e ajustes, nesta ordem. Miniaturas visíveis sem alertas vermelhos. As três associações antigas no formato Face ID grande foram retiradas; os arquivos permanecem na Biblioteca de Ativos. A área opcional confirma que herda as cinco imagens atuais. Evidência privada galeria-iphone-atualizada.png.
- Duas imagens de iPad 2732×2048 enviadas e associação antiga retirada, preservando sua cópia na biblioteca. Após reabrir a página, ambas as miniaturas foram conferidas renderizadas sem alertas: início e editor. A primeira observação mostrava indicador transitório de nuvem; não foi tomada apenas a contagem como confirmação. Evidência privada galeria-ipad-atualizada.png.
- Tentativa de anexar a captura real do paywall recebida pelo titular: rejeitada imediatamente com As dimensões de uma ou mais capturas de tela estão incorretas. O arquivo de WhatsApp mede 591×1280. Não foi redimensionado nem recriado como evidência nativa. Produto Criador permanece sem a captura obrigatória; Studio também precisa de captura. Evidência privada assinatura-captura-dimensoes.png. Precisam ser obtidas as capturas originais do iPhone, sem a redução do envio como foto no WhatsApp.

Nenhum envio público realizado. A primeira submissão deverá reunir app, grupo e ambos os produtos, depois de completar as capturas obrigatórias e verificar o processamento das imagens.

A versão foi novamente adicionada ao rascunho após salvar o 27 e as novas galerias. A ficha está Pronto para revisão e o painel do rascunho confirma apenas iOS App 1.6.5 (27), um item; Enviar para revisão não acionado. Evidência privada rascunho-build-27.png. Assinaturas e grupo ainda não compõem esse rascunho. A aba foi deixada na assinatura Criador para prosseguir quando forem entregues as capturas originais dos cartões Criador e Studio. Não enviar o rascunho contendo só o app.

## Envio concluído em 24/10 às 11h38 (Belém)

- O titular autorizou redimensionar convencionalmente as capturas recebidas, sem IA. Os dois cartões foram preservados integralmente, sem redesenhar textos ou interface, em PNG RGB 1284×2778, com ajuste proporcional e margem mínima. Manifesto privado com origem, método e hashes em artifacts/apple-publicacao-20261024/review-captures/manifest.json. A imagem da conta com dados pessoais não foi anexada.
- Apple aceitou as capturas Criador e Studio. Notas de revisão explicam que são de uma conta TestFlight com Criador ativo: Plano atual no Criador e contratação Studio desabilitada nessa conta. Não foi simulada uma tela de compra nem declarada homologação de compra Studio.
- Criador e Studio passaram a Pronto para revisão e foram adicionados ao mesmo rascunho do app 1.6.5 (27). O grupo AlvoPrompter Planos foi incluído em seguida, resolvendo a exigência de envio conjunto. Conferidos quatro itens e botão de envio habilitado, sem erro de validação.
- Enviar para revisão acionado dentro da autorização vigente do titular. Apple confirmou 4 itens enviados. A página de revisão confirma os quatro itens individualmente em Aguardando revisão: app 1.6.5 (27), Criador Mensal, Studio Mensal e grupo AlvoPrompter Planos.
- ID do envio: 6b21d128-1fd6-4008-8593-ce2972ae1dc3. Data exibida pela Apple: 24 de outubro de 2026 às 11h38. Acompanhamento: https://appstoreconnect.apple.com/apps/6815460612/distribution/reviewsubmissions/details/6b21d128-1fd6-4008-8593-ce2972ae1dc3.
- Evidências privadas: rascunho-quatro-itens.png, quatro-itens-enviados.png e aguardando-revisao-quatro-itens.png, em artifacts/apple-publicacao-20261024/.
- Liberação pública manual preservada. Envio para revisão não significa aprovação ou publicação. Nenhum preço, contrato, banco, plano de usuário ou configuração Google/Asaas foi alterado nesta conclusão.

Nenhuma mudança de código nesta etapa: validação por dimensões/formato, inspeção visual das imagens e confirmação oficial da interface Apple. Os testes do build 27 já registrados permanecem válidos; não foi gerado outro pacote.


## Revisão de termos, privacidade e ícone — 26/10/2026

- A mensagem automatizada da Apple especifica falta de link funcional para Termos de Uso/EULA na descrição (3.1.2). A análise completa do aplicativo ainda não ocorreu. Adicionado e salvo o link da licença padrão Apple na única localização existente (Português do Brasil); recarregamento confirmou persistência.
- Atualizar revisão colocou o app novamente como Pronto para revisão. O conjunto preserva app, Criador, Studio e grupo. Reenviar para revisão não foi acionado.
- A prévia do produto confirma o ícone A correto, o nome AlvoPrompter e as capturas. O campo vazio é o cabeçalho promocional opcional, não o ícone principal. Evidência privada: artifacts/apple-publicacao-20261026/previa-icone-apple.png. Não substituímos o ícone já correto nem adicionamos um cabeçalho sem necessidade.
- Preparada revisão do Worker de privacidade, com rota própria /terms e navegação entre documentos, mantendo a EULA padrão Apple. Incluídos Resend, Pexels/importações, distinção entre operadores e controladores independentes, bases por finalidade, direitos do art. 18/19, limites da exclusão, dados pseudonimizados e processamento internacional. Corrigida a descrição de tradução (assistente Gemini/Groq, tradução dedicada Cloudflare) e a promessa excessiva de retenção somente para processamento/segurança na IA.
- Novos links visíveis no cadastro, login e conta em todas as plataformas. Não tratamos a leitura da política como consentimento genérico.
- Proteção local antes de cada envio de texto, áudio, narração, tradução e descrição de avatar: diálogo identifica os destinatários e a finalidade; negar, fechar ou cancelar impede essa requisição. Autorização limitada à ação, sem concessão persistente nem publicidade associada. O 27 publicado no TestFlight ainda não contém estas mudanças; será necessário novo build para distribuí-las.
- Validação: 400 testes / 44 arquivos passaram, typecheck passou, verificação de segredos passou. Lint mantém apenas aviso preexistente no harness do prompter. Teste visual local confirmou recusa, autorização e foco inicial na recusa; nenhum conteúdo foi enviado a provedores nesse harness.
- Os textos e o código permanecem locais, aguardando a decisão do titular sobre os documentos. Prévia de documentos em artifacts/apple-publicacao-20261026/{termos,privacidade}.html. Não houve deploy desses textos, migração de dados, compra ou alteração de planos nesta etapa.

### Verificações que os textos não resolvem sozinhos

1. Confirmar o regime do projeto Gemini antes de liberar envio de dados pessoais: os termos do fornecedor proíbem esse envio ao serviço gratuito e permitem uso de entradas/saídas para melhorar modelos. Abertura do AI Studio foi bloqueada pela revisão automática por envolver uma página de chaves; solicitada autorização restrita ao status de faturamento, sem credenciais nem ativação de cobrança.
2. Conferir os instrumentos de tratamento e transferência internacional aplicáveis aos fornecedores (LGPD art. 33 e regulamento ANPD), incluindo suboperadores e países. O texto público não equivale a comprovação de contratos assinados.
3. Validar bases legais por operação, avaliação de legítimo interesse e tabela operacional de retenção. O identificador derivado de exclusão e o histórico da fila não têm rotina geral de expiração identificada; não chamar esses dados de anônimos nem prometer eliminação integral imediata.
4. Confirmar adequação da restrição 18+ do serviço/fornecedor à distribuição e à experiência de cadastro. A política já declarava maiores de 18; não foi coletada data de nascimento nem implementada verificação de idade nesta etapa.
5. Testar no próximo TestFlight a permissão de IA, retorno do navegador externo e links legais antes de reenviar. O disco estava com cerca de 643 MiB livres; não iniciar archive pesado nesse estado.

Fontes primárias consultadas: LGPD (Planalto, Lei 13.709/2018); Apple App Review Guidelines, 3.1.2 e 5.1.2(i); EULA padrão Apple; Gemini API Additional Terms of Service, versão efetiva em 23/03/2026. Não constitui certificação jurídica de conformidade integral.


## Publicação autorizada dos documentos — 26/10/2026

O titular aprovou expressamente ambos os textos e autorizou somente a consulta do status de faturamento do projeto Gemini, sem chaves, cartão, dados bancários ou ativação de cobrança.

- Worker alvoprompt-privacy publicado, versão 54b8af30-9856-4978-995f-7b0ced262ec5. Termos em https://alvoprompt-privacy.alexandrecostagg.workers.dev/terms; política em https://alvoprompt-privacy.alexandrecostagg.workers.dev/. Ambas as páginas conferidas no Chrome após deploy, com data de 26/10/2026, links e textos esperados.
- Consulta na tela Projetos do AI Studio, filtrada por Alvoprompter (gen-lang-client-0115721671), confirmou Nível gratuito e Configurar faturamento. Nenhuma chave foi aberta, copiada ou alterada. Nenhuma cobrança foi ativada. Evidência privada gemini-nivel-gratuito.png.
- O regime pago ainda depende de decisão e configuração financeira pelo titular. A configuração gratuita não atende ao envio de dados pessoais nos termos do Gemini. O novo build e o reenvio público permanecem pendentes.
- Documentos aprovados já estão públicos; as alterações de interface e de autorização de IA ainda precisam ser distribuídas em novo build. A publicação da política não atualiza o binário 27 instalado.


## Build 28, web e espaço em disco — 26/10/2026

- Limpamos somente o cache regenerável Gradle 9.3.1 após confirmar ausência de processo Gradle ativo. Dependências baixadas, credenciais, arquivos pessoais, projetos e archives Apple preservados. O espaço disponível passou a 6,3 GiB; cerca de 6,2 GiB após o upload.
- A primeira consulta de status pelo wrapper tentou baixar uma distribuição ausente e falhou por espaço. O download incompleto criado nessa tentativa foi removido antes da limpeza. A consulta posterior usou o executável já instalado, sem novo download.
- Código e configuração registrados e enviados em d476b9e. Build web de produção publicado no Pages alvoprompter: https://ccd19fdf.alvoprompter.pages.dev. Domínio https://app.alvoprompter.com.br conferido no Chrome, exibindo links para Termos, Privacidade/LGPD e EULA antes de login. Evidência privada links-legais-publicados.png.
- Confirmado no TestFlight que o maior contador existente era 27; preparado 1.6.5 (28). Build nativo e sincronização Capacitor iOS concluídos. Archive Xcode aprovado com um job, assinatura codesign validada e 54 arquivos conferidos por SHA-256 sem divergências. Bundle com.alvoprompt.app e versão/contador confirmados no Info.plist.
- Xcode confirmou Upload succeeded / EXPORT SUCCEEDED em 26/10 às 09h43 (Belém). Pacote recebido pela Apple e em processamento. Evidências em artifacts/release-1.6.5-28/{archive.log,upload.log,bundle-verification.json}. Não é confirmação de disponibilidade ao grupo nem aprovação pública; conferir processamento e associação ao grupo antes de pedir atualização ao titular.
- Esclarecido ao titular: a Apple não exige IA paga. A pendência específica é adequar o processamento de dados à modalidade do fornecedor; pagar Gemini, substituir a integração ou retirar IA online são caminhos distintos. Nenhuma cobrança ativada. O reenvio à revisão pública não foi realizado.


### TestFlight 28 liberado

A Apple concluiu o processamento do build 28 (ID 978dd2aa-5c02-4136-b378-ae54ec11c11c). Orientações de teste salvas e associação confirmada ao grupo interno Equipe AlvoPrompter, com um tester. Verificar abertura dos três links legais, recusa de envio à IA, autorização com conteúdo genérico sem dados pessoais e preservação do plano após restauração/reabertura. Nenhuma compra adicional necessária. O app público permanece no rascunho, sem reenvio.

As execuções CI dos commits d476b9e e b3f6dfb concluíram com sucesso: https://github.com/Alexandrecostagg/alvoprompter/actions/runs/40324318557 e https://github.com/Alexandrecostagg/alvoprompter/actions/runs/40325030754. Incluem lint, tipagem, testes, build, scanner de segredos e npm audit no limite high.

A aba Compilações do grupo confirmou 1.6.5 (28) Em testes. A lista geral usa o estado de revisão externa Pronta para envio, que não impede o teste interno. Evidência privada: artifacts/apple-publicacao-20261026/testflight-28-em-testes.png.
