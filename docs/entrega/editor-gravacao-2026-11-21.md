# Editor e gravação — 21/11/2026

## Evidência recebida

O usuário confirmou uma nova tomada na versão iOS 1.6.6 (31). No MP4 recebido pelo WhatsApp em 21/11, o ffprobe encontrou imagem H.264 com **15,000 s / 450 quadros**, áudio AAC com **97,406 s** e duração do contêiner de 97,406 s. A análise local das tabelas MP4 também identificou a diferença. O vídeo foi apenas lido em Downloads, sem copiar para assets públicos, enviar à nuvem ou excluir. Como a amostra passou pelo WhatsApp, ela comprova a diferença no arquivo recebido, mas não isola por si só a etapa que causou a falha no arquivo original.

## Alterações

- **Aplicar alterações e finalizar** disponível acima da edição e ao final dos ajustes. Rascunho salvo, alterações pendentes e edição finalizada têm mensagens distintas. A conclusão leva o foco e a rolagem à prévia final. Uma alteração posterior invalida a exportação anterior.
- O progresso deixa de começar artificialmente em 40%. Mostra a etapa, porcentagem real e tempo decorrido. Atualizações visuais limitadas a quatro por segundo. O usuário é avisado de que exportar com efeitos pode exigir a duração do vídeo ou mais.
- MP4 completo sem alterações pode ser reutilizado sem recodificação. Exportação em alta qualidade deixa de ampliar pixels para atingir o máximo do preset; tamanho real aparece na interface. Compacto continua solicitando compressão.
- A fonte usada pela exportação fica conectada ao DOM em uma pequena prévia visível, evitando depender apenas de um decoder solto. A exportação observa chegada de quadros, além do relógio do vídeo; interrompe com aviso se os quadros deixam de chegar, mesmo com áudio/tempo avançando. Cancelamento, troca para segundo plano e finalização têm liberação dos recursos. MP4 não solicita fragmentos periódicos.
- No iPhone/iPad, desativado o caminho de filtros ao vivo via canvas. A gravação usa a faixa direta da câmera. O aviso existente informa a indisponibilidade do filtro. Bitrate de captura limitado a 4 Mbps de vídeo e 128 kbps de áudio. Isto é uma medida de mitigação, não uma comprovação de causa ou de cura em hardware real.
- Verificação MP4 após captura e antes/depois da exportação: compara duração de amostras de imagem/áudio e procura intervalos excessivos entre quadros. A gravação danificada é preservada e acompanhada de aviso; não se tenta inventar quadros ausentes. A análise usa leitura de cabeçalhos/tabela `moov`, com limite de 16 MiB; arquivos sem essas tabelas, como certos MP4 fragmentados, retornam resultado inconclusivo. Não equivale a decodificação visual de todos os quadros.
- **Salvar vídeo editado**, **Salvar original** e **Salvar vídeo** da tomada usam a escrita de arquivo + folha nativa no app; a web continua com download. No iPhone, o usuário conclui com Salvar Vídeo ou Salvar em Arquivos. A descrição de acesso de adição ao Fotos foi incluída no preparo nativo. Não é afirmado que o arquivo foi salvo quando apenas se abriu o menu.
- Link público no app passa a usar `https://app.alvoprompter.com.br/?v=…`, em vez da origem local do Capacitor. Endereço visível, abrir/copiar/compartilhar link separados do compartilhamento do arquivo. Antes do upload, a interface explica a publicação e oferece definir a frase-chave no próprio fluxo, com pelo menos 12 caracteres. Se já existe sincronização, orienta reutilizar a mesma frase. Chave mantida na sessão, seguindo o armazenamento existente. Nenhuma publicação de vídeo pessoal foi executada no teste.
- Galeria ampliada de 5 para **12 trilhas geradas localmente**. Ouvir alterna para **Parar**, pode cancelar antes da geração terminar e encerra automaticamente em até 15 s. Só uma amostra toca por vez. O cache retém no máximo duas trilhas decodificadas. Upload de música própria permanece disponível.
- **Amostra de fundo e movimento** usa uma imagem do vídeo e as mesmas funções de recorte/movimento/chroma da exportação. Reprodução explícita de quatro segundos, botão Parar e nenhuma exportação necessária. O pan inclui margem de zoom para realmente deslocar uma imagem que ocupava todo o quadro.
- Ao finalizar, formato, estilo de legenda, movimento, cores e trilha da galeria são lembrados localmente por conta/espaço. Uma nova edição oferece **Usar estilo anterior** ou **Configurar este vídeo**. Não copia cortes, transcrição, títulos, logos ou arquivos de música pessoais; não envia material a IA para inferir um estilo.

## Validação

- **473 testes em 54 arquivos aprovados**, TypeScript e build nativo aprovados. Lint apenas com aviso preexistente de Fast Refresh em `audit/prompter-flow-harness.tsx`.
- Novos casos: exportação direta sem criar encoder, impedir reutilização com efeitos/cortes/conversão, dimensões sem ampliação, cancelamento, MP4 15 s de imagem / 97 s de áudio, intervalo de quadro excessivo, preferências isoladas por conta/espaço, salvar arquivo pelo plugin nativo e compartilhar URL HTTPS no app.
- O analisador executado no MP4 recebido retornou `videoSeconds: 15`, `audioSeconds: 97.4541`, `problem: true`.
- Exportação real no Chrome de mídia sintética com pan: 8,011 s, áudio decodificado e RMS 0,0914, arquivo persistido no projeto. Salvar vídeo editado criou o arquivo MP4 de 2.953.380 bytes em Downloads.
- Exportação real longa: **60,009 s**, concluída em **62,402 s**, RMS 0,0907, amostras visuais distintas em 1/20/40/58 s, 228 atualizações e progresso monotônico.
- Simulação de perda de callbacks de quadros enquanto a reprodução continua: erro correto em **16,159 s**, nenhum decoder residual. Cancelamento também aprovado.
- Interface conferida em largura de 390 px: Ouvir/Parar, 12 músicas, sugestão/aplicação do estilo anterior, amostra de movimento, ação de finalizar e orientação de frase-chave sem envio à nuvem.
- Tentativa de conferir pelo Safari local não produziu conteúdo visível na página de teste; não conta como teste WebKit aprovado. Gravação da câmera real e salvamento no Fotos/Arquivos do iPhone **ainda dependem de homologação no aparelho**. Os testes sintéticos não reproduzem todos os problemas de encoder do iOS.

Evidências em `artifacts/editor-20261121/`. O harness de finalização e o de exportação longa ficam em `audit/`, fora do bundle de produção.

## Entrega iOS

Gerada e enviada versão **1.6.6 (32)**, mantendo bundle ID e assinatura existentes. `ARCHIVE SUCCEEDED`, assinatura validada pelo `codesign --verify --deep --strict`, 55 arquivos web conferidos por SHA-256, manifesto de privacidade e descrição de acesso de adição ao Fotos presentes. O Xcode confirmou **Upload succeeded / EXPORT SUCCEEDED** e que o pacote entrou em processamento pela Apple.

Archive, logs, hashes, verificação e notas de teste em `artifacts/release-1.6.6-32/` e `artifacts/AlvoPrompter-1.6.6-32.xcarchive`. O cache do archive anterior foi reutilizado com uma tarefa de compilação por vez. Nenhuma limpeza manual ou exclusão de arquivos pessoais/projetos. Medição após archive: aproximadamente **7,5 GiB livres** no volume Data.

Após o usuário retomar o login, confirmado processamento concluído da versão **1.6.6 (32)** no App Store Connect. Notas de teste em português salvas e build associado ao grupo interno existente **Equipe AlvoPrompter**, com **1 tester**. A tela final confirmou `Salvo` e `Grupo (1): Equipe AlvoPrompter / Interno / 1`. Não houve envio à revisão pública nem associação a grupos externos. Comprovante: `artifacts/release-1.6.6-32/testflight-confirmacao.jpg`. Página: https://appstoreconnect.apple.com/teams/edfbb59a-11c0-4346-af77-6588b90d2ec5/apps/6815460612/testflight/ios/d5abda9c-1235-495b-afee-2b75e81c20db

Homologação recomendada no build 32: nova tomada de pelo menos dois minutos; assistir ao original até o fim; aplicar trilha e movimento; finalizar; assistir ao editado até o fim; salvar em Fotos/Arquivos; compartilhar arquivo; testar link público somente quando houver intenção de publicar. Comparar original e editado permite distinguir captura de exportação.
