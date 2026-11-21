---
name: alvorecer-web-modernizacao
description: Avalie e modernize componentes, desempenho e segurança de LPs, apps e painéis existentes. Use para uma revisão transversal ou aplicação dos quatro blocos de melhorias web; não para impor recursos sem necessidade nem substituir um pentest especializado.
---

# Modernização web Alvorecer

Analise o sistema antes de implementar. Cubra os quatro blocos abaixo em cada execução completa; marque cada item como implementado, existente e verificado, recomendado, inconclusivo ou não aplicável, com evidência e justificativa. Se o usuário pedir apenas avaliação ou um bloco, respeite esse limite.

## Execução

1. Identifique LP/app/painel, stack, build, rotas, autenticação, hospedagem, integrações e alterações locais. Preserve o trabalho existente e consulte instruções do repositório.
2. Registre a linha de base: testes relevantes, dados de desempenho disponíveis, interfaces atuais e configuração de segurança. Leia somente os arquivos necessários; não imprima segredos ou dados pessoais.
3. Priorize gargalos comprovados e mudanças proporcionais. Reutilize a stack. Uma melhoria pode ser uma decisão de não mudar. Não transforme todo item em tarefa obrigatória nem uma revisão local em autorização para publicar, migrar identidade ou testar terceiros.
4. Implemente o que for pertinente e autorizado. Pesquise documentação primária atual para APIs recentes, compatibilidade e dependências. Detecte capacidades e preserve alternativa funcional.
5. Valide comportamento, teclado, mobile/desktop, preferências de movimento e integrações afetadas. Use testes de regressão para riscos reais; não crie testes que apenas confiram texto ou reproduzam a implementação.
6. Entregue relatório com cobertura dos quatro blocos, mudanças, evidências, limitações e próximos passos. Diferencie hipótese de falha confirmada, resultado local de produção, e medição de laboratório de dados reais. Não declare melhoria de conversão ou Core Web Vitals sem dados comparáveis.

## 1. Componentes e responsividade

- **Accordion:** preserve números/provas essenciais visíveis; use expansão para FAQ e detalhes secundários. Anime abrir e fechar com conteúdo de altura variável, interrupções rápidas e teclado funcionando. Mantenha semântica/estado acessíveis e redução de movimento.
- **Abas:** aplique a grupos de conteúdo coerentes, com tablist/tab/tabpanel, rótulos, aria-selected, foco móvel e setas/Home/End. O destaque deve acompanhar posição e dimensões, inclusive após resize, fontes e quebra de linha. CSS Anchor Positioning pode aprimorar o visual; mantenha fallback.
- **Container queries:** adapte o conteúdo à largura do próprio card quando ele for reutilizado em espaços diferentes. O container fica em um ancestral do conteúdo consultado; não use consulta do viewport como substituto nem crie dashboards fictícios em LPs.

## 2. Modais e ajuda contextual

- **Dialog:** migre modais reais para `<dialog>` quando houver ganho. Preserve Escape, foco inicial/restaurado, nome acessível, fundo inerte, rolagem e modais aninhados. Não transforme avisos não bloqueantes em modais.
- Anime entrada/saída com `@starting-style`, `display` e `overlay` com `allow-discrete`, quando suportados. Não desmonte o componente React antes da animação de saída; mantenha fechamento funcional sem essas APIs.
- **Popover/tooltips:** use Popover API para conteúdo auxiliar não modal e Anchor Positioning para posicionamento. Não esconda informação essencial; suporte foco/teclado e toque. Popover sozinho não implementa toda a semântica/interação de tooltip. Não adicione tooltips apenas para preencher o checklist.

## 3. Desempenho

- **Pré-carregamento:** identifique destinos prováveis e use mecanismos do framework ou importações compartilhadas de módulos. Antecipe seletivamente por hover/foco, considerando toque. Não pré-carregue âncoras da mesma página, links com efeitos, conteúdo privado ou todos os destinos; respeite economia de dados/conexões lentas. Evite trabalho duplicado e trate falhas sem impedir a navegação normal.
- **INP/tarefas longas:** reproduza interações e meça antes/depois quando possível. Localize CPU, renderização e tarefas >50 ms; demora de rede não é, isoladamente, INP ruim. Divida processamento em lotes com `scheduler.yield()` e fallback macrotask; `Promise.resolve()` não libera o navegador para pintar. Considere Web Worker para CPU pesada, cancelamento e resultados obsoletos. Não fragmente loops sem evidência de custo relevante.
- **LCP:** identifique o candidato em mobile/desktop e separe TTFB, descoberta/carregamento do recurso e atraso de renderização. Priorize apenas recursos críticos, evite lazy loading no elemento principal, dimensione imagens, compile CSS no build e reduza dependências bloqueantes. Não use preload/fetchpriority em tudo. Inclua CLS na verificação de regressão.

## 4. Segurança e autenticação

- **Passkeys/WebAuthn (opcional):** avalie o provedor existente, RP ID/origens, HTTPS e plataformas web/nativas. Prefira integração suportada e bibliotecas mantidas. Cadastro e login exigem desafios imprevisíveis de uso único verificados no servidor, validação de origem/RP/assinatura/verificação do usuário e associação segura ao usuário existente. Planeje múltiplas credenciais, remoção, perda/recuperação e fallback. Nunca simule autenticação apenas no cliente nem substitua sessões existentes sem planejamento. Recursos recentes são condicionais à capacidade real do navegador.
- **CSP gradual:** inventarie política atual e integrações. Preserve proteções existentes; teste candidatas via header Report-Only antes de impor restrições incertas. Report-Only não bloqueia e não funciona como meta equivalente. Prefira scripts externos locais, hashes ou nonces por resposta conforme hospedagem; não adicione unsafe-eval, curingas ou unsafe-inline para ocultar falhas. Teste auth, mídia, workers, fontes, analytics com consentimento e checkout no limite autorizado. Não envie relatórios para terceiros sem necessidade/autorização.
- **Revisão de segurança:** examine fronteiras de confiança, autorização no servidor e isolamento entre usuários, validação, dependências, segredos, headers, URLs externas e integrações. Use fixtures locais para casos negativos e positivos. Documente cobertura e riscos residuais. Uma revisão local não é pentest completo; testes ofensivos/remotos precisam de escopo apropriado.

## Fontes primárias

Consulte conforme o bloco e confira atualizações/compatibilidade na execução:
- [Dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), [Popover](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API), [Anchor Positioning](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Anchor_positioning), [Container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries).
- [LCP](https://web.dev/articles/optimize-lcp), [INP](https://web.dev/articles/optimize-inp), [tarefas longas](https://web.dev/articles/optimize-long-tasks), [próxima navegação](https://developer.chrome.com/docs/modern-web-guidance/guides/performance/improve-next-page-load-performance).
- [WebAuthn](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API), [CSP](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSP), [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/).
