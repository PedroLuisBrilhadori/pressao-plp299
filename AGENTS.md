# pressao-plp299 — guia para agentes

Site estático de campanha cívica (sem build, sem deps de runtime). Stack:
HTML/CSS/JS puro, testes com `node --test`.

## Regras do projeto

- **Zero custo é requisito do mantenedor**: nada de API de e-mail, backend,
  analytics ou CDN paga. Envio é sempre `mailto:` do próprio e-mail do visitante.
- `js/data.js` é **gerado** por `scripts/gerar-dados.mjs` (Câmara + Senado).
  A exceção é o campo `posicao`, que é curadoria manual. Não reescrever o
  arquivo à mão; para atualizar, rodar `pnpm regenerar-dados`.
- `js/mailto.js` é lógica pura testável — qualquer função nova precisa de
  teste em `test/mailto.test.mjs` e não pode depender de DOM.
- Citações dos vídeos são transcrição ASR (faster-whisper) com limpeza leve;
  sempre linkar o timestamp no YouTube junto.
- Deploy só por tag e **após aprovação explícita do mantenedor** (ver
  README, seção Deploy).

## Comandos

```bash
pnpm test              # node --test
pnpm check             # valida data.js contra as APIs
pnpm regenerar-dados   # reescreve data.js
python3 -m http.server 8321   # preview local
```
