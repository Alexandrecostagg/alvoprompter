# Reconstrução da captura — candidato em validação

O titular confirmou que o build 32 congela a imagem também no original e pediu uma reescrita, com teste anterior à entrega. Esta rodada também organiza Vídeos/Ensaios/Roteiros e separa os controles de texto e vídeo, com gesto para reler.

**Estado: original e exportação nativa aprovados no iPhone para os cenários descritos abaixo. Versão 1.6.7 (33) em preparação para TestFlight.**

## Implementação

- `src/lib/capture` possui uma sessão independente do ciclo de renderização do React, do motor de texto e dos filtros.
- No app iOS, AVFoundation possui câmera, microfone, prévia e arquivo original. AVCaptureMovieFileOutput grava MOV com H.264; o MP4 é preparado por passthrough, sem um segundo encoder de vídeo. O arquivo original permanece no aparelho.
- A validação nativa decodifica a trilha inteira de vídeo, compara os finais das trilhas e mede lacunas entre quadros. Isso detecta truncamento técnico; movimento real ainda exige conferência com um alvo em movimento.
- Um registro nativo associa cada tomada à conta/espaço antes de começar. Tomadas interrompidas podem ser recuperadas na Biblioteca; confirmar a cópia na base local não exclui o original. Uma tomada danificada não bloqueia as demais.
- Na web/Android, um adaptador novo grava os tracks originais e possui abertura, início, parada, interrupção e liberação explícitos. Prefere MP4 H.264/AAC quando o navegador declara suporte. A captura nova não aplica filtros ao vivo; a interface informa a indisponibilidade.
- Biblioteca apresenta Vídeos, Ensaios e Roteiros. Vídeos expõem original, edição e última versão final, com filtros e ações de salvar/compartilhar. Ensaios explicam o ponto de leitura e os áudios, com o próximo passo explícito.
- Os controles dizem Pausar/Retomar texto e Parar gravação. Arrastar o texto pausa a leitura e muda a posição sem chamar a câmera. O indicador informa quando o texto está pausado e o vídeo continua gravando. Ações adicionais ficam em “Salvar e opções do ensaio”, para preservar espaço de leitura.

As fontes nativas estão em `native/ios`; `native:prepare` sincroniza os arquivos e suas referências no projeto do Xcode. Nenhum vídeo existente é convertido, migrado ou substituído por esta mudança.

## Verificações realizadas

- 508 testes em 59 arquivos passaram. Incluem concorrência de início/parada, cancelamento tardio, falhas do encoder, preview/finalização com tempo limitado, interrupção durante início, limpeza de recursos, arquivo menor que a duração capturada, recuperação por escopo, fonte/edição/lixeira preservadas e gesto com linhas quebradas.
- TypeScript/build web, lint e verificação de segredos passaram. Lint mantém apenas o aviso anterior de Fast Refresh no harness de fluxo. A verificação de endurecimento da dependência de build também passou.
- Xcode compilou a captura nativa e o candidato separado de QA. Assinatura verificada com `codesign --verify --deep --strict`.
- O mesmo validador AVFoundation leu um arquivo sintético H.264/AAC de 120 s: 3.600 quadros, vídeo até 120 s, áudio até 120,021 s, maior intervalo entre quadros de 0,033 s, saudável.
- Uma reprodução sintética do defeito (450 quadros/15 s de vídeo com 120 s de áudio) foi corretamente rejeitada pelo validador.
- Chrome, câmera e microfone sintéticos: 120,029 s gravados sob 3.103 atualizações de React; amostras com movimento em 1, 16, 65 e 118 s. Repetição, interrupção de track e cancelamento de permissão passaram. Os recursos foram encerrados antes da reprodução.
- Interface em 393 × 852: arrastar retornou o texto e o pausou enquanto o contador da gravação continuou. Salvar abriu Biblioteca → Vídeos. Ensaios exibiu o ponto salvo de 31%.
- Download pelo botão da interface: original de 70,486 s, 2.112 quadros, áudio de 70,400 s. Amostras em 1, 16, 40 e 69 s eram distintas. Retomado após reabrir a Biblioteca, sem câmera/microfone ativos.
- Aplicação de corte de 60–70 s: exportação final com H.264/AAC, vídeo de 10,025 s, áudio de 10,003 s, 291 quadros. Quatro amostras distintas até 9,5 s; validador AVFoundation aprovou. Botão Salvar vídeo editado baixou o arquivo; versão final apareceu na Biblioteca.

Limites observados: o original desse teste Chrome usou MP4/Opus. FFprobe decodificou o arquivo completo, mas AVFoundation interpretou uma duração de contêiner diferente e o marcou como não saudável. O adaptador passou a preferir H.264/AAC, como a exportação final já fazia; compatibilidade da gravação web continua sujeita aos testes nos navegadores alvo. Um primeiro ensaio de interface teve áudio sintético suspenso pelo bloqueio de reprodução automática; o harness foi corrigido para retomar o áudio no clique e o fluxo acima foi repetido com duração e arquivos conferidos. Tentativas de Safari macOS não concluíram a abertura do fixture sintético e são inconclusivas. Não contam como aprovação do Safari nem do iPhone.

Evidências locais (não versionadas): `artifacts/capture-rebuild-2026-11-23/`, com logs, JSON dos validadores, análise dos arquivos, vídeos sintéticos e capturas da Biblioteca. Nenhuma gravação pessoal foi criada ou enviada durante estes testes.

## Teste físico pendente

O Xcode identificou o iPhone 13 Pro Max, mas informou destino offline; a consulta final do CoreDevice retornou `unavailable`. Não houve instalação, abertura de câmera física ou alteração da instalação de uso.

Candidato pronto: `artifacts/capture-rebuild-2026-11-23/AlvoCapturaQA-candidato.app`, bundle **com.alvoprompt.captureqa**, nome **Alvo Captura QA**. Possui container separado de **com.alvoprompt.app**. Fontes do harness: `audit/NativeCaptureQA.tsx`; preparação: `scripts/prepare-capture-qa.mjs`. A interface QA é excluída do build normal.

Depois que o titular conectar e desbloquear o iPhone:

1. Confirmar o bundle ID do candidato antes de instalar. Instalar somente o app QA, sem substituir o aplicativo de uso.
2. Abrir a tela inicial do QA. A câmera só é solicitada ao usuário iniciar o teste.
3. Gravar pelo menos dois minutos com objeto em movimento e fala. Pausar texto, puxar para reler e retomar; verificar que a captura continua.
4. Conferir original no início, após 15 s, em 60 s e no último segundo; extrair os arquivos do container QA e conferir as trilhas e quadros.
5. Repetir tomada, interromper colocando o app em segundo plano e recuperar pela Biblioteca. Conferir liberação de câmera/microfone e preservação da tomada.
6. Aplicar corte e efeito, salvar o vídeo final e conferir novamente. Testar também Safari no iPhone e repetir controles compartilhados no Android.
7. Somente após esses resultados, definir novo build, revisar, fazer commit/push e publicar a versão validada.

Dados e projetos existentes foram preservados. Não foi feita limpeza de documentos, downloads ou projetos. Não houve novo commit, push, deploy ou upload ao TestFlight nesta rodada.

Referência técnica: [Apple — AVCaptureMovieFileOutput](https://developer.apple.com/documentation/avfoundation/avcapturemoviefileoutput) e [fragmentos recuperáveis de gravação](https://developer.apple.com/documentation/avfoundation/avcapturemoviefileoutput/moviefragmentinterval).

## Atualização do teste físico — 23/11/2026

O iPhone foi conectado e o app separado com.alvoprompt.captureqa foi instalado e aberto. O titular gravou e encerrou uma tomada real. O original foi copiado diretamente do container QA para análise local, sem recompressão ou alteração da instalação de produção.

Resultado do original: 126,6717 s, H.264/AAC, 3.800 quadros; final do vídeo em 126,6733 s e do áudio em 126,7200 s; maior lacuna de quadros de 0,035 s. A validação completa no próprio iPhone e a repetição no Mac aprovaram o arquivo. Amostras extraídas por AVAssetImageGenerator em 1,0667 s, 16 s, 59,97 s, 119,9733 s e 126,14 s foram revisadas visualmente e apresentam movimentos/enquadramentos distintos, incluindo o fim da tomada.

O contador auxiliar FFprobe mostrou lentidão e atingiu o limite de tempo no decodificador de software. Não foi usado como aprovação. A validação completa e as amostras foram obtidas pelas ferramentas AVFoundation; os artefatos estão em `artifacts/capture-rebuild-2026-11-23/physical/`. O novo analisador Python recebeu limite de execução; os controles sintéticos íntegro e truncado passaram.

A confirmação dos controles pelo titular e o teste físico de edição/salvamento ainda estão pendentes. O titular precisou sair da tela e pediu reabertura; o app QA foi novamente trazido ao primeiro plano sem usar encerramento forçado. A tomada nativa permanece preservada.

Revisão adicional de compartilhamento: originais recuperados em MOV passam a manter a extensão .mov, inclusive quando um chamador antigo fornece .webm. Testes do caminho nativo conferiram os bytes e a URI entregues ao compartilhamento; os 12 testes de compartilhamento passaram. Esse ajuste está no código local e não altera a captura H.264/AAC validada no candidato instalado.

O disco do Mac chegou a menos de 200 MiB livres durante esta etapa; não foi feita limpeza de arquivos pessoais ou projetos. Novos builds/publicação exigem conferir novamente o espaço disponível. Ainda não houve novo commit/push/deploy/TestFlight nesta rodada.

## Recuperação e acesso ao editor no QA

O titular informou que via apenas opções de ensaio/leitura. O QA foi atualizado para recuperar automaticamente o último vídeo e abrir `video-editor`, com um botão explícito para retomar o vídeo. A leitura de mídia nativa passou a usar intervalos de 2 MiB: o servidor Capacitor retorna HTTP 206 para Range, enquanto a resposta de mídia sem Range usa URLResponse sem status HTTP explícito. O leitor também aceita corpo nativo legível com status zero, rejeita corpo vazio/intervalos inconsistentes e limita cada leitura a 20 segundos.

A mesma leitura é usada ao encerrar a captura e ao recuperar a Biblioteca. Recuperação repara fonte ausente sem sobrescrever cortes, legendas ou metadados já salvos. Testes completos: 517 testes em 60 arquivos passaram; typecheck e lint passaram (apenas o aviso anterior do harness). O QA gera diagnóstico local de progresso e abertura do editor em Documents/capture-qa-log.json, sem enviar mídia.

A atualização foi instalada no mesmo bundle QA sem desinstalar ou apagar o container. A tentativa de abertura foi recusada pelo iOS com motivo `Locked`; foi solicitado ao titular desbloquear o iPhone. A confirmação de recuperação e edição na nova interface ainda depende desse passo. O aplicativo de produção permanece preservado.

## Encaminhamento autorizado ao TestFlight

O titular pediu para encerrar os testes assistidos no telefone e disponibilizar a versão no TestFlight para testar no próprio ritmo. Essa instrução substitui o plano anterior de aguardar todos os testes manuais antes de enviar um beta.

A última recuperação no iPhone confirmou 129.901.446 bytes lidos por intervalos HTTP 206, uma tomada recuperada, nenhuma falha, entrada em video-editor e persistência concluída. O gravador nativo validado permaneceu inalterado; a interface passou a resolver o caminho no container atual e verificar o tamanho completo da mídia. As notas de beta devem deixar explícito que a exportação/compartilhamento físicos ainda serão testados pelo titular.

Versão em preparação: 1.6.7 (33), bundle de produção com.alvoprompt.app. O build normal exclui o harness QA. Nenhuma outra abertura ou instalação no telefone do titular será realizada nesta publicação.

## Travamento ao aplicar a edição — 23/11, nova revisão

O titular demonstrou a exportação parada com uma janela pequena não interativa. A janela era o elemento de vídeo inserido pelo renderizador web. O caminho iOS ainda dependia de reprodução, AudioContext, canvas e MediaRecorder; a espera de AudioContext.resume antecedia os limites de tempo. Esse caminho deixou de ser usado no app iOS.

O novo AlvoVideoExport monta cortes e áudio em AVMutableComposition, compõe cada quadro com Core Image e exporta MP4 offline. Preserva zoom/pan, reenquadramento, legendas/destaque, logo, música, abertura/encerramento e chroma. Usa o original nativo por ID e escopo; arquivos anteriores/importados recebem uma cópia temporária exclusiva. Originais e exports nativos são preservados. Há cancelamento, proteção contra segundo plano, tempo sem progresso e limite total; o arquivo completo é decodificado antes de ser aceito. A interface oferece tempo e cancelamento junto ao botão inferior. O navegador também passou a limitar a espera de ativação do áudio.

Testes desta revisão: 525 testes em 61 arquivos passaram, TypeScript, lint (somente o aviso anterior do harness) e endurecimento de dependência passaram. Exportador compartilhado compilado no Mac; corte real 90–120 s com zoom/legenda: 30 s, 900 quadros, vídeo até 30 s, áudio até 30,0587 s, maior lacuna 0,0334 s. O primeiro teste sob forte lentidão do Mac foi cancelado pelo limite, sem aprovação; depois do reaproveitamento de sobreposições o trecho de 30 s terminou em 64,9 s. A conferência visual encontrou orientação invertida e deslocamento do preenchimento das legendas; ambos foram corrigidos e conferidos em nova amostra de 5 s/150 quadros/áudio completo. Os testes físicos ainda precisam confirmar a implementação final no iPhone.

Xcode compilou e assinou o novo candidato com os plugins de captura/exportação; instalado como atualização no bundle QA com.alvoprompt.captureqa, preservando o container e produção. O QA desta revisão executa automaticamente dois exports do original salvo (trecho final de 30 s com zoom/legenda e vídeo completo com zoom), registrando resultados locais. Isso existe apenas no build QA. O titular voltou a autorizar uso da conexão do iPhone para esta investigação. Não houve envio ao TestFlight nesta etapa.

### Resultado físico da nova exportação

As duas chamadas ao mesmo renderVideo usado pelo editor concluíram no iPhone real: trecho 90,6717–120,6717 s com zoom e legenda em 3,662 s (10.993.752 bytes, 900 quadros/30 s); original completo com zoom em 13,785 s (46.324.461 bytes, 3.798 quadros/126,6 s). Áudio até 30,0466 e 126,6184 s respectivamente; maior lacuna 0,0334 s. Todos os quadros foram decodificados e validados antes da leitura dos Blobs pelo Capacitor. A repetição da validação completa no Mac aprovou o vídeo integral com os mesmos resultados. Foram revisadas visualmente amostras do início, 120 s e 126,1 s, com gestos distintos e orientação correta; a legenda também aparece corretamente no fim do corte.

O teste compartilhado no Mac com dois cortes, caminho de reenquadramento, pan, música WAV repetida, logo PNG, chroma, abertura/encerramento e destaque de palavras terminou em 3,92 s: 150 quadros/5 s, áudio até 5,056 s e maior lacuna 0,0334 s. Cancelamento nativo solicitado durante a montagem retornou “Exportação cancelada”, sem substituir o original.

Escopo desta aprovação: exportação nativa em primeiro plano, com os arquivos e efeitos exercitados. Não equivale a comprovar todos os modelos de iPhone, todas as durações ou todas as combinações. Safari web no iPhone continua sem validação física nesta rodada. Artefatos privados permanecem ignorados em artifacts/capture-rebuild-2026-11-23/physical/.
