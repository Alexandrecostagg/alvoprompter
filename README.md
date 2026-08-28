# AlvoPrompter

**Seu roteiro no alvo. Seu olhar na câmera.**
*Your script on target. Your eyes on the camera.*

Teleprompter PT-BR com VoiceTrack, câmera, gravação, biblioteca local e ferramentas de preparação de vídeo.

## Marca

- **Nome público:** AlvoPrompter — “alvo” comunica foco na lente; “prompter” identifica corretamente a categoria.
- **Slogan:** Seu roteiro no alvo. Seu olhar na câmera.
- **Símbolo:** a letra A enquadrada por uma mira, com o ponto ciano marcando a linha de leitura.
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
| Contas e planos | Implementado, requer configuração | Firebase Authentication, plano gratuito e assinaturas recorrentes no Asaas |
| Workspaces SaaS | Implementado, requer configuração | D1 com RBAC de servidor para owner, admin, editor e viewer |
| Workspaces legados | Compatibilidade local | Brand kit e colaboradores via frase-chave continuam disponíveis durante a migração |
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

O checkout é hospedado pelo Asaas; dados de cartão não passam pelo AlvoPrompter. Criar o checkout não libera acesso. O plano é ativado somente pelo webhook autenticado `CHECKOUT_PAID`, com idempotência pelo ID do evento. Eventos de cobrança e assinatura atualizam atraso, renovação e cancelamento. O titular pode cancelar a renovação no app; o Worker remove a recorrência no Asaas e preserva o acesso até o fim do período já pago. As cotas mensais de IA são consumidas atomicamente no D1 antes da chamada ao provedor e não dependem do navegador.

O banco D1 `alvoprompter-saas` já foi criado e recebeu a migração `api/transcribe/migrations/0001_saas.sql`. Ele armazena apenas identidade vinculada, assinatura, checkout, workspaces, membros e IDs de eventos.

Para ativar as contas:

1. Crie ou selecione um projeto Firebase, cadastre um app Web e ative Email/Senha em Authentication.
2. Copie `.env.example` para `.env.local` e preencha as quatro variáveis `VITE_FIREBASE_*`.
3. Troque `FIREBASE_PROJECT_ID`, `APP_URL` e `CORS_ORIGIN` em `api/transcribe/wrangler.toml`.
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
2. Configure a chave da DeepSeek somente como secret do Worker:

```bash
cd api/transcribe
npx wrangler secret put DEEPSEEK_API_KEY
```

3. Em `api/transcribe/wrangler.toml`, substitua `CORS_ORIGIN` pelos domínios públicos reais antes de publicar.

Depois do deploy, `GET /health` confirma se o Worker está ativo, se o secret da DeepSeek foi encontrado e qual modelo está configurado, sem revelar a chave. A geração de roteiros usa `deepseek-v4-flash` com raciocínio desativado para priorizar baixa latência; sugestões estruturadas usam o modo JSON da API.

O Worker aplica limites diários por IP, limites de payload, isolamento de mídia por frase-chave e exige frases de sincronização com pelo menos 12 caracteres. A frase-chave permanece apenas como compatibilidade do sync antigo; novos workspaces SaaS usam conta e RBAC.

## Privacidade e retenção

- Dados locais permanecem no aparelho até serem apagados pelo usuário.
- Conta, assinatura e papéis de workspace ficam no Firebase Authentication e Cloudflare D1.
- O Asaas recebe os dados necessários ao checkout e processa a cobrança recorrente.
- Roteiros, agenda e workspaces sincronizados ficam no Cloudflare KV por até 90 dias desde a última sincronização.
- Solicitações de texto podem ser processadas por DeepSeek e Cloudflare.
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

1. Configurar Firebase e os segredos do Asaas nos ambientes de homologação e produção.
2. Migrar conteúdo dos workspaces legados por frase-chave para os workspaces SaaS autenticados.
3. Integrar APIs oficiais antes de anunciar publicação automática multicanal.
4. Adicionar clonagem de voz somente com consentimento explícito e provedor apropriado.
5. Ampliar testes de mídia, PWA e aparelhos Android/iOS.
