# AlvoPrompter 1.6.0 — 06/10/2026

## Escopo

Nova entrada e início, editor de roteiro reorganizado, correções dos painéis e áreas seguras, Gemini → Groq para texto, narração Gemini e leitura com a voz do aparelho. Não inclui as funcionalidades futuras propostas no comparativo competitivo.

- Android: versão 1.6.0, código 17; `artifacts/alvoprompter-1.6.0-code17.aab`.
- iOS: versão 1.6.0, build 17; `artifacts/AlvoPrompter-1.6.0-17.xcarchive` e `artifacts/ios-1.6.0-17/App.ipa`.
- Bundle/package preservado: `com.alvoprompt.app`.
- Sem alteração dos preços, grupos de testadores ou credenciais de assinatura.

## Verificação técnica

173 testes em 22 arquivos aprovados. Build nativo e sincronização Capacitor concluídos; Gradle `bundleRelease`, Xcode archive e exportação do IPA aprovados. Chaves privadas Gemini/Groq não aparecem no JavaScript empacotado.

Assinatura do AAB validada e certificado de upload igual ao das versões anteriores: SHA-256 `F9:06:8F:CA:33:00:E1:63:5F:BA:59:F5:1D:68:ED:4B:89:C5:4B:08:95:6F:05:E5:D3:FD:E2:64:3F:43:10:74`. O certificado autoassinado produz aviso de cadeia de confiança no Java, sem invalidar a verificação criptográfica.

AAB SHA-256: `5ee85c652a893aebaacb68d090c23c32af9c15e34973dccc639d802276fdcbf8`.

## Marca no Google Play

O arquivo antigo `play-store-icon.png` foi substituído pela identidade atual, derivada do SVG do app. Fonte própria: `docs/brand/play-store-icon.svg`; PNG de 512×512, opaco, com fundo quadrado para a máscara aplicada pela loja, conforme [especificações oficiais](https://developer.android.com/distribute/google-play/resources/icon-design-specifications).

## Notas da versão

Nova experiência de entrada e tela inicial. Editor de roteiro mais claro, com leitura em voz alta e ajustes de ritmo acessíveis. Melhorias na geração de roteiros com IA e na narração em português. Correções de layout dos painéis e botões em telas pequenas.

## Envios

- Apple: Xcode confirmou `Upload succeeded` em 06/10/2026 às 11:21:43. Build 1.6.0 (17) recebido e iniciado o processamento. Log: `artifacts/ios-upload-1.6.0-17.log`. Após o titular renovar o login, a compilação foi processada e adicionada ao grupo interno Equipe AlvoPrompter. Status **Em testes** confirmado na lista de compilações do grupo. ID Apple: `ce995438-3af9-464e-8295-c34c58fd17f4`. Não houve envio para distribuição pública.
- IPA SHA-256: `35e4848a41ec15a05fe910684b5acd762f800eb6487d90f6d3b3e2d90c382358`.
- Google Play: pacote 1.6.0 (17) recebido, processado e incluído na faixa de teste fechado `Dia 23 de Setembro 2026`, substituindo 1.4.0 (14). Envio confirmado: **Alterações em análise**, com verificações automáticas em andamento. O conjunto enviado contém quatro mudanças: versão 17, nome AlvoPrompter, descrição completa corrigida e nova logo. A aprovação e a disponibilização aos testadores ainda dependem do Google. Nenhuma perda de compatibilidade de dispositivos foi indicada. Único aviso: ausência de arquivo de desofuscação; o projeto usa `minifyEnabled false`.
- A produção Google permanece indisponível: o painel informa dois participantes e exige 12 testadores por 14 dias. A entrega será feita no canal de teste existente, sem alterar participantes ou disponibilidade territorial.
- Ficha revisada e salva: removidas alegações antigas de 4K, clonagem de voz, publicação automática e funcionamento 100% offline. A nova logo foi conferida visualmente no cabeçalho do Console. O titular confirmou que ela foi criada ou editada com IA; a identificação correspondente foi registrada antes do envio. Os demais recursos visuais não foram alterados.

Console Google: https://play.google.com/console/u/0/developers/6634974275284956398/app/4976438545964884287/publishing

TestFlight interno: https://appstoreconnect.apple.com/teams/edfbb59a-11c0-4346-af77-6588b90d2ec5/apps/6815460612/testflight/groups/7a5d46f5-c84e-4d9e-9088-ca980f3b43f8/builds

## Correção 1.6.1 (19) — retorno das fotos de 11:49

- Gravar reinicia o roteiro e inicia a rolagem junto com o vídeo; evita finalizar imediatamente quando o motor ainda está em `done` após um ensaio.
- Sessão de gravação espera os eventos finais do encoder antes de liberar câmera/filtro; MP4 usa perfil escolhido pelo aparelho e gravação sem fragmentos periódicos. Estado de finalização explícito e erro recuperável com nova abertura de câmera.
- Fim do ensaio oferece preparar gravação, repetir ou editar. Vídeo concluído oferece nova tomada, edição, compartilhamento e download; acesso ao último vídeo permanece disponível ao fechar o painel. O editor recebe URL própria, evitando revogação ao desmontar o gravador.
- No iPhone, modo foco mantém o viewport e as áreas seguras, sem abrir o fullscreen nativo que sobrepunha os controles. Barra de status recebe texto claro durante o prompter. Prévia dos ajustes deixa de encolher/truncar; texto pode quebrar linhas, e opções rolam abaixo do cabeçalho fixo.
- Compatibilidade iOS: câmera ligada usa rolagem automática no modo voz e não inicia reconhecimento/transcrição simultânea pelo microfone. Essa limitação aparece na interface; a gravação de áudio fica prioritária.
- Validação: 178 testes aprovados; typecheck, build nativo, Gradle e archive Xcode aprovados. Harness no Chrome com câmera/áudio sintéticos verificou vídeo contínuo com e sem filtro, término automático, passagem ao editor, ensaio concluído, gravação iniciada depois de 100%, falha vazia recuperável e prévia em 390×844. A captura real no iPhone continua dependendo do teste via TestFlight.
- Android: `artifacts/alvoprompter-1.6.1-code19.aab`, SHA-256 `fa38413fd190450e3534323d43deaaa278f2a7b5b827059d5dfdc87a95aa5a94`.
- iOS: `artifacts/AlvoPrompter-1.6.1-19.xcarchive`; log de envio `artifacts/ios-upload-1.6.1-19.log`.
- Distribuição final: Apple confirmou upload às 12:14:41 e a 1.6.1 (19) está **Em testes** no grupo interno Equipe AlvoPrompter. ID `51cf1c5d-7efc-436f-86df-42e4add50bf4`. No Google, pacote 19 processado e lançamento salvo na faixa existente; a visão geral mostra somente 19 como mudança nova pronta para revisão, enquanto 17 e a ficha continuam em análise. Reinício da análise aguarda autorização do titular. A compilação intermediária Android 18 foi substituída pela 19 no conjunto pendente.

A compilação intermediária 18 foi recebida pela Apple, mas não foi atribuída a testadores; a final 19 inclui também a pausa manual no modo de compatibilidade iOS, validada no harness. O Google exige cancelar/reiniciar a análise existente para enviar a correção. A revisão automática bloqueou esse reinício pelo aumento potencial da espera; autorização específica solicitada ao titular, ainda pendente. A análise 1.6.0 e a nova logo não foram canceladas.


## Publicação de segurança — 08/10/2026

A pedido do titular (commit, deploy e push), o commit `dc4c0ed` consolida as alterações de IA, experiência de criação, gravação e segurança acumuladas no projeto. Validação: 217 testes, build web, tipos e scanner de segredos aprovados; `npm audit` sem alertas. Lint mantém três avisos preexistentes.

- Site: https://0b7ce71d.alvoprompter.pages.dev, ativo em https://app.alvoprompter.com.br.
- D1: migração `0008_security_rate_limits.sql` aplicada.
- API: `edd890f5-ca65-4f85-ac17-939b1ca63270`, release `1.6.1-security-20261008`.
- Pós-deploy: origens, headers, 401 sem autenticação e arquivos do frontend conferidos; início/conta abrem sem erros de console.
- Segredos preservados, Asaas mantido em sandbox; Pexels continua sem chave configurada.
- Política de privacidade permanece em rascunho aguardando autorização específica. Nenhuma publicação nas lojas nesta rodada.
- A análise Google já em andamento não foi reiniciada; não houve alteração de testers, planos ou cobranças.

Detalhamento no relatório de auditoria `docs/auditoria-2026-09-23.md`.

## Binários de segurança 1.6.2 (20) — 09/10/2026

- Versões Android/iOS e npm alinhadas em 1.6.2; código/build 20. Inclui a revisão de segurança publicada no site/API em 08/10, Capacitor 8.5.3 e as correções de gravação da 1.6.1.
- Validação desta entrega: `cap:sync`, build web nativo, scanner de segredos, Gradle `bundleRelease` e Xcode archive concluídos com sucesso. Certificado Android preservado. Não houve nova homologação de câmera em aparelho físico.
- AAB: `artifacts/alvoprompter-1.6.2-code20.aab`, SHA-256 `9f388a23a1d15a91dbb844ee584aace3ca6250e37c7722e19c9ab760facf7ca1`.
- Archive Apple: `artifacts/AlvoPrompter-1.6.2-20.xcarchive`; envio direto pelo Xcode confirmado com `Upload succeeded` às 12:18:45. Log: `artifacts/ios-upload-1.6.2-20.log`.
- Google: 1.6.2 (20) enviada para análise na faixa de teste fechado existente. Painel confirmou **Alterações em análise**. Nenhuma perda de compatibilidade; único aviso é a ausência de arquivo de desofuscação, com `minifyEnabled false`. O pacote 20 substitui a mudança pendente 19. A análise anterior de 17 e da ficha já havia terminado, sem precisar de cancelamento/reinício.
- Apple: 1.6.2 (20) processada, notas de teste salvas e compilação adicionada ao grupo interno Equipe AlvoPrompter. Status **Em testes** confirmado, com um tester e validade de 90 dias. ID `42dadcf7-9b4f-4db8-8217-69ae21041d05`. Assinatura do archive validada por `codesign --verify --deep --strict` com acesso aos certificados do sistema.
- Mantidos os canais de teste, participantes, territórios, preços e credenciais. Política de privacidade permanece rascunho; esta entrega não publica a versão pública na App Store.

## Correção de áudio e filtros 1.6.3 (21) — 09/10/2026

- Retorno do iPhone: filtro incompatível impedia iniciar a gravação e a prévia de câmera/microfone permanecia aberta durante a reprodução do vídeo. A mensagem de filtro aparecia sobre o roteiro e era apresentada como falha ao salvar.
- Filtros são verificados por capacidade; falha ao criar a saída filtrada mantém o stream original com áudio. A prévia e os ajustes indicam corretamente que o vídeo será gravado sem efeito, sem bloquear a câmera.
- Captura liberada somente após finalizar o encoder, antes de oferecer o vídeo. WebKit recebe `audioSession.type = 'play-and-record'` na captura e `playback` após encerrá-la, quando a API está disponível. Não força saída por cima de fones/Bluetooth. Contexto técnico: [registro WebKit sobre volume durante captura](https://bugs.webkit.org/show_bug.cgi?id=218012).
- Ao abrir o último vídeo, a câmera é suspensa; ao fechar ou preparar nova tomada, ela reabre. Mantida a URL do arquivo para reprodução/edição. Separadas as reações a novo vídeo e a erro, evitando que a reabertura da câmera reabra o painel do resultado.
- Erros removidos da sobreposição ao roteiro. Aviso de filtro separado e dispensável; informação sobre rolagem automática no iPhone permanece, em estilo neutro.
- Validação: 220 testes aprovados; tipos, build nativo e scanner de segredos aprovados. Harness de mídia verificou MP4 contínuo sem filtro, com filtro e com falha de filtro; microfone encerrado antes da reprodução e cancelamento de abertura. Fluxo em 390×844 verificou término automático, nova tomada e reabertura do vídeo (player pronto, sem mute, microfone inativo). Rotas reais de alto-falante/fones no iPhone ainda precisam de teste físico.
- Android: `artifacts/alvoprompter-1.6.3-code21.aab`, SHA-256 `9c67fe6003147147ac32c9a36b702499dd5a10dee7d688b35fd7dd1321acf42a`; assinatura verificada.
- iOS: `artifacts/AlvoPrompter-1.6.3-21.xcarchive`. Primeira assinatura falhou com `errSecInternalComponent`; certificados válidos conferidos e nova tentativa de archive aprovada, sem alterar permissões do chaveiro.
- Google: pacote 21 processado e enviado ao teste fechado existente; painel confirmou **Alterações em análise**. A versão 20 já havia sido publicada às 12:45, portanto nenhuma análise foi cancelada/reiniciada. Mantida compatibilidade de dispositivos; único aviso é desofuscação, com minificação desativada.
- Apple: Xcode confirmou `Upload succeeded` às 16:25:00, log `artifacts/ios-upload-1.6.3-21.log`. Notas de teste salvas e compilação atribuída ao grupo interno Equipe AlvoPrompter; status **Em testes** confirmado, com um tester e validade de 90 dias. ID `cd6d2d92-055d-4114-b731-5db5f9324094`.
