# Apple 1.6.5 (24) — preparação para App Store — 21/10/2026

## Objetivo

O build 23 foi enviado como TestFlight Internal Only e não pode ser submetido à distribuição pública. Usuário autorizou novo envio pelo método App Store Connect, aproveitando a conta Apple, certificados e equipe existentes. Maior build conferido antes da compilação: 23. Versão comercial preservada em 1.6.5; novo build 24.

## Pacote

- Archive `artifacts/AlvoPrompter-1.6.5-24.xcarchive` e cópia no diretório padrão Archives do Xcode.
- Bundle `com.alvoprompt.app`, equipe `LCN99JS59U`, versão 1.6.5, build 24 e recurso Firebase conferidos.
- Código funcional igual ao 23. `VITE_AUTH_APPLE_ENABLED=true`, build nativo/TypeScript e archive aprovados. Scanner: 427 arquivos sem correspondências privadas nos padrões examinados. Não foi necessário repetir a suíte funcional de 311 testes por alteração exclusiva de empacotamento/numeração.
- Compilação com dois processos, Mac com cerca de 10 GiB livres e carga normal. Nenhum outro projeto interrompido ou cache adicional removido.
- Xcode confirmou **App 1.6.5 (24) uploaded**, pelo método **App Store Connect**, em 21/10 às 09h34 de Belém. Processamento concluído; build 24 selecionado e salvo no rascunho público 1.6.5. Evidências `artifacts/release-1.6.5-24/xcode-app-store-method.png`, `ios-upload-24.png` e `store-build-24-selected.png`.
- Nenhum AAB novo foi gerado/enviado: Android permanece na 1.6.5 (23). O contador fonte de preparo nativo passa a 24 também para o próximo pacote Android.

## Formulários

- Campo O que testar dos builds 23 e 24 preenchido e salvo; cobre cadastro/login, IA, roteiro, captura/reprodução de áudio, edição/exportação, áreas seguras e exclusão somente em conta descartável. Evidências `artifacts/release-1.6.5/test-notes-23-saved.png` e `artifacts/release-1.6.5-24/test-notes-24-saved.png`. Build 24 adicionado ao grupo interno existente Equipe AlvoPrompter, com um tester.
- Rascunho público estava em 1.4.0 com build 14. Associação antiga retirada, sem apagar o binário do TestFlight; versão do rascunho salva em 1.6.5. Orientações da revisão atualizadas para o fluxo local, login, compras iOS/restore e exclusão de conta. Lançamento manual preservado.
- A revisão automática inicialmente rejeitou a retirada da associação do build 14 por possível dificuldade de reversão. Documentação oficial confirmou que a seleção pode ser trocada até a submissão e que remover a associação não remove o build da conta. Nova tentativa aceita após essa evidência; bloqueio resolvido, nenhuma compilação excluída.
- Usuário corrigiu e salvou as credenciais diretamente na Apple. Conferência posterior confirmou o alias comum de revisão com “+apple”, diferente do e-mail administrativo, e o botão Salvar desabilitado. Consulta somente de leitura no D1 confirmou uma conta para esse alias. A senha não foi extraída nem copiada para o repositório; a autenticação com a conta de revisão ainda precisa ser validada pelo titular ou em teste autorizado.
- Os produtos de assinatura existentes continuam em Preparar para envio. A configuração de revisão das assinaturas, incluindo a captura solicitada pela Apple, ainda precisa ser concluída/conferida antes de afirmar que as compras estão prontas para revisão pública. Não houve alteração de preço nem contratação nesta etapa.
- Nenhuma submissão pública ou lançamento foi executado nesta etapa. Não elevar regra de atualização obrigatória antes da disponibilidade real.

## Revisão das imagens das lojas — envio suspenso a pedido do titular

Auditoria visual de 21/10, limitada à aquisição nas lojas. Evidências atuais em `artifacts/store-assets-20261021/`, ignoradas pelo Git. Nenhuma imagem foi removida, substituída ou enviada às lojas.

### Apple

- Três imagens de iPhone, com identidade própria roxa/ciano e boa hierarquia dos títulos, mas com biblioteca/editor/prompter antigos. Falta demonstrar gravação, legendas e resultado da edição/exportação.
- Os subtítulos e os detalhes dentro dos aparelhos ficam pequenos na miniatura. A rolagem parcial no prompter não comprova defeito funcional; o problema aqui é a clareza da apresentação.
- Um ativo de iPad, também com interface antiga, conferido na galeria. Não foi feita auditoria de todos os tamanhos herdados no Gerenciador de mídia.
- Nenhum vídeo de prévia no conjunto de iPhone examinado nem no de iPad. Vídeo é uma oportunidade posterior, não foi tratado como requisito obrigatório de publicação.

### Google Play

- Ícone principal mostra a marca atual; o recurso gráfico de destaque ainda traz a marca antiga e um grande bloco branco, com nome Alvoprompt.
- Sete imagens de telefone cadastradas em 18/08/2026. A galeria mostra faixas pretas dominantes e interface muito reduzida; as prévias da primeira imagem e da IA confirmam baixa legibilidade e apresentação antiga. Não foi examinada em detalhe cada uma das sete imagens.
- Campo de vídeo vazio. Recursos de tablet/computador/XR não examinados.
- O status No ar da página de detalhes não comprova disponibilidade pública do binário. A seção de produção ainda informa ausência de acesso à produção; não confundir com o teste fechado 1.6.5 (23).

### Direção recomendada para substituir a galeria

Manter a marca atual e compor seis imagens com capturas reais e atuais de cada plataforma, títulos curtos e uma função principal por imagem:

1. Estúdio: Seu próximo vídeo começa aqui.
2. IA: Da ideia ao roteiro.
3. Teleprompter e gravação: Fale com naturalidade.
4. Legendas: Legendas no tempo da sua fala.
5. Edição/exportação: Seu vídeo pronto para compartilhar.
6. Projetos: Retome de onde parou.

A imagem de pessoa pode vir do próprio conteúdo demonstrado ou do hero original já usado no app. Não reutilizar pessoas, composição ou telas do BIGVU. Não prometer correção de olhar, clonagem de voz ou publicação automática sem implementação e validação. A comparação com a home web atual foi capturada nesta sessão; ela não substitui capturas e validação dos binários iOS/Android em aparelho/simulador.

## Declaração de privacidade — 21/10/2026

- O titular tentou adicionar a versão à revisão e encontrou o bloqueio da declaração de privacidade. Na seção Privacidade do app havia dez categorias configuradas, ainda não publicadas.
- Conferidos código de conta/perfil/sincronização, uso/cobrança e uploads; manifestos de privacidade efetivamente incluídos no archive 24; documentação oficial Apple/Firebase/Google Sign-In. O Meta Pixel retorna antes de inicializar em plataforma nativa.
- Acrescentadas quatro categorias declaradas pelos SDKs do archive: localização aproximada (Google Sign-In pode inferi-la do IP para prevenção de fraude), outras informações de uso, outros tipos de dados e outros dados de diagnóstico. As três primeiras vinculadas à identidade conforme manifesto Google; diagnóstico não vinculado conforme manifesto Firebase Auth. Finalidades de análise também incluídas em ID de usuário e ID de dispositivo. Nenhuma categoria usada para rastreamento publicitário.
- Mantidas as dez categorias anteriores para conta, perfil opcional, conteúdo enviado à nuvem, assinatura, uso e segurança. Dados de pagamento da App Store, contatos e localização GPS não foram declarados como coletados pelo app.
- Política pública atualizada com os tratamentos dos SDKs e publicada em `https://alvoprompt-privacy.alexandrecostagg.workers.dev`, Worker versão `8bbbeee5-75ea-4874-9a79-fc49a92a006a`. Resposta pública conferida por HTTPS, incluindo data e novo parágrafo. Não houve alteração funcional nem necessidade de novo binário.
- As 14 categorias estão configuradas e salvas. O titular confirmou o clique final de Publicar. A Apple passou a exibir “Publicado alguns segundos atrás por Alexandre Gomes da Costa”, conferido na seção de privacidade. A pendência de publicação da ficha está resolvida; nenhuma submissão do aplicativo executada. Evidências `artifacts/privacy-20261021/confirmacao-apple.png` e `publicado-apple.png`.

Fontes técnicas:

- https://developer.apple.com/app-store/app-privacy-details/
- https://firebase.google.com/docs/ios/app-store-data-collection
- https://developers.google.com/identity/sign-in/ios/app-privacy
- Manifestos `GoogleSignIn_GoogleSignIn.bundle/PrivacyInfo.xcprivacy` e `Firebase_FirebaseAuth.bundle/PrivacyInfo.xcprivacy` do archive 1.6.5 (24).

## Ponto de retomada após reinício do Mac — 21/10, 11h39 (Belém)

- A versão pública continua em Preparar para envio com build 24; não foi submetida. Privacidade publicada e alias de revisão corrigido, conforme verificações acima.
- Três capturas atuais da interface web compartilhada foram preservadas em `artifacts/store-assets-20261021/current-ui/`: estúdio, resultado real da IA e editor. O roteiro demonstrativo foi gerado na produção e salvo localmente no navegador. Essas capturas ainda não constituem uma galeria final aprovada nem validação dos binários nativos.
- A nova galeria não foi montada/enviada. A captura do editor ainda requer revisão do foco/estado de salvamento. Falta obter demonstrações adequadas de gravação, legendas e exportação.
- A assinatura Studio mantém preços e disponibilidade anteriores; ainda falta a captura de revisão da tela real de contratação, e as notas de revisão não foram preenchidas. Criador também precisa de conferência final. Nenhuma assinatura foi adicionada à revisão nesta retomada.
- Conversão de mídia demonstrativa interrompida pelo reinício; arquivo incompleto de 48 bytes descartado. Não reutilizar como evidência de exportação funcional. Não retomar conversão pesada enquanto o Mac estiver sob pressão de recursos; limitar processos e duração em eventual nova conversão.
- Após o reinício, volume de dados com cerca de 10 GiB livres, RAM física de 8 GiB e uso significativo de compressão/swap. Carga inicial de 1 minuto em 73,1, depois 4,81. Isso não comprova a causa do reinício. O relatório recente de falha encontrado era do Warsaw após o boot; o panic localizado era antigo, de março, e não foi atribuído a este incidente.
- Removidos somente caches regeneráveis, sem compilação relacionada ativa: Gradle (2507 MiB), Build do AlvoPrompter (265 MiB), ModuleCache (238 MiB) e temporários do atualizador (1826 MiB). Cerca de 4,7 GiB liberados; volume passou a aproximadamente 15 GiB livres. Projetos, credenciais, arquivos pessoais, archives e processo de atualização do WhatsApp preservados.

## Referências

https://developer.apple.com/tutorials/develop-in-swift/test-your-beta-app
https://developer.apple.com/help/app-store-connect/manage-builds/choose-a-build-to-submit
https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app

## Retomada — galeria e conta de revisão, 21/10, 12h30 (Belém)

- Titular efetuou o login local com a conta comum de revisão. Conferido alias com +apple, plano Grátis, 0/10 usos e ausência de administração. O Firebase ainda informa e-mail não confirmado, inclusive após atualizar pelo botão Já confirmei meu e-mail. Solicitada confirmação pelo link recebido no Gmail; nenhuma marcação administrativa de e-mail verificado foi feita. Isso ainda impede validar IA/assinaturas com essa conta.
- Notas de revisão preenchidas e salvas nas assinaturas Criador e Studio, com caminho da contratação iOS, benefícios reais e restauração. Preço brasileiro do Criador conferido em leitura na Apple: R$ 29,90/mês. Nenhuma alteração de preço, contratação ou submissão. As capturas da tela nativa de contratação continuam pendentes.
- Produzida galeria para revisão com 13 JPEGs: cinco iPhone 1284×2778, cinco Android 1080×1920, dois iPad 2732×2048 e destaque Google 1024×500. Composição HTML/CSS própria, marca atual e imagem original de criadora já usada no app. Interface capturada diretamente da aplicação local em iframe escalado para preservar a nitidez; não se trata de captura dos binários em aparelho.
- Fonte reproduzível em audit/store-gallery-20261021.html e servidor local restrito audit/serve-store-gallery.py. Exportações e manifesto de dimensões em artifacts/store-assets-20261021/export/. Galeria disponível em http://127.0.0.1:4176/. Revisão visual executada em iPhone, Android, iPad e destaque, corrigindo espaço entre frases no iPad. Nada enviado às lojas. Ainda faltam boas capturas reais de gravação, legendas e exportação para ampliar a cobertura comercial.
- No teste de câmera negada foi reproduzido um ciclo: fechar o diálogo religava a câmera e abria o erro novamente. PrompterView agora desliga a câmera ao fechar um resultado com erro, mantendo o ensaio disponível. Verificado pela UI com Fechar e, em fixture sintética denied, com Escape; ajustes acessíveis e câmera desligada. A fixture não solicita hardware. O build 24 enviado NÃO contém essa correção; será necessário um próximo build com contador maior que 24 antes da publicação.
- TypeScript aprovado; lint sem erros, com aviso preexistente do componente na fixture de auditoria; 36 arquivos e 311 testes aprovados com um worker. Não foi executado novo build nativo, upload ou deploy nesta etapa.
- Volume de dados mostrou aproximadamente 11 GiB livres ao final, abaixo dos 16 GiB observados no início desta retomada; não foi atribuída causa sem evidência. Mantidos processos leves e nenhuma conversão de vídeo iniciada.
- Evidências: galeria-final-revisao.jpg, assinatura-notas-salvas.jpg e qa-camera-negada-fechada.jpg no diretório de auditoria de imagens. Dados de credenciais não extraídos.

## Confirmação do e-mail e geração real — 21/10, 13h (Belém)

- Titular localizou a mensagem de verificação na pasta Spam e confirmou o link. A aba local anterior havia sido fechada; reaberta sem novo login, usando a sessão persistida da conta comum com +apple. A conta passou a exibir os botões de assinatura sem o bloqueio de confirmação, mantendo plano Grátis e sem administração. Não foi necessário reenviar a mensagem nem alterar a identidade pelo console.
- O primeiro teste real da IA ainda recebeu EMAIL_VERIFICATION_REQUIRED: o perfil Firebase já estava confirmado, mas o JWT em cache mantinha a informação anterior. Corrigidos os helpers obrigatório e opcional de autenticação: quando o perfil está confirmado e a declaração assinada em cache não está, solicitam novo token ao Firebase. O servidor mantém a verificação da assinatura e de email_verified; nenhum acesso foi liberado apenas por estado da interface.
- Acrescentados cinco testes de regressão: atualização obrigatória e opcional, reutilização de sessão já confirmada, conta não confirmada e falha de atualização. TypeScript aprovado; lint sem erros e com o mesmo aviso preexistente na fixture; 316 testes em 36 arquivos aprovados, um worker.
- Repetida a geração pelo formulário real com a conta confirmada e tema genérico sobre confiança diante da câmera. Retornou roteiro de 76 palavras, inserido no editor pelo botão Usar este roteiro e velocidade ajustada para 150 wpm (~30 s). Evidência conta-revisao-ia-validada.jpg na pasta de imagens. Isso valida IA web autenticada; não substitui compra/restauração no iPhone.
- Esta correção também exige o próximo build nativo acima de 24. Commit/push preparados; nenhum novo deploy, pacote ou submissão nesta etapa. Conta deixada aberta no Chrome para o titular.

## Exportação social e nova auditoria de segurança — 21/10, 13h (Belém)

Solicitação adicional do titular: consolidar as pendências anteriores, simplificar a preparação para Instagram/YouTube/TikTok e executar a verificação profunda dos pontos das duas imagens. Relatório atual em `audit/revisao-export-seguranca-20261021.html`, prévia local `/revisao` no servidor restrito de imagens. O relatório distingue revisão de código, testes, evidência pública e homologação física pendente.

- Editor: destino explícito, proporção sugerida, reutilização de arquivo vertical entre destinos equivalentes, nome de arquivo correto, medidas lidas do vídeo final, texto de publicação persistido com a edição, cópia explícita e instruções para concluir na rede. O app não confirma publicação remota. Corrigido o desaparecimento da prévia ao editar apenas o texto da publicação. Metadados do resultado correspondem ao arquivo aberto, inclusive ao recuperar versões; não são inferidos da proporção atualmente selecionada.
- Legendas verticais mantêm 20% de margem inferior. Prévia na própria rede ainda necessária. Botões de ação/cancelamento com alvos mínimos de 44 px e progresso com semântica acessível. Revisão visual em 390 px sem overflow horizontal e em 1280 px; não constitui certificação de leitor de tela/aparelho.
- Criação de link público exige revisão explícita antes de enviar o vídeo à nuvem. Testados abertura e cancelamento dessa revisão, sem publicar mídia. Compartilhar/baixar não cria link público; retirada de links por uma central de gestão segue como evolução.
- Quatro arquivos sintéticos baixados pelo botão real e medidos por ffprobe: Shorts/Reels 1080×1920, YouTube 1920×1080, feed 1080×1080; MP4, vídeo H.264 e áudio AAC a 48 kHz. Quadro do arquivo com legenda inspecionado. A cadência real do navegador é variável; não foi prometida taxa fixa de 30 fps. Menus nativos e postagem em contas sociais reais não foram homologados nesta etapa.
- Segurança: npm audit encontrou uma dependência direta de desenvolvimento com severidade alta (Vite). Atualizado para 8.3.5; auditoria posterior sem vulnerabilidades conhecidas. npm 10 apresentou falha interna durante instalação; npm oficial 11 executado pontualmente concluiu sem scripts de instalação. Lockfile atualizado. Servidor local reiniciado na versão corrigida.
- Uploads agora verificam assinatura inicial do contêiner, além do tipo permitido e do comprimento. Limite de 100 MB por arquivo e reserva atômica de até 512 MB por conta/dia, incluindo tentativas. Não é cota de armazenamento total nem antivírus. Testes cobrem disfarce de arquivo executável, cancelamento do stream, preservação de bytes em chunks pequenos e concorrência do orçamento. Nenhuma migração necessária: usa a tabela de rate limit existente.
- Erros detalhados da interface restritos a desenvolvimento. Scanner ampliado para Resend/Asaas e histórico Git local (73 commits na conferência): sem correspondências privadas nos padrões examinados. Não se declarou ausência absoluta de segredos ou vulnerabilidades.
- Revalidados por testes: JWT adulterado/sem assinatura/expirado/projeto errado, isolamento entre contas/equipes, SQL parametrizado, permissões, CORS, erros sem detalhe, limites e SSRF/redirecionamentos. Firebase Auth + D1/KV/R2; Supabase/RLS direto não se aplica. Attestation/App Check, cotas totais por plano e monitoramento de escala permanecem avaliação operacional, não foram habilitados sem homologação.
- Produção consultada pelo Chrome sem sessão: /account, /admin/overview, /sync e /media recusaram acesso. Consultas HTTP de shell e ferramenta web não conseguiram resolver/acessar esses domínios; não se inferiu indisponibilidade do serviço, pois o Chrome confirmou a API e os bloqueios. Headers de borda não medidos novamente nessa rodada; fonte e testes conferidos.
- 336 testes em 37 arquivos aprovados; TypeScript do app e Worker aprovados, build web aprovado. Lint com um aviso preexistente de Fast Refresh no harness. Evidências e medições em `artifacts/export-security-20261021/`.
- Deploy API concluído: release `1.6.5-security-export-20261021`, Worker `88cc34c6-64a5-4752-8ab0-3de9e0519e21`. Health pelo Chrome confirmou status ok e a release nova, mantendo IA, Asaas, avisos e Apple configurados.
- Deploy Pages concluído: https://c9e9e364.alvoprompter.pages.dev, bundle `/assets/index-C2fqkiIA.js`, conferido na página pública. Domínio do produto https://app.alvoprompter.com.br. Sem novos uploads ou submissões às lojas. A atualização nativa acima de 24 e os testes físicos seguem necessários.

Pendências consolidadas no relatório: novo build e aparelhos; compra/restauração Apple e capturas; Play Billing; substituição das imagens; nome/entrega do e-mail Firebase; primeira cobrança real Asaas; ativação da política mínima somente após disponibilidade; limites operacionais por plano e comparação dos outros concorrentes. Administração de cortesia e avisos permanecem implementados.
