// Liberar: catálogo de recompensas com custo por moeda; bloqueadas mostram o motivo e quanto falta.
// #/liberar/<id> confirma a troca com stepper de kcal e R$ e chama trocar() — o servidor decide o saldo.

import { hojeBR, dataLonga, esc, ic, fmt, pct, clamp01, lerNumero, MOEDAS } from '../ui.js';
import { bancoHtml, avaliar, chipsCusto, motivoBloqueio, comUnidade, ORDEM } from './comum.js';

let confirmacao = null; // dados da tela de confirmação, usados em ligar()

export async function montar(ctx) {
  const { api, rota } = ctx;
  const [banco, recompensas] = await Promise.all([api.banco(), api.recompensas()]);
  if (rota.arg) return montarConfirmar(banco, recompensas, rota.arg);
  confirmacao = null;

  const H = hojeBR();
  const trocas = await api.trocas(H);
  const itens = recompensas.map((r) => ({ r, a: avaliar(r, banco) }));
  const disp = itens.filter((i) => !i.a.bloq);
  const bloq = itens.filter((i) => i.a.bloq).sort((x, y) => y.a.progresso - x.a.progresso);

  const linhaDisp = ({ r, a }) => {
    // quanto do banco essa troca consome (a moeda mais apertada)
    let maior = null;
    for (const c of a.custos) {
      const f = Number(banco[c.moeda]) > 0 ? c.valor / Number(banco[c.moeda]) : 1;
      if (!maior || f > maior.f) maior = { f, moeda: c.moeda };
    }
    const depois = a.custos.map((c) => comUnidade(c.moeda, a.depois[c.moeda])).join(' · ');
    return `<a class="recompensa" href="#/liberar/${encodeURIComponent(r.id)}">
<div class="corpo"><span class="nome-r">${esc(r.nome)}</span>${chipsCusto(a.custos)}
${maior ? `<div class="barra" style="height:6px" role="img" aria-label="Usa ${Math.round(clamp01(maior.f) * 100)}% do banco de ${MOEDAS[maior.moeda].nome.toLowerCase()}"><div style="width:${pct(maior.f)};background:var(--${MOEDAS[maior.moeda].cls})"></div></div>` : ''}
<span class="linha-r">Banco depois: ${depois || 'sem custo'}</span></div>${ic.seta(18)}</a>`;
  };
  const linhaBloq = ({ r, a }) => `<a class="recompensa bloq" href="#/liberar/${encodeURIComponent(r.id)}">
<div class="corpo"><span class="nome-r" style="display:flex;align-items:center;gap:6px">${ic.cadeado(15)}${esc(r.nome)}</span>${chipsCusto(a.custos, a.faltas)}
<div class="barra" style="height:6px" role="img" aria-label="${Math.round(a.progresso * 100)}% do caminho para liberar"><div style="width:${pct(a.progresso)};background:var(--hab)"></div></div>
<span class="linha-r cor-no">${esc(motivoBloqueio(a.faltas))}</span></div>${ic.seta(18)}</a>`;

  const listaTrocas = trocas.length
    ? trocas.map((t) => {
      const custos = ORDEM.filter((m) => Number(t[{ kcal: 'custo_kcal', reais: 'custo_reais', min: 'custo_min' }[m]]) > 0)
        .map((m) => ({ moeda: m, valor: Number(t[{ kcal: 'custo_kcal', reais: 'custo_reais', min: 'custo_min' }[m]]) }));
      return `<div class="item"><span class="txt"><span>${esc(t.nome)}</span></span>${chipsCusto(custos)}</div>`;
    }).join('')
    : '<div class="vazio">Nenhuma troca hoje.</div>';

  return `<div class="tela">
<div class="topo"><div><span class="quando">${esc(dataLonga(H))}</span><h1>Liberar</h1></div><span class="pilula">troca saldo por prazer</span></div>
${bancoHtml(banco)}

<section class="card" aria-labelledby="disp-tit">
<div class="card-cab"><h2 id="disp-tit"><span class="ponto" style="background:var(--ok)"></span>Disponíveis</h2><span class="lado">${disp.length} cabem no banco</span></div>
${disp.length ? disp.map(linhaDisp).join('') : '<div class="vazio">Nada cabe no banco agora. Um dia bom destrava as trocas.</div>'}
</section>

${bloq.length ? `<section class="card" aria-labelledby="bloq-tit">
<div class="card-cab"><h2 id="bloq-tit"><span class="ponto" style="background:var(--no)"></span>Bloqueadas</h2><span class="lado">barra = caminho até liberar</span></div>
${bloq.map(linhaBloq).join('')}
</section>` : ''}

<section class="card" aria-labelledby="trocas-tit">
<div class="card-cab"><h2 id="trocas-tit">${ic.troca(18)}Trocas de hoje</h2><span class="lado">${trocas.length}</span></div>
<div class="lista">${listaTrocas}</div>
</section>
<span class="nota">Sem fiado: moeda negativa bloqueia toda troca que a use. Recompensas novas entram pelos cadastros (em breve).</span>
</div>`;
}

// ------------------------------------------------------------ confirmação

function montarConfirmar(banco, recompensas, id) {
  const r = recompensas.find((x) => String(x.id) === String(id));
  if (!r) {
    confirmacao = null;
    return `<div class="tela"><div class="topo"><div><h1>Recompensa não encontrada</h1></div></div><a class="btn largo" href="#/liberar">Voltar para Liberar</a></div>`;
  }
  confirmacao = { r, banco, kcal: Number(r.custo_kcal), reais: Number(r.custo_reais), min: Number(r.custo_min), feito: null, erro: null, enviando: false };
  return `<div class="tela">
<div style="display:flex;align-items:center;gap:8px"><a class="btn-icone" href="#/liberar" aria-label="Voltar para Liberar">${ic.voltar(18)}</a><span class="nota" style="font-size:14px">Confirmar troca</span></div>
<div><h1 style="font-size:26px">${esc(r.nome)}</h1><span class="nota">Valores do cadastro. Ajuste se hoje for diferente.</span></div>
<div id="confirmar"></div>
</div>`;
}

function desenharConfirmar(el) {
  const c = confirmacao;
  const { r, banco } = c;
  const usa = { kcal: Number(r.custo_kcal) > 0, reais: Number(r.custo_reais) > 0, min: Number(r.custo_min) > 0 };
  const sim = { custo_kcal: usa.kcal ? c.kcal : 0, custo_reais: usa.reais ? c.reais : 0, custo_min: usa.min ? c.min : 0 };
  const a = avaliar(sim, banco);

  if (c.feito) {
    const depois = ORDEM.map((m) => comUnidade(m, c.feito.banco[m], { sinal: true })).join(' · ');
    el.innerHTML = `<section class="card din" role="status">
<div class="card-cab"><h2>${ic.check(18)}${esc(r.nome)} liberado</h2></div>
<span>Banco agora: <b>${depois}</b></span>
${r.libera_app ? `<div class="aviso neutro">${ic.celular(16)}<span>Esta troca libera ${esc(r.libera_app)} por ${r.libera_min || '—'} min no iPhone. O desbloqueio automático chega com o app nativo; por enquanto, a troca fica registrada.</span></div>` : ''}
<a class="btn primario largo" href="#/inicio">Voltar ao Início</a>
<a class="btn largo" href="#/liberar">Ver outras trocas</a>
</section>`;
    return;
  }

  const stepper = (moeda, valor, passo, rot) => `<div class="stepper ${MOEDAS[moeda].cls}">
<label class="rot-s" style="flex:1"><span><span class="ponto ${MOEDAS[moeda].cls}"></span>${rot}</span>
<input class="valor-s num" type="text" inputmode="${moeda === 'reais' ? 'decimal' : 'numeric'}" data-campo="${moeda}" value="${moeda === 'reais' ? fmt(valor, valor % 1 ? 2 : 0) : fmt(valor)}" aria-label="${rot}"></label>
<div class="botoes">
<button type="button" data-passo="${moeda}" data-delta="${-passo}" aria-label="Diminuir ${moeda === 'reais' ? 'R$ ' + passo : passo + ' kcal'}">${ic.menos(20)}</button>
<button type="button" data-passo="${moeda}" data-delta="${passo}" aria-label="Aumentar ${moeda === 'reais' ? 'R$ ' + passo : passo + ' kcal'}">${ic.mais(20)}</button>
</div></div>`;

  const steppers = [];
  if (usa.kcal) steppers.push(stepper('kcal', c.kcal, 50, 'Calorias (kcal)'));
  if (usa.reais) steppers.push(stepper('reais', c.reais, 5, 'Valor (R$)'));
  if (usa.min) steppers.push(`<div class="stepper tmp"><div class="rot-s"><span><span class="ponto tmp"></span>Tempo</span><span class="valor-s num" style="color:var(--ink)">${fmt(c.min)} <small>min</small></span></div><span class="nota" style="text-align:right">custo fixo${r.libera_min ? `<br>libera ${r.libera_min} min` : ''}</span></div>`);

  const linhas = a.custos.map((x) => {
    const antes = Number(banco[x.moeda]);
    const depois = antes - x.valor;
    const neg = depois < 0;
    const cls = MOEDAS[x.moeda].cls;
    return `<div class="metrica">
<div class="topo-m"><span class="nome-m"><span class="ponto ${cls}"></span>${MOEDAS[x.moeda].nome}</span><span class="valor-m">${comUnidade(x.moeda, antes, { sinal: true })} → <b class="num ${neg ? 'cor-no' : ''}">${comUnidade(x.moeda, depois, { sinal: true })}</b></span></div>
<div class="pilha" aria-hidden="true">${antes > 0 ? `<div style="width:${pct(Math.min(x.valor, antes) / antes)};background:var(--${neg ? 'no' : cls})"></div><div style="width:${pct(Math.max(0, depois) / antes)};background:var(--${cls}-soft)"></div>` : `<div style="width:100%;background:var(--no-soft)"></div>`}</div>
<span class="nota">${neg ? `faltam ${comUnidade(x.moeda, -depois)}` : `custa ${comUnidade(x.moeda, x.valor)} · ${Math.round(clamp01(x.valor / antes) * 100)}% do banco`}</span></div>`;
  }).join('');

  const semCusto = a.custos.length === 0;
  el.innerHTML = `<div class="tela" style="gap:14px">
${steppers.join('')}
<section class="card" aria-labelledby="custo-tit">
<div class="card-cab"><h2 id="custo-tit">Custo e banco</h2><span class="lado">antes → depois</span></div>
${semCusto ? '<div class="vazio">Sem custo nesta troca.</div>' : `<div class="metricas">${linhas}</div>`}
${a.bloq ? `<div class="aviso">${ic.cadeado(16)}<span><b>Pelo banco que você vê, não cabe:</b> ${esc(motivoBloqueio(a.faltas))}. Sem fiado — o servidor confere e recusa.</span></div>` : ''}
</section>
${c.erro ? `<div class="aviso" role="alert">${ic.x(16)}<span><b>Troca recusada.</b> ${esc(c.erro)}</span></div>` : ''}
<button type="button" class="btn primario largo" id="confirmar-btn"${c.enviando || semCusto ? ' disabled' : ''}>${c.enviando ? 'Confirmando…' : 'Confirmar troca'}</button>
<a class="btn fantasma largo" href="#/liberar">Voltar sem trocar</a>
</div>`;
}

export function ligar(raiz, { api, toast }) {
  if (!confirmacao) return;
  const el = raiz.querySelector('#confirmar');
  if (!el) return;
  desenharConfirmar(el);
  const c = confirmacao;

  el.addEventListener('click', async (ev) => {
    const passo = ev.target.closest('[data-passo]');
    if (passo) {
      const m = passo.dataset.passo;
      c[m] = Math.max(0, Math.round((c[m] + Number(passo.dataset.delta)) * 100) / 100);
      c.erro = null;
      desenharConfirmar(el);
      el.querySelector(`[data-passo="${m}"][data-delta="${passo.dataset.delta}"]`)?.focus();
      return;
    }
    if (ev.target.closest('#confirmar-btn')) {
      c.enviando = true; c.erro = null;
      desenharConfirmar(el);
      try {
        const r = c.r;
        await api.trocar({
          nome: r.nome,
          kcal: Number(r.custo_kcal) > 0 ? Math.round(c.kcal) : 0,
          reais: Number(r.custo_reais) > 0 ? c.reais : 0,
          min: Number(r.custo_min) > 0 ? c.min : 0,
          recompensa: r.id,
        });
        c.feito = { banco: await api.banco() };
        toast('Troca confirmada');
      } catch (e) {
        c.erro = e.message || String(e);
      }
      c.enviando = false;
      desenharConfirmar(el);
    }
  });
  el.addEventListener('change', (ev) => {
    const campo = ev.target.dataset.campo;
    if (!campo) return;
    const n = lerNumero(ev.target.value);
    if (Number.isFinite(n) && n >= 0) c[campo] = campo === 'reais' ? Math.round(n * 100) / 100 : Math.round(n);
    c.erro = null;
    desenharConfirmar(el);
  });
}
