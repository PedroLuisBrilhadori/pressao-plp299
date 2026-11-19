/* template.js — texto padrão da campanha (editável no site).
 * Placeholders: {nome} {partido} {uf} {meu_nome} {minha_cidade}
 * No envio em lote, {nome} vira "parlamentar(s)". */
(function (root) {
  'use strict';

  var ASSUNTO = 'Vote NÃO no PLP 299/2026 — sua eleitora e seu eleitor estão acompanhando';

  var CORPO = [
    'Prezado(a) {nome},',
    '',
    'Meu nome é {meu_nome}, sou eleitor(a) de {minha_cidade} ({uf}) e escrevo a respeito do PLP 299/2026, o pacote fiscal que está na pauta do Congresso.',
    '',
    'O projeto endurece o teto de despesas federais: o limite de crescimento das despesas cai de 2,5% para 2% ao ano acima da inflação, com impacto estimado de até R$ 56 bilhões em 2027. Na prática, isso significa corte real em despesas obrigatórias — saúde, educação e assistência — ano após ano, enquanto o custo de vida continua subindo para quem mais depende do serviço público.',
    '',
    'Peço respeitosamente que V.Sa. vote CONTRA o PLP 299/2026, pelos seguintes motivos:',
    '',
    '1. O país não deve mais economias à custa de quem tem menos — o ajuste não ataca isenções bilionárias nem privilégios, corta o que sustenta a vida da população;',
    '2. O crescimento de 2% acima da inflação é inferior à expansão natural da demanda por saúde (envelhecimento da população) e educação (demografia escolar), o que amarra o Estado para sempre;',
    '3. O Senado já aprovou o texto-base por 45 a 31 — cabe à Câmara representar o interesse de quem elegeu seus deputados, e não apenas o mapa do ajuste fiscal;',
    '4. Nossa pressão não termina no voto desta PLP: vamos continuar organizados até o fim do arcabouço fiscal — a régua que trata saúde, educação e salário mínimo como gastos a comprimir, e não como direitos a garantir;',
    '5. Eleitores de todo o país estão organizados e acompanhando o voto de cada parlamentar nesta matéria.',
    '',
    'Estou acompanhando a votação individual e conto com seu voto NÃO no PLP 299/2026.',
    '',
    'Com atenção,',
    '{meu_nome} — eleitor(a) de {minha_cidade} ({uf})'
  ].join('\n');

  root.TEMPLATE_PADRAO = { assunto: ASSUNTO, corpo: CORPO };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
