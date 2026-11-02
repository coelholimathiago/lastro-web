// Peças repetidas entre as telas: o banco das três moedas e a avaliação de uma recompensa.

import { MOEDAS, esc, ic, barrinhas, fNum, fReais, dataCurta } from '../ui.js';

export const ORDEM = ['kcal', 'reais', 'min'];
const CAMPO_CREDITO = { kcal: 'credito_kcal', reais: 'credito_reais', min: 'credito_min' };
const CUSTO = { kcal: 'custo_kcal', reais: 'custo_reais', min: 'custo_min' };

export const formatar = (moeda, n, o) => MOEDAS[moeda].f(n, o);
export const comUnidade = (moeda, n, o) => (moeda === 'reais' ? fReais(n, o) : `${fNum(n, o)} ${MOEDAS[moeda].unidade}`);

// Três blocos do banco, cada um com as barrinhas dos últimos dias.
export function bancoHtml(banco, creditos = [], { titulo = 'Banco', lado = 'saldo acumulado' } = {}) {
  const blocos = ORDEM.map((m) => {
    const v = Number(banco[m]);
    const neg = v < 0;
    const serie = creditos.map((c) => (c[CAMPO_CREDITO[m]] === null ? null : Number(c[CAMPO_CREDITO[m]])));
    const ult = creditos.length ? `de ${dataCurta(creditos[0].data)} a ${dataCurta(creditos[creditos.length - 1].data)}` : '';
    // no bloco do banco o real vai inteiro (os centavos aparecem na troca); número longo encolhe
    const txt = formatar(m, m === 'reais' ? Math.round(v) : v, { sinal: true });
    const tam = txt.length > 8 ? 17 : txt.length > 6 ? 20 : 24;
    return `<div class="moeda ${MOEDAS[m].cls}${neg ? ' neg' : ''}">
<span class="rot"><span class="ponto ${MOEDAS[m].cls}"></span>${MOEDAS[m].nome}</span>
<span class="valor num" style="font-size:${tam}px" aria-label="${MOEDAS[m].nome}: ${esc(formatar(m, v, { sinal: true }))}">${txt}${neg ? ic.cadeado(16) : ''}</span>
<span class="un">${neg ? 'negativo · bloqueia' : MOEDAS[m].unidade}</span>
${creditos.length ? barrinhas(serie, { cor: `var(--${MOEDAS[m].cls})`, rotulo: `Crédito diário de ${MOEDAS[m].nome.toLowerCase()} ${ult}` }) : ''}
</div>`;
  }).join('');
  const negativas = ORDEM.filter((m) => Number(banco[m]) < 0).map((m) => MOEDAS[m].nome.toLowerCase());
  const aviso = negativas.length
    ? `<div class="aviso" role="status">${ic.cadeado(16)}<span><b>Trocas com ${negativas.join(' e ')} bloqueadas.</b> Voltam quando o banco sair do negativo.</span></div>`
    : '';
  return `<section class="card" aria-labelledby="banco-tit">
<div class="card-cab"><h2 id="banco-tit">${esc(titulo)}</h2><span class="lado">${esc(lado)}</span></div>
<div class="banco">${blocos}</div>
${aviso}
</section>`;
}

// Avalia uma recompensa contra o banco: o que custa, o que bloqueia e quanto falta.
export function avaliar(r, banco) {
  const custos = ORDEM.filter((m) => Number(r[CUSTO[m]]) > 0).map((m) => ({ moeda: m, valor: Number(r[CUSTO[m]]) }));
  const faltas = [];
  let progresso = 1;
  for (const c of custos) {
    const b = Number(banco[c.moeda]);
    if (b < c.valor) {
      faltas.push({ moeda: c.moeda, falta: c.valor - b, negativo: b < 0, saldo: b });
    }
    progresso = Math.min(progresso, Math.max(0, b) / c.valor);
  }
  const depois = Object.fromEntries(custos.map((c) => [c.moeda, Number(banco[c.moeda]) - c.valor]));
  return { custos, faltas, bloq: faltas.length > 0, progresso, depois };
}

export function chipsCusto(custos, faltas = []) {
  return `<div class="chips">${custos.map((c) => {
    const falta = faltas.find((f) => f.moeda === c.moeda);
    return `<span class="chip ${falta ? 'no' : MOEDAS[c.moeda].cls}">${comUnidade(c.moeda, c.valor)}</span>`;
  }).join('')}</div>`;
}

export function motivoBloqueio(faltas) {
  return faltas.map((f) => {
    const nome = MOEDAS[f.moeda].nome;
    const falta = comUnidade(f.moeda, f.falta);
    return f.negativo
      ? `${nome} em ${comUnidade(f.moeda, f.saldo)} · faltam ${falta}`
      : `Faltam ${falta} de ${nome.toLowerCase()}`;
  }).join(' · ');
}
