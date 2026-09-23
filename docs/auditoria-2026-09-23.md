# AlvoPrompter — auditoria de produto e funcionalidades

Data: 23/09/2026. Versão declarada: 1.2.8.

## Parecer

**Aproximadamente 60% de prontidão para um lançamento comercial confiável.** O projeto já é um beta funcional, com biblioteca, editor, prompter e várias ferramentas implementadas. Ainda há falhas no fluxo essencial e dependências de configuração/validação que impedem considerar o produto pronto para cobrar e distribuir amplamente.

Esta porcentagem é uma estimativa de engenharia, não cobertura de testes, quantidade de arquivos concluídos ou prazo restante. Considera implementação, integração e evidências obtidas nesta auditoria. A visão histórica do produto inclui promessas que o próprio README classifica como futuras ou beta.

| Área | Prontidão estimada | Peso | Fundamentação |
|---|---:|---:|---|
| Roteiros e prompter | 75% | 30% | Leitura fixa, pausa, reinício, espelho, busca e importação TXT funcionam; o indicador de salvamento é incorreto e pode levar à perda de texto. |
| Voz, gravação e edição de vídeo | 60% | 20% | Código implementado; faltam evidências de gravação, exportação longa e reconhecimento em aparelhos reais nesta auditoria. |
| IA e legendas | 50% | 15% | Integrações presentes; geração bloqueada por autenticação no ambiente testado; sincronismo de legendas e qualidade não homologados. |
| Contas, cobrança e equipe | 35% | 20% | Estrutura SaaS existente, configuração local incompleta, sistemas de workspace separados e falha de repetição do webhook reproduzida. |
| Interface e identidade | 70% | 10% | Biblioteca utilizável em desktop e celular; identidade precisa simplificação e há mensagens de estado inconsistentes. |
| Qualidade e distribuição | 45% | 5% | CI, build web e testes unitários existentes; faltam testes contínuos dos fluxos críticos e homologação nativa. |

Resultado ponderado: 58,25%, arredondado para aproximadamente 60%. Faixa razoável de incerteza: 50–65%, especialmente por mídia e serviços autenticados ainda não homologados.

## O que foi executado

Ambiente: cópia local servida em `http://127.0.0.1:5173`, navegador integrado, visualizações de 1280×720 e 390×844. Os testes preservaram o roteiro preexistente. Foram criados um roteiro `QA — auditoria 23-09-2026` e um planejamento `QA — planejamento local`, ambos locais. Nada foi publicado nas redes sociais.

### Verificação automatizada

| Verificação | Resultado |
|---|---|
| `npm run lint` | Passou. |
| `npm run typecheck` | Passou para os projetos TypeScript configurados; a configuração do app inclui `src`, não todo o backend. |
| `npm test` — suíte original | 12 testes passaram em 4 arquivos. |
| `npm run build` | Passou; gerou app e service worker PWA. |
| `npm test -- audit/backend.audit.test.ts` | 4 verificações adicionais passaram; uma delas confirma a reprodução de um defeito, não sua correção. |

Na verificação final, `npm run lint` passou novamente e a suíte completa terminou com 16 verificações passando em 5 arquivos. O teste que reproduz o defeito de cobrança continua documentando o comportamento incorreto atual.

O build produziu um aviso de importação dinâmica ineficaz de `auth.ts`, que também é importado de forma estática. Não bloqueia o build. O precache gerado contém aproximadamente 1,85 MiB; isso não substitui testes de instalação e uso offline. Há dependências grandes carregadas separadamente, como PDF e DOCX.

Os 12 testes originais cobrem normalização e estatísticas de texto, interpretação de comandos de corte, utilitários de compartilhamento e detecção de disponibilidade da API de fala. **Não são 12 testes completos de funcionalidades do produto. Não foi medida cobertura percentual de código.**

As 4 verificações adicionais usam banco simulado e não acessam o Asaas nem alteram assinaturas reais:

1. Conta configurada sem token é rejeitada com 401.
2. Webhook sem token válido é rejeitado antes de acessar o banco.
3. Configuração com placeholder de Firebase deixa passar a etapa de cota mensal por conta, conforme o comportamento atual do código.
4. Falha temporária após registrar o evento de pagamento faz a repetição ser descartada como duplicada. Defeito reproduzido.

### Testes pela interface

| Cenário | Resultado observado |
|---|---|
| Abrir biblioteca | Funcionou e carregou o roteiro preexistente. |
| Criar roteiro e digitar título/texto | Campos e contagem de palavras funcionaram. |
| Indicador e botão de salvar | **Falhou:** exibe “Salvo neste dispositivo” com botão desativado após alterações. |
| Recarregar após digitar, sem usar Preparar | **Falhou:** o roteiro de teste desapareceu. |
| Preparar e abrir prompter | Funcionou e salvou o roteiro. |
| Recarregar depois de Preparar | Roteiro e conteúdo permaneceram na biblioteca. |
| Busca por título | Encontrou o roteiro QA e filtrou o outro roteiro. |
| Prompter fixo | Iniciou e avançou. |
| Pausa | Parou em 25% com estado “Pausado”. |
| Reinício | Retornou a 0% e estado “Pronto”. |
| Espelhamento | Texto apareceu espelhado visualmente. |
| Biblioteca em 390×844 | Navegação inferior e controles principais visíveis; título longo é truncado. |
| Importar TXT | Funcionou com texto em português e acentos. |
| Analisar texto importado | Exibiu contagem, duração e palavras-chave. |
| Abrir conta e planos | Exibiu aviso de que a conta online não está ativa neste beta. |
| Gerar roteiro com IA | **Bloqueado:** retornou “Entre na sua conta para continuar.” |
| Agenda sem título | Validou com “Dê um título à publicação.” |
| Salvar planejamento fictício | Funcionou e mostrou confirmação. |
| Recarregar e reabrir agenda | Planejamento permaneceu salvo. |

Consulta pública ao `/health` da API: HTTP 200. Resposta observada: `status: ok`, `carcara.configured: true`, modelo `Carcara-3.8-27B`, `workersAi.configured: true`. O código local anuncia DeepSeek nesse mesmo endpoint. Isso comprova divergência entre o código/configuração observados, mas não identifica qual revisão está implantada nem garante o funcionamento das operações de IA.

## Problemas e prioridades

### P1 — impedir perda de roteiros

**Confirmado na interface e no código.** Em `src/components/editor/ScriptEditor.tsx:25`, um efeito redefine `dirty` para falso toda vez que `currentScript` muda. Os campos mudam justamente esse objeto a cada edição. A interface volta a dizer que está salvo, sem que `handleSave` tenha sido executado.

Correção recomendada: separar a seleção de um roteiro das alterações do rascunho, implementar salvamento automático com tratamento de falha e mostrar o estado real de persistência. Confirmar com teste de digitar → esperar salvar → recarregar → recuperar o mesmo texto. O problema também afeta a confiança no estado de roteiros importados.

### P1 — conectar o login à IA e alinhar ambientes

**Confirmado na interface e configuração local.** Nenhum dos arquivos `.env`, `.env.local`, `.env.production` ou `.env.capacitor` foi encontrado na cópia examinada. O arquivo de exemplo tem campos Firebase vazios, e `api/transcribe/wrangler.toml` contém `FIREBASE_PROJECT_ID = "configure-o-id-do-projeto"` e Asaas sandbox. O app confirma que o login local não está configurado, enquanto a API acessada exige conta para gerar texto.

Correção recomendada: definir homologação e produção explicitamente; configurar Firebase em ambos os lados; indicar login obrigatório antes da geração; validar cadastro, login, recuperação, token, cota e geração autenticada. Acrescentar versão/revisão ao endpoint de saúde para tornar divergências verificáveis. Não foi inferido o estado dos segredos remotos a partir dos arquivos locais.

### P1 — tornar recuperável o processamento de pagamento

**Reproduzido em teste isolado.** Em `api/transcribe/src/saas.ts:288`, o evento entra em `webhook_events` antes da atualização da assinatura. Se a atualização falhar, o evento fica registrado; na repetição, retorna `duplicate: true` sem tentar a atualização novamente. O resultado possível é um pagamento confirmado sem liberação do plano.

Correção recomendada: garantir atomicidade ou controlar estados de processamento e permitir repetição de eventos incompletos. Testar erro temporário, duplicação, concorrência, ordem dos eventos e reconciliação. O teste demonstra o risco no código local; não demonstra que algum cliente real foi afetado.

### P2 — completar a integração entre equipe, conteúdo e planos

**Verificado por leitura de código.** `src/lib/saas.ts` gerencia workspaces de conta; `src/lib/workspace.ts` e a tela Equipe usam objetos locais e sincronização legada por frase-chave. A biblioteca carrega todos os roteiros locais, e o tipo Script não vincula o conteúdo a um workspace SaaS.

Há permissões de servidor para operações de conta/workspace, mas isso não comprova uma colaboração de conteúdo completa com os mesmos papéis. É necessário definir a migração e aplicar a autorização ao conteúdo compartilhado. Também alinhar a oferta paga de sync/backup ao controle legado que ainda se apresenta como gratuito.

### P2 — persistir preferências e definir conflitos de sincronização

**Verificado por leitura de código.** `src/store/useAppStore.ts` mantém as configurações de prompter apenas em memória; o tema possui persistência separada. Fontes, velocidade e espelho devem ter persistência consistente, se forem preferências do usuário.

O sync em `src/lib/sync.ts` mescla por chave e data, mas a exclusão local não cria um registro de exclusão sincronizável. Um roteiro excluído localmente que permaneça na nuvem pode reaparecer. Validar esse cenário em uma biblioteca isolada antes de oferecer backup como garantia de recuperação.

### P2 — homologar mídia e ampliar testes dos fluxos principais

O código de gravação pede resolução ideal de 1280×720 a 30 fps; a visão histórica menciona 4K. Não tratar 4K como capacidade validada. O VoiceTrack usa reconhecimento do navegador e fallback por nível de áudio, que não equivale a acompanhar cada palavra.

Priorizar: permissão concedida/negada, interrupção do app, vídeo longo, pouco espaço, áudio e vídeo sincronizados, orientação do celular, legendas, exportação e compartilhamento no Android e iPhone. Acrescentar testes contínuos de salvar/abrir roteiro, importar, prompter e fluxo autenticado. Incluir o backend na checagem de tipos e testar suas rotas.

## O que permanece sem homologação nesta auditoria

- Captação real de câmera e microfone, precisão de VoiceTrack e reconhecimento offline.
- Renderização/exportação de vídeo, cortes, áudio final, TTS, tradução e sincronismo das legendas.
- Importação de DOCX, PDF, áudio, YouTube e Google Docs.
- Pareamento real do Control Room entre dois aparelhos/redes.
- Sincronização entre dispositivos e recuperação de conflitos.
- Cadastro/login reais, compra, renovação, cancelamento e cobrança ponta a ponta no sandbox.
- Instalação PWA e execução offline após instalação; apps Android/iOS em aparelhos físicos.

Esses itens não foram classificados como aprovados apenas por existirem no código. A agenda é um planejador com publicação assistida; não há publicação automática comprovada. O avatar local reproduz/anima mídia, e não oferece clonagem de voz para textos novos.

## Direções para a logo

A marca atual combina borda com gradiente, quatro cantos de enquadramento, letra A e ponto ciano. Em tamanho pequeno, esses detalhes competem e o desenho perde clareza. O nome continua legível, mas o símbolo comunica pouco sobre leitura e gravação.

1. **A em foco — direção recomendada.** Um A robusto, com um único recorte circular ou ponto na travessa sugerindo a lente. Eliminar a moldura interna e reduzir a quantidade de traços. Grafite com um acento ciano; versão de uma cor igualmente forte.
2. **Roteiro em movimento.** Três linhas de texto, com uma linha destacada que forma discretamente uma seta. Comunica teleprompter de maneira mais direta e pode gerar uma animação de abertura simples.
3. **Lente e cursor.** Círculo aberto com um pequeno cursor de leitura integrado. Mais discreto e adequado para uma marca de estúdio; precisa de desenho próprio para não parecer um ícone genérico de câmera.

Para qualquer opção: desenhar primeiro em preto e branco, verificar em 16/24/32 px, usar o mesmo símbolo no app e favicon, testar fundo claro/escuro e preparar versão horizontal com AlvoPrompter. Evitar somar alvo, câmera, play, microfone e letra A no mesmo símbolo. Não foi feita pesquisa de disponibilidade de marca nem substituição da logo nesta auditoria.

## Ordem sugerida de trabalho

1. Corrigir salvamento e adicionar teste de persistência.
2. Alinhar Firebase, IA e configuração dos ambientes.
3. Corrigir repetição do webhook antes de abrir cobrança.
4. Homologar gravação → edição → exportação em Android/iPhone.
5. Integrar workspaces, sync e permissões sobre conteúdo.
6. Refinar logo e consistência visual enquanto os bloqueadores funcionais são resolvidos.

O escopo desta entrega é diagnóstico. Foram adicionadas verificações de auditoria e um arquivo TXT de teste; o código de produção não foi corrigido. A alteração preexistente em `android/app/build.gradle` foi preservada.
