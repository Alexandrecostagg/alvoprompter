# Ajustes de gravação e Android 30 — 20/11/2026

O menu de gravação foi reorganizado no código comum à web, iOS e Android. O acesso no topo passa a mostrar engrenagem + **Ajustes**, com contraste e área de toque maiores, nome acessível e estado de abertura.

## Experiência

- Categorias fixas **Câmera, Leitura, Texto e Fundo**, com painel ativo identificado, setas/Home/End, Escape e retorno de foco ao botão de abertura.
- A categoria Câmera aparece primeiro. Câmera, posição, enquadramento e filtro ficam agrupados; a opção de continuar gravando após o roteiro fica junto da configuração de gravação.
- Velocidade, fonte, espaçamentos e demais valores usam sliders largos e botões −/+ de pelo menos 44 px. Os valores aparecem junto dos nomes. Opções extensas deixam de depender de uma faixa horizontal escondida.
- Prévia de texto nas categorias de leitura/texto, incluindo variação proporcional ao tamanho selecionado. Alterações continuam salvas imediatamente no estado existente.
- No iPhone, quando câmera + modo por voz usam o fallback automático existente, o painel Leitura oferece diretamente o ajuste de velocidade e explica o comportamento.
- Fundos foram separados da tipografia. A interface esclarece que fundos da leitura não são incorporados ao vídeo da câmera.
- Configuração de câmera/filtro e restauração de padrões bloqueadas durante a tomada, evitando desligar ou reconstruir a captura por engano. Tipografia e leitura permanecem acessíveis. Restaurar padrões pede confirmação explícita.
- O painel mantém cabeçalho/categorias visíveis e conteúdo rolável. Campos numéricos têm nome acessível; cada grupo tem rótulo associado, sem envolver vários botões em um único label HTML.

## Verificação

446 testes em 50 arquivos aprovados. TypeScript e lint aprovados, com o aviso preexistente de Fast Refresh na fixture `audit/prompter-flow-harness.tsx`. A revisão final também passou por compilação do bundle Capacitor e build Android release.

No navegador, com câmera/microfone sintéticos:

- telas de 390×844, 360×640 e desktop 1440×900; largura do documento/painel sem overflow na tela estreita e desktop;
- troca das quatro categorias, mudança de velocidade 300→299 e fonte 48→50, estados ativos, navegação por setas/Home e Escape/restauração de foco;
- fluxo iPhone simulado para confirmar que a velocidade automática fica disponível com câmera + modo voz;
- tomada com painel aberto por mais de 30 s, sem interrupção pelo monitor de quadros; a prévia continuou com `readyState=4`, reprodução ativa e `currentTime=36,78 s` antes de finalizar;
- ajustes críticos da câmera desabilitados durante a gravação e tomada salva após parar, com zero microfones ativos na reprodução.

A simulação de UI de iPhone não substitui teste no aparelho. Não houve captura de hardware pessoal, compra ou solicitação real à IA. Capturas locais em `artifacts/settings-20261120/`.

## Android

Preparado **AlvoPrompter 1.6.5, versionCode 30**, applicationId `com.alvoprompt.app`. Incrementado `native/release.json` para o próximo preparo nativo e atualizado o código Android. Nenhuma nova versão iOS foi gerada nesta rodada.

- Bundle nativo compilado e sincronizado com `cap sync android`.
- `bundleRelease` e `assembleRelease` concluídos com Java 21, Gradle 8.14.3 e configuração de assinatura existente. Dependências ausentes do cache foram obtidas dos repositórios oficiais; a segunda compilação usou cache offline.
- APK verificado pelo apksigner e AAB pelo jarsigner. Os avisos do jarsigner sobre certificado autoassinado são esperados para a chave de upload Android; a verificação criptográfica passou. Certificado comparado com o AAB do build 26 e confirmado idêntico.
- APK e AAB contêm 55 arquivos web idênticos aos assets finais sincronizados. Confirmadas as strings do novo painel, do monitor de interrupção e a ausência da antiga confirmação de IA. Não há registro do service worker PWA no HTML nativo.
- Estão incluídas as correções anteriores de fonte de vídeo dos filtros, detecção de quadros interrompidos, base64 para compartilhamento e remoção da janela com fornecedor/plano de IA.

Arquivos privados locais:

- `artifacts/android-1.6.5-30/AlvoPrompter-1.6.5-30.apk` — pacote de teste instalável, sujeito à assinatura da instalação existente.
- `artifacts/android-1.6.5-30/AlvoPrompter-1.6.5-30.aab` — pacote para distribuição pela Play Console.
- `SHA256SUMS.txt` e `verification.json` na mesma pasta.

Pacotes não enviados à Play Store. A versão pública web e o iPhone instalado ainda dependem de liberação própria. Resta homologar gravação longa e compartilhamento nativo em aparelhos Android e iPhone com a versão atualizada; compilação e testes locais não constituem garantia de funcionamento em todo hardware.
