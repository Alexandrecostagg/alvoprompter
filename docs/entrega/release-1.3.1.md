# AlvoPrompter 1.3.1 — Android e publicação

Data: 23/09/2026.

## Versão e integração

O remoto já estava em 1.3.0 / código 12, seis commits à frente da pasta inicial. Essas atualizações foram integradas às correções de salvamento, login, pagamentos, equipes, vídeo e marca. A nova versão é **1.3.1**, com **versionCode 13**. Package, lockfile, Android e metadados iOS foram alinhados. O número foi conferido no repositório remoto; não houve consulta nem envio à Play Console.

## AAB

- Arquivo: `artifacts/alvoprompter-1.3.1-code13.aab`.
- Identificador: `com.alvoprompt.app`.
- Tamanho: 4.208.617 bytes.
- SHA-256: `eb1b96c73504a9010c6feadb05bd19e2a3a1d104fee7ff9b35eb91e9d84d7302`.
- Certificado SHA-256: `F9:06:8F:CA:33:00:E1:63:5F:BA:59:F5:1D:68:ED:4B:89:C5:4B:08:95:6F:05:E5:D3:FD:E2:64:3F:43:10:74`.
- Assinatura corresponde à chave de upload configurada e ao AAB assinado anterior. Senhas e chave privada permanecem fora do Git.
- `bundleRelease` aprovado; `jarsigner` confirmou a assinatura. Manifesto dentro do AAB confirmou versão e código. ZIP íntegro e assets nativos conferidos, sem service worker PWA.
- Certificado de upload autoassinado, sem timestamp; o verificador Java também aponta a ordem de entradas do ZIP gerado pelo Gradle ao comparar JarFile/JarInputStream. Nenhuma assinatura inválida foi reportada. A aceitação final pela Play Console não foi testada.

## Validações

52 testes em 12 arquivos aprovados. Tipagem, lint, builds web e Capacitor aprovados. Integração preserva o limite de 8.000 tokens do Carcará e a devolução da cota em falhas/respostas vazias. Corrigido e testado o caminho do arquivo na reprodução de páginas públicas de vídeo.

O relatório inicial `2026-09-23.md` registra a validação anterior à integração remota. As verificações de vídeo em navegador daquele relatório antecedem os recursos trazidos da versão 1.3.0. Testes em celulares físicos e login completo com conta real continuam pendentes.

## Publicação

Publicação concluída a partir do commit `cf6077a`:

- D1: migração aditiva `0004_workspace_content.sql` aplicada com sucesso.
- API: `1d71dec4-c120-440a-83fd-e0c512deb809`.
- Política: `17f80893-d6ab-404b-9f8c-a5495a06e82e`.
- App Pages: `https://a034279f.alvoprompter.pages.dev`, produção `https://app.alvoprompter.com.br`.
- Landing Pages: `https://8467e91b.alvoprompter-landing.pages.dev`, produção `https://alvoprompter.com.br`.
- API `/health`: release 1.3.1, protocolo 2, Carcará e login configurados; cobrança não configurada, sandbox ativo.
- Chat e workspaces sem sessão retornam 401; origem externa não permitida retorna 403.
- HTML e logo do app correspondem ao build. Favicon da landing corresponde ao arquivo local; HTML difere apenas pela proteção automática de e-mail do Cloudflare. Política responde 200 com os textos atualizados.
- Navegador carregou a apresentação inicial, formulário de login habilitado e entrada no modo local.

A cobrança permanece em sandbox e depende do segredo ASAAS_API_KEY. Esta entrega não configura cobranças de produção nem envia o AAB à loja.
