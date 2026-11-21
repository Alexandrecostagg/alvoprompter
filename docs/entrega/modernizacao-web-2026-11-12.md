# Primeira execução — modernização web AlvoPrompter

Data: 12/11/2026 (America/Belem). Escopo: checkout local, LP em `landing/`, app React/Capacitor e revisão das fronteiras de segurança da API Cloudflare. Nenhum deploy, migração, cadastro de credencial, compra ou teste ofensivo remoto. As alterações de accordion/abas/cards da rodada anterior foram preservadas.

## Skill

`alvorecer-web-modernizacao`, com fonte versionável em `skills/alvorecer-web-modernizacao` e cópia instalada em `~/.codex/skills/alvorecer-web-modernizacao`. Validador oficial aprovado. Cobre os quatro blocos, com decisões por aplicabilidade e limites explícitos. Esta execução real validou seu fluxo; não houve avaliação independente por outro agente.

## Cobertura e decisões

| Bloco/item | Resultado | Evidência/decisão |
| --- | --- | --- |
| Accordion animado | Existente e verificado | FAQ da LP abre/fecha; conteúdo e semântica nativa preservados. Verificação visual em 390 px e desktop nesta sequência de trabalho. |
| Abas e destaque | Existente e verificado | Abas da LP com Anchor Positioning, fallback medido e teclado. Teste de troca após extração do JS e compilação estática. |
| Container queries | Existente | Cards de recursos consultam sua largura; nenhum card fictício de dashboard foi criado. |
| Modais `<dialog>` | Implementado parcialmente | Menu “Mais ferramentas” migrado para camada nativa, com Escape, fundo inerte, restauração de foco e transições CSS. Componente permanece montado para a saída. Outros modais legados continuam candidatos a migrações próprias. `EditorToolDialog` já usava dialog. |
| Popover/tooltip | Recomendado seletivamente | LP não tem tooltips personalizados para migrar. App contém `title` em calendário, métricas e controles: revisar explicações que não tenham equivalente visível no toque/teclado; não substituir todos indiscriminadamente. |
| Pré-carregamento | Implementado | Importações compartilhadas com React.lazy em Início, Editor, Gravar e Agenda no desktop, por pointerenter/foco. Sem mount ou consulta de dados do usuário. Respeita saveData/2g, deduplica e permite retry após falha. Mobile continua navegando normalmente. Âncoras da LP não recebem prefetch. |
| Tarefas longas/INP | Implementado em gargalo medido | Conversão PCM de 12 min/16 kHz: linha de base local Node de 111 ms contínuos para 11.520.000 amostras. Caminho de transcrição agora usa lotes, orçamento cooperativo de 8 ms e verificação a cada 8.192 amostras, com scheduler.yield ou fallback macrotask; cancelamento é atendido entre lotes. Orçamento não é garantia de teto em qualquer aparelho. |
| LCP | Melhorias implementadas; medição de campo pendente | Tailwind Browser CDN removido. CSS gerado antes do carregamento; primeira imagem do hero tem fetchpriority high; demais capturas usam lazy/async e dimensões reservadas. Não foi medido ganho numérico de LCP/INP/CLS nesta rodada. |
| Passkeys | Recomendado como projeto separado | `src/lib/auth.ts` usa Firebase Auth e a API valida seus tokens. Não há registro/verificação WebAuthn nem emissão de sessão equivalente. Antes de implementar: decidir integração com Firebase, RP ID/origens, recuperação, vínculo à conta e suporte Android/iOS. Não foi alterado o login atual. |
| CSP | Implementado gradualmente na LP; existente no app | LP: proteções object-src/base-uri/frame-ancestors impostas e candidata mais completa em header Report-Only. Scripts executáveis foram extraídos para `main.js`. App mantém sua CSP existente. Report-Only não bloqueia; sem endpoint, violações ficam no console. |
| Revisão de segurança | Revisão local e regressões aprovadas | Revisados JWT, CORS, limites de requisição, URLs externas, regras Firestore e headers. Testes existentes cobrem tokens forjados/expirados, isolamento, SSRF/redirecionamentos e limites. Não equivale a pentest completo nem comprova configuração remota. |

## Alterações e operação

- `npm run build:landing` gera `landing/utilities.css` com o compilador Tailwind instalado no projeto e verifica ausência de script/handlers inline. Execute após modificar classes em `landing/index.html` ou `landing/main.js`. A pasta `landing/` continua pronta para hospedagem estática; o CSS gerado acompanha a fonte.
- A extração de JS mantém os controles de consentimento. Meta Pixel continua desativado quando não há ID e sem consentimento.
- A CSP candidata da LP deve ser observada com as integrações reais antes de impor bloqueio de scripts/conexões. Não houve habilitação de analytics para teste.
- As transições do menu respeitam movimento reduzido; a LP também desativa animações decorativas, rolagem suave e revelações animadas nessa preferência.
- Dependências diretas do build da LP são as mesmas versões de `@tailwindcss/node` e `@tailwindcss/oxide` já presentes no lockfile (4.3.3); nenhum pacote novo foi executado.

## Evidências e verificações

- 48 arquivos e 444 testes aprovados, incluindo segurança da API e novos casos de equivalência do WAV, cancelamento e falha/retry/economia de dados do preload.
- Build web e build da LP aprovados; TypeScript aprovado pelo build.
- Lint sem erros; permanece um aviso preexistente em `audit/prompter-flow-harness.tsx`.
- Scanner local de segredos aprovado nos arquivos examinados; não é garantia de ausência de segredos em todo o histórico ou arquivos ignorados.
- Navegador: LP com headers servidos localmente e CSS estático, abas, FAQ e consentimento; nenhum aviso/erro no console no cenário testado. Sem overflow horizontal observado no móvel.
- Menu em desktop e 390×844: camada modal nativa, Escape/restauração, layout inferior no celular e transição para Conta com foco em “Fechar conta”. Essa última transição revelou uma corrida de foco, corrigida aguardando a restauração nativa antes de abrir Conta.
- Captura privada local: `artifacts/web-modernizacao/menu-mobile.jpg`.
- Consulta online npm concluída após autorização explícita do titular: 7 pacotes sinalizados (5 moderados, 2 baixos; nenhum alto/crítico). A primeira tentativa havia sido bloqueada pela revisão automática por envio do grafo ao registro; a autorização resolveu esse limite.

### Achado confirmado: dependências de build com avisos conhecidos

`npm ls` localiza as cadeias em `@capacitor/cli → rimraf → glob` e `vite-plugin-pwa → workbox-build → glob/@rollup/plugin-node-resolve`. São ferramentas de desenvolvimento/build; não foi demonstrada exploração remota no app publicado. Os sete pacotes sinalizados incluem dependentes, não sete falhas independentes.

| Causa | Versões locais | Impacto/condição e encaminhamento |
| --- | --- | --- |
| [glob / GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | 11.1.0 e 13.0.6 | Aviso de cancelamento/consumo de recursos em travessia de arquivos; versão corrigida indicada: 14.0.2. Avaliar atualização dos consumidores, não impor uma major transitiva sem testes. |
| [minimatch / GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | 10.2.6 | Amplificação por padrões controlados pelo atacante; corrigido em 11.0.1. Não há endpoint identificado que aceite padrões remotos nessa cadeia de build. |
| [deepmerge / GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | 4.3.1 | Poluição do protótipo de objetos retornados; advisory sem versão corrigida. Rever atualização/substituição no consumidor do build. |

Recomendação: atualizar coordenadamente as ferramentas PWA/Capacitor e testar build web, build nativo e instalação/atualização/offline do service worker. Não foi executado `npm audit fix --force`: a proposta retornada para o plugin PWA é um downgrade para 1.1.0, com possível mudança de comportamento. Evitar fornecer configuração/padrões/objetos não confiáveis ao build enquanto as cadeias são avaliadas. Severidade efetiva depende da exposição; não tratar esses alertas como invasão confirmada.

## Pendências priorizadas

1. Tratar os avisos da cadeia de build acima em atualização controlada. Validar a CSP candidata com Pixel efetivamente configurado, login, mídia/serviços aplicáveis e hospedagem de produção, sem desativar a política já imposta no app. `connect-src https:` e permissões amplas de imagens/mídia no app merecem inventário antes de restringir.
2. Medir LCP e interações em aparelhos/CPUs mais lentos e, se houver dados de usuários disponíveis, comparar percentis reais. A alocação e cópia final do WAV ainda podem custar tempo em aparelhos modestos; um Worker é próximo passo se a medição justificar.
3. Migrar modais de Conta, ajustes, importação e resultado de gravação em rodadas com seus próprios fluxos de mídia/auth/nativo. Não confundir a primeira migração com migração de todos.
4. Planejar passkeys como integração completa, preservando recuperação e sessões Firebase; não adicionar um botão sem backend funcional.
5. Tooltips de métricas/calendário: priorizar informações que hoje só aparecem em `title`, oferecendo acesso por foco e toque.

## Fontes primárias consultadas

- https://tailwindcss.com/docs/installation/play-cdn — compilador de navegador destinado a desenvolvimento.
- https://developer.chrome.com/docs/modern-web-guidance/guides/performance/break-up-long-tasks — divisão cooperativa de tarefas.
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog — semântica/modal e animação.
- https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSP — adoção em Report-Only.
- https://firebase.google.com/docs/auth/web/custom-auth — sessões Firebase com autenticação customizada, caso essa integração seja escolhida.
