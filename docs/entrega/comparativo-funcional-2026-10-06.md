# AlvoPrompter: comparação funcional e prioridades

Análise em 06/10/2026. Referências: BIGVU, Captions e Teleprompter.com. São três referências internacionais complementares; não há nesta pesquisa comprovação de que sejam, em conjunto, os três maiores do mercado.

## Conclusão

O AlvoPrompter já tem uma base ampla de preparação, teleprompter, gravação e edição. A distância mais relevante está na continuidade do trabalho e na profundidade da pós-produção: recuperar um take após fechar o app, produzir legendas consistentes, automatizar escolhas de edição e publicar sem depender de etapas manuais.

Contar botões daria uma impressão enganosa de equivalência. Nosso avatar é uma animação de fotografia; o enquadramento de olhos é um recorte; a agenda organiza o compartilhamento. Esses recursos não equivalem a avatar neural, correção de olhar ou publicação programada por API.

## Método e limites

- Concorrentes: páginas oficiais consultadas, não testes dos aplicativos pagos. Recurso anunciado não significa disponibilidade em todos os planos, plataformas ou países.
- AlvoPrompter: inspeção do código atual e verificações locais de interface. A presença de uma implementação não comprova qualidade equivalente ou funcionamento em todos os aparelhos.
- “Não confirmado” significa que a fonte consultada não esclareceu o recurso; não significa que o concorrente não o possua.
- Gemini/Groq para texto e Gemini para narração tiveram verificações técnicas anteriores nesta tarefa. Falta concluir a validação autenticada do fluxo completo no aplicativo instalado. O redesenho local ainda não foi distribuído via TestFlight.

## O que aprender de cada referência

| Referência | Ênfase observada | Aplicação própria |
| --- | --- | --- |
| [BIGVU](https://bigvu.tv/tools) | Jornada de roteiro até distribuição, identidade visual e ferramentas de vídeo. | Conectar as etapas e mostrar o próximo passo com clareza. |
| [Captions](https://captions.ai/features/edit-with-ai) | Edição assistida por IA, com composição automática e comandos de alteração. | Mostrar uma prévia concreta e permitir ajustes, em vez de apresentar apenas uma lista de opções. |
| [Teleprompter.com](https://www.teleprompter.com/) | Leitura, controle de ritmo, importação e acessórios. | Tornar ensaio e gravação previsíveis, com ajustes acessíveis. |

A identidade continua sendo AlvoPrompter: fotografia original ilustrativa, violeta profundo, espaços claros, linguagem em português e conteúdo do usuário como centro da área de trabalho. Não reproduzir telas completas, personagens, preços ou promessas dos concorrentes.

## Comparação por capacidade

As fontes vinculadas em cada coluna sustentam as capacidades anunciadas. A avaliação do AlvoPrompter se apoia nos arquivos listados adiante.

| Capacidade | BIGVU | Captions | Teleprompter.com | AlvoPrompter e diferença encontrada |
| --- | --- | --- | --- | --- |
| Roteiro com IA | [AI Script Writer](https://bigvu.tv/tools) | [Criação com IA](https://captions.ai/) | [AI Script Generator](https://www.teleprompter.com/) | Geração, melhoria, títulos, ganchos e hashtags com Gemini → Groq. Base implementada; qualidade editorial comparativa não medida. |
| Teleprompter e ritmo | [Mobile e web](https://bigvu.tv/tools) | Modos detalhados não confirmados nas páginas consultadas | [Voz, velocidade, tempo e espelhamento](https://www.teleprompter.com/) | Modos voz, fixo, manual e duração; fontes e espelhamento. Sem reconhecimento disponível, o modo voz pode acompanhar energia do áudio, não palavras. |
| Controle remoto | [Integração PIVO](https://bigvu.tv/tools) | Não confirmado | [Watch, Bluetooth e MIDI](https://www.teleprompter.com/) | Sala de controle entre dispositivos por WebRTC/QR. Não encontrei integrações equivalentes com Watch/MIDI/pedais. |
| Qualidade de captura | [Gravação integrada](https://bigvu.tv/tools) | [Fluxo de criação e edição](https://captions.ai/) | [Até 4K, conforme aparelho](https://www.teleprompter.com/features/4k-recording-captions) | Solicita resolução ideal de 1280×720 a até 30 fps; não encontrei seletor 1080p/4K. A resolução real depende do dispositivo. |
| Legendas | [Automáticas](https://bigvu.tv/tools) | [Ampla biblioteca de estilos e idiomas](https://captions.ai/) | [Geradas após gravar, com ajustes](https://www.teleprompter.com/features/4k-recording-captions) | Texto/tempo editáveis, destaque por palavra, SRT e legenda no vídeo. Três temas visuais; origem atual depende de transcrição ao vivo e tempos por palavra estimados. |
| Edição automática | [Corte por palavras](https://bigvu.tv/tools) | [Composição por IA e ajustes por chat](https://captions.ai/features/edit-with-ai) | [Edição e tratamento de gravação](https://www.teleprompter.com/features/4k-recording-captions) | Cortes, intervalos, silêncio e palavras de preenchimento. Comandos de clipe usam regras; não há editor semântico completo de vídeo por IA. |
| Vídeo longo → cortes | [Seleção de momentos por IA](https://bigvu.tv/tools/ai-auto-shorts/) | Não confirmado nesta pesquisa específica | Não confirmado | Exportação de vários clipes existe. Não encontrei seleção semântica dos melhores momentos, com justificativa e revisão. |
| Imagens de apoio e música | [AI B-Roll](https://bigvu.tv/tools) | [Inserção na edição por IA](https://captions.ai/features/edit-with-ai) | Não confirmado | Busca manual no Pexels, dependente de configuração, e cinco trilhas sintetizadas localmente. Falta sugerir cenas relevantes e sincronizar automaticamente. |
| Correção de olhar | [Eye Contact Correction](https://bigvu.tv/tools) | [Redirecionamento do olhar](https://captions.ai/features/correct-your-eye-contact) | Não confirmado | Rastreamento/enquadramento do rosto quando FaceDetector está disponível. Não altera a direção dos olhos; nome da opção corrigido nesta etapa. |
| Remoção de fundo | [Background Remover](https://bigvu.tv/tools) | [Remoção na edição](https://captions.ai/features/edit-with-ai) | [Desfoque/substituição](https://www.teleprompter.com/features/4k-recording-captions) | Chroma key por cor. Não encontrei segmentação automática de pessoa em fundo comum. |
| Limpeza de áudio | Não confirmado nesta pesquisa específica | [Remoção de ruído](https://captions.ai/features/edit-with-ai) | [Clean Audio na pós-produção](https://www.teleprompter.com/features/4k-recording-captions) | Supressão de ruído solicitada na captura. Não equivale a tratamento dedicado do áudio já gravado. |
| Narração e voz pessoal | [Voice Cloning](https://bigvu.tv/tools) | [Voz e criação com IA](https://captions.ai/) | Não confirmado nesta pesquisa específica | Leitura pela voz do aparelho e narração Gemini com voz configurada. Amostras de voz salvas não constituem clonagem. |
| Avatar/dublê digital | [AI Twin e Talking Photo](https://bigvu.tv/tools) | [Avatares e AI Twin](https://captions.ai/) | Não confirmado | Fotografia animada em canvas, boca modulada pelo áudio. Não é dublê neural com sincronização labial realista. Tradução de texto não equivale a dublagem traduzida com lip-sync. |
| Marca | [Brand Kit](https://bigvu.tv/tools) | [Estilos de edição](https://captions.ai/features/edit-with-ai) | [Personalização de marca](https://www.teleprompter.com/) | Logos, cores, introdução/finalização e kits de equipe existem. Falta validar consistência do resultado entre formatos e aparelhos. |
| Publicação programada | [Envio automático para contas conectadas](https://bigvu.tv/tools/social-media-scheduler/) | Não confirmado nesta pesquisa específica | Não confirmado | Agenda, conteúdo e compartilhamento pelo aparelho. A pessoa confirma na rede; não encontrei serviço de publicação automática com OAuth e fila de tarefas. |
| Métricas sociais | [Painel social](https://bigvu.tv/tools) | Não confirmado nesta pesquisa específica | Não confirmado | Contadores locais de uso e visualizações de páginas de vídeo. Não encontrei alcance, retenção e engajamento consolidados via APIs sociais. |

## Lacuna crítica adicional: continuidade do projeto

O take atual fica no estado em memória e usa uma URL temporária. As tabelas locais abrangem roteiros, agenda, equipes, avatares e amostras de voz, mas não encontrei recuperação automática da gravação e da edição em andamento após fechar/reabrir o app. Há exportação de vídeo, páginas publicadas e anexos na agenda; isso não substitui salvar automaticamente o projeto de edição.

A renderização usa canvas e MediaRecorder em tempo real. O aplicativo precisa permanecer ativo, e interrupções, limites de memória e compatibilidade merecem testes no aparelho. Não é evidência de falha em todos os casos, mas é um risco de produto mais urgente que adicionar novos efeitos. Não foi feita medição comparativa de estabilidade dos concorrentes.

## Prioridade recomendada

| Ordem | Entrega | Critério de aceite proposto |
| --- | --- | --- |
| P0 | Recuperação de gravação e projeto | Reabrir o app e recuperar take, cortes e legendas; tratar falta de armazenamento sem perder silenciosamente o trabalho. |
| P0 | Jornada real no iPhone e Android | Preparar → gravar → legendar → exportar → compartilhar; verificar orientação, sincronismo, interrupções, teclado e áreas seguras. |
| P1 | Transcrição após a gravação | Gerar legendas a partir do áudio final, editar palavras/tempos e repetir a geração; informar limites e falhas. Já existe uma base de transcrição a integrar ao editor. |
| P1 | Resultado audiovisual consistente | Presets próprios de legenda, qualidade de captura selecionável conforme o aparelho, prévia confiável e tratamento de áudio. Começar por 1080p bem validado, antes de prometer 4K. |
| P2 | Edição assistida | Sugerir cortes semânticos e imagens de apoio; sempre permitir revisar. Medir custo, demora e relevância antes de oferecer automatização ampla. |
| P2 | Distribuição conectada | Integrar inicialmente uma rede com autorização, fila de publicação, confirmação de sucesso e tratamento de erro. Depois expandir métricas e canais. |
| P3 | Recursos de IA especializada | Avaliar correção real de olhar, remoção de fundo, voz clonada e avatares realistas. Dependem de provedores/modelos, processamento, qualidade, consentimento e custo; as chaves de texto não resolvem tudo. |

Essas são prioridades propostas, não recursos já implementados nem estimativas de prazo. A recomendação é consolidar primeiro um estúdio confiável para vídeos falados em português, com qualidade de saída reconhecível e fluxo simples.

## Evidência no repositório

- Roteiro e cascata: `src/components/ai/AiPanel.tsx`, `src/lib/ai.ts`, `src/lib/chatStream.ts`, `api/transcribe/src/chat.ts`.
- Leitura, captura e voz: `src/lib/types.ts`, `src/hooks/useVoiceTrack.ts`, `src/hooks/useRecorder.ts`, `src/hooks/useTranscription.ts`, `src/lib/controlRoom.ts`.
- Persistência: `src/store/useAppStore.ts` (`recording`, `setRecording`), `src/lib/db.ts`, `src/lib/drafts.ts`.
- Edição/exportação: `src/components/editor/VideoEditor.tsx`, `src/lib/video/render.ts`, `src/lib/clipPrompt.ts`.
- Imagem e áudio: `src/lib/faceTrack.ts`, `src/lib/broll.ts`, `src/lib/music.ts`, `src/lib/aiTwin.ts`, `api/transcribe/src/tts.ts`.
- Agenda/métricas/equipe: `src/components/scheduling/SchedulingHub.tsx`, `src/components/metrics/MetricsPanel.tsx`, `src/lib/videopage.ts`, `src/lib/cloudSync.ts`.

## UX aplicada nesta etapa

- Mantida a entrada e a identidade visual aprovadas, com imagem original.
- Retomada de roteiro existente acima do destaque promocional no início.
- Editor com etapas nomeadas Preparar → Gravar → Finalizar, duração estimada visível, campos rotulados e área de escrita mais legível.
- Ouvir texto em acesso direto; importação, análise e ritmo agrupados em Mais ajustes.
- “Eye contact fix” substituído por “Enquadrar olhos no terço superior”, descrevendo o comportamento implementado.
- Verificação visual do editor em 390×844 e 320×568, abertura/fechamento do assistente e aplicação/restauração do ritmo. Prévia usa dados sintéticos, sem chamada de IA ou captura de câmera.
- Lint, tipagem no build e build nativo aprovados. A visualização no navegador não substitui validar áreas seguras e teclado no iPhone real.

Captura: `artifacts/ux/editor-390.png`. Alterações locais; nenhuma nova versão TestFlight enviada nesta etapa.
