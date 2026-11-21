# Gravação, compartilhamento e interface de IA — 20/11/2026

## Escopo e evidências

Correção local do AlvoPrompter web e do bundle Capacitor. Preservadas as alterações locais anteriores de modernização. Nenhuma publicação web, sincronização do projeto Xcode, geração de IPA/AAB, envio a lojas ou alteração de provedor/contrato foi feita nesta rodada.

O vídeo de teste fornecido foi examinado localmente com ffprobe: H.264, 1024×576 com rotação de −90°, 465 quadros, trilha de vídeo com 15,48 s e áudio AAC com 96,424331 s. Isso confirma ausência de imagem nova após os primeiros segundos no próprio arquivo; não é apenas falha do player/WhatsApp. O arquivo original foi movido para a Lixeira a pedido do titular. As capturas foram preservadas. Não foram criadas cópias do vídeo pessoal nem enviados os anexos a serviços externos.

## Correções

### Compartilhamento nativo

`share.ts` extraía base64 a partir da primeira vírgula de um data URL. O MediaRecorder pode produzir MIME com uma lista de codecs que já contém vírgula, como `video/mp4;codecs=avc1,opus` (também observado nos testes reais do navegador). Ao ler o arquivo, essa extração inclui parte do cabeçalho MIME dentro do base64. O parser nativo iOS de `@capacitor/filesystem` rejeita base64 inválido em `getEncodingMapper`, retornando a mesma mensagem `The 'writeFile' input parameters aren't valid.` da captura.

A extração agora usa o marcador `;base64,`. Arquivos vazios, leituras abortadas ou sem marcador produzem erro antes da gravação nativa. A mesma correção cobre partes de stories e a restauração de vídeos por data URL com parâmetros de codec. Testes simulam a fronteira nativa e verificam os bytes exatos enviados ao Filesystem; a folha de compartilhamento do iPhone ainda exige teste no aparelho.

### Câmera e arquivo congelado

O filtro era renderizado usando um segundo vídeo desconectado do DOM e dependia de `requestVideoFrameCallback` nesse elemento. Essa arquitetura permite que um navegador suspenda o decodificador oculto e interrompa a imagem filtrada, enquanto o áudio segue. Foi removida essa dependência: o canvas usa a prévia visível, com loop limitado a aproximadamente 30 pinturas por segundo, sem substituir as trilhas do encoder durante a tomada. Mudanças de layout podem reassociar a prévia sem criar outro encoder.

A prévia recebe uma tentativa explícita de `play()` ao associar o stream. Um monitor acompanha quadros entregues pela câmera, tenta retomar uma prévia pausada e finaliza a tomada se a trilha acabar ou se os quadros cessarem por mais de 5 s. Nesse caso, preserva o trecho retornado pelo encoder e mostra “Gravação interrompida”, com aviso para revisão; não apresenta uma tomada danificada como concluída normalmente. A captura é liberada somente após a finalização do encoder.

Não foi estabelecida uma causa única para todos os congelamentos do aparelho do titular: especialmente para gravação sem filtro, ainda faltam logs e repetição na versão atualizada do iPhone. O monitor é uma proteção verificável, não uma prova de correção de todos os defeitos de câmera do sistema operacional. Interrupção pode deixar uma curta cauda sem quadros no trecho preservado; não é recuperação de imagem inexistente.

### Interface de IA

Removida a confirmação adicional que mostrava fornecedor, alternativa e regime gratuito. As funções de gerar, transcrever, traduzir, narrar e criar imagem executam diretamente a ação solicitada. Permanecem autenticação, cancelamento, limites do backend e links existentes de termos/privacidade. Não foram alterados contratos, tratamento real de dados, textos da política de privacidade ou diagnósticos internos/API nesta rodada. O teste anterior de confirmação foi substituído por testes do fluxo direto e de cancelamento antes da rede.

## Verificação

- 50 arquivos, 446 testes aprovados.
- TypeScript e builds web e Capacitor aprovados. `build:native` é compilação do bundle web destinado ao Capacitor, não validação de um binário iOS instalado.
- Lint sem erros, com o aviso preexistente de Fast Refresh em `audit/prompter-flow-harness.tsx`.
- Teste no navegador com câmera e microfone sintéticos, sem hardware pessoal: 1.855 atualizações de interface sem reabrir a câmera ou reassociar a prévia continuamente.
- Sem filtro: MP4 com 35,2764 s; posições do objeto móvel em 1/12/20/32 s: 93/426/219/132.
- Com filtro: MP4 com 35,0341 s; posições em 1/12/20/32 s: 99/433/225/139.
- Filtro indisponível: fallback sem filtro, arquivo de 4,255733 s com movimento nas quatro amostras.
- Interrupção simulada: a fonte de vídeo parou de desenhar e o microfone continuou ativo. O app detectou a ausência de quadros, encerrou a tomada, preservou um blob não vazio e apresentou o aviso.
- Cancelamento durante abertura: câmera/microfone liberados.
- Testes unitários cobrem retorno de base64 com vírgula nos codecs, múltiplas partes, arquivo vazio, erro de preparação, cancelamento de compartilhamento e fallback no navegador.
- Não houve chamada real de IA, compra, login ou compartilhamento externo nos testes.

Evidências locais privadas: `artifacts/recorder-20261120/resultado.txt` e `resultado.jpg`. Os vídeos sintéticos existem apenas durante o teste em memória e seus object URLs de inspeção são revogados; nenhuma mídia pessoal foi usada na fixture.

## Limites para liberação

Não há iPhone conectado no inventário de desenvolvimento. Antes de considerar homologado no iPhone, é necessário instalar uma nova versão e executar tomadas com e sem filtro, em mais de uma duração (incluindo pelo menos a duração do relato), reproduzir o arquivo salvo até o final, abrir o compartilhamento nativo, cancelar/repetir e testar interrupções/reentrada. Conferir áudio e imagem no arquivo enviado, não somente na prévia. Validar também Safari/Chrome iOS e a versão web publicada.

As correções ainda são locais: a versão já instalada/publicada continua com seu código anterior até uma liberação autorizada. A conclusão de testes sintéticos não constitui garantia de confiabilidade de 100% em todos os aparelhos.
