// Metas: 3 meses, 6 meses e 1 ano. Cada meta num card na cor do que mede, com de onde está → alvo,
// progresso, ritmo que o prazo pede e as recompensas que ela libera. Rotas: #/metas?h=3m|6m|12m,
// #/metas/nova?h=… e #/metas/editar?id=…  Contrato: supabase/migrations/0004_metas_semana_recompensas.sql.

import { hojeBR, addDias, dataLonga, dataCurta, esc, ic, anel, barra, linha, fmt, clamp01, pct, lerNumero, MENOS } from '../ui.js';
import { cartoesConselheiro, ligarConselheiro } from './conselheiro.js';

const HORIZONTES = [
  { id: '3m', rot: '3 meses', meses: 3 },
  { id: '6m', rot: '6 meses', meses: 6 },
  { id: '12m', rot: '1 ano', meses: 12 },
];

// cor e fonte de cada tipo de meta
const TIPOS = {
  peso: { cls: 'cal', nome: 'Peso', fonte: 'balança', icone: ic.peso, un: 'kg' },
  treinos_semana: { cls: 'hab', nome: 'Treinos por semana', fonte: 'Garmin', icone: ic.relogioPulso, un: 'treinos' },
  minutos_semana: { cls: 'tmp', nome: 'Minutos por semana', fonte: 'tempo produtivo', icone: ic.relogio, un: 'min' },
  contagem: { cls: 'din', nome: 'Contagem', fonte: 'você conta', icone: ic.check, un: '' },
};

const MESES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const KCAL_POR_KG = 7700;

// ------------------------------------------------------------ datas e números

function segundaDe(iso) {
  const dow = new Date(iso + 'T12:00:00Z').getUTCDay();
  return addDias(iso, -((dow + 6) % 7));
}
function addMeses(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m - 1 + n + 1, 0)).getUTCDate();
  const r = new Date(Date.UTC(a, m - 1 + n, Math.min(d, ultimo), 12));
  return r.toISOString().slice(0, 10);
}
function diasEntre(de, ate) {
  return Math.round((Date.parse(ate + 'T12:00:00Z') - Date.parse(de + 'T12:00:00Z')) / 864e5);
}
// "2 fev" até uns 10 meses à frente; "2 nov 2027" quando está longe (ou já passou de ano)
function dataMeta(iso, H) {
  const [a, m, d] = iso.split('-').map(Number);
  const s = `${d} ${MESES_C[m - 1]}`;
  const dist = diasEntre(H, iso);
  return dist > 300 || (dist < 0 && String(a) !== H.slice(0, 4)) ? `${s} ${a}` : s;
}
const mesCurto = (iso) => MESES_C[Number(iso.slice(5, 7)) - 1];
const n1 = (v) => fmt(v, 1);
// treinos: inteiro quando der, senão uma casa
const fT = (v) => (Math.abs(Math.round(v * 10) / 10 % 1) < 0.05 ? fmt(Math.round(v), 0) : fmt(v, 1));
function fMin(v) {
  const m = Math.round(Number(v) || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}
const numOuNulo = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// ------------------------------------------------------------ montar

export async function montar(ctx) {
  const { api, rota } = ctx;
  const H = hojeBR();

  if (api.modo === 'demo' || typeof api.metas !== 'function') {
    return `<div class="tela">
<div class="topo"><div><span class="quando">${esc(dataLonga(H))}</span><h1>Metas</h1></div></div>
<section class="card hab"><div class="card-cab"><h2>${ic.alvo(18)}Disponível com a conta conectada</h2></div>
<p class="nota" style="margin:0;color:var(--ink)">Metas de 3 meses, 6 meses e 1 ano moram no Supabase: peso pela média de 7 dias, treinos pelo Garmin, tempo pelo que você registra.</p>
<a class="btn largo" href="#/ajustes">Conectar nos ajustes</a></section>
</div>`;
  }

  if (rota.arg === 'nova' || rota.arg === 'editar') return montarForm(ctx, H);
  return montarLista(ctx, H);
}

async function montarLista({ api, rota }, H) {
  const semana = segundaDe(H);
  const opcional = (p, vazio) => (p ? p.catch(() => vazio) : Promise.resolve(vazio));
  const [metas, recompensas, pesos, sugestoes, compromissos, atividades] = await Promise.all([
    api.metas(),
    opcional(api.recompensasStatus && api.recompensasStatus(), []),
    opcional(api.pesoMedia && api.pesoMedia(addDias(H, -60), H), []),
    opcional(api.sugestoes && api.sugestoes(semana), []),
    opcional(api.compromissos && api.compromissos(semana), []),
    opcional(api.atividades && api.atividades(), []),
  ]);

  const ativas = metas.filter((m) => m.status === 'ativa');
  const porHz = Object.fromEntries(HORIZONTES.map((h) => [h.id, metas.filter((m) => m.horizonte === h.id)]));
  let hz = rota.q.get('h');
  if (!porHz[hz]) hz = HORIZONTES.find((h) => porHz[h.id].some((m) => m.status === 'ativa'))?.id || '3m';
  const doHz = porHz[hz].slice().sort((a, b) => (a.status === 'cumprida') - (b.status === 'cumprida') || a.prazo.localeCompare(b.prazo));
  const hzInfo = HORIZONTES.find((h) => h.id === hz);

  // ---- resumo
  const primeiro = ativas.slice().sort((a, b) => a.prazo.localeCompare(b.prazo))[0];
  const idsAtivas = new Set(ativas.map((m) => m.id));
  const libera = recompensas.filter((r) => r.meta_condicao_id && idsAtivas.has(r.meta_condicao_id));
  const grandes = libera.filter((r) => r.nivel === 'grande');
  const listaLib = grandes.length ? grandes : libera;
  const resumo = `<section class="metas-resumo" aria-labelledby="resumo-tit">
<div class="metas-resumo-topo">
<div class="metas-resumo-n"><span class="num">${ativas.length}</span><div><h2 id="resumo-tit">${ativas.length === 1 ? 'meta ativa' : 'metas ativas'}</h2><span class="nota">de 3 meses a 1 ano</span></div></div>
${primeiro ? `<div class="metas-resumo-prazo"><span class="nota">primeiro prazo</span><b class="num">${esc(dataMeta(primeiro.prazo, H))}</b><span class="nota">${semanasTxt(primeiro.dias_restantes)}</span></div>` : ''}
</div>
${listaLib.length ? `<div class="metas-resumo-lib"><span class="nota">${listaLib.length === 1 ? 'Libera 1 recompensa' : `Liberam ${listaLib.length} recompensas`}${grandes.length ? (listaLib.length === 1 ? ' grande' : ' grandes') : ''}</span>
<div class="metas-fichas">${listaLib.map((r) => `<span class="metas-ficha"><span class="ponto din"></span>${esc(r.nome)}</span>`).join('')}</div></div>` : ''}
</section>`;

  // ---- horizonte
  const seletor = `<div class="metas-hz-bloco">
<div class="metas-hz" role="group" aria-label="Horizonte das metas">${HORIZONTES.map((h) => {
    const n = porHz[h.id].filter((m) => m.status === 'ativa').length;
    return `<button type="button" data-hz="${h.id}" aria-pressed="${h.id === hz}">${h.rot}${n ? `<span>${n}</span>` : ''}</button>`;
  }).join('')}</div>
<span class="nota metas-hz-leg">${legendaHz(doHz, hzInfo, H)}</span>
</div>`;

  // ---- cards
  const ctxCard = { H, pesos, recompensas, compromissos, atividades, metasPorId: Object.fromEntries(metas.map((m) => [m.id, m])) };
  const cards = doHz.map((m) => cardMeta(m, ctxCard)).join('');
  const vazio = metas.length
    ? `<section class="card metas-vazio"><p class="nota" style="margin:0">Nenhuma meta de ${hzInfo.rot === '1 ano' ? '1 ano' : hzInfo.rot} ainda.</p></section>`
    : `<section class="card hab metas-vazio"><div class="card-cab"><h2>${ic.alvo(18)}Nenhuma meta ainda</h2></div>
<p class="nota" style="margin:0;color:var(--ink)">Uma meta de 3 meses é um bom começo: peso, treinos por semana, horas num projeto ou uma contagem (livros, por exemplo).</p></section>`;
  const novaRot = { '3m': 'Nova meta de 3 meses', '6m': 'Nova meta de 6 meses', '12m': 'Nova meta de 1 ano' }[hz];

  // ---- conselheiro: primeiro o que fala de meta
  const sugs = sugestoes.slice().sort((a, b) => (b.meta_id ? 1 : 0) - (a.meta_id ? 1 : 0));
  sugsAtuais = sugs;
  const conselho = `<section class="metas-conselho" aria-labelledby="cons-tit">
<div class="card-cab"><h2 id="cons-tit">${ic.brilho(16)}Conselheiro</h2><span class="lado">tendência, não promessa</span></div>
<div class="metas-conselho-lista">${cartoesConselheiro(sugs, { max: 2 })}</div>
</section>`;

  return `<div class="tela metas-tela">
<div class="topo"><div><span class="quando">${esc(dataLonga(H))}</span><h1>Metas</h1></div>
<a class="btn primario metas-nova-topo" href="#/metas/nova?h=${hz}">${ic.mais(16)}Nova meta</a></div>
${resumo}
${seletor}
<div class="metas-lista">${cards || vazio}
<a class="btn tracejado largo metas-nova" href="#/metas/nova?h=${hz}">${ic.mais(16)}${novaRot}</a></div>
${conselho}
</div>`;
}

let sugsAtuais = [];

function semanasTxt(dias) {
  const d = Number(dias);
  if (d < 0) return 'prazo passou';
  if (d === 0) return 'é hoje';
  if (d < 14) return d === 1 ? '1 dia' : `${d} dias`;
  return `${Math.round(d / 7)} semanas`;
}

function legendaHz(lista, hzInfo, H) {
  if (!lista.length) return `Prazo ${hzInfo.rot === '1 ano' ? 'de 1 ano' : `de ${hzInfo.rot}`}: ${esc(dataMeta(addMeses(H, hzInfo.meses), H))} para uma meta criada hoje`;
  const prazos = [...new Set(lista.map((m) => m.prazo))].sort();
  const n = lista.length;
  const p = prazos[0];
  const dias = diasEntre(H, p);
  return `${prazos.length > 1 ? 'Primeiro prazo em' : 'Prazo em'} ${esc(dataMeta(p, H))} · ${semanasTxt(dias)} · ${n === 1 ? '1 meta' : `${n} metas`}`;
}

// ------------------------------------------------------------ card de uma meta

function cardMeta(m, c) {
  const { H } = c;
  const T = TIPOS[m.tipo] || TIPOS.contagem;
  const cls = T.cls;
  const cumprida = m.status === 'cumprida';
  const prog = clamp01(m.progresso);
  const atual = numOuNulo(m.valor_atual);
  const alvo = Number(m.alvo);
  const hzRot = (HORIZONTES.find((h) => h.id === m.horizonte) || HORIZONTES[0]).rot;
  const ativ = m.atividade_id ? c.atividades.find((a) => a.id === m.atividade_id) : null;
  const fonte = m.tipo === 'minutos_semana' ? (ativ ? ativ.nome.toLowerCase() : 'tempo produtivo') : T.fonte;
  const idH = `meta-${esc(m.id)}`;

  // cabeçalho
  let html = `<article class="meta-card ${cls}${cumprida ? ' cumprida' : ''}" data-meta="${esc(m.id)}" aria-labelledby="${idH}">
<div class="meta-cab"><span class="meta-pilula">${hzRot} · até ${esc(dataMeta(m.prazo, H))}</span>
${cumprida ? `<span class="meta-pilula ok">${ic.check(14)}Cumprida</span>` : `<span class="meta-fonte">${T.icone(14)}${esc(fonte)}</span>`}</div>
<h3 id="${idH}">${esc(m.titulo)}</h3>`;

  // números grandes e progresso
  const unidade = m.unidade || T.un;
  let deTxt, paraTxt, unTxt = '', legenda;
  if (m.tipo === 'peso') {
    deTxt = atual === null ? '—' : n1(atual); paraTxt = n1(alvo); unTxt = 'kg';
    legenda = 'média de 7 dias hoje → onde quer chegar';
  } else if (m.tipo === 'treinos_semana') {
    deTxt = atual === null ? '—' : fT(atual); paraTxt = fT(alvo); unTxt = 'por semana';
    legenda = 'média das últimas 4 semanas, fora caminhada → onde quer chegar';
  } else if (m.tipo === 'minutos_semana') {
    deTxt = atual === null ? '—' : fMin(atual); paraTxt = fMin(alvo);
    legenda = 'média por semana nas últimas 4 → toda semana';
  } else {
    deTxt = atual === null ? '0' : fmt(atual, atual % 1 ? 1 : 0); paraTxt = fmt(alvo, alvo % 1 ? 1 : 0); unTxt = unidade;
    legenda = 'feito → onde quer chegar';
  }
  const numeros = `<div class="meta-num"><div class="meta-de-para"><span class="num">${deTxt}</span><span class="seta">→</span><span class="num alvo">${paraTxt}</span>${unTxt ? `<span class="un">${esc(unTxt)}</span>` : ''}</div>
<span class="meta-leg">${legenda}</span></div>`;

  if (m.tipo === 'peso') {
    html += numeros + blocoPesoBarra(m, c, prog);
  } else {
    const anelHtml = anel({ pct: prog, cor: `var(--${cls})`, trilho: `var(--${cls}-soft)`, tam: 68, esp: 7,
      centro: `<span class="medio num">${Math.round(prog * 100)}%</span>`, rotulo: `${Math.round(prog * 100)}% do alvo` });
    const contador = m.tipo === 'contagem' && !cumprida
      ? `<div class="meta-contador" role="group" aria-label="Ajustar contagem">
<button type="button" data-meta-acao="menos" aria-label="Diminuir 1"${!atual ? ' disabled' : ''}>${ic.menos(18)}</button>
<button type="button" data-meta-acao="mais" aria-label="Somar 1">${ic.mais(18)}</button></div>`
      : '';
    html += `<div class="meta-linha-num">${numeros}<div class="meta-lado">${anelHtml}${contador}</div></div>`;
  }

  // tempo decorrido do prazo
  html += linhaDoTempo(m, H, cls);

  // escada de treinos
  if (m.tipo === 'treinos_semana' && !cumprida) html += escada(m, H);

  // peso: gráfico e tendência
  if (m.tipo === 'peso') html += blocoPesoGrafico(m, c) + `<a class="btn largo meta-registrar" href="#/registrar?tipo=peso">${ic.peso(18)}Registrar peso</a>`;

  // esta semana (compromissos do plano ligados à meta)
  const comps = c.compromissos.filter((x) => x.meta_id === m.id);
  if (comps.length) {
    html += comps.map((x) => {
      const feito = Number(x.feito) || 0, alvoC = Number(x.alvo);
      const v = x.tipo === 'minutos_atividade' ? `${fMin(feito)}<span class="cor-sub"> de ${fMin(alvoC)}</span>` : `${fmt(feito)}<span class="cor-sub"> de ${fmt(alvoC)}</span>`;
      return `<div class="meta-semana"><div class="meta-semana-topo"><span>Esta semana · ${esc(x.titulo)}</span><b class="num">${v}</b></div>
${barra(Math.min(feito, alvoC), alvoC, { cor: `var(--${cls})`, alto: 8, rotulo: `${x.titulo}: ${feito} de ${alvoC}` })}</div>`;
    }).join('');
  }

  // fatos: mede, pede, prazo
  html += `<div class="meta-fatos">
<div><span>mede</span><b>${esc(medeTxt(m))}</b></div>
<div><span>pede</span><b>${esc(pedeTxt(m, atual, alvo))}</b></div>
<div><span>prazo</span><b>${esc(prazoTxt(m))}</b></div>
</div>`;

  // recompensas que ela libera
  html += blocoRecompensas(m, c);

  // ações
  html += `<div class="meta-acoes">
<a class="btn fantasma" href="#/metas/editar?id=${encodeURIComponent(m.id)}">Editar</a>
${cumprida
    ? '<button type="button" class="btn" data-meta-acao="reabrir">Reabrir</button>'
    : `<button type="button" class="btn${prog >= 1 ? ' primario' : ''}" data-meta-acao="cumprida">${ic.check(16)}Cumprida</button>`}
</div>
</article>`;
  return html;
}

function medeTxt(m) {
  if (m.tipo === 'peso') return 'média 7 dias';
  if (m.tipo === 'treinos_semana') return 'Garmin, 4 semanas';
  if (m.tipo === 'minutos_semana') return 'tempo registrado';
  return 'botões −1 e +1';
}

function pedeTxt(m, atual, alvo) {
  const dias = Number(m.dias_restantes);
  if (Number(m.progresso) >= 1) return 'alvo atingido';
  if (dias <= 0) return 'prazo encerrado';
  const semanas = dias / 7;
  if (m.tipo === 'peso') {
    if (atual === null) return 'sem pesagem';
    const falta = atual - alvo;
    if (falta > 0) return `~${fmt(Math.round((falta * KCAL_POR_KG) / dias / 10) * 10)} kcal/dia`;
    return `+${n1(Math.abs(falta) / semanas)} kg/sem`;
  }
  if (m.tipo === 'treinos_semana') {
    const a = atual || 0;
    return a >= alvo ? 'manter o ritmo' : `+${fT(alvo - a)} por semana`;
  }
  if (m.tipo === 'minutos_semana') return `≈ ${fMin(alvo / 7)} por dia`;
  const resto = alvo - (atual || 0);
  if (resto <= 0) return 'alvo atingido';
  const porSem = resto / semanas;
  if (porSem >= 1) return `≈ ${fT(porSem)} por semana`;
  return `1 a cada ${Math.max(1, Math.round(1 / porSem))} semanas`;
}

function prazoTxt(m) {
  const d = Number(m.dias_restantes);
  if (d < 0) return `venceu há ${Math.abs(d)} dias`;
  if (d === 0) return 'hoje';
  return d === 1 ? '1 dia' : `${d} dias`;
}

// faixa de semanas (até 26) ou de meses (1 ano) entre o início e o prazo
function linhaDoTempo(m, H, cls) {
  const inicio = m.inicio || H;
  const total = Math.max(1, diasEntre(inicio, m.prazo));
  const passados = Math.max(0, Math.min(total, diasEntre(inicio, H)));
  const porMes = total > 26 * 7;
  const n = porMes ? Math.max(1, Math.round(total / 30.4)) : Math.max(1, Math.round(total / 7));
  const atualIdx = Math.min(n - 1, Math.floor((passados / total) * n));
  const segs = Array.from({ length: n }, (_, i) => {
    const estado = i < atualIdx ? 'foi' : i === atualIdx ? 'agora' : 'vem';
    return `<span class="${estado}"></span>`;
  }).join('');
  const rot = porMes ? `mês ${atualIdx + 1} de ${n}` : `semana ${atualIdx + 1} de ${n}`;
  return `<div class="meta-tempo"><div class="meta-segs ${cls}${n > 20 ? ' finos' : ''}" role="img" aria-label="${rot}">${segs}</div>
<div class="meta-tempo-rot"><span>${rot}</span><span>${esc(dataMeta(m.prazo, H))}</span></div></div>`;
}

// degraus de hoje até o alvo, espalhados até o prazo
function escada(m, H) {
  const atual = Number(m.valor_atual) || 0;
  const alvo = Number(m.alvo);
  const dias = Number(m.dias_restantes);
  if (!(alvo > atual) || dias <= 0) return '';
  // degraus inteiros acima de hoje até o alvo; no máximo três
  const inteiros = [];
  for (let v = Math.floor(atual) + 1; v < alvo; v++) inteiros.push(v);
  inteiros.push(alvo);
  const vals = inteiros.length > 3 ? [0, 1, 2].map((i) => inteiros[Math.round((i * (inteiros.length - 1)) / 2)]) : inteiros;
  const passos = vals.length;
  const degraus = [{ val: fT(atual), rot: 'hoje', nota: 'média', v: atual, tipo: 'hoje' }];
  for (let i = 1; i <= passos; i++) {
    const v = vals[i - 1];
    const data = addDias(H, Math.round((dias * i) / passos));
    degraus.push({ val: `${fT(v)}×`, rot: `até ${mesCurto(data)}`, nota: i === 1 ? 'degrau atual' : i === passos ? 'alvo' : '', v, tipo: i === 1 ? 'atual' : 'vem' });
  }
  const cols = degraus.map((d) => {
    const h = Math.max(10, Math.round((d.v / alvo) * 64));
    return `<div class="degrau ${d.tipo}"><span class="num">${d.val}</span><div style="height:${h}px"></div><span class="r">${d.rot}</span><span class="n">${d.nota || '&nbsp;'}</span></div>`;
  }).join('');
  return `<div class="meta-escada"><span class="meta-sub">A escada</span><div class="degraus">${cols}</div></div>`;
}

// peso: barra do início ao alvo, com o traço da balança de hoje
function blocoPesoBarra(m, c, prog) {
  const { H, pesos } = c;
  const ini = numOuNulo(m.valor_inicial);
  const alvo = Number(m.alvo);
  const hoje = pesos.find((p) => p.data === H && p.kg !== null && p.kg !== undefined);
  const total = ini === null ? 0 : Math.abs(ini - alvo);
  let traco = '';
  if (hoje && ini !== null && ini !== alvo) {
    const p = clamp01((ini - Number(hoje.kg)) / (ini - alvo));
    traco = `<div class="meta-traco" style="left:${pct(p)}" title="Balança hoje"></div>`;
  }
  const feito = prog * total;
  return `<div class="meta-peso-barra">
<div class="meta-trilho"><div class="meta-enche" style="width:${pct(prog)}"></div>${traco}</div>
<div class="meta-tempo-rot"><span>${ini === null ? '—' : n1(ini)} início</span><span>${n1(alvo)} alvo</span></div>
<span class="meta-leg-forte"><b>${n1(feito)} de ${n1(total)} kg</b> pela média${hoje ? ` · o traço é a balança de hoje, ${n1(hoje.kg)} kg` : ''}</span>
</div>`;
}

function blocoPesoGrafico(m, c) {
  const { H, pesos } = c;
  const porData = Object.fromEntries(pesos.map((p) => [p.data, p]));
  const serie = Array.from({ length: 61 }, (_, i) => {
    const p = porData[addDias(H, i - 60)];
    return p && p.media7 !== null && p.media7 !== undefined ? Number(p.media7) : null;
  });
  const validos = serie.map((v, i) => ({ v, i })).filter((x) => x.v !== null);
  if (validos.length < 2) {
    return `<div class="meta-dica">${ic.peso(16)}<span>Ainda há poucas pesagens para mostrar a tendência. Registre o peso de manhã, em jejum, alguns dias por semana.</span></div>`;
  }
  const graf = linha(serie, { cor: 'var(--cal)', alto: 64, larg: 320 });
  const ult = validos[validos.length - 1];
  const ref = validos.filter((x) => x.i <= ult.i - 28).pop() || validos[0];
  const semanas = (ult.i - ref.i) / 7;
  const alvo = Number(m.alvo);
  let texto;
  if (semanas < 1) {
    texto = `Média de 7 dias em ${n1(ult.v)} kg. A tendência aparece com mais algumas semanas de pesagem.`;
  } else {
    const ritmo = (ult.v - ref.v) / semanas;
    const desde = dataCurta(addDias(H, ref.i - 60));
    if (Math.abs(ritmo) < 0.05) {
      texto = `Desde ${desde} a média ficou estável perto de ${n1(ult.v)} kg.`;
    } else {
      const sinal = ritmo < 0 ? MENOS : '+';
      texto = `Desde ${desde} a média foi de ${n1(ref.v)} para ${n1(ult.v)} (${sinal}${n1(Math.abs(ritmo))} kg por semana).`;
      const falta = alvo - ult.v;
      if (Math.abs(falta) < 0.05) texto += ' A média já está no alvo.';
      else if (Math.sign(falta) === Math.sign(ritmo)) {
        const data = addDias(H, Math.round((Math.abs(falta) / Math.abs(ritmo)) * 7));
        texto += ` Nesse ritmo, ${n1(alvo)} fica perto de ${dataMeta(data, H)}${data > m.prazo ? ', depois do prazo' : ''}.`;
      } else texto += ' Nesse ritmo, a média se afasta do alvo.';
    }
  }
  return `<div class="meta-grafico">
<div class="meta-grafico-cab"><span class="meta-sub">Média de 7 dias</span><span class="nota">últimos 60 dias</span></div>
<div class="meta-grafico-svg">${graf}</div>
<div class="meta-tempo-rot"><span>${dataCurta(addDias(H, validos[0].i - 60))} · ${n1(validos[0].v)}</span><span>hoje · ${n1(ult.v)}</span></div>
</div>
<div class="meta-dica">${ic.troca(16)}<span>${esc(texto)}</span></div>`;
}

function blocoRecompensas(m, c) {
  const lista = c.recompensas.filter((r) => r.meta_condicao_id === m.id);
  if (!lista.length) return '<span class="meta-leg">Ainda não libera recompensa grande. Dá para ligar uma recompensa a esta meta na tela da recompensa.</span>';
  return lista.map((r) => {
    let cofre = '';
    if (r.tipo === 'cofrinho' && Number(r.cofrinho_alvo) > 0) {
      const g = Number(r.guardado) || 0, a = Number(r.cofrinho_alvo);
      cofre = `<div class="meta-cofre"><div class="meta-semana-topo"><span>Cofrinho</span><span><b class="num">${fReaisCurto(g)}</b><span class="cor-sub"> de ${fReaisCurto(a)}</span></span></div>
${barra(Math.min(g, a), a, { cor: 'var(--din)', alto: 6, rotulo: `Cofrinho: ${fReaisCurto(g)} de ${fReaisCurto(a)}` })}</div>`;
    }
    const ok = r.condicao_ok;
    return `<div class="meta-libera">
<div class="meta-libera-tit">${ic.estrela(16)}Libera: ${esc(r.nome)}</div>
${cofre}
<div class="meta-libera-cond"><span>${esc(m.titulo)} até ${esc(dataMeta(m.prazo, c.H))}</span><span class="${ok ? 'cor-ok' : 'cor-sub'}">${ok ? 'cumprida' : 'em andamento'}</span></div>
${cofre ? `<span class="nota">${ok ? 'Meta cumprida: falta só completar o cofrinho.' : 'As duas condições juntas liberam a recompensa.'}</span>` : ''}
</div>`;
  }).join('');
}

const fReaisCurto = (v) => 'R$ ' + fmt(Math.round(Number(v) || 0));

// ------------------------------------------------------------ formulário

let formCtx = null;

async function montarForm({ api, rota }, H) {
  const editar = rota.arg === 'editar';
  const opcional = (p, vazio) => (p ? p.catch(() => vazio) : Promise.resolve(vazio));
  const [metas, atividades, pesos] = await Promise.all([
    editar ? api.metas() : Promise.resolve([]),
    opcional(api.atividades && api.atividades(), []),
    opcional(api.pesoMedia && api.pesoMedia(addDias(H, -14), H), []),
  ]);
  const media = pesos.filter((p) => p.media7 !== null && p.media7 !== undefined).pop();
  const mediaAtual = media ? Number(media.media7) : null;

  let m;
  if (editar) {
    m = metas.find((x) => x.id === rota.q.get('id'));
    if (!m) {
      return `<div class="tela metas-form">
<div class="topo"><div><span class="quando">${esc(dataLonga(H))}</span><h1>Editar meta</h1></div><a class="btn-icone" href="#/metas" aria-label="Voltar para metas">${ic.x(18)}</a></div>
<div class="aviso neutro">${ic.alvo(16)}<span>Meta não encontrada. Pode ter sido abandonada.</span></div>
<a class="btn largo" href="#/metas">Voltar para metas</a></div>`;
    }
  } else {
    const hz = HORIZONTES.some((h) => h.id === rota.q.get('h')) ? rota.q.get('h') : '3m';
    m = { titulo: '', horizonte: hz, tipo: 'peso', atividade_id: null, valor_inicial: mediaAtual, alvo: '', unidade: 'kg',
      inicio: H, prazo: addMeses(H, HORIZONTES.find((h) => h.id === hz).meses) };
  }
  const produtivas = atividades.filter((a) => a.tipo === 'produtivo');
  formCtx = { H, editar, meta: m, mediaAtual, prazoEditado: false };

  const num = (v, casas = 1) => (v === null || v === undefined || v === '' ? '' : fmt(Number(v), Number(v) % 1 ? casas : 0).replace(/\./g, ''));
  const radios = (nome, lista, atual) => `<div class="opcoes">${lista.map((o) =>
    `<label class="opcao"><input class="sr" type="radio" name="${nome}" value="${o.id}"${o.id === atual ? ' checked' : ''}>${o.rot}</label>`).join('')}</div>`;

  const tipos = Object.entries(TIPOS).map(([id, t]) => ({ id, rot: `<span class="ponto ${t.cls}"></span>${t.nome}` }));
  const voltar = `#/metas?h=${m.horizonte}`;

  return `<div class="tela metas-form">
<div class="topo"><div><span class="quando">${esc(dataLonga(H))}</span><h1>${editar ? 'Editar meta' : 'Nova meta'}</h1></div>
<a class="btn-icone" href="${voltar}" aria-label="Fechar e voltar para metas">${ic.x(18)}</a></div>
<form id="form-meta" class="tela" novalidate>
<label class="campo">Título<input name="titulo" type="text" required maxlength="80" value="${esc(m.titulo)}" placeholder="Emagrecer 3 kg" autocomplete="off"></label>

<fieldset class="metas-fs"><legend class="grupo-rot">Horizonte</legend>${radios('horizonte', HORIZONTES, m.horizonte)}</fieldset>
<label class="campo">Prazo<input name="prazo" type="date" value="${esc(m.prazo)}" min="${H}" required>
<span class="nota" id="prazo-nota">${prazoNota(m.inicio, m.prazo, H)}</span></label>

<fieldset class="metas-fs"><legend class="grupo-rot">O que mede</legend>${radios('tipo', tipos, m.tipo)}</fieldset>
<p class="nota metas-tipo-nota" id="tipo-nota">${notaTipo(m.tipo)}</p>

<label class="campo" data-so="minutos_semana"${m.tipo === 'minutos_semana' ? '' : ' hidden'}>Atividade
<select name="atividade_id"><option value="">Todo o tempo produtivo</option>
${produtivas.map((a) => `<option value="${esc(a.id)}"${a.id === m.atividade_id ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>

<div class="metas-par">
<div class="stepper ${TIPOS[m.tipo].cls}" data-stepper="valor_inicial">
<label class="rot-s" style="flex:1"><span id="rot-inicial">${rotInicial(m.tipo)}</span>
<input class="valor-s num" name="valor_inicial" type="text" inputmode="decimal" value="${num(m.tipo === 'contagem' && editar ? m.contagem_atual ?? m.valor_inicial : m.valor_inicial)}" placeholder="—"${editar && m.tipo === 'contagem' ? ' readonly' : ''}></label>
<div class="botoes"><button type="button" data-passo="valor_inicial" data-delta="-1" aria-label="Diminuir">${ic.menos(20)}</button><button type="button" data-passo="valor_inicial" data-delta="1" aria-label="Aumentar">${ic.mais(20)}</button></div></div>
<div class="stepper ${TIPOS[m.tipo].cls}" data-stepper="alvo">
<label class="rot-s" style="flex:1"><span id="rot-alvo">${rotAlvo(m.tipo)}</span>
<input class="valor-s num" name="alvo" type="text" inputmode="decimal" value="${num(m.alvo)}" required placeholder="—"></label>
<div class="botoes"><button type="button" data-passo="alvo" data-delta="-1" aria-label="Diminuir">${ic.menos(20)}</button><button type="button" data-passo="alvo" data-delta="1" aria-label="Aumentar">${ic.mais(20)}</button></div></div>
</div>
<p class="nota" id="inicial-nota">${notaInicial(m.tipo, mediaAtual, editar)}</p>

<label class="campo">Unidade<input name="unidade" type="text" maxlength="20" value="${esc(m.unidade || '')}" placeholder="livros" autocomplete="off"></label>

<div id="erro-meta" role="alert"></div>
<button type="submit" class="btn primario largo">${editar ? 'Salvar alterações' : 'Criar meta'}</button>
${editar ? `<div class="metas-form-acoes">
${m.status === 'cumprida'
    ? '<button type="button" class="btn largo" data-status="ativa">Reabrir meta</button>'
    : `<button type="button" class="btn largo" data-status="cumprida">${ic.check(16)}Marcar como cumprida</button>`}
<button type="button" class="btn fantasma largo cor-no" data-status="abandonada">Abandonar meta</button>
</div>` : ''}
</form>
</div>`;
}

function prazoNota(inicio, prazo, H) {
  if (!prazo) return '';
  const d = diasEntre(H, prazo);
  return `${dataLonga(prazo)}${prazo.slice(0, 4) !== H.slice(0, 4) ? ` de ${prazo.slice(0, 4)}` : ''} · ${semanasTxt(d)} a partir de hoje`;
}
function notaTipo(tipo) {
  return {
    peso: 'Mede pela média de 7 dias da balança (a pesagem manual vale sobre a do Garmin).',
    treinos_semana: 'Mede pela média de treinos das últimas 4 semanas no Garmin, fora caminhada e treinos com menos de 20 min.',
    minutos_semana: 'Mede pela média semanal do tempo registrado nas últimas 4 semanas.',
    contagem: 'Você conta com os botões −1 e +1 no card da meta.',
  }[tipo];
}
function rotInicial(tipo) {
  return { peso: 'Peso hoje (kg)', treinos_semana: 'Treinos por semana hoje', minutos_semana: 'Minutos por semana hoje', contagem: 'Já feito' }[tipo];
}
function rotAlvo(tipo) {
  return { peso: 'Peso alvo (kg)', treinos_semana: 'Treinos por semana', minutos_semana: 'Minutos por semana', contagem: 'Quantos no total' }[tipo];
}
function notaInicial(tipo, media, editar) {
  if (tipo === 'peso') return media !== null ? `Preenchido com a média de 7 dias de hoje: ${n1(media)} kg. O progresso conta a partir daqui.` : 'Sem pesagem recente: informe o peso de hoje. O progresso conta a partir dele.';
  if (tipo === 'contagem') return editar ? 'A contagem anda pelos botões do card.' : 'Se já começou, a contagem parte daqui.';
  return 'Opcional: só para lembrar de onde partiu. O progresso vem dos dados.';
}

const PADRAO_UN = { peso: 'kg', treinos_semana: 'treinos', minutos_semana: 'min', contagem: '' };

function ligarForm(raiz, { api, ir, toast }) {
  const form = raiz.querySelector('#form-meta');
  if (!form) return;
  const { H, editar, meta, mediaAtual } = formCtx;
  const erro = raiz.querySelector('#erro-meta');
  const falha = (msg) => { erro.innerHTML = `<div class="aviso">${ic.x(16)}<span>${esc(msg)}</span></div>`; };
  let tipoAnterior = meta.tipo;

  const aplicarTipo = (tipo) => {
    const cls = TIPOS[tipo].cls;
    form.querySelectorAll('.stepper').forEach((s) => { s.className = `stepper ${cls}`; });
    raiz.querySelector('#rot-inicial').textContent = rotInicial(tipo);
    raiz.querySelector('#rot-alvo').textContent = rotAlvo(tipo);
    raiz.querySelector('#tipo-nota').textContent = notaTipo(tipo);
    raiz.querySelector('#inicial-nota').textContent = notaInicial(tipo, mediaAtual, editar);
    form.querySelectorAll('[data-so]').forEach((el) => { el.hidden = el.dataset.so !== tipo; });
    // unidade padrão acompanha o tipo, a não ser que tenha sido escrita à mão
    if (!form.unidade.value.trim() || form.unidade.value.trim() === PADRAO_UN[tipoAnterior]) form.unidade.value = PADRAO_UN[tipo];
    // peso parte da média de 7 dias
    const vi = form.valor_inicial;
    vi.readOnly = editar && tipo === 'contagem' && meta.tipo === 'contagem';
    if (!vi.readOnly) {
      if (tipo === 'peso' && !vi.value.trim() && mediaAtual !== null) vi.value = fmt(mediaAtual, 1).replace(/\./g, '');
      else if (tipoAnterior === 'peso' && tipo !== 'peso' && mediaAtual !== null && lerNumero(vi.value) === Math.round(mediaAtual * 10) / 10) vi.value = '';
    }
    tipoAnterior = tipo;
  };

  form.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.name === 'horizonte' && !formCtx.prazoEditado) {
      const h = HORIZONTES.find((x) => x.id === t.value);
      form.prazo.value = addMeses(editar ? (meta.inicio || H) : H, h.meses);
    }
    if (t.name === 'prazo') formCtx.prazoEditado = true;
    if (t.name === 'horizonte' || t.name === 'prazo') raiz.querySelector('#prazo-nota').textContent = prazoNota(meta.inicio, form.prazo.value, H);
    if (t.name === 'tipo') aplicarTipo(t.value);
  });

  form.addEventListener('click', (ev) => {
    const p = ev.target.closest('[data-passo]');
    if (!p) return;
    const campo = form[p.dataset.passo];
    if (campo.readOnly) return;
    const tipo = (form.querySelector('input[name="tipo"]:checked') || {}).value;
    const passo = tipo === 'peso' ? 0.1 : tipo === 'minutos_semana' ? 15 : 1;
    const base = lerNumero(campo.value);
    const atual = Number.isFinite(base) ? base : (p.dataset.passo === 'alvo' && tipo === 'peso' && mediaAtual !== null ? mediaAtual : 0);
    const novo = Math.max(0, Math.round((atual + passo * Number(p.dataset.delta)) * 10) / 10);
    campo.value = tipo === 'peso' ? fmt(novo, 1).replace(/\./g, '') : String(Math.round(novo));
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.innerHTML = '';
    const titulo = form.titulo.value.trim();
    const horizonte = (form.querySelector('input[name="horizonte"]:checked') || {}).value;
    const tipo = (form.querySelector('input[name="tipo"]:checked') || {}).value;
    const prazo = form.prazo.value;
    const alvo = lerNumero(form.alvo.value);
    const viTxt = form.valor_inicial.value.trim();
    const vi = viTxt ? lerNumero(viTxt) : null;
    if (!titulo) return falha('Dê um título para a meta.');
    if (!horizonte) return falha('Escolha o horizonte.');
    if (!tipo) return falha('Escolha o que a meta mede.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return falha('Informe o prazo.');
    if (!editar && prazo <= H) return falha('O prazo precisa ser depois de hoje.');
    if (!Number.isFinite(alvo) || alvo <= 0) return falha('Informe o alvo em número.');
    if (vi !== null && (!Number.isFinite(vi) || vi < 0)) return falha('O valor inicial precisa ser um número.');
    if (tipo === 'peso') {
      if (alvo < 30 || alvo > 300) return falha('O peso alvo precisa estar entre 30 e 300 kg.');
      if (vi === null) return falha('Informe o peso de hoje: o progresso conta a partir dele.');
      if (vi < 30 || vi > 300) return falha('O peso de hoje precisa estar entre 30 e 300 kg.');
      if (Math.abs(vi - alvo) < 0.05) return falha('O alvo é igual ao peso de hoje.');
    }
    const linhaMeta = {
      titulo, horizonte, tipo, prazo,
      atividade_id: tipo === 'minutos_semana' ? (form.atividade_id.value || null) : null,
      alvo: tipo === 'peso' ? Math.round(alvo * 10) / 10 : alvo,
      unidade: form.unidade.value.trim() || null,
    };
    if (!(editar && tipo === 'contagem' && meta.tipo === 'contagem')) linhaMeta.valor_inicial = vi;
    if (editar) linhaMeta.id = meta.id;
    else if (tipo === 'contagem') linhaMeta.contagem_atual = vi || 0;
    if (editar && tipo === 'contagem' && meta.tipo !== 'contagem') linhaMeta.contagem_atual = vi || 0;

    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await api.salvarMeta(linhaMeta);
      toast(editar ? 'Meta atualizada' : 'Meta criada');
      ir(`#/metas?h=${horizonte}`);
    } catch (e) {
      falha(e.message || String(e));
      btn.disabled = false;
    }
  });

  form.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
    const status = b.dataset.status;
    if (status === 'abandonada' && !window.confirm('Abandonar esta meta? Ela sai da lista e as recompensas ligadas a ela deixam de depender dela.')) return;
    b.disabled = true;
    try {
      await api.salvarMeta({ id: meta.id, status });
      toast({ cumprida: 'Meta cumprida', abandonada: 'Meta abandonada', ativa: 'Meta reaberta' }[status]);
      ir(`#/metas?h=${meta.horizonte}`);
    } catch (e) {
      falha(e.message || String(e));
      b.disabled = false;
    }
  }));
}

// ------------------------------------------------------------ ligar

export function ligar(raiz, ctx) {
  const { api, rota, ir, toast, recarregar } = ctx;
  if (api.modo === 'demo' || typeof api.metas !== 'function') return;
  if (rota.arg === 'nova' || rota.arg === 'editar') { ligarForm(raiz, ctx); return; }

  raiz.querySelectorAll('[data-hz]').forEach((b) => b.addEventListener('click', () => ir(`#/metas?h=${b.dataset.hz}`)));

  raiz.querySelectorAll('[data-meta-acao]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('[data-meta]').dataset.meta;
    const acao = b.dataset.metaAcao;
    b.disabled = true;
    try {
      if (acao === 'mais' || acao === 'menos') {
        await api.somarContagem(id, acao === 'mais' ? 1 : -1);
      } else if (acao === 'cumprida') {
        await api.salvarMeta({ id, status: 'cumprida' });
        toast('Meta cumprida');
      } else if (acao === 'reabrir') {
        await api.salvarMeta({ id, status: 'ativa' });
        toast('Meta reaberta');
      }
      recarregar();
    } catch (e) {
      toast(e.message || String(e), 'erro');
      b.disabled = false;
    }
  }));

  ligarConselheiro(raiz.querySelector('.metas-conselho') || raiz, ctx, sugsAtuais);
}
