# AlvoPrompter 1.4.0 — entrega Android e iOS

Data: 23/09/2026. Pacotes gerados sem commit, push ou deploy. Após autorização posterior, o app foi criado e o build iOS 1.4.0 (14) enviado e processado pela Apple; consulte [registro do envio](apple-envio-1.4.0.md).

## Arquivos prontos

- Android: [alvoprompter-1.4.0-code14.aab](../../artifacts/alvoprompter-1.4.0-code14.aab). Versão 1.4.0, código 14, identificador com.alvoprompt.app. Assinatura de upload conferida com o certificado da versão anterior. O repositório remoto estava em 1.3.1/código 13; o Play Console não foi consultado.
- Xcode: [AlvoPrompter-1.4.0-14.xcarchive](../../artifacts/AlvoPrompter-1.4.0-14.xcarchive).
- Pacote iOS: [App.ipa](../../artifacts/ios-1.4.0-14/App.ipa), exportado para App Store Connect e assinado com Apple Distribution. Versão 1.4.0, build 14; equipe LCN99JS59U; iOS 15 ou superior, iPhone e iPad.
- Projeto: [App.xcodeproj](../../ios/App/App.xcodeproj). Assinatura automática com a equipe informada. Opções de exportação em [ExportOptions-AppStore.plist](ExportOptions-AppStore.plist).
- Integridade: [release-1.4.0.json](../../artifacts/release-1.4.0.json), com tamanho e SHA-256 dos pacotes.

## Revisão de design e experiência

Referências: [BIGVU](https://bigvu.tv/tools/teleprompter-mobile-teleprompter-ios-android), pela sequência de produção de vídeo; [PromptSmart](https://www.promptsmart.com/), pela prioridade aos controles de leitura; e [Teleprompter.com](https://www.teleprompter.com/faq), pela organização de roteiros e gravações. Foram usadas como referências de fluxo, preservando a identidade e a logo aprovadas do AlvoPrompter. Não foi estabelecido um ranking de mercado.

- Biblioteca: removidos cartões de estatísticas e instruções repetidas que empurravam os roteiros para fora da primeira tela. Criação, IA e importação em uma linha; busca e lista próximas do topo; atalho compacto para continuar o roteiro.
- Navegação: Roteiros, Editor, Gravar, Agenda e Mais. Mesma organização no computador; menu com foco de teclado, Escape e retorno do foco. Equipe continua acessível e permite voltar à biblioteca ou criar roteiro sem equipe.
- Leitura e gravação: tema escuro próprio, botão Gravar visível em celulares pequenos, Parar com contador, acesso direto para ligar a câmera. Gravação indisponível enquanto a câmera ainda abre. Voltar durante a captura interrompe e abre a revisão.
- Editor: primeiro passo identificado corretamente; salvamento automático e ação Gravar destacados.
- Vídeo: prévia compacta, exportação e progresso logo abaixo; formato e legendas abertos, ferramentas adicionais recolhidas em grupos. Termos mais claros, seleção de legenda com contraste, confirmação antes de descartar e arquivos principais com extensão correspondente ao formato real.
- Cores e formulários: maior contraste de textos, mensagens e estados; botões de ação com texto branco; campos de celular com tamanho legível, evitando ampliação automática do formulário no iOS.
- Incluídas as correções anteriores de conta, perfil, equipe e estabilidade da câmera. Os detalhes estão em [ajustes-prints.md](ajustes-prints.md).

## Validação realizada

- 89 testes automatizados em 17 arquivos aprovados; lint, tipos do app e APIs, builds web e nativo aprovados.
- Inspeção no navegador em 360 × 800 e computador: biblioteca, editor, gravação, equipe, cadastro e editor de vídeo. Editor de vídeo com largura de conteúdo igual à viewport (360 px), sem transbordamento horizontal.
- Roteiro de teste salvo e recuperado após recarregamento da prévia; retorno de Equipe para biblioteca validado.
- Vídeo sintético: cortes, legenda, formato vertical 360 × 640 e áudio preservados. Saída MP4 de 2,005 s (alvo 2 s), RMS 0,0699 e 4.353 pixels identificados da legenda. Exportação também concluída pela interface do editor, incluindo links MP4 do original e do editado.
- Android: bundleRelease concluído; assinatura, identificador, versão e código lidos no AAB; conteúdo web igual ao pacote nativo preparado.
- iOS: ARCHIVE SUCCEEDED e EXPORT SUCCEEDED; assinatura do archive verificada; IPA com versão 1.4.0/build 14, entitlement de distribuição (get-task-allow false), perfil App Store da equipe correta e manifesto de privacidade incluído. Ícone 1024 × 1024 sem transparência.
- Manifesto de acesso a timestamps do Filesystem incluído conforme [documentação do Capacitor](https://capacitorjs.com/docs/apis/filesystem). Pixel de marketing explicitamente desativado em aplicativos nativos. Descrições de câmera, microfone e reconhecimento de fala em português.
- Não foi possível validar em celular físico nesta rodada. A piscada relatada deve ser conferida no aparelho original, incluindo reprodução do vídeo salvo. A tentativa de abrir o Xcode por automação da interface excedeu o tempo de resposta; compilação e exportação ocorreram pela ferramenta oficial do Xcode.

## Como enviar

### Google Play

Abra a faixa de testes desejada no Play Console e envie o AAB 1.4.0/código 14. Se o código 14 já tiver sido enviado por outro caminho, será necessário gerar um código superior. O último código confirmado no repositório era 13.

### Xcode / App Store Connect

1. Abra o archive acima com o Xcode. No Organizer, selecione AlvoPrompter/App, versão 1.4.0 (14).
2. No App Store Connect, crie o registro do app caso ainda não exista, com bundle ID com.alvoprompt.app, idioma Português (Brasil), nome AlvoPrompter e SKU próprio (sugestão: ALVOPROMPTER-IOS).
3. No Organizer, use Distribute App → App Store Connect → Upload. Preserve a versão/build 1.4.0/14; o pacote já foi exportado com gerenciamento automático de versão desativado. Alternativamente, envie App.ipa pelo Transporter.
4. Aguarde o processamento e use primeiro os testes internos do TestFlight. Upload do binário não significa aprovação para distribuição pública ou testes externos.

## Pendências antes da publicação pública

O binário está preparado para envio e testes; **a aprovação pública na App Store ainda não está pronta**:

- Conta: implementar exclusão de conta e dados dentro do app, com reautenticação e tratamento de assinatura/equipe, antes da revisão pública. [Exigência da Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app).
- Compras: a integração atual é Asaas. Para vender recursos digitais dentro da versão iOS, preparar compras nativas/StoreKit ou outra modalidade expressamente aplicável e aprovada para as lojas/regiões de distribuição. Não habilitar o checkout externo indiscriminadamente. [Diretrizes da Apple, seção 3.1](https://developer.apple.com/app-store/review/guidelines/).
- Login: Google/Apple nativos dependem dos cadastros Firebase e da configuração Apple ainda ausentes; nesta compilação ficam indisponíveis, com alternativa por e-mail. O Team ID configurado assina o aplicativo, mas não ativa o login Apple. Ver [login-social.md](login-social.md).
- Servidor: a migração D1 0005, endpoint de perfil e política de privacidade atualizada ainda precisam ser publicados. O AAB/IPA não publica o servidor. Pagamentos reais continuam bloqueados pela ausência de configuração Asaas em produção.
- App Store Connect: preencher metadados, privacidade/coleta, classificação etária, suporte, política de privacidade e screenshots reais; disponibilizar acesso de revisão se necessário. Validar câmera/microfone, login e compartilhamento em iPhone real, e a câmera no Android relatado.

Esses pontos não são solucionados apenas pela assinatura do IPA. O envio posterior à Apple foi concluído, mas não foi solicitada revisão pública.
