# AlvoPrompter

**Seu roteiro no alvo. Seu olhar na câmera.**
*Your script on target. Your eyes on the camera.*

Teleprompter PT-BR com VoiceTrack, câmera, gravação, biblioteca local e ferramentas de preparação de vídeo.

## Marca

- **Nome público:** AlvoPrompter — “alvo” comunica foco na lente; “prompter” identifica corretamente a categoria.
- **Slogan:** Seu roteiro no alvo. Seu olhar na câmera.
- **Símbolo:** A branco em fita dobrada sobre gradiente azul, violeta e magenta, derivado do conceito aprovado em `docs/brand/conceito-aprovado.png`. O SVG editável está em `public/logo.svg`; `node scripts/generate-brand.mjs` regenera os ícones.
- **Referências de produto:** BIGVU, Teleprompter Pro e PromptSmart. A referência é funcional; identidade, textos e ativos são próprios.

Alguns identificadores técnicos antigos (`com.alvoprompt.app`, banco IndexedDB `alvoprompt` e Worker publicado) são preservados para não quebrar instalações ou apagar dados existentes.

## Estado real do produto

| Área | Estado | Observação |
|---|---|---|
| Biblioteca e editor de roteiros | Funcional | IndexedDB local, importação de TXT, MD, DOCX, PDF, áudio e links |
| Prompter fixo/manual | Funcional | Velocidade, espelho, layout, câmera e gravação |
| VoiceTrack | Beta | Usa Web Speech API; disponibilidade e uso offline dependem do navegador |
| Legendas e tradução | Beta | Web Speech ou Cloudflare Workers AI |
| Editor de vídeo | Beta | Processamento local por Canvas e MediaRecorder; desempenho varia por aparelho |
| Control Room | Beta | WebRTC/DataChannel com pareamento manual, sem servidor de sinalização |
| Agenda multicanal | Planejador | Prepara mídia e legenda; não publica automaticamente nas redes |
| Contas e planos | Firebase configurado; cobrança pendente de segredo | Login por e-mail, cotas no servidor e webhook transacional |
| Workspaces SaaS | Integrados | Roteiros, agenda e brand kit em D1, revisões e RBAC de servidor |
| Sincronização legada | Recuperação | Importação por frase antiga; novos fluxos usam a conta |
| AI Twin | Avatar local | Anima foto com áudio; referências gravadas não fazem clonagem de voz |
| PWA, Android e iOS | Empacotados | Exigem QA final em aparelhos antes da distribuição pública |

## Stack

- React 19, Vite e TypeScript
- Tailwind CSS v4
- Zustand e Dexie/IndexedDB
- Web Speech API, MediaRecorder e WebRTC
- Cloudflare Workers AI, KV, R2 e D1
- Firebase Authentication
- Asaas Checkout e Webhooks
- Capacitor para Android e iOS

## Executar

```bash
npm install
npm run dev
```

Validação local:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Contas, planos e cobrança

Os planos iniciais, com valores de lançamento durante o beta, estão centralizados em `src/lib/plans.ts` e também validados no Worker:

| Plano | Mensalidade | Uso principal |
|---|---:|---|
| Grátis | R$ 0 | Prompter local, rolagem por voz, gravação e 10 usos de IA/mês |
| Criador | R$ 29,90 | Sync e backup, 1 workspace pessoal e 100 usos de IA/mês |
| Studio | R$ 79,90 | Até 5 membros, níveis de acesso, brand kit e 300 usos de IA/mês |

O checkout é hospedado pelo Asaas; dados de cartão não passam pelo AlvoPrompter. Criar o checkout não libera acesso. O plano é ativado somente pelo webhook autenticado `CHECKOUT_PAID`, com idempotência pelo ID do evento. Registro do evento e efeitos de pagamento são uma única transação: uma falha não impede a próxima tentativa. Eventos de cobrança e assinatura atualizam atraso, renovação e cancelamento. O titular pode cancelar a renovação no app; o Worker remove a recorrência no Asaas e preserva o acesso até o fim do período já pago. As cotas mensais de IA são consumidas atomicamente no D1 antes da chamada ao provedor e não dependem do navegador. Erros e respostas de chat vazias devolvem o uso consumido.

O banco D1 `alvoprompter-saas` já foi criado e recebeu a migração `api/transcribe/migrations/0001_saas.sql`. A migração `0004_workspace_content.sql` acrescenta conteúdo, revisões e marcações de exclusão. Aplique as migrações antes de publicar esta API.

Para ativar as contas:

1. O app Web do projeto `alvoprompt` está cadastrado e Email/Senha está habilitado. A configuração pública está em `src/lib/firebase-config.json`.
2. Use as quatro variáveis `VITE_FIREBASE_*` somente para substituir o projeto padrão. Não coloque segredos nelas.
3. Ao criar outro ambiente, ajuste `FIREBASE_PROJECT_ID`, `APP_URL` e `CORS_ORIGIN` em `api/transcribe/wrangler.toml`.
4. Configure os segredos sem prefixo `VITE_`:

```bash
cd api/transcribe
npx wrangler secret put ASAAS_API_KEY
npx wrangler secret put ASAAS_WEBHOOK_TOKEN
```

5. No Asaas, cadastre `https://SEU-WORKER/webhooks/asaas` com o mesmo token e os eventos de Checkout, Assinaturas e Cobranças usados pelo Worker.
6. Valide tudo com `ASAAS_API_BASE = "https://api-sandbox.asaas.com/v3"`. Só depois troque para `https://api.asaas.com/v3`.

O Firebase identifica a pessoa. O Worker valida o ID token e consulta o papel no D1 a cada operação protegida; o papel exibido no navegador não concede autoridade por si só.

## Outros serviços de nuvem

O núcleo de roteiro, prompter e gravação é local. Geração de texto, transcrição, tradução, TTS, avatar e sincronização usam o Worker em `api/transcribe`.

1. Copie `.env.example` para `.env.local` e configure `VITE_CLOUDFLARE_API_BASE`.
2. Crie chaves exclusivas para o AlvoPrompter no Google AI Studio e na Groq. Cadastre ambas somente como secrets do Worker:

```bash
cd api/transcribe
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GROQ_API_KEY
```

3. Em `api/transcribe/wrangler.toml`, substitua `CORS_ORIGIN` pelos domínios públicos reais antes de publicar.

O código de texto usa **Gemini → Groq**, com modelos configuráveis por `GEMINI_MODEL` e `GROQ_MODEL`. O Carcará foi retirado da integração. Cadastre as novas chaves antes do deploy; esta alteração local não ativa os serviços em produção. Para desenvolvimento, copie `api/transcribe/.dev.vars.example` para `.dev.vars` na mesma pasta (ignorado pelo Git).

Cada pedido tenta o Gemini primeiro e usa a Groq em falhas de rede, timeout, autenticação/configuração, limite, indisponibilidade ou resposta vazia, somente antes de entregar texto. São até 20 segundos por provedor para iniciar a resposta e 30 segundos de espera entre blocos durante a geração. Cancelamento, pedido inválido e recusa de conteúdo não disparam a cascata. Se uma resposta já começou, não misturamos textos de provedores diferentes. Uma falha é sinalizada ao app; versões anteriores do app podem exibir o texto parcial. A cota mensal é consumida uma vez, com devolução quando nenhum provedor entrega conteúdo; os custos dos provedores seguem suas próprias regras de cobrança.

Depois do deploy, `GET /health` informa versão, protocolo, projeto de login, os dois provedores/modelos e disponibilidade da cobrança, sem expor segredos. `ai.providers[].configured` informa apenas a presença de cada chave, não sua validade; `ai.fallbackReady` exige as duas chaves. Verifique chamadas reais de geração, melhoria e títulos antes de considerar a migração concluída. Publique também a política de privacidade atualizada em `api/privacy`.

Esta cascata é para geração de texto. A narração (`POST /tts`) usa a mesma `GEMINI_API_KEY`, com `GEMINI_TTS_MODEL=gemini-3.8-flash-lite-tts` e `GEMINI_TTS_VOICE=Kore`. Retorna WAV PCM mono de 24 kHz, aceita até 5.000 caracteres e aguarda até 90 segundos, sem repetir pedidos nem recorrer a outro provedor. Falhas devolvem a cota mensal do app. As cotas gratuitas e a cobrança do Google dependem do projeto da chave: confirme o Free tier no AI Studio antes de usar como serviço gratuito. A requisição usa `store: false`; isso impede a recuperação posterior da interação, mas não substitui as condições de uso de dados do plano Google.

Transcrição e tradução continuam no Cloudflare Workers AI. A leitura de ensaio no editor usa a voz disponibilizada pelo aparelho ou navegador, sem chamadas à API e sem gerar arquivo exportável. Essa leitura local depende da atualização do app instalada no aparelho.

O Worker exige login Firebase e isola mídia/sync legado por UID + frase-chave (mínimo 12 caracteres). Workspaces SaaS usam conta e RBAC. Limites de tentativa e uso são atômicos em D1; aplique a migração `0008_security_rate_limits.sql` antes de publicar o Worker. Clientes de sync/upload precisam enviar o token. Backups legados sem titular não são reivindicados automaticamente; reenvie a cópia local pela conta. Veja a atualização de segurança de 08/10 em `docs/auditoria-2026-09-23.md`.

## Privacidade e retenção

- Dados locais permanecem no aparelho até serem apagados pelo usuário.
- Conta, assinatura e papéis de workspace ficam no Firebase Authentication e Cloudflare D1.
- O Asaas recebe os dados necessários ao checkout e processa a cobrança recorrente.
- Roteiros, agenda e identidade visual dos workspaces da conta ficam no Cloudflare D1. Vídeos permanecem no dispositivo; o plano sincroniza conteúdo textual e metadados, não arquivos de vídeo.
- O conteúdo legado por frase-chave continua no KV com expiração em 90 dias.
- Solicitações de texto são enviadas ao Google Gemini e, em caso de falha antes de entregar conteúdo, podem ser reenviadas à Groq; transcrição e outras funções usam Cloudflare Workers AI.
- Áudios enviados para transcrição são processados pelo Cloudflare Workers AI.
- O vídeo do avatar é renderizado localmente.

A política publicada deve permanecer alinhada a esses comportamentos: `api/privacy/src/index.ts`.

## Estrutura principal

```text
src/
├── components/       interface, editor, prompter, agenda, equipe e AI Twin
├── hooks/            VoiceTrack, gravação, gamepad e transcrição
├── lib/              banco local, sync, IA, vídeo, importação e WebRTC
└── store/            estado global Zustand
api/
├── transcribe/       Worker de IA, sync e mídia
└── privacy/          política de privacidade
landing/              página comercial baseada em demonstrações reais do produto
android/ e ios/       projetos Capacitor
```

## Próximas etapas

1. Configurar `ASAAS_API_KEY` e validar a compra em sandbox antes de habilitar cobrança real.
2. Publicar a API com a migração de conteúdo e a versão web correspondente após a revisão da entrega.
3. Integrar APIs oficiais antes de anunciar publicação automática multicanal.
4. Adicionar clonagem de voz somente com consentimento explícito e provedor apropriado.
5. Ampliar testes de mídia, PWA e aparelhos Android/iOS.

## Validação de mídia

Com `npm run dev`, abra `/audit/media-harness.html`. A bancada usa os módulos reais de gravação, edição e compartilhamento com vídeo/áudio sintéticos. Não entra no build de produção. O relatório de entrega discrimina testes automatizados, navegador e aparelhos físicos.

### Verificação de segurança

Execute `npm run security:secrets` após o build e `npm audit`. Não configure segredos com prefixo `VITE_`; Pexels usa `PEXELS_API_KEY` no Worker. `public/_headers` configura as proteções do Pages; a API aplica seus próprios headers. O importador do servidor aceita apenas HTTPS e serviços aprovados, inclusive em redirecionamentos. A auditoria local não confirma regras/IAM remotos nem publica correções automaticamente.
