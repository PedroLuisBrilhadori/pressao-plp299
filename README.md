# pressao-plp299

Campanha popular para pressionar parlamentares a votarem **NO no PLP 299/2026**
(pacote fiscal: teto de despesas 2,5% → 2%, impacto de até R$ 56 bi em 2027 —
texto-base aprovado no Senado por 45×31). O visitante **escolhe seu estado** e o
site monta os e-mails para a **bancada da sua UF** (513 deputados + 81 senadores
em exercício, via APIs públicas).

Site **100% estático, zero backend, zero custo**: cada visitante envia do
**seu próprio e-mail** via links `mailto:` pré-preenchidos. Nenhum dado sai
do navegador (perfil, estado e progresso ficam em localStorage).

## Rodar local

```bash
python3 -m http.server 8321   # ou qualquer static server
# abrir http://127.0.0.1:8321
```

## Testes

```bash
pnpm test            # node --test — chunking, mailto, template (10 testes)
pnpm check           # data.js coerente com as APIs da Câmara/Senado
```

## Dados dos parlamentares

`js/data.js` é gerado a partir das APIs públicas
(`dadosabertos.camara.leg.br` + `legis.senado.leg.br`):

```bash
pnpm regenerar-dados   # reescreve js/data.js (513 deputados + 81 senadores em exercício, 27 UFs)
```

O campo `posicao` dos registros é curadoria manual (editável direto no
data.js) — usado para destacar alvos persuasivos no site. Parlamentares sem
e-mail público (ex.: 2 senadores hoje) aparecem no site com card "sem e-mail
público", direcionados só à página oficial.

## Deploy (Cloudflare Pages, por tag)

`scripts/deploy.sh` roda `wrangler pages deploy` — mesmo padrão do
`pedroluisbrilhadori/` (deploy em container na db01, disparado por tag `v*`).
Custom domain na zona Cloudflare existente. **Não deployar sem ok do
mantenedor.**

## Estrutura

```
index.html          single-page: contexto PLP 299, vídeos, editor, lote, cards
css/style.css       tema escuro, sem dependências
js/data.js          594 parlamentares em 27 UFs (GERADO — não editar à mão exceto posicao)
js/mailto.js        funções puras: chunking, buildMailto, renderTemplate
js/template.js      assunto/corpo padrão com placeholders
js/app.js           UI: editor (localStorage), chunks, cards, progresso, share
scripts/gerar-dados.mjs   regenera/valida data.js (--check, exit 0/1/2)
scripts/deploy.sh         wrangler pages deploy por tag
test/mailto.test.mjs      node --test
```

## Conteúdo dos vídeos

As citações da seção "Entenda em vídeo" vieram de transcrição local
(faster-whisper large-v3-turbo, API `127.0.0.1:8701`) dos vídeos do Jones
Manoel com `yt-dlp`. Links de citação apontam para o timestamp no YouTube.
