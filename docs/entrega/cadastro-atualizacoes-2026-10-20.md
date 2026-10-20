# Cadastro, visitante e atualização por loja — 20/10/2026

## Decisão de produto

Manter o cadastro inicial curto: nome, e-mail, senha e confirmação, ou provedor social configurado. Telefone e organização opcionais no perfil, sem pedir CPF, endereço ou data de nascimento sem finalidade concreta. Dados de cobrança no momento da assinatura, pelo fluxo do provedor. Não associar automaticamente contas por coincidência de e-mail.

Visitante pode escrever, ensaiar e gravar localmente. IA, mídia remota, sincronização, importação remota, B-roll e workspaces exigem autenticação validada no servidor e e-mail confirmado. Perfil/consulta da própria conta continuam disponíveis antes da confirmação; o usuário precisa conseguir reenviar a mensagem e atualizar seu estado. A verificação de e-mail reduz abuso de contas descartáveis, mas não substitui cotas, limites de tentativas e autorização por usuário.

Google tem integração no código. Apple permanece indisponível até concluir configuração do provedor, capacidade e entitlement no target, provisionamento e testes reais. Não habilitar o botão apenas para simular disponibilidade. A diretriz Apple 4.8 exige opção equivalente com recursos de privacidade ao oferecer login social; revisar antes da publicação. Também não foi encontrado fluxo de exclusão da própria conta no app, exigido pela diretriz 5.1.1(v). Estas pendências não estão resolvidas por esta entrega.

## Implementação

- Autorização de IA recusa e-mail não confirmado antes da reserva de cota e do uso do provedor. Endpoints de nuvem e workspaces também recusam. Resposta 403 com `EMAIL_VERIFICATION_REQUIRED`; sem login, 401.
- Textos de boas-vindas e confirmação explicam a divisão local/nuvem.
- Migração 0011 cria `app_policy` e `app_policy_audit`. Regras independentes para iOS e Android, inicialmente build mínimo 0 (desligadas).
- GET público `/app-policy?platform=ios|android` retorna apenas plataforma, build mínimo, versão e revisão, com `Cache-Control: no-store`. Sem dados de usuários, ator ou URLs configuráveis.
- `/admin/app-policy` GET/PUT exige o mesmo administrador raiz com Firebase verificado/allowlist. PUT valida build, versão, revisão esperada e confirmação de disponibilidade na loja. Atualização e auditoria são atômicas; conflito retorna 409.
- Conta e assinatura → Administração → Atualização obrigatória nas lojas. Exige revisão e confirmação antes de aplicar. Não altera usuários, contratos ou cobranças.
- `NativeUpdateGate` consulta o build nativo via Capacitor App, ao abrir, voltar ao primeiro plano e a cada 5 minutos em primeiro plano. Build antigo recebe tela sem opção de pular, com link fixo da loja e nova consulta. Não compara a versão do package.json.
- Primeiro carregamento aguarda a consulta; consulta HTTP termina em até 8s. Sem rede e sem regra armazenada, não inventa bloqueio e permite abrir. Regra já conhecida persiste offline. Falha/corrupção de cache não apaga projetos. Revisões antigas não desfazem configurações mais novas; rollback administrativo recebe revisão nova.
- Uma regra recebida durante prompter/editor de vídeo é aplicada após sair da tela, para não encobrir uma gravação ou exportação. Filhos ficam montados e inertes durante o bloqueio, preservando seu estado. Não há instalação silenciosa.

## Operação por versão

1. Gerar novo AAB/IPA com o verificador incluído, conferindo os maiores números nos consoles. Esta rodada não gera nem envia binários e não reutiliza build 22.
2. Publicar e confirmar download efetivo para os públicos/países suportados de cada loja. Upload, revisão, TestFlight e teste fechado não confirmam disponibilidade pública.
3. No painel, definir a versão e o build mínimo para cada plataforma e confirmar a disponibilidade. Para exigir toda nova versão, repetir após cada lançamento; não há descoberta automática da disponibilidade nos consoles.
4. Em incidente, salvar build mínimo 0. O cliente aceita a revisão nova mesmo com o mínimo reduzido.

Apps antigos sem o verificador não podem passar a exibir essa tela retroativamente. Distribuir a primeira versão compatível é pré-requisito. O bloqueio de tela é controle de compatibilidade, não substitui autenticação nem prova criptográfica da integridade do cliente. Não foram adicionados headers de versão que pudessem ser confundidos com uma credencial.

## Verificação

- 295 testes passaram em 34 arquivos, incluindo 11 novos casos de política/segurança/cache: admin, isolamento de plataformas, prontidão da loja, build inválido, conflito, auditoria atômica/rollback, cache offline e recusa antes da cota.
- TypeScript app/Worker e build web aprovados. Navegador com componentes reais e transporte de teste, viewport 390×844: revisão, gravação simulada da regra, tela obrigatória e ação de verificar novamente. Sem regra habilitada em produção durante os testes.
- Evidências locais em `artifacts/account-update-20261020/`: logs, `01-admin-mobile.png`, `02-update-mobile.png`. O harness é explicitamente simulado; não comprova sessão Capacitor/App Store/Play em aparelho real. O verificador completo também foi executado com adaptador nativo simulado: chegada da regra durante tomada, bloqueio após sair, consulta sem desvio do bloqueio, instalação de build igual ao mínimo, reabertura offline com cache e suspensão administrativa. Evidências 03 a 07 no mesmo diretório.
- Pendente antes da loja: homologação da atualização no iPhone/Android real (startup, volta da loja, offline, versões antiga/igual/nova e segurança de área de tela), login Apple e exclusão de conta.

Fontes: https://developer.apple.com/app-store/review/guidelines/#login-services e https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage

## Publicação desta rodada

- Migração 0011 aplicada em produção, ambas as plataformas com mínimo 0/revisão 0, confirmado pelo endpoint público.
- Worker release `1.6.4-access-update-policy-20261020`, versão `5ab3b061-b81c-4114-adea-1ad0b97c42dd`.
- Pages: https://282e8c64.alvoprompter.pages.dev, domínio https://app.alvoprompter.com.br.
- Nenhum AAB/IPA gerado, nenhuma regra obrigatória ativada e nenhuma cobrança criada.
