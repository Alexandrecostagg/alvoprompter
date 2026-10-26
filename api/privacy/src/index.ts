const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Política de Privacidade — AlvoPrompter</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0B0D12;
    color: #E7E9EE;
    line-height: 1.6;
  }
  main { max-width: 760px; margin: 0 auto; padding: 40px 20px 80px; }
  h1 { font-size: 1.7rem; color: #fff; }
  h2 { font-size: 1.2rem; margin-top: 2.2em; color: #fff; }
  p, li { color: #C6CAD3; }
  a { color: #bfa8ff; }
  nav { display:flex; flex-wrap:wrap; gap:16px; margin:20px 0; }
  a:focus-visible { outline:3px solid #bfa8ff; outline-offset:4px; }
  .muted { color: #8A8F9A; font-size: .9rem; }
  .card {
    background: #151922;
    border: 1px solid #232936;
    border-radius: 12px;
    padding: 18px 20px;
    margin: 14px 0;
  }
  .tag {
    display: inline-block;
    background: #8B5CF6;
    color: #fff;
    border-radius: 999px;
    padding: 2px 10px;
    font-size: .78rem;
    margin-right: 6px;
  }
</style>
</head>
<body>
<main>
  <nav aria-label="Documentos legais"><a href="/">Privacidade e LGPD</a><a href="/terms">Termos de uso</a><a href="mailto:alexandrecostagg@gmail.com">Contato</a></nav>
  <h1>Política de Privacidade — AlvoPrompter</h1>
  <p class="muted">Última atualização: 26 de outubro de 2026</p>

  <p>Esta Política de Privacidade descreve como o aplicativo <strong>AlvoPrompter</strong> ("nós", "nosso" ou "aplicativo"), desenvolvido por Alexandre Costa, trata informações quando você utiliza o aplicativo na web, Android ou iOS.</p>

  <h2>1. Contato</h2>
  <div class="card">
    <p>Responsável pelo AlvoPrompter e controlador dos dados de conta: Alexandre Gomes da Costa<br>
    E-mail: <a href="mailto:alexandrecostagg@gmail.com">alexandrecostagg@gmail.com</a></p>
  </div>

  <h2>2. Visão geral</h2>
  <p>O AlvoPrompter é um estúdio de vídeo com teleprompter, editor, legendas e recursos opcionais de IA. Roteiros, gravações, perfis de voz e configurações ficam, por padrão, <strong>localmente no seu dispositivo</strong>. Recursos de conta, segurança, sincronização, pagamentos e IA usam serviços online conforme descrito abaixo. A gravação local não implica envio automático do vídeo para esses serviços.</p>

  <h2>3. Dados que coletamos</h2>
  <p>Coletamos apenas os dados necessários para fornecer os recursos solicitados por você:</p>
  <ul>
    <li><strong>Sincronização:</strong> roteiros, dados de agenda e identidade visual escolhidos para sincronização ficam no Cloudflare D1, vinculados à conta e às permissões do workspace. Gravações permanecem no aparelho enquanto você não escolhe enviá-las. Conteúdo da sincronização antiga por frase-chave fica no Cloudflare KV por até 90 dias desde a última sincronização.</li>
    <li><strong>Páginas de vídeo:</strong> ao criar uma página compartilhável, o vídeo, incluindo seu áudio, é enviado ao Cloudflare R2. Título, descrição, nome do autor, data e contador de visualizações ficam no Cloudflare KV. Quem recebe o link pode acessar o conteúdo; compartilhe somente materiais que deseja disponibilizar dessa forma. Essa mídia não tem a expiração automática de 90 dias dos roteiros legados. Para solicitar a remoção de uma página e da mídia correspondente, use o contato de privacidade abaixo.</li>
    <li><strong>Segurança dos serviços online:</strong> o endereço IP é usado para limitar requisições e prevenir abuso. Os contadores por IP no nosso serviço expiram após 25 horas. O Firebase Authentication pode manter registros de IP por algumas semanas para proteger cadastros e acessos. Não usamos esses registros para publicidade direcionada ou para determinar sua localização.</li>
    <li><strong>Texto para IA:</strong> pedidos de geração ou melhoria de roteiro são enviados pelo nosso Worker ao Google Gemini. Se o serviço falhar antes de entregar texto, o pedido pode ser encaminhado à Groq como alternativa. Textos para narração em arquivo de áudio também são enviados ao Google Gemini. Traduções de legendas e textos feitas pelo assistente usam Gemini, com alternativa Groq; o recurso de tradução dedicado usa Cloudflare Workers AI; a leitura de ensaio usa a voz disponibilizada pelo aparelho ou navegador.</li>
    <li><strong>Áudio:</strong> quando você solicita uma transcrição, o áudio é enviado pelo nosso Worker à Groq para obter o texto e os tempos das palavras. Em caso de indisponibilidade ou resposta sem os tempos necessários, o áudio pode ser processado pelo Cloudflare Workers AI como alternativa. As amostras de voz do Avatar IA permanecem locais e não treinam um modelo de clonagem.</li>
    <li><strong>Avatar:</strong> somente a descrição textual é enviada ao Cloudflare Workers AI para gerar uma imagem. A animação do avatar e a exportação do vídeo acontecem localmente no aparelho.</li>
    <li><strong>Conta:</strong> nome, e-mail, identificador de usuário e estado de verificação são tratados pelo Firebase Authentication e vinculados ao cadastro do AlvoPrompter.</li>
    <li><strong>Perfil opcional:</strong> nome completo, telefone e empresa ou organização informados por você ficam no Cloudflare D1, vinculados à sua conta. Telefone e organização são opcionais, podem ser removidos na tela de perfil e não são usados para autenticação por SMS.</li>
    <li><strong>Login social:</strong> quando disponível e escolhido por você, Google ou Apple fornecem ao Firebase os dados necessários à autenticação, como identificador, nome e e-mail autorizado. A Apple pode fornecer um endereço de e-mail privado. Não recebemos a senha da sua conta Google ou Apple.</li>
    <li><strong>SDKs de autenticação no iOS:</strong> o Google Sign-In pode usar o endereço IP para estimar a localização aproximada e prevenir fraude, sem solicitar localização GPS. Seu manifesto também declara identificadores de conta e dispositivo, dados técnicos e de uso para funcionamento e análise do serviço. O Firebase Authentication declara diagnósticos técnicos não vinculados à identidade para análise do SDK. Esses tratamentos não são usados por nós para publicidade direcionada nem para rastreamento entre apps. A disponibilidade desses dados para o provedor não significa que o AlvoPrompter receba todos eles.</li>
    <li><strong>Equipe:</strong> nome do workspace, e-mails convidados e papéis de acesso são armazenados no Cloudflare D1 para aplicar as permissões no servidor.</li>
    <li><strong>Assinatura e uso:</strong> plano, estado da cobrança, contador mensal de ações de IA e identificadores técnicos do checkout/assinatura ficam no Cloudflare D1. Na web, o Asaas recebe os dados necessários para identificar o pagador e processar o checkout. No iOS, a Apple processa as compras e fornece identificadores e o estado da assinatura; vinculamos esses dados à conta para liberar e restaurar o plano.</li>
    <li><strong>Avisos administrativos:</strong> pedidos de acesso temporário, plano solicitado e vencimentos podem gerar e-mails ao administrador pelo Resend, contendo nome, e-mail, plano e datas do acesso. Esses avisos são operacionais, não uma inscrição em publicidade. Mensagens de confirmação de cadastro e recuperação de senha são enviadas pelo Firebase.</li>
    <li><strong>Importações e banco de mídia:</strong> quando você importa uma URL, nosso servidor acessa o endereço informado, inclusive serviços como Google Docs ou YouTube. Buscas de vídeos de apoio são encaminhadas ao Pexels; ao carregar mídia externa, o fornecedor pode receber informações técnicas da conexão. Não inclua credenciais ou links privados que você não tenha autorização para usar.</li>
    <li><strong>Medição de campanhas na landing page:</strong> somente depois do seu consentimento, o Meta Pixel registra visitas e eventos do funil, como início do cadastro, seleção de plano, cadastro concluído e início do checkout. Não enviamos nome, e-mail, roteiro, gravação ou dados de pagamento nesses eventos. A Meta pode tratar identificadores técnicos, como endereço IP, navegador e cookies, conforme suas próprias políticas.</li>
  </ul>
  <p>Não coletamos sua lista de contatos nem localização precisa. A conta é necessária para sincronização SaaS, assinatura e colaboração; o prompter local pode ser usado sem conta.</p>

  <h2>4. Compartilhamento de dados</h2>
  <p>Cloudflare fornece hospedagem, banco, armazenamento, proteção de requisições e parte da IA; Firebase/Google fornece autenticação e e-mails de acesso; Google Gemini e Groq processam os conteúdos de IA descritos acima; Resend entrega avisos administrativos; Pexels fornece mídia de apoio. Apple trata login e compras no iOS, e Asaas processa pagamentos na web. A Meta participa somente da medição de campanhas autorizada. Não vendemos dados pessoais.</p>
  <p>Cada fornecedor recebe os dados necessários à função utilizada. Alguns atuam como operadores sob instruções do AlvoPrompter; outros, especialmente lojas, pagamentos e serviços de identidade, também podem atuar como controladores independentes para segurança, obrigações legais e operações próprias. As políticas desses serviços se aplicam às atividades sob sua responsabilidade.</p>
  <p><strong>Conteúdo enviado à IA:</strong> as condições variam por fornecedor e regime contratado. O Gemini gratuito permite uso de entradas e respostas para melhoria de produtos, inclusive revisão humana; seus termos orientam não enviar dados pessoais, confidenciais ou sensíveis nesse regime. No regime pago, o Google informa que não usa os conteúdos para melhorar seus produtos, mantendo tratamento de segurança conforme seus termos. Não envie segredos, dados de saúde ou informações de outras pessoas sem fundamento e autorização adequados. A permissão exibida no app não elimina essas restrições.</p>
  <p>Documentos dos fornecedores: <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare</a>, <a href="https://firebase.google.com/support/privacy">Firebase</a>, <a href="https://ai.google.dev/gemini-api/terms">Gemini</a>, <a href="https://groq.com/privacy-policy">Groq</a>, <a href="https://resend.com/legal/privacy-policy">Resend</a>, <a href="https://www.apple.com/legal/privacy/">Apple</a>, <a href="https://www.asaas.com/politica-de-privacidade">Asaas</a> e <a href="https://www.pexels.com/privacy-policy/">Pexels</a>.</p>

  <h2>5. Cookies e escolha de marketing</h2>
  <p>O Meta Pixel fica desativado por padrão e não é inicializado no aplicativo nativo para iOS ou Android. Na primeira visita à landing page, você pode aceitar a medição ou manter somente o armazenamento essencial. Sua escolha fica salva no navegador e pode ser revista a qualquer momento pelo botão <strong>Cookies</strong> no rodapé da página. A recusa não impede o uso da landing page nem do aplicativo.</p>

  <h2>6. Segurança</h2>
  <div class="card">
    <span class="tag">Criptografia em trânsito</span>
    <p>Todos os dados enviados do aplicativo para nossos servidores são transmitidos por conexões criptografadas (HTTPS/TLS).</p>
  </div>

  <h2>7. Armazenamento e retenção</h2>
  <p>Dados locais podem permanecer até você apagá-los, limpar o armazenamento ou remover o aplicativo. O sistema operacional e o navegador também podem remover esse armazenamento; mantenha cópias dos arquivos importantes. Tomadas, edições e versões exportadas são salvas neste aparelho; esse salvamento não é um backup na nuvem. Itens na lixeira local continuam armazenados e podem ser restaurados. Conteúdo do sync legado expira no Cloudflare KV após 90 dias sem renovação. Dados de conta, workspace e assinatura permanecem enquanto a conta ou relação contratual estiver ativa e depois pelo prazo necessário para segurança, defesa de direitos e obrigações legais. A retenção de solicitações de IA depende das condições e configurações dos respectivos provedores, inclusive as diferenças entre Gemini gratuito e pago descritas na seção 4. Não afirmamos que todos os provedores apagam imediatamente os conteúdos após responder.</p>

  <h2>8. Seus direitos</h2>
  <p>Você pode apagar seus roteiros, vídeos e dados locais no próprio aplicativo. Nos termos da LGPD, pode solicitar confirmação do tratamento, acesso, correção, informação sobre compartilhamentos, anonimização, bloqueio ou eliminação de dados desnecessários ou tratados irregularmente, portabilidade conforme regulamentação e eliminação dos dados tratados com consentimento, observadas as exceções legais. Pode revogar consentimento e conhecer as consequências da recusa; também pode apresentar oposição nas hipóteses legais e pedir revisão de decisões tomadas exclusivamente por tratamento automatizado que afetem seus interesses. Para exercer esses direitos, entre em contato pelo e-mail <a href="mailto:alexandrecostagg@gmail.com">alexandrecostagg@gmail.com</a>.</p>
  <p>Para excluir sua conta no aplicativo, abra <strong>Conta e assinatura → Excluir minha conta</strong>, confira os espaços compartilhados afetados e confirme sua identidade. A exclusão remove a identidade de login, o perfil e os dados vinculados à conta que conseguimos identificar. Conteúdo de equipes pertencentes a outras pessoas permanece, sem o vínculo de autoria da conta excluída. Você pode optar também por apagar todos os arquivos locais deste aparelho; cópias exportadas ou compartilhadas fora do serviço não são removidas.</p>
  <p>A solicitação é processada em segundo plano e pode ser acompanhada na mesma seção. Usamos temporariamente uma credencial de sessão cifrada para concluir a remoção da identidade; ela é apagada ao concluir essa etapa ou ao vencer. Se a confirmação expirar durante uma falha, será necessário confirmar a identidade novamente. Mantemos um identificador derivado da conta (dado pseudonimizado, não necessariamente anônimo), sem nome ou e-mail, para impedir que sessões antigas recriem a conta e concluir tentativas de limpeza. Dados do sync legado que não possam ser associados à conta expiram em até 90 dias, conforme a seção 7; entre em contato para solicitar ajuda com esses dados.</p>
  <p>A renovação de assinatura pelo Asaas é cancelada antes da exclusão. <strong>Excluir a conta não cancela uma assinatura da App Store:</strong> gerencie e cancele a renovação nos ajustes de assinaturas da Apple. Os provedores de pagamento podem conservar seus próprios registros conforme suas obrigações legais.</p>

  <p>Solicitações podem exigir verificação proporcional da identidade para evitar entrega de dados à pessoa errada. Não envie senha nem dados de cartão. O pedido é gratuito; a resposta observará os prazos legais, incluindo a declaração completa de acesso em até 15 dias nos termos do art. 19 da LGPD. Quando não pudermos atender integralmente, informaremos os motivos e os dados que precisam ser preservados. Você também pode apresentar petição à ANPD e aos órgãos de defesa do consumidor.</p>

  <h2>9. Menores de idade</h2>
  <p>O aplicativo é destinado a maiores de 18 anos e não é dirigido a crianças. Não coletamos intencionalmente informações de menores de idade.</p>

  <h2>10. Alterações nesta política</h2>
  <p>Podemos atualizar esta Política de Privacidade periodicamente. A versão mais recente estará sempre disponível nesta página.</p>

  <h2>11. Finalidades e bases legais</h2>
  <ul>
    <li><strong>Execução do contrato e procedimentos solicitados:</strong> autenticação, perfil, sincronização, colaboração, atendimento, entrega de recursos contratados e controle do plano.</li>
    <li><strong>Obrigação legal ou regulatória e exercício regular de direitos:</strong> registros de cobrança, cumprimento de solicitações oficiais e defesa em processos, limitados aos dados e prazos necessários.</li>
    <li><strong>Legítimo interesse, quando cabível:</strong> prevenção de abuso e segurança do serviço, com minimização, avaliação de necessidade e respeito aos direitos do titular.</li>
    <li><strong>Consentimento específico:</strong> medição publicitária opcional e compartilhamentos opcionais para os quais seja exigido consentimento. Autorizar uma função de IA não autoriza publicidade, nem constitui autorização genérica para tratar dados sensíveis.</li>
  </ul>
  <p>A base aplicável depende da operação e do contexto. O aceite de termos de uso não substitui consentimento específico quando necessário. Você não precisa autorizar publicidade ou IA para escrever, ensaiar e gravar localmente.</p>

  <h2>12. Tratamento fora do Brasil</h2>
  <p>Os fornecedores globais descritos nesta política podem processar ou armazenar dados fora do Brasil, inclusive nos Estados Unidos e em países onde mantêm infraestrutura e suboperadores. Isso pode ocorrer em autenticação, hospedagem, IA, e-mails e pagamentos. Você pode solicitar informações sobre os destinatários e as garantias aplicáveis pelo contato da seção 1.</p>
  <p>Transferências internacionais devem observar o art. 33 da LGPD e a regulamentação da ANPD. Esta política informa os fluxos; não substitui os instrumentos contratuais e demais garantias exigidos para cada fornecedor, nem usa o simples aceite da política como consentimento genérico para transferências.</p>

  <p class="muted" style="margin-top:40px">© 2026 AlvoPrompter. Todos os direitos reservados.</p>
</main>
</body>
</html>`;

const TERMS = HTML.replace('Política de Privacidade — AlvoPrompter</title>', 'Termos de Uso — AlvoPrompter</title>').replace(/<main>[\s\S]*?<\/main>/, `<main>
  <nav aria-label="Documentos legais"><a href="/">Privacidade e LGPD</a><a href="/terms">Termos de uso</a><a href="mailto:alexandrecostagg@gmail.com">Contato</a></nav>
  <h1>Termos de Uso — AlvoPrompter</h1>
  <p class="muted">Versão de 26 de outubro de 2026</p>
  <h2>1. Serviço e responsável</h2>
  <p>O AlvoPrompter oferece ferramentas para escrever, ensaiar, gravar, editar e compartilhar vídeos. O responsável é Alexandre Gomes da Costa, contato <a href="mailto:alexandrecostagg@gmail.com">alexandrecostagg@gmail.com</a>. Os recursos disponíveis dependem da plataforma, do dispositivo, da conexão e do plano apresentado antes da contratação.</p>
  <h2>2. Licença do aplicativo na Apple</h2>
  <p>A licença de uso da versão distribuída pela App Store segue o <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Contrato de Licença de Usuário Final padrão da Apple (EULA)</a>. Esta página descreve as condições do serviço AlvoPrompter e não substitui essa licença por uma EULA personalizada. Os direitos obrigatórios do consumidor permanecem preservados.</p>
  <h2>3. Conta e utilização</h2>
  <p>O serviço destina-se a maiores de 18 anos. Informe dados corretos e proteja seu acesso. Recursos locais podem ser utilizados sem conta; sincronização, equipe, IA e assinaturas exigem os requisitos apresentados no app, inclusive confirmação de e-mail quando aplicável. Telefone e organização são opcionais.</p>
  <p>Não utilize o serviço para fraude, violação de direitos, conteúdo ilícito, acesso a contas de terceiros ou tentativas de comprometer a segurança. Medidas de proteção e limitações de uso devem ser proporcionais ao abuso identificado; você pode solicitar esclarecimento pelo contato acima.</p>
  <h2>4. Planos, renovação e cancelamento</h2>
  <p>Antes de contratar, confira o nome do plano, os recursos, a duração e o preço exibidos na confirmação de compra. As assinaturas pagas são mensais e recorrentes. No iOS, a compra, a cobrança, a renovação e a gestão da assinatura ocorrem pela App Store. Na web, o checkout é processado pelo Asaas. O preço e a moeda podem variar por loja e região; prevalecem os apresentados na confirmação da contratação.</p>
  <p>O acesso pago depende da validação da compra. Em caso de compra anterior na Apple, utilize “Restaurar compras da App Store” na mesma conta AlvoPrompter vinculada à assinatura. A compra não transfere automaticamente o plano a outra conta do aplicativo.</p>
  <p>Para impedir futuras renovações na Apple, use “Gerenciar na App Store” ou os ajustes de assinaturas da sua conta Apple, observando o prazo informado pela loja. Na web, use a opção de cancelar renovação da conta ou procure o suporte. O cancelamento de renovação normalmente preserva o acesso até o fim do período pago, sujeito ao estado da compra, reembolsos ou estornos. Excluir o aplicativo ou a conta não cancela automaticamente a assinatura Apple.</p>
  <p>Pedidos de reembolso de compras Apple podem ser feitos em <a href="https://reportaproblem.apple.com/">reportaproblem.apple.com</a>. Para compras na web, entre em contato com o AlvoPrompter. Estas condições não afastam direitos de arrependimento, reembolso ou demais garantias previstos na legislação aplicável. Compras em ambiente de teste não geram cobrança real.</p>
  <h2>5. Acesso temporário e limites</h2>
  <p>Solicitar acesso por convite não contrata uma assinatura nem autoriza cobrança. A administração define o plano e o prazo concedidos. A concessão termina na data informada, salvo prorrogação. A passagem para um plano pago depende de contratação autorizada pelo usuário. Limites de IA e de equipe são os apresentados no plano; não constituem uso ilimitado.</p>
  <h2>6. Seus materiais e inteligência artificial</h2>
  <p>Seus textos e gravações continuam sendo seus. Você deve ter os direitos e autorizações necessários sobre materiais e dados de outras pessoas que usar. O envio para sincronização, publicação ou IA permite o processamento necessário à função solicitada, conforme a <a href="/">Política de Privacidade</a>; não representa cessão geral dos seus direitos.</p>
  <p>A IA pode gerar erros, conteúdo inadequado ou semelhante ao de outras pessoas. Revise o resultado antes de usar ou publicar. Ela não substitui orientação profissional e não garante originalidade, desempenho ou resultado comercial. Confira as informações sobre envio de textos e áudio aos fornecedores antes de autorizar. Não envie dados sensíveis, confidenciais ou pessoais aos serviços Gemini gratuitos.</p>
  <h2>7. Salvamento e compartilhamento</h2>
  <p>Arquivos salvos neste aparelho não são automaticamente um backup na nuvem. Mantenha cópias dos materiais importantes. A sincronização cobre os conteúdos indicados pelo recurso. Uma página compartilhada pode ser acessada por quem obtiver o link; cópias exportadas para redes sociais ou terceiros ficam fora do controle do AlvoPrompter. A disponibilidade de formatos e destinos depende também das plataformas externas.</p>
  <h2>8. Privacidade e encerramento da conta</h2>
  <p>A <a href="/">Política de Privacidade e LGPD</a> explica dados, finalidades, fornecedores, retenção e direitos. Para excluir sua conta, abra “Conta e assinatura → Excluir minha conta” e siga a confirmação de identidade. Leia os efeitos sobre espaços compartilhados e assinaturas antes de confirmar. Para exercer direitos ou resolver dificuldades, use o contato acima.</p>
  <h2>9. Atendimento e alterações</h2>
  <p>Comunique falhas e questões sobre seu acesso pelo e-mail de suporte, sem enviar senhas ou dados de cartão. A versão vigente dos documentos fica disponível nesta página, com a data de atualização. Mudanças de preço e de assinatura seguem os avisos e procedimentos do canal de contratação. Nenhuma disposição limita direitos obrigatórios previstos no Código de Defesa do Consumidor, na LGPD ou em outras normas aplicáveis.</p>
</main>`);

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers = {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { ...headers, allow: "GET, HEAD" } });
    }
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/robots.txt") {
      return new Response(request.method === "HEAD" ? null : "User-agent: *\nAllow: /\n", {
        headers: { "content-type": "text/plain", "cache-control": "no-store" },
      });
    }
    const body = path === "/terms" ? TERMS : ["/", "/privacy"].includes(path) ? HTML : null;
    return new Response(request.method === "HEAD" ? null : body ?? "Página não encontrada.", {
      status: body ? 200 : 404, headers,
    });
  },
};
