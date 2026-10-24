# AlvoPrompter 1.6.5 (27) — conta e confirmação da assinatura

## Comportamento

- Ao retornar ao app, atualiza o perfil Firebase e o token antes de consultar o plano, reconhecendo a confirmação de e-mail feita no navegador.
- Se a consulta da conta falhar, oferece recarregar e mantém a confirmação de e-mail separada do erro do serviço. Impede contratar enquanto o plano não foi carregado.
- Compra e restauração só informam acesso ativo quando o servidor confirma plano pago e status ativo. Um direito expirado não produz confirmação falsa de ativação.
- Reenvio orienta procurar a mensagem do AlvoPrompter, inclusive na pasta de spam.
- Administração distingue registros recriados pelo UID e pela última atividade, sem transferir dados apenas pela coincidência de e-mail.

## Evidência do servidor e do aparelho

A restauração do Criador foi confirmada pelo titular no TestFlight 26 e por consulta restrita do servidor em 23/10/2026. Plano ativo via Apple Sandbox, limite de 100 usos de IA e uma única associação da compra à conta atual. O vínculo de teste antigo, cancelado e vencido, foi removido após autorização específica. A correção não concedeu plano manualmente. Ver conta-email-2026-10-23.md.

Essa validação do build 26 não comprova o funcionamento de todas as mudanças do cliente no build 27. Studio, renovação/reembolso e cobrança em produção não foram homologados por essa restauração.

## Preparação

- Versão comercial mantida em 1.6.5; contador local incrementado de 26 para 27, sem reutilizar o número do pacote instalado.
- 387 testes em 42 arquivos, tipagem e scanner de segredos aprovados antes da preparação. Lint com aviso preexistente do harness.
- Build web nativo, sincronização Capacitor iOS e archive Xcode aprovados, com um job e cache existente devido ao pouco espaço livre do Mac. Info.plist confirma 1.6.5 (27), bundle com.alvoprompt.app e equipe LCN99JS59U.
- Assinatura aprovada por codesign --verify --deep --strict com acesso normal ao chaveiro. A primeira execução no sandbox havia retornado CSSMERR_TP_NOT_TRUSTED; a repetição fora do sandbox confirmou valid on disk / satisfies its Designated Requirement, sem alterar confiança ou certificados.
- Os 53 arquivos do build web foram comparados por SHA-256 aos recursos embarcados no archive: nenhuma ausência ou divergência. Evidência privada bundle-verification.json.
- Upload oficial pelo xcodebuild concluído às 20h51 de 23/10 (Belém): Upload succeeded / EXPORT SUCCEEDED. A Apple informou que o pacote está em processamento. Log privado artifacts/release-1.6.5-27/upload.log.
- Em 24/10, após renovar a sessão, App Store Connect confirmou o processamento do 27. Instruções de teste salvas e compilação associada ao grupo interno Equipe AlvoPrompter, com um tester. A aba Compilações do grupo confirma 1.6.5 (27) Em testes; evidência privada artifacts/apple-publicacao-20261024/testflight-27-em-testes.png. Nenhuma submissão pública feita nessa ação.
- Google continua desativado; nenhum AAB 27 gerado ou enviado nesta etapa.

## Testes no novo build antes do envio público

1. Conferir que o TestFlight informa 1.6.5 (27).
2. Na mesma conta com a compra já feita, abrir Conta e assinatura: deve carregar Criador ativo e 100 usos. Restaurar a compra existente deve manter o plano, sem contratar novamente.
3. Fechar e reabrir o app; conferir que o plano continua reconhecido. Não utilizar a conta administrativa nas credenciais dos revisores.
4. Em conta de teste sem e-mail confirmado, concluir a verificação no navegador e retornar ao app. Recarregar deve reconhecer a confirmação.

Continuam pendentes as capturas de revisão das assinaturas, sua inclusão conjunta na primeira submissão e a conferência final da galeria da loja. Não afirmar que o envio público foi concluído enquanto esses itens e o teste do novo build permanecerem abertos.

## Teste do titular em 24/10

O titular confirmou que, após atualizar para o 27, restaurar as compras e fechar/reabrir o app, o Criador permaneceu reconhecido. Esse teste do novo cliente está concluído. Não foi solicitada nova contratação.

Build 26 retirado do rascunho anterior e seleção do 27 salva na ficha pública, que retornou a Preparar para envio. Não alteradas as credenciais de revisão. A próxima adição ao rascunho deve incluir as assinaturas e o grupo, após concluir seus metadados.

Após atualizar e conferir as galerias de cinco imagens iPhone e duas iPad, o app com o build 27 foi adicionado novamente a um rascunho, ainda sem envio público. O rascunho contém somente o app; ainda é necessário acrescentar os produtos e o grupo. Captura do paywall recebida por WhatsApp foi rejeitada pelas dimensões 591×1280. Solicitadas capturas originais dos cartões dos planos para completar a revisão das assinaturas. Detalhes e evidências em apple-publicacao-2026-10-23.md.
