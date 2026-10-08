# Entrada e início — 06/10/2026

Implementação local inspirada na hierarquia das referências do BIGVU enviadas pelo usuário. Identidade AlvoPrompter preservada, sem reutilizar fotografias, marcas, preços ou promessas de recursos do concorrente.

## Alterações

- Entrada com fotografia original de uma criadora, mensagem curta, três apresentações opcionais e acesso direto a cadastro, login e modo sem conta.
- Cadastro/login com a mesma identidade e retorno à apresentação. Os fluxos de autenticação existentes foram preservados.
- Início com destaque visual, atalhos para IA, escrita, importação e avatar, seguido de busca e roteiros. Navegação renomeada de Roteiros para Início.
- Imagem em WebP, 84.414 bytes, incluída no cache PWA e distribuída localmente no build nativo. Não há dependência de imagem externa.
- Tema escuro, larguras pequenas e espaçamento das áreas seguras preservados. A imagem é ilustrativa, gerada por IA, sem testemunho ou alegação de cliente real.

## Arte e rastreabilidade

- Ferramenta: image_gen integrado.
- Arquivo de produção: `public/images/creator-studio.webp`.
- Prompt completo e origem: `docs/entrega/creator-studio-image.json`.

## Verificação

- Prévia visual no navegador em 390 × 844 e 320 × 568; início também em 1280 × 900. Tela pequena permite rolagem vertical; entrada sem transbordamento horizontal a 320 px.
- Conferidos: apresentações, cadastro, login, explorar sem conta, abrir/fechar importação e abrir/fechar assistente IA, sem gerar chamadas de IA.
- Tema escuro do início verificado. Exibição com biblioteca vazia e com roteiro local conferida.
- Tipagem, lint e build nativo aprovados. Não foram criados testes automatizados para a alteração visual.
- Capturas: `artifacts/ux/entrada-390.png` e `artifacts/ux/inicio-390.png`.
- Prévia da apresentação: `http://localhost:5173/audit/entry-preview.html`; app: `http://localhost:5173/`.

## Distribuição

Alterações no código e prévia local. Nenhum novo binário iOS/TestFlight foi enviado nesta etapa. Políticas, preços e assinaturas não foram publicados ou alterados por este redesenho.

## Direção aprovada pelo usuário: referências múltiplas e identidade própria

O usuário aprovou a primeira versão visual e pediu que a evolução considere três grandes referências internacionais, evitando semelhança excessiva com o BIGVU. A versão aprovada deve ser a base; mudanças posteriores precisam resolver necessidades do AlvoPrompter, sem reproduzir telas completas de concorrentes.

Pesquisa em páginas oficiais em 06/10/2026:

| Referência | Evidência pública de escala | Princípio a estudar e adaptar |
| --- | --- | --- |
| BIGVU | A página inicial informa 12 milhões ou mais de usuários. | Apresentação humana dos benefícios e conexão entre roteiro, gravação e resultado. |
| Captions, da Mirage | A página inicial informa 20 milhões de usuários. | Prévia visual do resultado e ferramentas de IA descritas pela tarefa que resolvem. |
| Teleprompter.com | A página institucional informa mais de 5 milhões de downloads e 200 mil usuários mensais. | Leitura como foco principal, ajustes de ritmo e gravação acessíveis. |

São métricas declaradas pelas próprias empresas, em bases diferentes; não comprovam um ranking dos três maiores do mundo. A seleção é um benchmark complementar de teleprompter e criação de vídeo com IA. A análise se baseia nas páginas públicas e nas capturas fornecidas; não equivale a uma auditoria dos três aplicativos autenticados.

Aplicação própria para o AlvoPrompter:

- Posicionamento: um estúdio pessoal para preparar, ensaiar, gravar e finalizar uma mensagem.
- Usar fotografias originais de pessoas em situações plausíveis de criação, sem tratar personagens gerados como clientes ou depoimentos.
- Manter assinatura visual própria: violeta profundo, fundos claros, detalhes suaves em verde e tipografia legível. Evitar reproduzir a composição de pessoa, telefone flutuante e mascote do concorrente.
- Uma ação principal por etapa, com ferramentas secundárias acessíveis e estado de progresso claro.
- Apresentar o resultado de uma ferramenta por uma prévia verdadeira, apenas quando o recurso estiver implementado e validado.
- Fotografias na entrada e em pontos de descoberta; área de trabalho centrada no conteúdo do usuário, com roteiros e projetos fáceis de retomar.
- Textos, ícones, composição, planos e condições comerciais próprios. A seleção das referências não autoriza copiar a identidade ou importar promessas de funcionalidades.

Fontes: https://bigvu.tv/ ; https://captions.ai/ ; https://www.teleprompter.com/about-us ; https://www.teleprompter.com/ .

## Continuação: editor e auditoria funcional

- Retomada do roteiro existente movida para antes do destaque visual no início.
- Editor com etapas Preparar, Gravar e Finalizar, duração estimada, campos rotulados e área de escrita com contraste explícito nos dois temas.
- Leitura pela voz do aparelho acessível diretamente; importação, análise e ritmo em Mais ajustes.
- Opção de edição renomeada para Enquadrar olhos no terço superior: a implementação reenquadra o rosto, não corrige a direção do olhar.
- Editor conferido em prévia isolada com dados sintéticos nas larguras 390 e 320; ajuste de ritmo aplicado e restaurado, assistente IA aberto/fechado. Lint, tipagem e build nativo aprovados. Não houve nova distribuição iOS.
- Captura adicional: `artifacts/ux/editor-390.png`.
- Comparação e prioridades: [comparativo funcional](comparativo-funcional-2026-10-06.md).
