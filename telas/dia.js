// Dia: data navegável, as três moedas com a conta e a barra, listas com excluir, hábitos do Garmin e manuais.

import { hojeBR, addDias, dataLonga, esc, ic, anel, fNum, fReais, fDuracao, fFator, fmt, pct, MENOS } from '../ui.js';
import { previsaoDia, blocoPrevisao } from './previsao.js';
import { botaoSincronizar, ligarSincronizar } from './sincronizar.js';

const tracejado = (tipo, data, rot) =>
  `<a class="btn tracejado" href="#/registrar?tipo=${tipo}&data=${data}" aria-label="Registrar ${rot.toLowerCase()}">${ic.mais(16)}${rot}</a>`;

const excluir = (tabela, id, nome) =>
  `<button type="button" class="btn-icone leve" data-acao="excluir" data-tabela="${tabela}" data-id="${esc(id)}" data-nome="${esc(nome)}" aria-label="Excluir ${esc(nome)}">${ic.lixeira(18)}</button>`;

function pilha(partes) {
  const total = partes.reduce((a, p) => a + Math.max(0, p.v), 0) || 1;
  return `<div class="pilha" aria-hidden="true">${partes.filter((p) => p.v > 0).map((p) => `<div style="width:${pct(p.v / total)};background:${p.cor}"></div>`).join('')}</div>
<div class="legenda">${partes.filter((p) => p.v > 0).map((p) => `<span><i style="background:${p.cor}"></i>${p.rot}</span>`).join('')}</div>`;
}

export async function montar({ api, rota }) {
  const H = hojeBR();
  let D = rota.q.get('data') || H;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(D) || D > H) D = H;

  const ehHoje = D === H;
  const [c, refeicoes, gastos, tempos, atividadesG, g, habitos, regra, banco, garmin8] = await Promise.all([
    api.creditoDia(D), api.refeicoes(D), api.gastos(D), api.tempos(D), api.garminAtividades(D),
    api.garminDia(D), api.habitosDia(D), api.regras(D), api.banco(),
    ehHoje ? api.garminPeriodo(addDias(H, -8), H).catch(() => []) : Promise.resolve([]),
  ]);
  const fator = regra ? Number(regra.fator_vicio) : 2.3;

  // ---- situação do dia
  let status;
  if (!c) status = `<div class="aviso neutro">${ic.relogio(16)}<span>Dia fora do período do banco. Os registros aparecem, mas não geram crédito.</span></div>`;
  else if (ehHoje) status = `<div class="aviso neutro" role="status">${ic.relogio(16)}<span>Dia aberto. O crédito fica pendente até o dia fechar e o Garmin sincronizar.</span></div>`;
  else if (!c.confirmado_kcal) status = `<div class="aviso neutro" role="status">${ic.relogio(16)}<span>Dinheiro e tempo confirmados. Calorias aguardam o Garmin sincronizar o dia completo.</span></div>`;
  else status = `<div class="aviso ok" role="status">${ic.check(16)}<span>Dia fechado: as três moedas já estão no banco.</span></div>`;

  // ---- calorias
  const consumo = c ? Number(c.consumo_kcal) : refeicoes.reduce((a, r) => a + Number(r.kcal), 0);
  const deficit = c ? Number(c.deficit_meta) : (regra ? regra.deficit_meta : 500);
  const gastoK = c && c.gasto_kcal !== null ? Number(c.gasto_kcal) : null;
  let calConta, calBarra = '';
  if (gastoK !== null) {
    const cred = Number(c.credito_kcal);
    calConta = `<div class="conta" style="grid-template-columns:repeat(4,minmax(0,1fr))">
<div><span class="v num">${fmt(gastoK)}</span><span class="r">gasto Garmin</span></div>
<div><span class="v num">${MENOS} ${fmt(consumo)}</span><span class="r">consumo</span></div>
<div><span class="v num">${MENOS} ${fmt(deficit)}</span><span class="r">déficit meta</span></div>
<div><span class="v res num ${cred < 0 ? 'cor-no' : 'cor-cal'}">${fNum(cred, { sinal: true })}</span><span class="r">crédito</span></div></div>`;
    if (g && g.calorias_bmr !== null && g.calorias_ativas !== null) {
      calConta += `<span class="nota">Gasto = basal ${fmt(g.calorias_bmr)} + ativas ${fmt(g.calorias_ativas)}${ehHoje ? '. Hoje é parcial: o basal cresce ao longo do dia e o total fecha à meia-noite' : ''}.</span>`;
    }
    if (ehHoje) calConta += blocoPrevisao(previsaoDia(garmin8, H), consumo, deficit) + botaoSincronizar();
    calBarra = cred >= 0
      ? pilha([{ v: consumo, cor: 'var(--track)', rot: 'consumo' }, { v: deficit, cor: 'var(--cal-soft)', rot: 'déficit' }, { v: cred, cor: 'var(--cal)', rot: 'crédito' }])
      : pilha([{ v: Math.max(0, gastoK - deficit), cor: 'var(--track)', rot: 'consumo no orçamento' }, { v: -cred, cor: 'var(--no)', rot: 'passou do orçamento' }, { v: deficit, cor: 'var(--cal-soft)', rot: 'déficit' }]);
  } else {
    calConta = `<div class="conta" style="grid-template-columns:repeat(3,minmax(0,1fr))">
<div><span class="v num">—</span><span class="r">gasto Garmin</span></div>
<div><span class="v num">${MENOS} ${fmt(consumo)}</span><span class="r">consumo</span></div>
<div><span class="v num">${MENOS} ${fmt(deficit)}</span><span class="r">déficit meta</span></div></div>
<span class="nota">O gasto de calorias chega com o Garmin; até lá o crédito fica em aberto.</span>`;
    if (ehHoje) calConta += blocoPrevisao(previsaoDia(garmin8, H), consumo, deficit) + botaoSincronizar();
  }
  const listaRef = refeicoes.length
    ? refeicoes.map((r) => `<div class="item"><span class="txt"><span>${esc(r.descricao)}</span>${r.hora ? `<small>${esc(String(r.hora).slice(0, 5))}</small>` : ''}</span><span class="val">${fmt(r.kcal)} kcal</span>${excluir('refeicao', r.id, r.descricao)}</div>`).join('')
    : `<div class="vazio">Nenhuma refeição registrada.</div>`;

  // ---- dinheiro
  let dinConta = '', dinBarra = '', dinNota = '';
  const gastoR = gastos.reduce((a, x) => a + Number(x.valor), 0);
  if (c) {
    const teto = Number(c.teto_reais), cred = Number(c.credito_reais);
    dinConta = `<div class="conta" style="grid-template-columns:repeat(3,minmax(0,1fr))">
<div><span class="v num">${fReais(teto)}</span><span class="r">teto do dia</span></div>
<div><span class="v num">${MENOS} ${fReais(gastoR)}</span><span class="r">gasto</span></div>
<div><span class="v res num ${cred < 0 ? 'cor-no' : 'cor-din'}">${fReais(cred, { sinal: true })}</span><span class="r">crédito</span></div></div>`;
    dinBarra = cred >= 0
      ? pilha([{ v: gastoR, cor: 'var(--track)', rot: 'gasto' }, { v: cred, cor: 'var(--din)', rot: 'sobra do teto' }])
      : pilha([{ v: teto, cor: 'var(--track)', rot: 'dentro do teto' }, { v: -cred, cor: 'var(--no)', rot: 'acima do teto' }]);
    const dias = new Date(Date.UTC(+D.slice(0, 4), +D.slice(5, 7), 0)).getUTCDate();
    if (regra) dinNota = `<span class="nota">${fReais(regra.teto_mensal)} no mês ÷ ${dias} dias</span>`;
  }
  const listaGas = gastos.length
    ? gastos.map((x) => `<div class="item"><span class="txt"><span>${esc(x.descricao)}</span>${x.categoria ? `<small>${esc(x.categoria)}</small>` : ''}</span><span class="val">${fReais(x.valor)}</span>${excluir('gasto', x.id, x.descricao)}</div>`).join('')
    : `<div class="vazio">Nenhum gasto registrado.</div>`;

  // ---- tempo
  let tmpConta = '', tmpBarra = '';
  if (c) {
    const prod = Number(c.produtivo_min), vmin = Number(c.vicio_min), custo = Number(c.vicio_custo_min), cred = Number(c.credito_min);
    tmpConta = `<div class="conta" style="grid-template-columns:repeat(3,minmax(0,1fr))">
<div><span class="v num">+ ${fmt(prod)}</span><span class="r">produtivo (min)</span></div>
<div><span class="v num">${MENOS} ${fmt(custo)}</span><span class="r">${vmin} min de vício</span></div>
<div><span class="v res num ${cred < 0 ? 'cor-no' : 'cor-tmp'}">${fNum(cred, { sinal: true })}</span><span class="r">crédito (min)</span></div></div>`;
    tmpBarra = pilha([{ v: prod, cor: 'var(--tmp)', rot: 'produtivo' }, { v: custo, cor: 'var(--no)', rot: 'custo do vício' }]);
  }
  const linhasTreino = atividadesG.map((a) => `<div class="item"><span class="txt"><span>${esc(a.nome || 'Treino')}</span><small>Garmin · automático</small></span><span class="val cor-tmp">+ ${fmt(Math.round(a.duracao_min))}</span><span style="width:34px"></span></div>`);
  const linhasTempo = tempos.map((t) => {
    const a = t.atividade || {};
    const vicio = a.tipo === 'vicio';
    const f = vicio ? Number(a.fator ?? fator) : 1;
    const v = vicio ? Math.round((t.minutos * Math.round(f * 100)) / 100) : t.minutos; // centésimos inteiros, como o numeric do SQL
    const det = vicio ? `${t.minutos} min × ${fFator(f)}` : (t.fonte === 'iphone' ? 'iPhone' : 'manual');
    return `<div class="item"><span class="txt"><span>${esc(a.nome || 'Atividade')}</span><small>${det}</small></span><span class="val ${vicio ? 'cor-no' : 'cor-tmp'}">${vicio ? MENOS : '+'} ${fmt(v)}</span>${excluir('tempo_registro', t.id, a.nome || 'registro')}</div>`;
  });
  const listaTmp = linhasTreino.length + linhasTempo.length ? linhasTreino.concat(linhasTempo).join('') : `<div class="vazio">Nenhum tempo registrado.</div>`;

  // ---- hábitos
  const total = habitos.length;
  const feitos = habitos.filter((h) => h.status === 'fiz').length;
  const auto = habitos.filter((h) => h.fonte !== 'manual');
  const manuais = habitos.filter((h) => h.fonte === 'manual');
  const marcados = manuais.filter((h) => h.status).length;
  const valorGarmin = (h) => {
    if (!g && h.regra !== 'treino') return 'sem dados';
    switch (h.regra) {
      case 'acordar_ate': return g.acordou_as ? String(g.acordou_as).replace(' ', 'T').slice(11, 16) : '—';
      case 'dormir_ate': return g.dormiu_as ? String(g.dormiu_as).replace(' ', 'T').slice(11, 16) : '—';
      case 'sono': return g.sono_min !== null ? `${fDuracao(g.sono_min)} · score ${g.sono_score ?? '—'}` : '—';
      case 'passos': return g.passos !== null ? fmt(g.passos) : '—';
      case 'treino': {
        const a = [...atividadesG].sort((x, y) => y.duracao_min - x.duracao_min)[0];
        return a ? `${a.nome || a.tipo} ${Math.round(a.duracao_min)} min` : 'nenhum';
      }
      case 'pesar': return g.peso_kg !== null && g.peso_kg !== undefined ? `${fmt(g.peso_kg, 1)} kg` : '—';
      default: return '';
    }
  };
  const linhasAuto = auto.map((h) => {
    const cor = h.status === 'fiz' ? 'cor-ok' : h.status === 'nao' ? 'cor-no' : 'cor-sub';
    const icone = h.status === 'fiz' ? ic.check(16) : h.status === 'nao' ? ic.x(16) : ic.pendente(16);
    const det = h.regra === 'dormir_ate' ? 'mede a noite anterior' : h.regra === 'sono' ? 'conta no dia em que acordou' : '';
    return `<div class="item"><span class="txt"><span>${esc(h.nome)}</span>${det ? `<small>${det}</small>` : ''}</span><span class="val ${cor}" style="display:flex;align-items:center;gap:6px">${icone}${esc(valorGarmin(h))}</span></div>`;
  }).join('');
  const linhasManuais = manuais.map((h) => `<div class="item"><span class="txt"><span>${esc(h.nome)}</span></span>
<div class="seg" role="group" aria-label="${esc(h.nome)}">
<button type="button" class="fiz" data-acao="marcar" data-id="${esc(h.habito_id)}" data-status="fiz" aria-pressed="${h.status === 'fiz'}">Fiz</button>
<button type="button" class="nao" data-acao="marcar" data-id="${esc(h.habito_id)}" data-status="nao" aria-pressed="${h.status === 'nao'}">Não fiz</button>
</div></div>`).join('');

  const extras = g ? [['FC repouso', g.fc_repouso, 'bpm'], ['HRV', g.hrv, 'ms'], ['Body Battery', g.body_battery_max, 'máx']]
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([r, v, u]) => `<div><span class="v num">${v}</span><span class="r">${r} · ${u}</span></div>`).join('') : '';

  const prox = addDias(D, 1);
  return `<div class="tela">
<div class="navdia">
<a class="btn-icone" href="#/dia?data=${addDias(D, -1)}" aria-label="Dia anterior">${ic.voltar(18)}</a>
<div class="meio"><span class="nota">${ehHoje ? 'hoje' : D === addDias(H, -1) ? 'ontem' : 'dia'}</span><h1>${esc(dataLonga(D))}</h1></div>
${ehHoje ? `<span class="btn-icone" aria-disabled="true" aria-label="Próximo dia">${ic.seta(18)}</span>` : `<a class="btn-icone" href="#/dia?data=${prox}" aria-label="Próximo dia">${ic.seta(18)}</a>`}
</div>
${status}

<section class="card cal" aria-labelledby="cal-tit">
<div class="card-cab"><h2 id="cal-tit"><span class="ponto cal"></span>Calorias</h2>${tracejado('refeicao', D, 'Refeição')}</div>
${calConta}
${calBarra}
<div class="lista">${listaRef}</div>
</section>

<section class="card din" aria-labelledby="din-tit">
<div class="card-cab"><h2 id="din-tit"><span class="ponto din"></span>Dinheiro</h2>${tracejado('gasto', D, 'Gasto')}</div>
${dinConta}
${dinBarra}
${dinNota}
<div class="lista">${listaGas}</div>
</section>

<section class="card tmp" aria-labelledby="tmp-tit">
<div class="card-cab"><h2 id="tmp-tit"><span class="ponto tmp"></span>Tempo</h2>${tracejado('tempo', D, 'Tempo')}</div>
${tmpConta}
${tmpBarra}
<span class="nota">Minuto de vício custa × ${fFator(fator)} · banco de tempo em ${fNum(banco.min, { sinal: true })} min</span>
<div class="lista">${listaTmp}</div>
</section>

<section class="card hab" aria-labelledby="hab-tit">
<div class="card-cab"><h2 id="hab-tit"><span class="ponto hab"></span>Hábitos</h2>
${anel({ pct: total ? feitos / total : 0, cor: 'var(--hab)', trilho: 'var(--hab-soft)', tam: 52, esp: 6, centro: `<span style="font-size:12px;font-weight:600">${feitos}/${total}</span>`, rotulo: `${feitos} de ${total} hábitos cumpridos` })}
</div>
${total ? '' : '<div class="vazio">Dia fora do período dos hábitos.</div>'}
${auto.length ? `<span class="grupo-rot" style="display:flex;align-items:center;gap:6px">${ic.relogioPulso(14)}Do Garmin, automático</span><div class="lista">${linhasAuto}</div>` : ''}
${manuais.length ? `<span class="grupo-rot">Fiz / não fiz · ${marcados} de ${manuais.length} marcados</span><div class="lista">${linhasManuais}</div>` : ''}
${extras ? `<div class="mosaico">${extras}</div>` : ''}
</section>
</div>`;
}

export function ligar(main, { api, rota, recarregar, toast }) {
  const D = rota.q.get('data') || hojeBR();
  ligarSincronizar(main, { api, recarregar, toast });
  main.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    if (b.dataset.acao === 'marcar') {
      const atual = b.getAttribute('aria-pressed') === 'true';
      b.closest('.seg').querySelectorAll('button').forEach((x) => { x.disabled = true; });
      try {
        await api.marcarHabito(b.dataset.id, D > hojeBR() ? hojeBR() : D, atual ? null : b.dataset.status);
        recarregar();
      } catch (e) { toast(e.message, 'erro'); recarregar(); }
    }
    if (b.dataset.acao === 'excluir') {
      if (!window.confirm(`Excluir "${b.dataset.nome}"?`)) return;
      b.disabled = true;
      try {
        await api.excluir(b.dataset.tabela, b.dataset.id);
        toast('Excluído');
        recarregar();
      } catch (e) { toast(e.message, 'erro'); b.disabled = false; }
    }
  });
}
