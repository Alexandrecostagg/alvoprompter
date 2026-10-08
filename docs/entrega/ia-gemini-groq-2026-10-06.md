# Migração de IA — 06/10/2026

## Publicado

- Worker: `alvoprompt-api`, release `1.5.0`.
- Versão atual publicada (texto e narração): `bc265535-84d9-47b9-87b9-a13f05e13482`. Versão anterior, só texto: `712c3410-0f9e-4d4c-8673-55ed644da486`.
- Endpoint: https://alvoprompt-api.alexandrecostagg.workers.dev.
- Texto: Google Gemini `gemini-3.5-flash-lite` primeiro, Groq `openai/gpt-oss-120b` como reserva.
- `GEMINI_API_KEY` e `GROQ_API_KEY` cadastradas como secrets do Worker; valores não incluídos neste registro nem no Git.
- `/health` em produção confirmou os dois provedores configurados e `fallbackReady: true`.
- `/chat` sem sessão, com origem `capacitor://localhost`, retornou HTTP 401: o login continua obrigatório.
- Carcará não é chamado pelo código publicado. Configurações antigas não utilizadas foram preservadas no servidor para permitir reversão; outros serviços e credenciais foram preservados.
- Versão anterior do código, antes do cadastro das novas chaves: `e602e3bf-e872-4d53-b716-92dcd8eb7e45`.

## Validação

- Tipagem, lint, diff e 153 testes aprovados.
- Testes reais feitos a partir deste computador, com o mesmo módulo de cascata e leitor de streaming usados pelo projeto.
- Gemini 3.5 Flash-Lite: JSON com 5 títulos, 5 ganchos e 12 hashtags válido, HTTP 200, aproximadamente 1,9 segundo.
- Groq: texto e JSON de títulos/ganchos/hashtags válidos, HTTP 200; JSON em aproximadamente 1,1 segundo.
- O Gemini 3.8 Flash respondeu ao teste simples, mas excedeu o limite de 20 segundos em duas tentativas estruturadas. Foi substituído pelo Flash-Lite após validação real.
- Testes automatizados cobrem fallback em falhas de rede, autenticação, limite e indisponibilidade; resposta vazia; cancelamento; recusa de conteúdo; falha durante streaming; e cobrança única/devolução da cota.
- Não foi realizada uma geração autenticada pelo app instalado após o deploy. Essa verificação em aparelho permanece necessária.

## Pendências separadas

- Política de privacidade atualizada no código em `api/privacy/src/index.ts`. Publicação bloqueada pela revisão automática por exigir autorização explícita para o texto público; confirmação solicitada ao usuário.
- Correção da área segura e botão Fechar do assistente preparada e verificada em prévia móvel, mas ainda não distribuída em novo binário TestFlight.
- Narração migrada ao Gemini na publicação complementar abaixo. Ainda falta testar o fluxo completo com uma sessão autenticada no aparelho.
- A leitura de ensaio com a voz do aparelho está preparada no cliente local, mas depende de distribuição da atualização para chegar ao app instalado.

## Narração Gemini — publicada após confirmação do nível gratuito

- Implementação em `api/transcribe/src/tts.ts`, conectada a `POST /tts`: Gemini `gemini-3.8-flash-lite-tts`, voz `Kore`, mesma chave existente no servidor.
- A listagem de modelos da chave confirmou acesso ao catálogo com esse modelo. Isso não confirma quota disponível nem o plano de cobrança.
- Entrada literal de até 5.000 caracteres, resposta WAV PCM mono 24 kHz validada, timeout de 90 segundos e cancelamento. Sem repetição automática ou segundo provedor de voz.
- Requisições usam `store: false`. Os termos de dados do Free tier continuam aplicáveis; o rascunho local da política foi ajustado e continua sem publicação.
- Erros não expõem detalhes do provedor. Login, limite diário e reserva/devolução de cota mensal continuam ativos.
- O editor mantém a leitura pelo aparelho. A tela do avatar aceita até 5.000 caracteres e mostra o motivo da falha de exportação.
- 173 testes aprovados, incluindo 20 novos de narração; tipagem, lint, diff e empacotamento local do Worker aprovados.
- Usuário confirmou o nível gratuito com captura do Google AI Studio em 06/10/2026 às 10:20. O sufixo da chave local corresponde ao projeto Alvoprompter mostrado na captura, sem registrar a chave no documento.
- Teste real pelo mesmo módulo do Worker: HTTP 200 em 27,8 segundos. Arquivo `artifacts/tts/gemini-portugues-2026-10-06.wav`, 432.354 bytes, duração 8,88 segundos, WAV PCM mono de 24 kHz e 16 bits. Cabeçalho, duração e amostras não silenciosas validados; qualidade da pronúncia ainda depende de escuta.
- Publicação com `--keep-vars` concluída: versão `bc265535-84d9-47b9-87b9-a13f05e13482`.
- `/health` confirmou Gemini TTS configurado com Flash-Lite e voz Kore, mantendo Gemini/Groq para texto. `/tts` sem autenticação, origem `capacitor://localhost`, retornou 401 sem síntese.
- O teste real foi direto no Gemini, usando o módulo local; o fluxo completo autenticado no app instalado ainda não foi validado. Não houve nova distribuição do cliente/TestFlight.
- Política de privacidade continua somente em rascunho local: não publicar sem autorização específica, conforme bloqueio da revisão automática.
