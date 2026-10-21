# AlvoPrompter 1.6.5 (25) — 21/10/2026

Pedido do titular: concluir a preparação, enviar um build ao TestFlight e validar no aparelho pelo TestFlight, sem conexão física ao Mac. Não enviar a versão pública antes do teste do titular.

## Pacotes e validação

- Mesma versão comercial 1.6.5; build iOS e versionCode Android elevados para 25. App Store Connect tinha como maior número 24 antes do envio.
- Código inclui as correções de sessão após confirmação de e-mail, ensaio após câmera negada, exportação social e segurança registradas no release anterior.
- Sincronização Capacitor e TypeScript nativo aprovados. Archive Xcode aprovado com apenas um job; upload pelo xcodebuild com método app-store-connect, destino upload e sem opção de distribuição restrita a testes internos. Log confirmou Upload succeeded / EXPORT SUCCEEDED às 14h56 (Belém). App Store Connect confirmou processamento; build 25 adicionado ao grupo interno Equipe AlvoPrompter (1 tester). Instruções de teste preenchidas e botão Salvo confirmado.
- AAB assinado `artifacts/alvoprompter-1.6.5-code25.aab`, SHA-256 ao lado. Gradle aprovado com um worker, sem daemon persistente. Archive `artifacts/AlvoPrompter-1.6.5-25.xcarchive`.
- Suíte completa: 351 testes em 39 arquivos aprovados; após acrescentar a prova de preservação de dados da migração, nova rodada direcionada: 36 testes em 5 arquivos aprovados. Tipagem app/Worker e lint aprovados, exceto aviso preexistente de Fast Refresh no harness. Scanner de segredos e histórico aprovados após inclusão dos novos arquivos: 442 arquivos, sem correspondências privadas nos padrões examinados.

## Cobrança Android preparada, ainda desativada

- Cliente usa NativePurchases já instalado; preço localizado e oferta mensal padrão vêm da Play Store. Não usa preço promocional/trial como preço recorrente.
- Compra vinculada a um identificador opaco da conta; validação e acknowledgement no servidor, somente após confirmação do Google. Pagamento pendente não libera plano. Restauração filtra conta, produto e estado.
- Servidor usa OAuth de conta de serviço e purchases.subscriptionsv2. Confere titular, produto, plano-base mensal, estado e expiração; mantém acesso após cancelamento da renovação somente até a expiração verificada. Token de compra armazenado com AES-GCM e índice SHA-256, nunca em logs.
- Conta com assinatura em outro provedor não pode sobrepor seu plano por este fluxo. Atualização de um vínculo antigo Apple/Google só ocorre se esse ainda é o provedor atual da assinatura.
- Exclusão de conta alerta sobre renovação Google e exige reconhecimento, assim como Apple. Não afirma que excluir a conta cancela a assinatura da loja.
- `GOOGLE_PLAY_ENABLED=false`. A integração não está homologada nem liberada a compradores. Nenhuma compra real criada nos testes.
- Antes de habilitar: finalizar perfil de comerciante; cadastrar produtos `com.alvoprompt.app.creator.monthly` e `com.alvoprompt.app.studio.monthly`, base plan `mensal`, renovação mensal (preços de referência do app: Criador R$29,90 / Studio R$79,90); habilitar Android Publisher API e conta de serviço com permissões mínimas para consultar e confirmar compras; instalar `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` e `BILLING_ENCRYPTION_KEY` como secrets do Worker; aplicar migração 0013 após backup; configurar e validar notificações de ciclo de vida/reconciliação; testar compra pendente, compra aprovada, restauração, cancelamento e reembolso pelo canal de testes Google. Só depois alterar a flag.
- Migração 0013 preserva todos os campos existentes ao estender o CHECK de provedores. Teste confirma preservação integral da linha Asaas e integridade referencial. **Ainda não aplicada à produção**, pois a cobrança Google continua desativada. Não habilitar a flag antes dela.

## Imagens e serviços externos

- Geradas cinco variações iPhone 1206×2622 a partir da arte HTML da galeria e capturas atuais do componente web compartilhado. Duas artes iPad 2732×2048. Não constituem teste físico dos binários.
- Apple recebeu as novas imagens, mas elas falharam no processamento visual, apesar da persistência de nomes e contagens. Todas as associações com alerta foram retiradas, preservando arquivos na Biblioteca de Ativos. Galeria anterior restaurada: três PNGs do iPhone com Face ID (tela grande), reutilizados automaticamente pela categoria principal, e um PNG de iPad. Miniaturas anteriores exibidas sem alertas; as novas artes continuam pendentes de homologação.
- Google exigiu perfil de comerciante: a página inicialmente ficava em branco. Uma aba comum criada pelo controle nativo do Chrome conseguiu mostrar o perfil existente do titular para Play e Cloud. Titular selecionou esse perfil; ainda não apareceu ação de continuação/confirmacão. Não declarar a vinculação concluída nem criar outra conta financeira automaticamente.
- Produção Google bloqueada por critério da conta: painel mostrou 2 testadores participantes, exigindo 12 por 14 dias contínuos. Upload em canal de teste não resolve esse requisito.

## Roteiro de teste do titular no TestFlight

1. Atualizar para 1.6.5 (25), confirmar número no app e entrar com a conta comum de teste.
2. Criar/gerar roteiro, ouvir texto, salvar e reabrir.
3. Gravar com áudio por pelo menos 20 segundos; parar, assistir e conferir saída no alto-falante. Repetir com o roteiro chegando ao fim. Conferir ação de nova gravação e retorno ao roteiro.
4. Conferir modo tela cheia, sair dele e abrir os ajustes; botões e texto precisam respeitar as áreas do aparelho. Testar filtro e alternativa sem filtro.
5. Fazer cortes/legendas; preparar Reels/TikTok/Shorts e YouTube horizontal. Assistir arquivo final, copiar texto, salvar e importar na rede desejada. O app não confirma postagem automática.
6. Em Conta e assinatura, conferir preço App Store, concluir uma compra de teste no TestFlight e restaurar; nunca usar cobrança real Asaas para este teste. Enviar captura da tela de contratação e qualquer erro. Exclusão de conta só com usuário descartável.

Pendências de publicação pública mantidas: validação física pelo titular, captura nativa das assinaturas e produtos vinculados à versão Apple, cobrança Google homologada, imagens finais confirmadas, nome/entrega dos e-mails Firebase e requisito de teste fechado Google. Não elevar o build mínimo obrigatório antes da versão estar disponível nas lojas.

## Publicação dos serviços

Worker publicado: `30ef9d3b-0f52-4938-a41e-ac14fb39fa90`, release `1.6.5-25-store-billing-20261021`. Health consultado no Chrome confirmou status ok, Apple/IA/Asaas configurados e googleBilling.configured=false. Migração 0013 não aplicada. Web publicada em https://ca30ca43.alvoprompter.pages.dev.

AAB 25 recebido e processado pela Play Console na faixa fechada Dia 23 de Setembro 2026, versão interna de lançamento 10. Salvamento confirmado pela mensagem A alteração foi salva. Aviso único: falta de arquivo de desofuscação; o build tem minifyEnabled=false, portanto não gera mapping R8. Não houve erro de versão/código reutilizado nem perda de aparelhos compatíveis.

## Conferência final das lojas — 21/10, 15h (Belém)

- Google: AAB 25 e as mudanças de ficha foram enviados; painel passou a **Alterações em análise**, com verificações rápidas em andamento. Faixa fechada Dia 23 de Setembro 2026; não é produção pública. Cinco capturas atuais 1080×1920 aplicadas na ordem início, IA, editor, ensaio, ajustes; novo destaque 1024×500. Associação das sete capturas antigas retirada do rascunho, preservando arquivos na biblioteca. Declaração global de uso de IA permaneceu selecionada conforme a origem conhecida da marca e da imagem de criadora. Não declarar resultado de aprovação antes da resposta Google.
- Apple: a contagem e os nomes das capturas persistiram após navegação, mas a revisão visual posterior mostrou cinco miniaturas com alerta vermelho. **A galeria não está homologada para envio público**, apesar da contagem de arquivos. Formatos locais conferidos: JPEG baseline RGB nas medidas 1206×2622 e 2732×2048. Investigação pela biblioteca e tentativa de empacotamento PNG sem alteração do desenho. As associações anteriores continuam recuperáveis na Biblioteca de Ativos. Esse problema pertence às imagens da ficha e não invalida o upload/processamento do build 25 no TestFlight.
- Perfil financeiro Google continua pendente: o titular selecionou o perfil existente, mas o formulário não exibiu ação de continuação. Não houve confirmação da vinculação. Não foram inseridos dados bancários nem criado outro perfil pelo agente.

A tentativa PNG da Apple também terminou com alerta visual. A associação temporária da sexta captura foi retirada junto às cinco JPEGs com alerta; preservados os arquivos na biblioteca. Recuperação da galeria anterior pela Biblioteca de Ativos concluída: três PNGs do iPhone e um PNG do iPad, com miniaturas visíveis sem alertas. Não há nova submissão pública Apple. O TestFlight 25 permanece liberado ao grupo interno.

Conferência após novo relato de travamento: o formulário financeiro do Google voltou a mostrar o perfil selecionado sem botão de continuação. Após recarregar e reabrir o fluxo preparatório, permaneceu carregando; não houve confirmação financeira nem vinculação. A cobrança Google permanece desativada. Mac com aproximadamente 10 GiB livres no volume de dados; não há diagnóstico confirmado de falta de espaço como causa dessa falha web.
