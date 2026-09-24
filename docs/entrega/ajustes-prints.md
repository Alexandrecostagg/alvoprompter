# Ajustes por prints — em andamento, sem commit

## Print 1 — Conta e assinatura

- Cabeçalho fixo e rolagem interna; margens respeitam as áreas seguras do celular.
- Textos descritivos justificados, com hifenização em português e contraste maior.
- Nome, e-mail, selo do plano e consumo de IA separados; planos antes do acesso à equipe.
- Disponibilidade da cobrança consultada antes de habilitar assinatura; consulta pode ser repetida. Falha de rede, indisponibilidade e sandbox têm mensagens distintas.
- Checkout: cartão para recorrência; link montado pelo ID retornado pelo Asaas; dados de cobrança preenchidos no próprio checkout; ausência de configuração bloqueia a criação no servidor.
- 62 testes aprovados, lint e build aprovados. Prévia em 360 × 800: parágrafos justificados e sem transbordamento horizontal. Conta conectada inspecionada em fixture isolada com dados fictícios; nenhuma cobrança criada.

**Dependência externa:** API publicada ainda informa cobrança não configurada e sandbox. É necessário cadastrar ASAAS_API_KEY no servidor, confirmar o webhook e configurar produção para pagamentos reais. Não enviar credenciais por conversa. Nenhuma configuração remota, deploy, commit, push ou novo AAB nesta rodada.

Referências da integração: https://docs.asaas.com/docs/link-do-checkout-e-redirecionamento-do-cliente e https://docs.asaas.com/docs/checkout-com-assinatura-recorrente .

## Print 2 — Equipe, saída da tela e autenticação

- Tela organizada em espaço pessoal, equipes na nuvem e recuperação antiga. Parágrafos justificados; controles, contraste e espaçamento consistentes com Conta.
- “Voltar aos roteiros” sempre disponível. “Abrir biblioteca local” agora sai da tela; “Criar novo roteiro” abre o editor mesmo sem biblioteca ou equipe e limpa o escopo de equipe antes de criar o texto.
- Plano Grátis recebe explicação e acesso a planos, em vez de um formulário de criação que só falharia. Equipes convidadas continuam acessíveis. Carregamento e falha de rede têm estados próprios e tentativa novamente.
- Login e cadastro padronizados: nome completo, e-mail, confirmação de senha no cadastro; recuperação de senha e gerenciadores de senhas. Telefone e organização opcionais no perfil da conta, inclusive para login social.
- Google/Apple implementados com Firebase web e credenciais nativas. Ativação e homologação dependem das configurações externas detalhadas em [login-social.md](login-social.md). Nenhuma conta, credencial ou cobrança real criada para os testes.
- Validação do print 2: 85 testes automatizados aprovados; lint, tipos do app/API e builds web/capacitor aprovados. Em 360 × 800, tela de equipe e cadastro sem transbordamento; criação de roteiro sem conta abriu o editor. Na conta fictícia isolada, perfil salvo atualizou o resumo e “Abrir biblioteca local” voltou à biblioteca. A migração e a política de privacidade atualizada ficam para a publicação final.

## Relato 3 — Câmera piscando ao gravar

- Causa identificada no código: o efeito de beleza dependia do objeto completo retornado pelo gravador (novo a cada renderização). Isso reaplicava o filtro em atualizações do contador/estado. Sem filtro, reatribuía a mesma fonte de vídeo; com filtro, encerrava e recriava a faixa capturada pelo canvas.
- Efeito agora depende da função estável e do filtro. Aplicação repetida é idempotente; a prévia mantém a câmera direta e usa o mesmo ajuste visual. A gravação filtrada mantém uma faixa de vídeo por sessão e preserva a faixa de áudio.
- Processamento acompanha os quadros decodificados, com alternativa limitada a 30 fps. Recursos do filtro são liberados ao fechar a câmera. Controles de filtro ficam indisponíveis enquanto grava, sem trocar a entrada do gravador em andamento.
- Aberturas simultâneas da câmera são deduplicadas. Uma resposta de permissão que chega depois de sair da tela é descartada e libera câmera/microfone. A finalização aguarda o último bloco do gravador antes de permitir outra gravação.
- O usuário ainda não verificou se a piscada também está no arquivo salvo. A reprodução no aparelho original deverá ser confirmada na próxima versão instalada; testes sintéticos não substituem esse teste físico.
- Validação do relato 3: 89 testes em 17 arquivos aprovados, lint sem avisos e tipos aprovados. Teste no navegador com câmera e áudio sintéticos: 210 atualizações forçadas, somente uma abertura da câmera e uma associação da prévia por sessão. Arquivos MP4 sem filtro (4,260 s; 26.710 bytes) e com filtro (4,265 s; 26.261 bytes), ambos com movimento contínuo nas amostras de 0,5/1,5/2,5/3,5 segundos e sem quadros pretos nessas amostras. Cancelamento durante abertura liberou câmera e microfone. Builds web/capacitor verificados; sem novo AAB, commit ou deploy.
