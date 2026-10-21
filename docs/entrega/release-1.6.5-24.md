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
- Usuário preencheu e salvou as credenciais diretamente na Apple. A conferência identificou que o nome de usuário salvo ainda corresponde à conta administrativa principal; a senha não foi lida. Antes da submissão, o titular precisa substituir esse acesso por uma conta comum de revisão. Nenhuma credencial foi copiada para o repositório.
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
- As 14 categorias estão configuradas e salvas. Confirmação final de Publicar aberta para o titular: o diálogo exige concordância com precisão, conformidade e atualização das respostas. Publicação final ainda pendente de confirmação humana nesta anotação; nenhuma submissão do aplicativo executada. Evidência `artifacts/privacy-20261021/confirmacao-apple.png`.

Fontes técnicas:

- https://developer.apple.com/app-store/app-privacy-details/
- https://firebase.google.com/docs/ios/app-store-data-collection
- https://developers.google.com/identity/sign-in/ios/app-privacy
- Manifestos `GoogleSignIn_GoogleSignIn.bundle/PrivacyInfo.xcprivacy` e `Firebase_FirebaseAuth.bundle/PrivacyInfo.xcprivacy` do archive 1.6.5 (24).

## Referências

https://developer.apple.com/tutorials/develop-in-swift/test-your-beta-app
https://developer.apple.com/help/app-store-connect/manage-builds/choose-a-build-to-submit
https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app
