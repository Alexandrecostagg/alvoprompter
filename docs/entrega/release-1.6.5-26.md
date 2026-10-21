# AlvoPrompter 1.6.5 (26) — ensaios e Stories

## Comportamento

- A geração de IA guarda um roteiro separado na biblioteca. O usuário pode salvar para depois ou abrir no editor. Falhas de armazenamento impedem o fechamento silencioso do resultado concluído.
- O prompter guarda texto, ajustes e posição de leitura. “Salvar e continuar depois” retorna à biblioteca; o ensaio pode ser recuperado sem substituir alterações posteriores do roteiro.
- “Gravar áudio do ensaio” usa somente o microfone. Parar/salvar, terminar a leitura ou ocultar a tela finalizam a captura e aguardam o encoder antes de liberar o microfone. Áudio e roteiro correspondente ficam em “Seus ensaios”, com reprodução, compartilhamento e retomada. Cada gravação de voz é uma tomada separada; máximo de 30 minutos por tomada.
- Ensaios e áudios são locais, separados por conta e espaço. A exclusão local da conta remove suas fontes de áudio. Outro aparelho requer uma cópia compartilhada; não há promessa de sincronização automática desses arquivos.
- Tomadas parciais preservam o vídeo original. É possível reabrir a edição e usar um trecho. Continuar o roteiro gera outra tomada; não concatena automaticamente gravações.
- IA e exportação identificam Instagram Reels, Stories e Feed. Feed retrato usa 4:5; Stories usam 9:16.
- Exportação compacta limita a dimensão maior a 1280 e usa bitrate de 2,5 Mbps. Stories podem ser inteiros ou partes de até 15/30/60 segundos, com arquivos numerados e compartilhamento individual ou conjunto quando o sistema oferece suporte.
- As partes usam a linha de tempo já editada; não repetem abertura/encerramento em cada parte. Intervalos contíguos reservam 150 ms de margem de encoder, preservando todo o conteúdo. Limite de 30 partes por operação. A duração disponível no Instagram deve ser conferida no próprio destino.

## Validação

- 362 testes em 40 arquivos aprovados antes do preparo nativo. Tipagem aprovada; lint com apenas aviso preexistente no harness antigo.
- Testes adicionados: recuperação após reabertura do banco, isolamento de contas/espaços, captura sem câmera, finalização assíncrona, falha do encoder, fontes de áudio, exclusão seletiva e intervalos de Stories.
- Navegador, componentes reais com mídia sintética: áudio de 13,78 s persistido, decodificado (RMS 0,0141) e reproduzido na biblioteca; roteiro, ajustes e posição de 32% recuperados. Retomada do checkpoint confirmou 18% na interface.
- Segunda exportação de fonte de 17,01 s: partes de 14,87 s e 2,15 s, 720×1280, MP4 H.264/AAC; áudio decodificado nas duas (RMS 0,0141 / 0,0137). Partes e vídeo completo reabertos na biblioteca; presets Stories/compacto/15 s preservados.
- Primeiro teste revelou excedente de 40 ms na parte de 15 s; corrigido com margem de encoder e repetido com sucesso.
- Evidências privadas em `artifacts/salvar-stories-20261021/`. O teste usa oscilador e canvas, sem câmera/microfone reais ou postagem nas redes.

## Teste do titular no TestFlight

1. Confirmar versão 1.6.5 (26). Gerar roteiro para Stories; salvar para depois, fechar e reabrir pela biblioteca.
2. Abrir o prompter, tocar “Gravar áudio do ensaio”, ler por 20 s e “Salvar e continuar depois”. Em Roteiros → Seus ensaios, ouvir o áudio no alto-falante e retomar o roteiro. Repetir encerrando pelo fim da leitura.
3. Parar um vídeo antes do fim; salvar e voltar depois. Reabrir a edição, manter um trecho e conferir o original. “Continuar roteiro em nova tomada” preserva a anterior.
4. Exportar Instagram Stories → Compacto → partes de 15 s, usando um vídeo de mais de 20 s. Assistir todas as partes, conferir continuidade de voz e ordem; salvar pelo menu do iPhone e importar no Instagram sem publicar se não desejar.
5. Repetir em Reels e Feed 4:5. Conferir enquadramento, áudio, legendas e botões fora das áreas do sistema.

O teste do navegador não homologa microfone, roteamento de áudio, compartilhamento nativo, exportações longas ou importação no Instagram do iPhone. Nenhuma versão pública deve ser enviada antes desse teste. Cobrança Google continua desativada, aguardando suporte; esta entrega não altera o Worker nem cria cobranças.

## Distribuição

- Build 26 em iOS e Android. Archive Xcode e AAB assinados aprovados, usando um único job/worker por compilação.
- Xcode confirmou `Upload succeeded` e `EXPORT SUCCEEDED` às 17h23 (Belém). Após o titular renovar a sessão, App Store Connect confirmou processamento. Build associado ao grupo interno Equipe AlvoPrompter (1 tester); tabela do grupo confirmou status Em testes. Instruções preenchidas e botão Salvo confirmado. Evidências privadas: testflight-26-notas.jpg e testflight-26-grupo.jpg em artifacts/release-1.6.5-26. Não foi enviada versão pública.
- AAB: `artifacts/alvoprompter-1.6.5-code26.aab`, com SHA-256 ao lado e assinatura verificada. Ainda não enviado à Play Console nesta entrega.
- Web publicada em `https://63b3bac6.alvoprompter.pages.dev`, projeto de produção `alvoprompter`. Backend não alterado.
- Scanner de segredos: 453 arquivos e histórico Git, sem correspondências privadas nos padrões examinados. Isso não equivale a certificação integral de segurança.
