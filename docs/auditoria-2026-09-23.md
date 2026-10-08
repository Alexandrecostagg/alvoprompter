# AlvoPrompter — auditorias de produto e segurança

## Atualização — auditoria de segurança de 08/10/2026

Escopo: código local do app, Worker Cloudflare, autenticação Firebase, autorização D1, KV/R2, dependências, histórico Git acessível e sondagens públicas somente de leitura. A lista enviada pelo usuário foi tratada como referência de auditoria. As alterações anteriores de produto foram preservadas.

**Resultado: correções implementadas e verificadas localmente. Não houve publicação desta revisão na API, no site ou nas lojas.** A API pública ainda utiliza o comportamento anterior. Não equivale a uma auditoria externa de infraestrutura ou garantia de ausência de vulnerabilidades.

### Achados corrigidos

| Prioridade | Achado | Correção e evidência |
|---|---|---|
| Crítica | Capacitor Android/iOS 8.5.0 afetados por carregamento de conteúdo remoto na origem do app | Atualização para 8.5.3 e sincronização dos projetos nativos. A correção só chega aos aparelhos com novo binário instalado. |
| Alta | Rotas legadas `/sync`, `/schedules`, `/workspaces` e `/media` dependiam apenas da frase-chave | Agora exigem JWT Firebase validado; o namespace é derivado de UID + frase, calculado no servidor. Testes confirmam isolamento mesmo com frase e nome de arquivo iguais. |
| Alta | Modelo de integração Pexels colocava sua chave em `VITE_PEXELS_API_KEY` | Busca migrou para `/broll` autenticado; chave `PEXELS_API_KEY` somente no Worker. Build recusa variáveis VITE de segredos, exceto identificador público Firebase. |
| Alta | Upload confiava apenas em um Content-Length opcional | PUT exige tamanho, limite de 100 MiB, tipo de mídia permitido e `FixedLengthStream`. Runtime local confirmou que excesso/truncamento não deixam objeto gravado. GET privado força download; CSP/nosniff impedem interpretação ativa. A validação de tipo é por MIME declarado, sem antivírus ou análise completa de codecs. |
| Alta | Importação de URL seguia redirecionamentos após validar só a URL inicial | HTTPS e domínios aprovados, validação a cada salto, cinco saltos no máximo, timeout e limite de 2 MiB. Domínios arbitrários não são buscados pelo servidor. |
| Média | Exceções de provedor/banco/JWT podiam aparecer ao usuário | Respostas públicas genéricas, sem SQL, detalhes criptográficos ou mensagem bruta do provedor. |
| Média | CORS retornava wildcard e faltavam headers consistentes | Origem exata autorizada, Vary, no-store, nosniff, CSP, HSTS e proteção de frames; aplicados também às falhas e respostas de autenticação. Headers do frontend preparados em `public/_headers`. |
| Média | Limites por KV usavam leitura/incremento sujeitos a corrida | Contadores atômicos D1, limite prévio de 120 tentativas/minuto por IP, limites por usuário nas rotas protegidas e limites diários. Limpeza limitada em segundo plano remove contadores expirados durante o tráfego, sem exigir novo Cron Trigger. Cotas de IA existentes continuam atômicas. |
| Média | JSON/multipart podia ser lido sem limite efetivo se faltasse tamanho no header | Leitura limitada pelo total real de bytes antes dos parsers: JSON 1 MiB; áudio 26 MiB incluindo envelope, com arquivo limitado a 25 MiB. Objetos/tipos/idiomas validados. |
| Média | Validação manual Firebase não exigia todos os campos de tempo; cache de certificados não expirava | JWT exige assinatura RS256, issuer, audience, sub, exp, iat e auth_time; limite de idade e cache com validade/timeout. Testes usam assinatura real para tokens falsificados/expirados/outro projeto. |
| Média | Vite aceitava qualquer host e escutava em toda a rede | Desenvolvimento restrito a loopback/localhost; bloqueio explícito de arquivos de chaves, artefatos, `.env`, `.dev.vars` e material de assinatura. |
| Preventiva | Troca direta de conta podia manter seleção de workspace anterior | Seleção de workspace é limpa quando o UID muda. |

### Cobertura da lista enviada

| Itens | Resultado |
|---|---|
| 1–3: chaves, .env e senhas no código | Gemini/Groq continuam no servidor; Pexels corrigido. Scanner não encontrou padrões de credenciais privadas no histórico local acessível nem no pacote. Configuração Firebase pública não é chave administrativa. Não foi inferida a validade de segredos remotos. |
| 4–7: login, servidor, IDs e isolamento | JWT real, RBAC, UID derivado do token e consultas filtradas por membro; testes de invasor e de mesma frase em duas contas. |
| 8–10: banco, storage e admin | D1/R2 acessados por bindings; SQL parametrizado; membros/admin/owner conferidos no backend. Firestore local restringe roteiros a `/users/{uid}/scripts`; regras implantadas/IAM dos consoles não foram inspecionados. Não há integração Supabase/Firebase Storage neste fluxo. |
| 11–12: debug e erros | Sem source maps no build padrão; erros internos tratados. Desenvolvimento agora local. Lint tem três avisos anteriores nas telas/harness do prompter, sem novos erros. |
| 13–16: validação, conteúdo, upload e SQL | Limites reais de corpo, sanitização por coleção, React renderizando textos sem injeção HTML, upload limitado e binds SQL. DOCX usa extração de texto, não inserção do HTML recebido. |
| 17: limites | Contador D1 atômico com teste concorrente. Login/senha é delegado ao Firebase; configurações remotas de proteção contra abuso não foram auditadas. |
| 18: histórico Git | 1.323 objetos enumerados; blobs de até 3 MB examinados por padrões conhecidos, sem correspondências privadas. Scan não substitui revogação se algum segredo tiver sido compartilhado fora do repositório. |
| 19: headers/CORS | Ajustes locais na API e em Cloudflare Pages. Publicação pendente. |
| 20–21: teste externo e auditoria | Testes adversariais locais + sondagens públicas de leitura; limites e pendências discriminados abaixo. |

### Verificações realizadas

- `npm test`: **217 testes aprovados em 24 arquivos**, dos quais 39 novos nesta auditoria.
- `npm run typecheck`, build web, build Capacitor e `cap sync`: aprovados.
- `npm run lint`: termina com sucesso, com três avisos preexistentes do prompter/harness.
- `npm audit`: **16 alertas inicialmente; zero após atualizações**. Capacitor 8.5.3, sharp e dependências transitivas corrigidos. Overrides específicos: gRPC do Firestore, UUID do Xcode e argparse do Mammoth; não foi usado `audit fix --force`.
- Compatibilidade adicional: leitura do projeto Xcode e geração de UUID; CLI Mammoth `--help`; extração de texto de DOCX de teste.
- Runtime Cloudflare local + R2 local: upload de 4 bytes aceito; corpos de 3 e 5 bytes declarando 4 rejeitados, sem objeto persistido.
- Scanner de segredos no código versionado e pacote público, com saída sem valores. CI passa a executar scanner e `npm audit --audit-level=high`.
- Sondagens públicas: `/account` sem token retorna 401; `/sync` sem frase retorna 400; mídia sem frase retorna 401. API ainda retorna CORS wildcard e não os novos headers. Site sem CSP; `.env` e `chaves-ia.local.txt` retornam HTML do aplicativo, sem conteúdo desses arquivos.

### Publicação e limitações

1. Aplicar **`0008_security_rate_limits.sql` antes do Worker**. Sem a tabela, a nova proteção falha fechada e impede chamadas protegidas.
2. Publicar frontend atualizado e Worker de forma coordenada. Clientes antigos que não enviam token em sync/upload precisam atualizar. Publicar também `_headers` no Pages.
3. Backups antigos por frase **não são atribuídos automaticamente à primeira conta que conhecer a frase**. Isso permitiria apropriação. As cópias locais permanecem e podem ser reenviadas ao namespace da conta; dados antigos não foram apagados nem lidos nesta auditoria. Workspaces SaaS com RBAC mantêm seu formato atual. Páginas de vídeo já compartilhadas continuam públicas pelo link, como antes.
4. Configurar `PEXELS_API_KEY` no Worker para ativar busca. Nenhuma chave deve ser copiada para VITE. Outros domínios de importação só podem ser liberados pelo operador em `IMPORT_ALLOWED_HOSTS`, com nomes exatos de serviços confiáveis; arquivos/texto continuam como alternativa.
5. Gerar/publicar novos binários para que a correção nativa chegue aos aparelhos. **Esta rodada não gerou AAB/IPA nem enviou versões às lojas.** Sincronização/build web nativo não substituem compilação nativa e teste físico.
6. O acesso com um ID token já emitido segue sua validade, até uma hora; não foi adicionada consulta de revogação imediata de conta a cada chamada. Dados locais permanecem no aparelho, sem criptografia adicional por conta.
7. Configurações remotas de Firebase, IAM, bucket R2 público, App Check, restrições da chave pública e proteção contra abuso/cadastro precisam de inspeção nos consoles para uma conclusão de infraestrutura. Não foram alteradas nesta rodada. Limites por IP/conta não substituem gestão de armazenamento total e monitoramento de custos.

Referências primárias consultadas: [verificação de tokens Firebase](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [orientações OWASP para SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [segurança de hosts no Vite](https://vite.dev/config/server-options). As conclusões de implementação e os números acima vêm dos testes locais e das sondagens descritas.

---

## Registro histórico de produto — 23/09/2026

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
