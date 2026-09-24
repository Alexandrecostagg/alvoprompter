# Cadastro e envio à Apple — 23/09/2026

- App: AlvoPrompter, Apple ID 6815460612.
- App Store Connect: https://appstoreconnect.apple.com/apps/6815460612/distribution
- Bundle ID: com.alvoprompt.app. SKU: ALVOPROMPTER-IOS. Equipe: LCN99JS59U.
- Idioma: Português (Brasil). Categorias: Foto e vídeo e Produtividade.
- Descrição, texto promocional, palavras-chave, links de suporte/marketing, copyright e versão 1.4.0 preenchidos e salvos. Lançamento público manual.
- Política de privacidade cadastrada; classificação elevada para 18 anos conforme política publicada (17 anos nos sistemas Apple anteriores ao 26).
- Recursos locais acessíveis sem login. Notas distinguem recursos online e pendências da versão beta.
- Upload oficial do Xcode concluído em 21:34:30: versão 1.4.0, build 14. Log: artifacts/ios-upload-1.4.0.log.
- Build 14 associado à versão de distribuição. Logo aprovada confirmada visualmente na lista de apps da Apple.
- Contato privado de revisão e informações beta salvos após autorização explícita do usuário. Sem dados pessoais reproduzidos neste documento.

## TestFlight

- Grupo interno necessário à habilitação de testes externos: Equipe AlvoPrompter. Sem distribuição automática ou membros adicionados.
- Grupo externo: Testadores convidados, ID d5564b9d-3a88-460d-bf83-a2960016c94e.
- Elaine cadastrada no endereço expressamente autorizado pelo usuário, somente como testadora externa.
- Build 1.4.0 (14) enviado à revisão beta, com status confirmado **Aguardando revisão**.
- Notificação automática de testers ativada. O convite para instalar depende da aprovação beta da Apple; não afirmar que já foi entregue por e-mail.
- Link do grupo: https://appstoreconnect.apple.com/teams/edfbb59a-11c0-4346-af77-6588b90d2ec5/apps/6815460612/testflight/groups/d5564b9d-3a88-460d-bf83-a2960016c94e
- Nenhum pedido de revisão pública realizado.

## Imagens e referência

- Referência visual inspecionada no cadastro CasaLumina: logo superior, título curto, fundo suave e celular central com a tela do app.
- Composição adaptada às cores e logo do AlvoPrompter, com biblioteca, editor e teleprompter reais renderizados na prévia local. Conteúdo demonstrativo criado para as imagens; interface não redesenhada dentro das capturas.
- Origem: audit/store-gallery.html. PNGs: artifacts/app-store-1.4.0/01-suas-ideias-1284x2778.png, 02-escreva-1284x2778.png, 03-seu-ritmo-1284x2778.png.
- Dimensões: 1284 × 2778, sem transparência. A verificação posterior identificou JPEG com extensão PNG; os arquivos foram convertidos para PNG real em 23/09 às 22h31. Montagem visual verificada em preview.png.
- Capturas produzidas com a interface web compartilhada pelo app híbrido dentro de uma moldura ilustrativa de iPhone. Não são fotografias de aparelho físico nem comprovação de testes em hardware real.
- Compilação de simulador iOS concluída e abertura do app observada, mas as falhas no controle do simulador impediram utilizá-lo para todas as capturas. Simulador encerrado ao terminar a tentativa.

## Duplicidade e pendências

- A Apple lista apenas um AlvoPrompter. Os outros cadastros são CasaLumina, Alvorecer e AlvorecerApp. Nenhum desses cadastros foi removido; pergunta enviada para identificar qual duplicidade o usuário deseja resolver.
- Exclusão de conta, autenticação social nativa, compras iOS, rótulos de coleta de dados e validação física continuam entre as pendências para publicação pública descritas na entrega 1.4.0.
- As imagens expõem um problema de contraste no botão Ligar câmera no modo escuro: revisar em próxima compilação, mantendo as capturas fiéis ao build atual.

## Confirmação das imagens na Apple

- O primeiro upload chegou a **3 de 10 capturas**, mas falhou no processamento: eram JPEGs com extensão PNG. Não considerar aquele envio concluído.
- Os três envios rejeitados foram removidos e substituídos por PNGs válidos. Estado atual: **3 capturas para iPhone e 1 para iPad de 13 polegadas**.
- PNGs reais corrigidos: artifacts/app-store-1.4.0/upload-corrigido/. Formato, RGB 8 bits, dimensões e ausência de transparência verificados com sharp e file. Cópias principais e upload/ também corrigidas para evitar reutilizar arquivos inválidos.
- Alternativa JPEG com extensão correta: artifacts/app-store-1.4.0/upload-jpeg/.
- Reenvio concluído usando cópias em /private/tmp, que habilitaram o botão Enviar do Safari. Ordem do iPhone confirmada: 01, 02, 03. Após o envio de iPhone e iPad, a validação da Apple aponta somente a publicação da ficha de privacidade como pendência de cadastro; não há mais erro de processamento das imagens.
- Imagem de iPad: artifacts/app-store-1.4.0/ipad/01-roteiro-ipad-2732x2048.png. PNG RGB 8 bits, sem transparência, 2732 × 2048. Editor real da interface compartilhada renderizado em viewport de tablet; moldura ilustrativa, sem alegação de captura em aparelho físico.
- O cadastro continua com apenas um AlvoPrompter e a logo visível no cabeçalho e na lista de apps.

## Correções do aviso de revisão

- Preço inicial gratuito, USD 0,00 e equivalentes em 175 regiões, confirmado e salvo. Disponibilidade territorial ainda precisa ser definida.
- Direitos de conteúdo: declaração de direitos sobre conteúdo de terceiros salva após confirmação explícita do responsável na conversa.
- Ficha de privacidade: dez categorias configuradas para funcionalidade do app, vinculadas à identidade, sem rastreamento publicitário nativo: nome, e-mail, telefone opcional, fotos/vídeos, áudio, outros conteúdos, ID de usuário, ID de dispositivo (IP para segurança), histórico de compras/assinaturas e interações (quotas de IA).
- Ficha ainda NÃO publicada: a Apple apresenta declaração de precisão, conformidade e atualização; confirmação solicitada ao responsável e ainda pendente. Botão Publicar habilitado após configuração.
- Conferir novamente a ficha antes do lançamento se mudar o tratamento de dados. A ficha inclui os recursos opcionais do cliente 1.4.0; não significa que pagamentos ou login social já estejam liberados em produção.
- Política pública corrigida para explicar páginas de vídeo em R2/KV, áudio compartilhado, ausência de expiração automática dessas páginas, retenção de IP para segurança e Meta Pixel desativado no nativo.
- Política publicada: Worker alvoprompt-privacy, versão 80ea6178-b0a2-4a8a-82d9-69624948d9a6. O deploy posterior da API e do site está registrado abaixo.
- O app permanece em Preparar para envio; corrigir metadados não resolve as pendências funcionais da revisão pública.

## Publicação do código autorizada

- Usuário autorizou commit, deploy e push após o envio dos arquivos.
- Verificação desta rodada: 89 testes em 17 arquivos, lint, tipos do app/API/política e build web aprovados. Nenhuma nova alteração no binário móvel; permanece 1.4.0/build 14.
- Commit de implementação: 4574961 (feat: prepare AlvoPrompter 1.4.0 with refreshed UX and store release).
- Migração aditiva D1 0005_account_profiles.sql aplicada em produção com sucesso.
- API publicada com RELEASE 1.4.0: Worker alvoprompt-api, versão 00844f17-68fb-4484-b6bb-b75f83e9980d.
- Site publicado no projeto Pages alvoprompter: https://60429729.alvoprompter.pages.dev. Domínio de produção: https://app.alvoprompter.com.br.
- Verificação após deploy: domínio de produção retorna os novos arquivos index-BRlMWcJH.js e index-BTkcO2Ee.css; /health confirma release 1.4.0, autenticação e IA configuradas. PATCH /account/profile sem sessão retorna 401, como esperado.
- Pagamentos permanecem não configurados e em sandbox; o deploy não habilitou cobranças reais. A landing page é um projeto separado e não recebeu alterações nesta rodada.
