// Liberar: catálogo de recompensas em níveis (pequenas, médias, grandes), plano da semana com estrela e cofrinhos.
// O custo mostrado já leva o multiplicador da semana (a 2ª vez sai × 1,5); o saldo usado é o livre (banco − reservas).
// #/liberar/<id> confirma a troca com stepper de kcal e R$ e chama trocar() — o servidor decide o saldo e aplica o × 1,5.

import { hojeBR, addDias, dataLonga, diaSemana, esc, ic, fmt, fReais, fFator, pct, clamp01, lerNumero, MOEDAS } from '../ui.js';
import { avaliar, chipsCusto, motivoBloqueio, comUnidade, formatar, ORDEM } from './comum.js';

const MAX_SEMANA = 4;
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const CUSTO = { kcal: 'custo_kcal', reais: 'custo_reais', min: 'custo_min' };
const CREDITO = { kcal: 'credito_kcal', reais: 'credito_reais', min: 'credito_min' };

let confirmacao = null; // dados da tela de confirmação, usados em ligar()
let catalogo = null;    // dados do catálogo, usados em ligar()
let parabens = null;    // nome do cofrinho recém-usado, mostrado uma vez

// ------------------------------------------------------------ datas e números

export function segundaDe(iso) {
  const dow = new Date(iso + 'T12:00:00Z').getUTCDay(); // 0 = domingo
  return addDias(iso, -((dow + 6) % 7));
}

function periodoSemana(seg) {
  const dom = addDias(seg, 6);
  const d1 = Number(seg.slice(8, 10)), d2 = Number(dom.slice(8, 10));
  const m1 = MESES_CURTOS[Number(seg.slice(5, 7)) - 1], m2 = MESES_CURTOS[Number(dom.slice(5, 7)) - 1];
  return m1 === m2 ? `${d1} a ${d2} ${m2}` : `${d1} ${m1} a ${d2} ${m2}`;
}

const pctInt = (x) => Math.round(clamp01(x) * 100);

// Crédito médio por dia em cada moeda, pelos dias com número (últimas semanas).
function ritmoDiario(creditos) {
  const r = {};
  for (const m of ORDEM) {
    const vals = (creditos || []).map((c) => c[CREDITO[m]]).filter((v) => v !== null && v !== undefined).map(Number);
    r[m] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return r;
}

// Custo que vale hoje: o do cadastro × multiplicador da semana.
function custoEfetivo(r) {
  if (r.tipo === 'cofrinho') return { custo_kcal: 0, custo_reais: 0, custo_min: 0 };
  const mult = Number(r.multiplicador) || 1;
  return {
    custo_kcal: Math.round(Number(r.custo_kcal || 0) * mult),
    custo_reais: Math.round(Number(r.custo_reais || 0) * mult * 100) / 100,
    custo_min: Math.round(Number(r.custo_min || 0) * mult),
  };
}

// Saldo livre para trocas: banco menos as reservas da semana. Sem a view nova (modo demonstração), o banco puro.
async function lerSaldo(api) {
  if (typeof api.bancoDisponivel === 'function') {
    const b = await api.bancoDisponivel();
    return {
      kcal: Number(b.kcal_livre ?? b.kcal), reais: Number(b.reais_livre ?? b.reais), min: Number(b.min),
      kcalRes: Number(b.kcal_reservado) || 0, reaisRes: Number(b.reais_reservado) || 0,
    };
  }
  const b = await api.banco();
  return { kcal: Number(b.kcal), reais: Number(b.reais), min: Number(b.min), kcalRes: 0, reaisRes: 0 };
}

async function lerRecompensas(api) {
  if (typeof api.recompensasStatus === 'function') return api.recompensasStatus();
  // modo demonstração: sem nível, multiplicador nem cofrinho no armazenamento local
  const lista = await api.recompensas();
  return lista.map((r) => ({
    ...r,
    nivel: r.nivel || 'media',
    tipo: r.tipo || (r.libera_app ? 'tempo_app' : 'compra'),
    multiplicador: 1, vezes_semana: 0, condicao_ok: true,
  }));
}

function estrela(on, w = 22) {
  return `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`;
}

function barraProgresso(p, { cls, rotulo, alto = 8 }) {
  const n = pctInt(p);
  return `<div class="lb-barra lb-${cls}" style="height:${alto}px" role="progressbar" aria-label="${esc(rotulo)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${n}"><div style="width:${pct(p)}"></div></div>`;
}

// ------------------------------------------------------------ catálogo

export async function montar(ctx) {
  const { api, rota } = ctx;
  if (rota.arg) {
    const [saldo, recompensas] = await Promise.all([lerSaldo(api), lerRecompensas(api)]);
    catalogo = null;
    return montarConfirmar(saldo, recompensas, rota.arg);
  }
  confirmacao = null;

  const H = hojeBR();
  const SEG = segundaDe(H);
  const completo = typeof api.recompensasStatus === 'function' && typeof api.semanaRecompensas === 'function';

  const [saldo, recompensas, marcadas, metas, trocas, creditos] = await Promise.all([
    lerSaldo(api),
    lerRecompensas(api),
    completo ? api.semanaRecompensas(SEG) : Promise.resolve([]),
    typeof api.metas === 'function' ? api.metas().catch(() => []) : Promise.resolve([]),
    api.trocas(H),
    api.creditos(addDias(H, -28), addDias(H, -1)).catch(() => []),
  ]);
  const ritmo = ritmoDiario(creditos);
  const metaPorId = Object.fromEntries((metas || []).map((m) => [String(m.id), m]));
  const naSemana = new Set((marcadas || []).map(String));
  const diasRestantes = 6 - ((new Date(H + 'T12:00:00Z').getUTCDay() + 6) % 7); // até domingo

  // avaliação de cada recompensa contra o saldo livre
  const itens = recompensas.map((r) => {
    const efetivo = custoEfetivo(r);
    const a = avaliar(efetivo, saldo);
    return { r, a, efetivo, mult: Number(r.multiplicador) || 1, on: naSemana.has(String(r.id)) };
  });
  const porId = Object.fromEntries(itens.map((i) => [String(i.r.id), i]));

  // ---- progresso de uma recompensa (estrela): quanto do custo o saldo livre já cobre
  const progresso = (i) => {
    const { r, a } = i;
    if (r.tipo === 'cofrinho') {
      const alvo = Number(r.cofrinho_alvo) || 0;
      const guardado = Number(r.guardado) || 0;
      return { p: alvo > 0 ? guardado / alvo : 0, tom: 'din', det: `${fReais(guardado)} de ${fReais(alvo)}` };
    }
    if (!a.custos.length) return { p: 1, tom: 'hab', det: 'sem custo' };
    const partes = a.custos.map((c) => {
      const tem = Math.max(0, Math.min(saldo[c.moeda], c.valor));
      return { moeda: c.moeda, p: tem / c.valor, txt: c.moeda === 'reais' ? `${fReais(tem)} de ${fReais(c.valor)}` : `${fmt(tem)} de ${comUnidade(c.moeda, c.valor)}` };
    });
    const pior = partes.reduce((x, y) => (y.p < x.p ? y : x));
    return { p: pior.p, tom: MOEDAS[pior.moeda].cls, det: partes.map((x) => x.txt).join(' · ') };
  };

  // ---- quando dá para trocar, no ritmo das últimas 4 semanas
  const previsao = (i) => {
    const { r, a } = i;
    if (r.tipo === 'cofrinho') return previsaoCofrinho(r);
    if (!a.bloq) return { txt: 'Já cabe no saldo livre', pode: true };
    let dias = 0;
    for (const f of a.faltas) {
      const v = ritmo[f.moeda];
      if (!v || v <= 0) return { txt: `No ritmo atual, ${MOEDAS[f.moeda].nome.toLowerCase()} não sobe · faltam ${comUnidade(f.moeda, f.falta)}`, pode: false };
      dias = Math.max(dias, Math.ceil(f.falta / v));
    }
    if (dias <= diasRestantes) return { txt: `Você junta até ${dias === 0 ? 'hoje' : diaSemana(addDias(H, dias))}`, pode: false };
    return { txt: `Faltam ${a.faltas.map((f) => comUnidade(f.moeda, f.falta)).join(' + ')} · no seu ritmo, ~${dias} dias`, pode: false };
  };

  const previsaoCofrinho = (r) => {
    const alvo = Number(r.cofrinho_alvo) || 0;
    const guardado = Number(r.guardado) || 0;
    const porSemana = Number(r.guardar_semana) || 0;
    if (alvo > 0 && guardado >= alvo) return { txt: r.condicao_ok ? 'Cofrinho cheio e meta cumprida' : 'Cofrinho cheio · falta a meta', pode: false };
    const resto = Math.max(0, alvo - guardado);
    const semanas = porSemana > 0 ? Math.ceil(resto / porSemana) : null;
    const jaGuardou = Number(r.vezes_semana) > 0;
    if (!porSemana) return { txt: 'Defina quanto guardar por semana', pode: false };
    if (jaGuardou) return { txt: `Guardado nesta semana · faltam ~${semanas} semanas`, pode: false };
    return { txt: `Guarde ${fReais(porSemana)} nesta semana · faltam ~${semanas} semanas`, pode: false };
  };

  catalogo = { saldo, itens, porId, SEG, completo, marcadas: [...naSemana].filter((id) => porId[id]) };

  // ---- banco livre
  const blocos = ORDEM.map((m) => {
    const v = saldo[m];
    const neg = v < 0;
    const res = m === 'kcal' ? saldo.kcalRes : m === 'reais' ? saldo.reaisRes : 0;
    const txt = formatar(m, m === 'reais' ? Math.round(v) : v, { sinal: true });
    const tam = txt.length > 8 ? 17 : txt.length > 6 ? 20 : 24;
    return `<div class="moeda ${MOEDAS[m].cls}${neg ? ' neg' : ''}">
<span class="rot"><span class="ponto ${MOEDAS[m].cls}"></span>${MOEDAS[m].nome}</span>
<span class="valor num cor-${neg ? 'no' : MOEDAS[m].cls}" style="font-size:${tam}px" aria-label="${MOEDAS[m].nome} livre: ${esc(formatar(m, v, { sinal: true }))}">${txt}${neg ? ic.cadeado(15) : ''}</span>
<span class="un">${neg ? 'negativo · bloqueia' : 'livre'}</span>
${res > 0 ? `<span class="lb-reserva">${comUnidade(m, res)} reservado</span>` : ''}
</div>`;
  }).join('');
  const temReserva = saldo.kcalRes > 0 || saldo.reaisRes > 0;

  // ---- esta semana
  const doSemana = catalogo.marcadas.map((id) => porId[id]);
  const cartaoSemana = (i) => {
    const pr = progresso(i);
    const pv = previsao(i);
    const n = pctInt(pr.p);
    return `<div class="lb-sem ${pr.tom}">
<div class="lb-sem-topo">
<div class="lb-sem-txt"><span class="lb-sem-nome"><span class="cor-hab">${estrela(true, 13)}</span>${esc(i.r.nome)}</span><span class="lb-sem-det">${esc(pr.det)}</span></div>
<span class="lb-sem-pct num">${n}%</span>
</div>
${barraProgresso(pr.p, { cls: pr.tom, rotulo: `${i.r.nome}: ${n}% juntado` })}
<div class="lb-sem-rodape"><span>${esc(pv.txt)}</span>${pv.pode && i.r.tipo !== 'cofrinho' ? `<a class="lb-link" href="#/liberar/${encodeURIComponent(i.r.id)}">Trocar</a>` : ''}</div>
</div>`;
  };
  let avisoSemana = '';
  if (doSemana.length === 1) avisoSemana = '<div class="lb-aviso-hab" role="status">Escolha ao menos 2 recompensas para a semana.</div>';
  const secaoSemana = completo ? `<section class="lb-semana" aria-labelledby="sem-tit">
<div class="lb-semana-cab">
<div><h2 id="sem-tit"><span class="cor-hab">${estrela(true, 16)}</span>Esta semana</h2><span class="nota">${periodoSemana(SEG)} · ${doSemana.length} de ${MAX_SEMANA} escolhidas</span></div>
<a class="lb-link-sub" href="#/semana">Plano da semana${ic.seta(16)}</a>
</div>
<div id="lb-aviso-semana">${avisoSemana}</div>
${doSemana.length ? `<div class="lb-sem-grade">${doSemana.map(cartaoSemana).join('')}</div>` : '<p class="nota lb-sem-vazio">Marque com a estrela de 2 a 4 recompensas para juntar nesta semana.</p>'}
</section>` : '';

  // ---- linha de uma recompensa comum
  const linha = (i) => {
    const { r, a, mult, on } = i;
    const negativa = a.faltas.find((f) => f.negativo);
    let est;
    if (on) est = { txt: `na semana · ${pctInt(progresso(i).p)}%`, cls: 'cor-hab' };
    else if (negativa) est = { txt: `bloqueada · ${MOEDAS[negativa.moeda].nome.toLowerCase()} negativo`, cls: 'cor-no' };
    else if (a.bloq) est = { txt: `faltam ${a.faltas.map((f) => comUnidade(f.moeda, f.falta)).join(' + ')}`, cls: 'cor-no' };
    else est = { txt: 'disponível', cls: 'cor-ok' };
    const notas = [];
    if (r.descricao) notas.push(esc(r.descricao));
    else if (r.tipo === 'tempo_app' && Number(r.libera_min) > 0 && Number(r.custo_min) > 0) {
      notas.push(`${fmt(r.libera_min)} min de ${esc(r.libera_app || 'uso')} × ${fFator(Math.round((Number(r.custo_min) / Number(r.libera_min)) * 10) / 10)}`);
    }
    const nota2 = mult > 1 ? `<span class="lb-nota cor-hab">2ª vez na semana × ${fFator(mult)}</span>` : '';
    return `<div class="lb-item${a.bloq ? ' bloq' : ''}">
<div class="lb-corpo">
<span class="lb-nome">${a.bloq ? ic.cadeado(14) : ''}${esc(r.nome)}</span>
${notas.length ? `<span class="lb-nota">${notas.join(' · ')}</span>` : ''}${nota2}
<div class="lb-estado"><span class="${est.cls}">${esc(est.txt)}</span>
${!a.bloq && a.custos.length ? `<a class="lb-link" href="#/liberar/${encodeURIComponent(r.id)}">Trocar</a>` : ''}
${completo ? `<a class="lb-link-sub" href="#/recompensa/${encodeURIComponent(r.id)}">Editar</a>` : ''}</div>
</div>
<div class="lb-chips">${a.custos.length ? chipsCusto(a.custos, a.faltas) : '<span class="chip neutro">sem custo</span>'}</div>
${botaoEstrela(i)}
</div>`;
  };

  const botaoEstrela = (i) => (completo ? `<button type="button" class="lb-estrela${i.on ? ' on' : ''}" data-estrela="${esc(i.r.id)}" aria-pressed="${i.on}" aria-label="${i.r.tipo === 'cofrinho' ? 'Guardar nesta semana' : 'Quero esta semana'}: ${esc(i.r.nome)}">${estrela(i.on)}</button>` : '');

  // ---- cofrinho (grande)
  const linhaCofrinho = (i) => {
    const { r } = i;
    const alvo = Number(r.cofrinho_alvo) || 0;
    const guardado = Number(r.guardado) || 0;
    const p = alvo > 0 ? guardado / alvo : 0;
    const n = pctInt(p);
    const cheio = alvo > 0 && guardado >= alvo;
    const pronta = cheio && r.condicao_ok;
    const meta = r.meta_condicao_id ? metaPorId[String(r.meta_condicao_id)] : null;
    let cond, condNota;
    if (!r.meta_condicao_id) { cond = 'Sem meta-condição'; condNota = 'libera com o cofrinho cheio'; }
    else if (!meta) { cond = 'Meta-condição'; condNota = r.condicao_ok ? 'cumprida' : 'ainda não cumprida'; }
    else {
      cond = meta.titulo;
      const pm = pctInt(meta.progresso);
      const vence = meta.prazo ? `${MESES_CURTOS[Number(meta.prazo.slice(5, 7)) - 1]}/${meta.prazo.slice(2, 4)}` : '';
      condNota = r.condicao_ok ? 'meta cumprida' : `meta em ${pm}%${vence ? ' · vence ' + vence : ''}`;
    }
    const pv = previsaoCofrinho(r);
    const porSemana = Number(r.guardar_semana) || 0;
    const deposito = Math.round(Math.min(porSemana, Math.max(0, alvo - guardado)) * 100) / 100;
    const faltaLivre = deposito - saldo.reais;
    let acao = '';
    if (pronta) {
      acao = `<div class="lb-pronta" role="status"><span>${ic.check(16)}Pronta para usar</span><button type="button" class="btn primario" data-usar="${esc(r.id)}">Usar</button></div>`;
    } else if (!cheio && deposito > 0) {
      acao = `<button type="button" class="btn lb-guardar" data-guardar="${esc(r.id)}" data-valor="${deposito}"${faltaLivre > 0 ? ' disabled' : ''}>${ic.cofre(18)}Guardar ${fReais(deposito)}</button>
${faltaLivre > 0 ? `<span class="nota cor-no">Faltam ${fReais(faltaLivre)} de dinheiro livre para guardar.</span>` : ''}`;
    }
    return `<div class="lb-cofre">
<div class="lb-cofre-topo">
<div class="lb-corpo"><span class="lb-nome">${ic.cofre(15)}${esc(r.nome)}</span><span class="lb-nota">${fReais(guardado)} de ${fReais(alvo)}${porSemana ? ` · ${fReais(porSemana)} por semana` : ''}</span></div>
<span class="lb-cofre-pct num">${n}%</span>
${botaoEstrela(i)}
</div>
${barraProgresso(p, { cls: 'din', rotulo: `${r.nome}: ${n}% guardado` })}
<div class="lb-cond${r.condicao_ok ? ' ok' : ''}">${ic.alvo(16)}<div><span class="lb-cond-tit">${esc(cond)}</span><span class="lb-cond-nota">${esc(condNota)}</span></div></div>
<div class="lb-estado"><span>${esc(pv.txt)}</span>${completo ? `<a class="lb-link-sub" href="#/recompensa/${encodeURIComponent(r.id)}">Editar</a>` : ''}</div>
${acao}
</div>`;
  };

  const doNivel = (n) => itens.filter((i) => (i.r.nivel || 'media') === n);
  const pequenas = doNivel('pequena');
  const medias = doNivel('media');
  const grandes = doNivel('grande');
  const disp = (lista) => lista.filter((i) => !i.a.bloq && i.r.tipo !== 'cofrinho').length;
  const vazioNivel = (rot) => `<div class="vazio">Nenhuma recompensa ${rot}.${completo ? ' <a class="lb-link" href="#/recompensa/nova">Cadastrar</a>' : ''}</div>`;

  const medNaSemana = medias.filter((i) => i.on).length;
  const medLado = medNaSemana
    ? `${medNaSemana} na semana${disp(medias) ? ` · ${disp(medias)} ${disp(medias) === 1 ? 'disponível' : 'disponíveis'}` : ''}`
    : `${disp(medias)} de ${medias.length} disponíveis`;

  const listaTrocas = trocas.length
    ? trocas.map((t) => {
      const custos = ORDEM.filter((m) => Number(t[CUSTO[m]]) > 0).map((m) => ({ moeda: m, valor: Number(t[CUSTO[m]]) }));
      return `<div class="item"><span class="txt"><span>${esc(t.nome)}</span></span>${chipsCusto(custos)}</div>`;
    }).join('')
    : '<div class="vazio">Nenhuma troca hoje.</div>';

  const recado = parabens;
  parabens = null;

  return `<div class="tela lb-tela">
<div class="topo"><div><span class="quando">${esc(dataLonga(H))}</span><h1>Liberar</h1></div>
${completo ? `<a class="btn tracejado lb-nova" href="#/recompensa/nova">${ic.mais(18)}Nova recompensa</a>` : ''}</div>
${recado ? `<div class="aviso ok lb-parabens" role="status">${ic.check(18)}<span><b>Parabéns: ${esc(recado)} liberada.</b> Você encheu o cofrinho e cumpriu a meta. Aproveite. O cofrinho saiu de Liberar.</span></div>` : ''}
${completo ? '' : `<div class="aviso neutro">${ic.cadeado(16)}<span><b>Disponível com a conta conectada:</b> plano da semana, cofrinhos, níveis e cadastro de recompensas. No modo demonstração, só as trocas.</span></div>`}

<section class="card lb-banco" aria-labelledby="banco-tit">
<div class="card-cab"><h2 id="banco-tit">Saldo livre</h2><span class="lado">${temReserva ? 'banco menos as reservas da semana' : 'banco acumulado'}</span></div>
<div class="banco">${blocos}</div>
${ORDEM.some((m) => saldo[m] < 0) ? `<div class="aviso" role="status">${ic.cadeado(16)}<span><b>Trocas com ${ORDEM.filter((m) => saldo[m] < 0).map((m) => MOEDAS[m].nome.toLowerCase()).join(' e ')} bloqueadas.</b> Voltam quando o saldo sair do negativo.</span></div>` : ''}
</section>

${secaoSemana}

<section class="card lb-nivel" aria-labelledby="peq-tit">
<div class="card-cab"><h2 id="peq-tit">Pequenas <span class="lb-sub">· dia a dia</span></h2><span class="lado cor-hab">repetir na semana: × 1,5</span></div>
${pequenas.length ? pequenas.map(linha).join('') : vazioNivel('pequena')}
</section>

<section class="card lb-nivel" aria-labelledby="med-tit">
<div class="card-cab"><h2 id="med-tit">Médias <span class="lb-sub">· da semana</span></h2><span class="lado">${esc(medLado)}</span></div>
${medias.length ? medias.map(linha).join('') : vazioNivel('média')}
</section>

<section class="card lb-nivel" aria-labelledby="gra-tit">
<div class="card-cab"><h2 id="gra-tit">Grandes <span class="lb-sub">· cofrinho</span></h2><span class="lado">dinheiro + meta cumprida</span></div>
${grandes.length ? grandes.map((i) => (i.r.tipo === 'cofrinho' ? linhaCofrinho(i) : linha(i))).join('') : vazioNivel('grande')}
</section>

<section class="card" aria-labelledby="trocas-tit">
<div class="card-cab"><h2 id="trocas-tit">${ic.troca(18)}Trocas de hoje</h2><span class="lado">${trocas.length}</span></div>
<div class="lista">${listaTrocas}</div>
</section>
<span class="nota lb-rodape">Sem fiado: saldo negativo bloqueia toda troca que use aquela moeda. A 2ª vez da mesma recompensa na semana custa × 1,5.</span>
</div>`;
}

// ------------------------------------------------------------ confirmação

function montarConfirmar(saldo, recompensas, id) {
  const r = recompensas.find((x) => String(x.id) === String(id));
  if (!r) {
    confirmacao = null;
    return `<div class="tela lb-confirmar"><div class="topo"><div><h1>Recompensa não encontrada</h1></div></div><a class="btn largo" href="#/liberar">Voltar para Liberar</a></div>`;
  }
  const cofrinho = r.tipo === 'cofrinho';
  const mult = cofrinho ? 1 : Number(r.multiplicador) || 1;
  const sugerido = cofrinho
    ? Math.round(Math.min(Number(r.guardar_semana) || 0, Math.max(0, Number(r.cofrinho_alvo || 0) - Number(r.guardado || 0))) * 100) / 100
    : Number(r.custo_reais);
  confirmacao = {
    r, banco: saldo, mult, cofrinho,
    kcal: cofrinho ? 0 : Number(r.custo_kcal), reais: sugerido, min: cofrinho ? 0 : Number(r.custo_min),
    feito: null, erro: null, enviando: false,
  };
  return `<div class="tela lb-confirmar">
<div style="display:flex;align-items:center;gap:8px"><a class="btn-icone" href="#/liberar" aria-label="Voltar para Liberar">${ic.voltar(18)}</a><span class="nota" style="font-size:14px">${cofrinho ? 'Guardar no cofrinho' : 'Confirmar troca'}</span></div>
<div><h1 style="font-size:26px">${esc(r.nome)}</h1><span class="nota">${mult > 1 ? `2ª vez na semana: o custo sai × ${fFator(mult)}. ` : ''}Valores do cadastro. Ajuste se hoje for diferente.</span></div>
<div id="confirmar"></div>
</div>`;
}

function desenharConfirmar(el) {
  const c = confirmacao;
  const { r, banco, mult } = c;
  const usa = c.cofrinho
    ? { kcal: false, reais: true, min: false }
    : { kcal: Number(r.custo_kcal) > 0, reais: Number(r.custo_reais) > 0, min: Number(r.custo_min) > 0 };
  // o servidor aplica o multiplicador: aqui só mostra o que vai sair do banco
  const sim = {
    custo_kcal: usa.kcal ? Math.round(c.kcal * mult) : 0,
    custo_reais: usa.reais ? Math.round(c.reais * mult * 100) / 100 : 0,
    custo_min: usa.min ? Math.round(c.min * mult) : 0,
  };
  const a = avaliar(sim, banco);

  if (c.feito) {
    const depois = ORDEM.map((m) => comUnidade(m, c.feito.banco[m], { sinal: true })).join(' · ');
    el.innerHTML = `<section class="card din" role="status">
<div class="card-cab"><h2>${ic.check(18)}${esc(r.nome)} ${c.cofrinho ? 'recebeu o depósito' : 'liberado'}</h2></div>
<span>Saldo livre agora: <b>${depois}</b></span>
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

  const base = mult > 1 ? ' · base' : '';
  const steppers = [];
  if (usa.kcal) steppers.push(stepper('kcal', c.kcal, 50, `Calorias (kcal)${base}`));
  if (usa.reais) steppers.push(stepper('reais', c.reais, 5, c.cofrinho ? 'Depósito (R$)' : `Valor (R$)${base}`));
  if (usa.min) steppers.push(`<div class="stepper tmp"><div class="rot-s"><span><span class="ponto tmp"></span>Tempo</span><span class="valor-s num" style="color:var(--ink)">${fmt(sim.custo_min)} <small>min</small></span></div><span class="nota" style="text-align:right">custo fixo${mult > 1 ? ` × ${fFator(mult)}` : ''}${r.libera_min ? `<br>libera ${r.libera_min} min` : ''}</span></div>`);

  const linhas = a.custos.map((x) => {
    const antes = Number(banco[x.moeda]);
    const depois = antes - x.valor;
    const neg = depois < 0;
    const cls = MOEDAS[x.moeda].cls;
    return `<div class="metrica">
<div class="topo-m"><span class="nome-m"><span class="ponto ${cls}"></span>${MOEDAS[x.moeda].nome}</span><span class="valor-m">${comUnidade(x.moeda, antes, { sinal: true })} → <b class="num ${neg ? 'cor-no' : ''}">${comUnidade(x.moeda, depois, { sinal: true })}</b></span></div>
<div class="pilha" aria-hidden="true">${antes > 0 ? `<div style="width:${pct(Math.min(x.valor, antes) / antes)};background:var(--${neg ? 'no' : cls})"></div><div style="width:${pct(Math.max(0, depois) / antes)};background:var(--${cls}-soft)"></div>` : `<div style="width:100%;background:var(--no-soft)"></div>`}</div>
<span class="nota">${neg ? `faltam ${comUnidade(x.moeda, -depois)}` : `custa ${comUnidade(x.moeda, x.valor)} · ${Math.round(clamp01(x.valor / antes) * 100)}% do saldo livre`}</span></div>`;
  }).join('');

  const semCusto = a.custos.length === 0;
  el.innerHTML = `<div class="tela" style="gap:14px">
${steppers.join('')}
<section class="card" aria-labelledby="custo-tit">
<div class="card-cab"><h2 id="custo-tit">Custo e saldo livre</h2><span class="lado">${mult > 1 ? `× ${fFator(mult)} · ` : ''}antes → depois</span></div>
${semCusto ? '<div class="vazio">Sem custo nesta troca.</div>' : `<div class="metricas">${linhas}</div>`}
${a.bloq ? `<div class="aviso">${ic.cadeado(16)}<span><b>Pelo saldo livre que você vê, não cabe:</b> ${esc(motivoBloqueio(a.faltas))}. Sem fiado — o servidor confere e recusa.</span></div>` : ''}
</section>
${c.erro ? `<div class="aviso" role="alert">${ic.x(16)}<span><b>Troca recusada.</b> ${esc(c.erro)}</span></div>` : ''}
<button type="button" class="btn primario largo" id="confirmar-btn"${c.enviando || semCusto ? ' disabled' : ''}>${c.enviando ? 'Confirmando…' : c.cofrinho ? 'Guardar no cofrinho' : 'Confirmar troca'}</button>
<a class="btn fantasma largo" href="#/liberar">Voltar sem trocar</a>
</div>`;
}

function ligarConfirmar(raiz, { api, toast }) {
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
        // valores-base: o servidor multiplica por 1,5 quando é a 2ª vez na semana
        await api.trocar({
          nome: r.nome,
          kcal: !c.cofrinho && Number(r.custo_kcal) > 0 ? Math.round(c.kcal) : 0,
          reais: c.cofrinho || Number(r.custo_reais) > 0 ? c.reais : 0,
          min: !c.cofrinho && Number(r.custo_min) > 0 ? c.min : 0,
          recompensa: r.id,
        });
        c.feito = { banco: await lerSaldo(api) };
        toast(c.cofrinho ? 'Guardado no cofrinho' : 'Troca confirmada');
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

// ------------------------------------------------------------ eventos

export function ligar(raiz, ctx) {
  if (confirmacao) { ligarConfirmar(raiz, ctx); return; }
  if (!catalogo) return;
  const { api, toast, recarregar } = ctx;
  const cat = catalogo;

  raiz.addEventListener('click', async (ev) => {
    // estrela: quero esta semana
    const bEstrela = ev.target.closest('[data-estrela]');
    if (bEstrela) {
      const id = bEstrela.dataset.estrela;
      const quer = bEstrela.getAttribute('aria-pressed') !== 'true';
      if (quer && cat.marcadas.length >= MAX_SEMANA) {
        const av = raiz.querySelector('#lb-aviso-semana');
        if (av) av.innerHTML = `<div class="lb-aviso-hab" role="status">Máximo de ${MAX_SEMANA} por semana. Tire uma estrela antes de marcar outra.</div>`;
        toast(`Máximo de ${MAX_SEMANA} por semana`, 'erro');
        return;
      }
      bEstrela.disabled = true;
      try {
        await api.marcarRecompensaSemana(cat.SEG, id, quer);
        recarregar();
      } catch (e) {
        toast(e.message || String(e), 'erro');
        bEstrela.disabled = false;
      }
      return;
    }

    // cofrinho: guardar o valor da semana (troca só em reais com a própria recompensa)
    const bGuardar = ev.target.closest('[data-guardar]');
    if (bGuardar) {
      const i = cat.porId[bGuardar.dataset.guardar];
      if (!i) return;
      const valor = Number(bGuardar.dataset.valor);
      bGuardar.disabled = true;
      bGuardar.textContent = 'Guardando…';
      try {
        await api.trocar({ nome: i.r.nome, kcal: 0, reais: valor, min: 0, recompensa: i.r.id });
        toast(`${fReais(valor)} no cofrinho`);
        recarregar();
      } catch (e) {
        toast(e.message || String(e), 'erro');
        recarregar();
      }
      return;
    }

    // cofrinho cheio e meta cumprida: usar desativa a recompensa
    const bUsar = ev.target.closest('[data-usar]');
    if (bUsar) {
      const i = cat.porId[bUsar.dataset.usar];
      if (!i) return;
      if (!window.confirm(`Usar ${i.r.nome}? O cofrinho sai de Liberar.`)) return;
      bUsar.disabled = true;
      try {
        await api.salvarRecompensa({ id: i.r.id, ativo: false });
        parabens = i.r.nome;
        recarregar();
      } catch (e) {
        toast(e.message || String(e), 'erro');
        bUsar.disabled = false;
      }
    }
  });
}

