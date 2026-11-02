// Semana: "Esta semana" (recompensas escolhidas, compromissos, eventos que reservam o banco, Conselheiro)
// e "Planejar" a próxima (escolher recompensas, reservar eventos, compromissos e a projeção do saldo).
// Semana = segunda a domingo; no banco, a coluna semana guarda a segunda-feira (semana_de).
// As peças da semana (cartão de recompensa, compromisso) também são usadas no Início.

import { hojeBR, addDias, dataLonga, diaSemana, diaCurto, dataCurta, esc, ic, fNum, fReais, fmt, clamp01, lerNumero, MOEDAS, toast } from '../ui.js';
import { ORDEM, formatar, comUnidade } from './comum.js';
import { cartoesConselheiro, ligarConselheiro } from './conselheiro.js';

// ------------------------------------------------------------ datas da semana

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// segunda-feira da semana de `iso`
export function segundaDe(iso) {
  const dow = new Date(iso + 'T12:00:00Z').getUTCDay(); // 0 = domingo
  return addDias(iso, -((dow + 6) % 7));
}

// "2 a 8 nov" ou "30 nov a 6 dez"
export function intervaloSemana(seg) {
  const fim = addDias(seg, 6);
  const d1 = Number(seg.slice(8, 10)), d2 = Number(fim.slice(8, 10));
  const m1 = MESES_CURTOS[Number(seg.slice(5, 7)) - 1], m2 = MESES_CURTOS[Number(fim.slice(5, 7)) - 1];
  return m1 === m2 ? `${d1} a ${d2} ${m2}` : `${d1} ${m1} a ${d2} ${m2}`;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------ moedas e custos

const CAMPO_CREDITO = { kcal: 'credito_kcal', reais: 'credito_reais', min: 'credito_min' };
const CUSTO = { kcal: 'custo_kcal', reais: 'custo_reais', min: 'custo_min' };
const NIVEL = { pequena: 'Pequena', media: 'Média', grande: 'Grande' };

// Saldo que pode ser gasto: banco menos as reservas dos eventos (o tempo não tem reserva).
export function livreDe(bd) {
  return {
    kcal: Number(bd.kcal_livre ?? bd.kcal) || 0,
    reais: Number(bd.reais_livre ?? bd.reais) || 0,
    min: Number(bd.min) || 0,
  };
}

// Média do crédito diário em [de, ate], por moeda, só com os dias que têm valor.
export function taxasDiarias(creditos, de, ate) {
  const out = {};
  for (const m of ORDEM) {
    const vals = (creditos || [])
      .filter((c) => c.data >= de && c.data <= ate && c[CAMPO_CREDITO[m]] !== null && c[CAMPO_CREDITO[m]] !== undefined)
      .map((c) => Number(c[CAMPO_CREDITO[m]]));
    out[m] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    out['dias_' + m] = vals.length;
  }
  return out;
}

const ehCofrinho = (r) => r.tipo === 'cofrinho';

// Custo de uma vez, sem o multiplicador. No cofrinho é o depósito da semana.
export function custoBase(r) {
  if (ehCofrinho(r)) return { kcal: 0, reais: Number(r.guardar_semana) || Number(r.custo_reais) || 0, min: 0 };
  return { kcal: Number(r.custo_kcal) || 0, reais: Number(r.custo_reais) || 0, min: Number(r.custo_min) || 0 };
}

// Custo agora: a 2ª vez na mesma semana sai × 1,5 (recompensa_status.multiplicador).
export function custoEfetivo(r) {
  const b = custoBase(r);
  const mult = ehCofrinho(r) ? 1 : Number(r.multiplicador) || 1;
  return { kcal: Math.round(b.kcal * mult), reais: Math.round(b.reais * mult * 100) / 100, min: Math.round(b.min * mult), mult };
}

// Cor do cartão: calorias quando custa comida, senão dinheiro, senão tempo.
export function moedaPrincipal(r) {
  if (ehCofrinho(r)) return 'reais';
  const c = custoBase(r);
  if (c.kcal > 0) return 'kcal';
  if (c.reais > 0) return 'reais';
  return 'min';
}

const comUn = (m, v) => comUnidade(m, v);

export function custoTexto(r) {
  const c = custoBase(r);
  if (ehCofrinho(r)) return c.reais ? `${fReais(c.reais)} ao cofrinho` : 'sem depósito definido';
  const partes = ORDEM.filter((m) => c[m] > 0).map((m) => comUn(m, c[m]));
  return partes.length ? partes.join(' + ') : 'sem custo';
}

export function nivelTexto(r) {
  return `${NIVEL[r.nivel] || 'Média'} · ${ehCofrinho(r) ? 'cofrinho' : 'da semana'}`;
}

// Quanto do custo o banco livre já cobre, quando junta o resto e o que bloqueia.
export function progressoRecompensa(r, livre, taxas, H) {
  const domingo = addDias(segundaDe(H), 6);
  const cls = MOEDAS[moedaPrincipal(r)].cls;
  const bloqueios = [];
  if (r.condicao_ok === false) bloqueios.push('Só libera quando a meta ligada a ela for cumprida');

  if (ehCofrinho(r)) {
    const guardado = Number(r.guardado) || 0;
    const alvo = Number(r.cofrinho_alvo) || 0;
    const gs = Number(r.guardar_semana) || 0;
    const pct = alvo > 0 ? clamp01(guardado / alvo) : 0;
    let juntou = alvo > 0 ? `${fReais(guardado)} de ${fReais(alvo)}` : `${fReais(guardado)} guardados · sem alvo`;
    if (gs) juntou += ` · ${fReais(gs)} por semana`;
    if (Number(r.vezes_semana) > 0) juntou += ' · depósito da semana feito';
    let previsao, pronto = false;
    if (alvo > 0 && guardado >= alvo) { previsao = 'Cofrinho cheio: já dá para liberar'; pronto = true; }
    else if (gs > 0 && alvo > 0) {
      const semanas = Math.ceil((alvo - guardado) / gs);
      const fim = addDias(H, semanas * 7);
      const ano = fim.slice(0, 4) !== H.slice(0, 4) ? ` de ${fim.slice(0, 4)}` : '';
      previsao = `No ritmo de ${fReais(gs)} por semana, fecha em ${MESES[Number(fim.slice(5, 7)) - 1]}${ano}`;
    } else previsao = 'Defina quanto guardar por semana';
    if (gs > 0 && Number(r.vezes_semana) === 0 && livre.reais < gs) {
      bloqueios.push(livre.reais < 0
        ? `Dinheiro em ${fReais(livre.reais)}: o depósito libera ao sair do negativo`
        : `Faltam ${fReais(gs - livre.reais)} para o depósito da semana`);
    }
    return { pct, juntou, previsao, pronto, bloqueio: bloqueios.join(' · '), cls };
  }

  const ce = custoEfetivo(r);
  const moedas = ORDEM.filter((m) => ce[m] > 0);
  let pct = 1;
  const juntouPartes = [], faltas = [];
  let dias = 0, semRitmo = false;
  for (const m of moedas) {
    const tem = Math.max(0, livre[m]);
    pct = Math.min(pct, clamp01(tem / ce[m]));
    const j = Math.min(tem, ce[m]);
    juntouPartes.push(m === 'reais' ? `${fReais(j)} de ${fReais(ce[m])}` : `${fNum(j)} de ${fNum(ce[m])} ${MOEDAS[m].unidade}`);
    const falta = ce[m] - livre[m]; // saldo negativo também precisa ser coberto
    if (falta > 0) {
      faltas.push(comUn(m, falta));
      if (taxas[m] > 0) dias = Math.max(dias, falta / taxas[m]);
      else semRitmo = true;
    }
    if (livre[m] < 0) bloqueios.push(`${MOEDAS[m].nome} em ${comUn(m, livre[m])}: libera ao sair do negativo`);
  }
  let juntou = moedas.length ? 'Juntou ' + juntouPartes.join(' e ') : 'Não custa nada do banco';
  if (ce.mult > 1) juntou += ' · 2ª vez na semana × 1,5';
  let previsao, pronto = false;
  if (!faltas.length) { previsao = 'Já dá para liberar'; pronto = true; }
  else {
    let quando;
    if (semRitmo) quando = 'no ritmo das últimas 4 semanas não junta';
    else {
      const d = addDias(H, Math.ceil(dias));
      if (d === H) quando = 'você junta hoje';
      else if (d <= domingo) quando = `você junta até ${diaSemana(d)}`;
      else quando = `no ritmo atual, junta em ${Math.ceil(dias)} dias`;
    }
    previsao = `Faltam ${faltas.join(' e ')} · ${quando}`;
  }
  return { pct, juntou, previsao, pronto, bloqueio: bloqueios.join(' · '), cls };
}

// Cartão grande e colorido de uma recompensa escolhida para a semana. Toque leva ao Liberar.
export function cartaoRecompensa(r, livre, taxas, H) {
  const p = progressoRecompensa(r, livre, taxas, H);
  const n = Math.floor(p.pct * 100);
  return `<a class="rsem ${p.cls}${p.pronto ? ' pronto' : ''}" href="#/liberar">
<div class="rsem-topo"><div class="rsem-nomes"><span class="rsem-nivel">${esc(nivelTexto(r))}</span><span class="rsem-nome">${esc(r.nome)}</span></div>
<span class="rsem-pct num">${n}%</span></div>
<div class="rsem-barra" role="progressbar" aria-label="${esc(r.nome)}: ${n}% juntado" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="100"><div style="width:${(p.pct * 100).toFixed(1)}%"></div></div>
<span class="rsem-juntou">${esc(p.juntou)}</span>
<span class="rsem-prev">${p.pronto ? ic.check(15) : ic.relogio(15)}${esc(p.previsao)}</span>
${p.bloqueio ? `<span class="rsem-bloq">${ic.cadeado(14)}${esc(p.bloqueio)}</span>` : ''}
</a>`;
}

// ------------------------------------------------------------ compromissos

const TIPOS_COMP = [
  { id: 'treinos', nome: 'Treinos na semana', alvo: 3 },
  { id: 'deitar_ate', nome: 'Deitar até um horário', alvo: 5 },
  { id: 'minutos_atividade', nome: 'Minutos de uma atividade', alvo: 180 },
  { id: 'passos_dias', nome: 'Dias com N passos', alvo: 5 },
];

function detalheCompromisso(c, atividades) {
  const p = c.parametros || {};
  switch (c.tipo) {
    case 'treinos': return 'treinos de 20 min ou mais, fora caminhada';
    case 'deitar_ate': return `noites deitando até ${esc(p.hora || '23:00')}`;
    case 'minutos_atividade': {
      const a = (atividades || []).find((x) => x.id === p.atividade_id);
      return `${a ? esc(a.nome) : 'atividade'} · minutos na semana`;
    }
    case 'passos_dias': return `dias com ${fmt(Number(p.meta) || 8000)} passos`;
    default: return '';
  }
}

function valorCompromisso(c) {
  const feito = Number(c.feito) || 0, alvo = Number(c.alvo) || 0;
  return c.tipo === 'minutos_atividade' ? `${fNum(feito)} de ${fNum(alvo)} min` : `${fNum(feito)} de ${fNum(alvo)}`;
}

// Progresso feito/alvo em segmentos (poucos passos) ou barra contínua.
export function compromissoHtml(c, atividades, { excluir = false } = {}) {
  const feito = Number(c.feito) || 0, alvo = Number(c.alvo) || 0;
  const completo = alvo > 0 && feito >= alvo;
  let blocos = 0, porBloco = 1;
  if (c.tipo === 'minutos_atividade') {
    if (alvo % 30 === 0 && alvo / 30 <= 12) { blocos = alvo / 30; porBloco = 30; }
  } else if (Number.isInteger(alvo) && alvo <= 10) blocos = alvo;
  const rotulo = `${c.titulo}: ${valorCompromisso(c)}`;
  const prog = blocos
    ? `<div class="csem-segs" role="progressbar" aria-label="${esc(rotulo)}" aria-valuenow="${feito}" aria-valuemin="0" aria-valuemax="${alvo}">${Array.from({ length: blocos }, (_, i) => `<span${feito >= (i + 1) * porBloco ? ' class="on"' : ''}></span>`).join('')}</div>`
    : `<div class="csem-barra" role="progressbar" aria-label="${esc(rotulo)}" aria-valuenow="${feito}" aria-valuemin="0" aria-valuemax="${alvo}"><div style="width:${(clamp01(alvo ? feito / alvo : 0) * 100).toFixed(1)}%"></div></div>`;
  return `<div class="csem${completo ? ' feito' : ''}">
<div class="csem-topo"><span class="csem-nomes"><span class="csem-nome">${completo ? ic.check(15) : ''}${esc(c.titulo)}</span><span class="csem-det">${detalheCompromisso(c, atividades)}</span></span>
<span class="csem-valor num">${valorCompromisso(c)}</span>
${excluir ? `<button type="button" class="btn-icone leve" data-excluir-comp="${esc(c.id)}" aria-label="Excluir ${esc(c.titulo)}">${ic.lixeira(18)}</button>` : ''}</div>
${prog}
</div>`;
}

// ------------------------------------------------------------ eventos

function chipsEvento(e) {
  const out = [];
  if (Number(e.kcal)) out.push(`<span class="chip cal">~${fNum(e.kcal)} kcal</span>`);
  if (Number(e.reais)) out.push(`<span class="chip din">${fReais(e.reais)}</span>`);
  if (e.imprevisto) out.push('<span class="chip neutro">imprevisto</span>');
  return out.join('');
}

function eventoHtml(e, { aconteceu = true } = {}) {
  const dia = e.data ? cap(diaCurto(e.data)) : '—';
  const acoes = [];
  if (aconteceu) {
    acoes.push(e.realizado
      ? `<button type="button" class="sem-mini" data-ev-desfazer="${esc(e.id)}">Desfazer</button>`
      : `<button type="button" class="sem-mini forte" data-ev-aconteceu="${esc(e.id)}">Aconteceu</button>`);
  }
  acoes.push(`<button type="button" class="btn-icone leve" data-ev-excluir="${esc(e.id)}" aria-label="Excluir ${esc(e.descricao)}">${ic.lixeira(18)}</button>`);
  return `<div class="sem-ev${e.realizado ? ' feito' : ''}">
<span class="sem-ev-dia" title="${e.data ? esc(dataLonga(e.data)) : 'sem dia certo'}">${dia}</span>
<div class="sem-ev-txt"><span class="sem-ev-nome">${esc(e.descricao)}</span>
<span class="sem-ev-chips">${e.realizado ? 'aconteceu · reserva liberada' : 'reserva'} ${e.realizado ? '' : chipsEvento(e)}</span></div>
<div class="sem-ev-acoes">${acoes.join('')}</div>
</div>`;
}

const abertos = new Set(); // formulários abertos sobrevivem ao recarregar

function formEvento(semana, H, estimar) {
  const dias = Array.from({ length: 7 }, (_, i) => addDias(semana, i)).filter((d) => d >= H);
  const id = `ev-${semana}`;
  return `<details class="sem-add" data-chave="${id}"${abertos.has(id) ? ' open' : ''}>
<summary>${ic.mais(16)}Adicionar evento</summary>
<form class="sem-form" data-form-evento="${esc(semana)}" novalidate>
<label class="campo">Dia<select name="data"><option value="">Sem dia certo</option>${dias.map((d) => `<option value="${d}">${cap(diaCurto(d))} ${dataCurta(d)}</option>`).join('')}</select></label>
<label class="campo">O que é<input name="descricao" required maxlength="120" placeholder="Jantar com amigos" autocomplete="off"></label>
<div class="sem-form-linha">
<label class="campo">kcal estimadas<input name="kcal" inputmode="numeric" placeholder="opcional" autocomplete="off"></label>
<label class="campo">R$<input name="reais" inputmode="decimal" placeholder="0" autocomplete="off"></label>
</div>
${estimar ? `<button type="button" class="btn tracejado" data-estimar>${ic.brilho(16)}Estimar com IA</button><span class="nota" data-estimativa aria-live="polite"></span>` : ''}
<label class="sem-check"><input type="checkbox" name="imprevisto"><span>Imprevisto (pode não acontecer)</span></label>
<div class="sem-erro" role="alert"></div>
<button type="submit" class="btn primario">Reservar no banco</button>
</form>
</details>`;
}

function formCompromisso(semana, atividades) {
  const produtivas = (atividades || []).filter((a) => a.tipo === 'produtivo');
  const id = `comp-${semana}`;
  return `<details class="sem-add" data-chave="${id}"${abertos.has(id) ? ' open' : ''}>
<summary>${ic.mais(16)}Adicionar compromisso</summary>
<form class="sem-form" data-form-comp="${esc(semana)}" novalidate>
<label class="campo">Tipo<select name="tipo">${TIPOS_COMP.map((t) => `<option value="${t.id}">${t.nome}</option>`).join('')}</select></label>
<div class="sem-form-linha">
<label class="campo">Alvo na semana<input name="alvo" inputmode="numeric" value="3" autocomplete="off"></label>
<label class="campo" data-para="deitar_ate" hidden>Deitar até<input name="hora" type="time" value="23:00"></label>
<label class="campo" data-para="passos_dias" hidden>Passos por dia<input name="meta" inputmode="numeric" value="8000" autocomplete="off"></label>
</div>
<label class="campo" data-para="minutos_atividade" hidden>Atividade<select name="atividade">${produtivas.length ? produtivas.map((a) => `<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join('') : '<option value="">Nenhuma atividade produtiva cadastrada</option>'}</select></label>
<label class="campo">Nome (opcional)<input name="titulo" maxlength="80" placeholder="sai do tipo e do alvo" autocomplete="off"></label>
<span class="nota" data-unidade>Treinos de 20 min ou mais contados pelo Garmin.</span>
<div class="sem-erro" role="alert"></div>
<button type="submit" class="btn primario">Adicionar</button>
</form>
</details>`;
}

// ------------------------------------------------------------ projeção

function sugerirCorte(m, falta, recs, eventos) {
  const nomeR = (r) => `"${r.nome}"`;
  const candR = recs.map((r) => ({ nome: nomeR(r), valor: custoBase(r)[m] })).filter((x) => x.valor > 0);
  const candE = eventos.filter((e) => !e.realizado && !e.imprevisto)
    .map((e) => ({ nome: `"${e.descricao}"`, valor: Number(e[m]) || 0 })).filter((x) => x.valor > 0);
  const asc = (a, b) => a.valor - b.valor;
  const r1 = [...candR].sort(asc).find((x) => x.valor >= falta);
  if (r1) return `Tirar ${r1.nome} devolve ${comUn(m, r1.valor)} e fecha a conta.`;
  const e1 = [...candE].sort(asc).find((x) => x.valor >= falta);
  if (e1) return `Reduzir ou tirar ${e1.nome} (${comUn(m, e1.valor)}) fecha a conta.`;
  const todos = [...candR, ...candE].sort((a, b) => b.valor - a.valor);
  const lista = [];
  let soma = 0;
  for (const x of todos) { lista.push(x.nome); soma += x.valor; if (soma >= falta) break; }
  if (!lista.length) return 'Nenhuma recompensa ou evento da semana usa essa moeda: o ritmo das últimas 4 semanas não cobre.';
  if (soma >= falta) return `Tirar ${lista.join(' e ')} devolve ${comUn(m, soma)} e fecha a conta.`;
  return `Mesmo tirando ${lista.join(', ')} ainda faltam ${comUn(m, falta - soma)}: o ritmo das últimas 4 semanas não cobre a semana.`;
}

function projecaoHtml({ taxas, eventos, recs, livre }) {
  const linhas = [], avisos = [];
  for (const m of ORDEM) {
    const ganho = Math.round(taxas[m] * 7);
    const ev = m === 'min' ? 0 : eventos.filter((e) => !e.realizado).reduce((a, e) => a + (Number(e[m]) || 0), 0);
    const rec = recs.reduce((a, r) => a + custoBase(r)[m], 0);
    const saldo = ganho - ev - rec;
    const neg = saldo < 0;
    const uso = ev + rec;
    const frac = ganho > 0 ? Math.min(1, uso / ganho) : (uso > 0 ? 1 : 0);
    let conta = `${formatar(m, ganho, { sinal: true })} ganho previsto`;
    if (ev) conta += ` − ${formatar(m, ev)} eventos`;
    if (rec) conta += ` − ${formatar(m, rec)} recompensas`;
    conta += ` · banco livre hoje ${comUn(m, m === 'reais' ? Math.round(livre[m]) : livre[m])}`;
    linhas.push(`<div class="proj ${MOEDAS[m].cls}${neg ? ' neg' : ''}">
<div class="proj-topo"><span class="proj-nome"><span class="ponto ${MOEDAS[m].cls}"></span>${MOEDAS[m].nome}</span>
<span class="proj-saldo num">${formatar(m, m === 'reais' ? Math.round(saldo) : saldo, { sinal: true })}${m === 'reais' ? '' : `<small>${MOEDAS[m].unidade}</small>`}</span></div>
<div class="proj-barra" role="img" aria-label="${MOEDAS[m].nome}: ${Math.round(frac * 100)}% do ganho previsto já comprometido"><div style="width:${(frac * 100).toFixed(1)}%"></div></div>
<span class="proj-conta">${esc(conta)}</span>
</div>`);
    if (neg) {
      avisos.push(`<div class="aviso" role="status">${ic.cadeado(16)}<span><b>Faltam ${esc(comUn(m, -saldo))} de ${MOEDAS[m].nome.toLowerCase()}.</b> ${esc(sugerirCorte(m, -saldo, recs, eventos))}</span></div>`);
    }
  }
  const poucos = Math.min(taxas.dias_reais, taxas.dias_min);
  let base = '';
  if (!taxas.dias_reais && !taxas.dias_min && !taxas.dias_kcal) base = `<div class="aviso neutro">${ic.relogio(16)}<span>Ainda não há histórico para prever o ganho: a projeção mostra só o que sai.</span></div>`;
  else if (poucos < 28) base = `<span class="nota">Ganho previsto = média do crédito diário × 7, com ${poucos} ${poucos === 1 ? 'dia' : 'dias'} de histórico nas últimas 4 semanas.</span>`;
  else base = '<span class="nota">Ganho previsto = média do crédito diário das últimas 4 semanas × 7.</span>';
  const azul = avisos.length ? '' : `<div class="aviso ok" role="status">${ic.check(16)}<span>O plano fecha no azul nas três moedas.</span></div>`;
  return `<div class="proj-lista" aria-live="polite">${linhas.join('')}</div>${avisos.join('')}${azul}${base}`;
}

// ------------------------------------------------------------ escolha de recompensas

function seletorRecompensas(status, escolhidasIds, semana) {
  if (!status.length) return '<p class="vazio">Nenhuma recompensa cadastrada. Crie as suas no Liberar.</p>';
  return `<div class="sem-escolhas">${status.map((r) => {
    const on = escolhidasIds.includes(r.id);
    const cls = MOEDAS[moedaPrincipal(r)].cls;
    let prev = '';
    if (on && ehCofrinho(r) && Number(r.guardar_semana)) prev = `<span class="sem-escolha-prev"><span>chega a</span><b>${fReais((Number(r.guardado) || 0) + Number(r.guardar_semana))}</b></span>`;
    const cond = r.condicao_ok === false ? ' · pede a meta ligada' : '';
    return `<button type="button" class="sem-escolha ${cls}" aria-pressed="${on}" data-rec="${esc(r.id)}" data-semana="${esc(semana)}">
<span class="sem-estrela">${ic.estrela(18)}</span>
<span class="sem-escolha-txt"><span class="sem-escolha-nome">${esc(r.nome)}</span><span class="sem-escolha-sub">${esc(NIVEL[r.nivel] || 'Média')} · ${esc(custoTexto(r))}${cond}</span></span>
${prev}
</button>`;
  }).join('')}</div>`;
}

// ------------------------------------------------------------ montar

let estado = null;

export async function montar({ api, rota }) {
  const H = hojeBR();
  const S = segundaDe(H);
  const P = addDias(S, 7);
  const aba = rota.q.get('aba') === 'planejar' ? 'planejar' : 'esta';
  const editar = rota.q.get('editar') === '1';
  const diaN = Math.round((new Date(H + 'T12:00:00Z') - new Date(S + 'T12:00:00Z')) / 86400000) + 1;

  const abas = `<div class="sem-abas" role="tablist" aria-label="Período">
<a role="tab" href="#/semana" aria-selected="${aba === 'esta'}">Esta semana<span>${intervaloSemana(S)}</span></a>
<a role="tab" href="#/semana?aba=planejar" aria-selected="${aba === 'planejar'}">Planejar<span>${intervaloSemana(P)}</span></a>
</div>`;
  const topo = `<div class="topo"><div><span class="quando">${esc(dataLonga(H))}</span><h1>Semana</h1></div>
<span class="pilula${aba === 'planejar' ? ' hab' : ''}">${aba === 'esta' ? `dia ${diaN} de 7` : 'fecha dom. à noite'}</span></div>`;

  if (typeof api.metas !== 'function') {
    estado = null;
    return `<div class="tela">${topo}${abas}
<div class="aviso neutro">${ic.cadeado(16)}<span><b>Disponível com a conta conectada.</b> O plano da semana (recompensas, eventos, compromissos e projeção) mora no Supabase.</span></div></div>`;
  }

  const semana = aba === 'planejar' ? P : S;
  const de28 = addDias(S, -28), ate28 = addDias(S, -1);
  const [bd, status, ids, comps, eventos, atividades, sugs, creditos, compsAtual] = await Promise.all([
    api.bancoDisponivel(), api.recompensasStatus(), api.semanaRecompensas(semana), api.compromissos(semana),
    api.semanaEventos(semana), api.atividades(), api.sugestoes(S), api.creditos(de28, ate28),
    aba === 'planejar' ? api.compromissos(S) : Promise.resolve([]),
  ]);
  const livre = livreDe(bd);
  const taxas = taxasDiarias(creditos, de28, ate28);
  const escolhidas = status.filter((r) => ids.includes(r.id));
  estado = { S, P, H, status, ids, comps, compsAtual, eventos, atividades, sugs, semana };
  const estimar = typeof api.estimarRefeicao === 'function';
  const conselho = cartoesConselheiro(sugs, { max: 2 });

  if (aba === 'esta') {
    const mostrarSeletor = editar || !escolhidas.length;
    const rec = `<section class="sem-bloco" aria-labelledby="rec-tit">
<div class="sem-cab"><div><h2 id="rec-tit">Recompensas da semana</h2><span class="nota">${intervaloSemana(S)} · ${escolhidas.length ? `${escolhidas.length} escolhida${escolhidas.length === 1 ? '' : 's'}` : 'nenhuma escolhida ainda'}</span></div>
${escolhidas.length ? `<a class="sem-link" href="${editar ? '#/semana' : '#/semana?editar=1'}">${editar ? 'Pronto' : 'Mudar'}${ic.seta(14)}</a>` : ''}</div>
${mostrarSeletor ? `<div class="card"><div class="sem-passo-cab"><div><h3>${escolhidas.length ? 'Mudar as escolhas' : 'Escolha o que quer ganhar esta semana'}</h3><span class="nota">De 2 a 4 · repetir na semana: 2ª vez × 1,5</span></div><span class="sem-qtd">${escolhidas.length} de 4</span></div>
${seletorRecompensas(status, ids, S)}</div>` : ''}
${escolhidas.map((r) => cartaoRecompensa(r, livre, taxas, H)).join('')}
</section>`;

    const compsH = `<section class="card hab" aria-labelledby="comp-tit">
<div class="card-cab"><div class="sem-cab-txt"><h2 id="comp-tit"><span class="ponto hab"></span>Compromissos da semana</h2><span class="nota">saem das suas metas</span></div>
<a class="sem-link" href="#/metas">Metas${ic.seta(14)}</a></div>
${comps.length ? `<div class="csem-lista">${comps.map((c) => compromissoHtml(c, atividades)).join('')}</div>` : '<p class="vazio">Nenhum compromisso nesta semana. Aplique uma sugestão do Conselheiro ou planeje a próxima.</p>'}
</section>`;

    const reservado = Number(bd.kcal_reservado) || Number(bd.reais_reservado)
      ? `<span class="nota">Reservado no banco agora: ${[Number(bd.kcal_reservado) ? `${fNum(bd.kcal_reservado)} kcal` : '', Number(bd.reais_reservado) ? fReais(bd.reais_reservado) : ''].filter(Boolean).join(' e ')}. Ao marcar "aconteceu", a reserva sai; registre o que foi de verdade em Registrar.</span>`
      : '';
    const evH = `<section class="card" aria-labelledby="ev-tit">
<div class="card-cab"><div class="sem-cab-txt"><h2 id="ev-tit">O que pode me tirar da meta</h2><span class="nota">fica reservado no banco antes de acontecer</span></div></div>
<div class="sem-evs">${eventos.length ? eventos.map((e) => eventoHtml(e)).join('') : '<p class="vazio">Nenhum evento nesta semana.</p>'}</div>
${reservado}
${formEvento(S, H, estimar)}
</section>`;

    const prox = `<section class="card sem-prox" aria-labelledby="prox-tit">
<div class="sem-cab-txt"><h2 id="prox-tit">Próxima semana · ${intervaloSemana(P)}</h2>
<span class="nota">O plano fecha no domingo, ${dataCurta(addDias(S, 6))}, à noite. As escolhas já podem ser adiantadas.</span></div>
<a class="btn primario largo" href="#/semana?aba=planejar">Planejar a semana${ic.seta(16)}</a>
</section>`;

    return `<div class="tela">${topo}${abas}
<div class="sem-grade"><div class="sem-col">${rec}${compsH}</div><div class="sem-col">${evH}${conselho}${prox}</div></div></div>`;
  }

  // ---- planejar a próxima semana
  const passo = (n, tit, sub, lado = '') => `<div class="sem-passo-cab"><span class="sem-num">${n}</span><div><h2 id="p${n}">${tit}</h2>${sub ? `<span class="nota">${sub}</span>` : ''}</div>${lado}</div>`;
  const n = escolhidas.length;
  const p1 = `<section class="card" aria-labelledby="p1">
${passo(1, 'O que quero ganhar', 'De 2 a 4 · repetir na semana: 2ª vez × 1,5', `<span class="sem-qtd">${n} de 4</span>`)}
${seletorRecompensas(status, ids, P)}
${n && n < 2 ? '<span class="nota cor-no" role="status">Escolha pelo menos 2 para a semana ter o que perseguir.</span>' : ''}
</section>`;

  const p2 = `<section class="card" aria-labelledby="p2">
${passo(2, 'O que pode me tirar da meta', 'Fica reservado no banco antes de acontecer')}
<div class="sem-evs">${eventos.length ? eventos.map((e) => eventoHtml(e, { aconteceu: false })).join('') : '<p class="vazio">Nenhum evento previsto. Jantar, viagem, presente: reserve antes.</p>'}</div>
${formEvento(P, H, estimar)}
</section>`;

  const copiar = !comps.length && compsAtual.length
    ? `<button type="button" class="btn tracejado" data-copiar-comps>${ic.troca(16)}Repetir os ${compsAtual.length} compromissos desta semana</button>` : '';
  const p3 = `<section class="card hab" aria-labelledby="p3">
${passo(3, 'Compromissos da semana', 'Treinos, sono, atividades e passos', '<a class="sem-link" href="#/metas">das metas</a>')}
${comps.length ? `<div class="csem-lista">${comps.map((c) => compromissoHtml(c, atividades, { excluir: true })).join('')}</div>` : '<p class="vazio">Nenhum compromisso ainda.</p>'}
${copiar}
${formCompromisso(P, atividades)}
</section>`;

  const p4 = `<section class="card" aria-labelledby="p4">
${passo(4, 'Projeção da semana', '', '<span class="nota">recalcula a cada mudança</span>')}
${projecaoHtml({ taxas, eventos, recs: escolhidas, livre })}
</section>`;

  return `<div class="tela">${topo}${abas}
<div class="sem-grade"><div class="sem-col">${p1}${p2}</div><div class="sem-col">${p3}${conselho}${p4}</div></div></div>`;
}

// ------------------------------------------------------------ ligar

export function ligar(raiz, ctx) {
  const { api, recarregar } = ctx;
  if (!estado) return;
  const st = estado;
  ligarConselheiro(raiz, ctx, st.sugs);

  const agir = async (btn, fn, ok) => {
    btn.disabled = true;
    try {
      await fn();
      if (ok) toast(ok);
      recarregar();
    } catch (e) {
      toast(e.message || String(e), 'erro');
      btn.disabled = false;
    }
  };

  // formulários abertos continuam abertos depois do recarregar
  raiz.querySelectorAll('details.sem-add').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) abertos.add(d.dataset.chave); else abertos.delete(d.dataset.chave);
  }));

  // escolher recompensas (estrela)
  raiz.querySelectorAll('.sem-escolha').forEach((b) => b.addEventListener('click', () => {
    const quer = b.getAttribute('aria-pressed') !== 'true';
    const marcadas = raiz.querySelectorAll(`.sem-escolha[data-semana="${b.dataset.semana}"][aria-pressed="true"]`).length;
    if (quer && marcadas >= 4) { toast('Máximo de 4. Desmarque uma para trocar.', 'erro'); return; }
    b.setAttribute('aria-pressed', String(quer));
    agir(b, () => api.marcarRecompensaSemana(b.dataset.semana, b.dataset.rec, quer));
  }));

  // eventos
  raiz.querySelectorAll('[data-ev-aconteceu]').forEach((b) => b.addEventListener('click', () =>
    agir(b, () => api.marcarEventoRealizado(b.dataset.evAconteceu, true), 'Reserva liberada. Registre o que foi de verdade.')));
  raiz.querySelectorAll('[data-ev-desfazer]').forEach((b) => b.addEventListener('click', () =>
    agir(b, () => api.marcarEventoRealizado(b.dataset.evDesfazer, false), 'Voltou a reservar')));
  raiz.querySelectorAll('[data-ev-excluir], [data-excluir-comp]').forEach((b) => b.addEventListener('click', () => {
    // dois toques: o primeiro arma, o segundo exclui
    if (!b.classList.contains('armado')) {
      raiz.querySelectorAll('.armado').forEach((x) => x.classList.remove('armado'));
      b.classList.add('armado');
      b.dataset.rotulo = b.getAttribute('aria-label');
      b.setAttribute('aria-label', 'Toque de novo para excluir');
      toast('Toque de novo para excluir');
      return;
    }
    if (b.dataset.evExcluir) agir(b, () => api.excluirEvento(b.dataset.evExcluir), 'Evento excluído');
    else agir(b, () => api.excluirCompromisso(b.dataset.excluirComp), 'Compromisso excluído');
  }));

  raiz.querySelectorAll('[data-form-evento]').forEach((form) => {
    const erro = form.querySelector('.sem-erro');
    const btnEst = form.querySelector('[data-estimar]');
    if (btnEst) btnEst.addEventListener('click', async () => {
      const texto = form.descricao.value.trim();
      const saida = form.querySelector('[data-estimativa]');
      if (!texto) { erro.textContent = 'Escreva o que é (ex.: rodízio de pizza com 2 cervejas) para estimar.'; form.descricao.focus(); return; }
      erro.textContent = '';
      btnEst.disabled = true;
      btnEst.textContent = 'Estimando…';
      try {
        const est = await api.estimarRefeicao(texto);
        const k = Math.round(Number(est && est.total_kcal) || 0);
        form.kcal.value = k ? String(k) : '';
        saida.textContent = k ? `Estimativa da IA: ~${fmt(k)} kcal. Ajuste se quiser.` : 'A IA não chegou a um número; preencha à mão.';
      } catch (e) {
        saida.textContent = '';
        erro.textContent = e.message || String(e);
      } finally {
        btnEst.disabled = false;
        btnEst.innerHTML = `${ic.brilho(16)}Estimar de novo`;
      }
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const descricao = form.descricao.value.trim();
      const kTxt = form.kcal.value.trim(), rTxt = form.reais.value.trim();
      const kcal = kTxt ? Math.round(lerNumero(kTxt)) : 0;
      const reais = rTxt ? Math.round(lerNumero(rTxt) * 100) / 100 : 0;
      if (!descricao) { erro.textContent = 'Diga o que é o evento.'; form.descricao.focus(); return; }
      if (Number.isNaN(kcal) || kcal < 0) { erro.textContent = 'kcal precisa ser um número a partir de 0.'; form.kcal.focus(); return; }
      if (Number.isNaN(reais) || reais < 0) { erro.textContent = 'R$ precisa ser um valor a partir de 0.'; form.reais.focus(); return; }
      if (!kcal && !reais) { erro.textContent = 'Informe kcal ou R$ para reservar.'; form.kcal.focus(); return; }
      erro.textContent = '';
      const btn = form.querySelector('button[type="submit"]');
      agir(btn, () => api.adicionarEvento({
        semana: form.dataset.formEvento, data: form.data.value || null, descricao, kcal, reais, imprevisto: form.imprevisto.checked,
      }), 'Reservado no banco');
    });
  });

  // compromissos
  raiz.querySelectorAll('[data-form-comp]').forEach((form) => {
    const erro = form.querySelector('.sem-erro');
    const nota = form.querySelector('[data-unidade]');
    const NOTAS = {
      treinos: 'Treinos de 20 min ou mais contados pelo Garmin.',
      deitar_ate: 'Noites na semana em que o Garmin viu você dormir até o horário. Máximo 7.',
      minutos_atividade: 'Minutos registrados no Lastro para a atividade, somados na semana.',
      passos_dias: 'Dias da semana com a meta de passos batida. Máximo 7.',
    };
    const mostrar = () => {
      const t = form.tipo.value;
      form.querySelectorAll('[data-para]').forEach((el) => { el.hidden = el.dataset.para !== t; });
      nota.textContent = NOTAS[t];
    };
    form.tipo.addEventListener('change', () => {
      const t = TIPOS_COMP.find((x) => x.id === form.tipo.value);
      form.alvo.value = String(t.alvo);
      mostrar();
    });
    mostrar();
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const tipo = form.tipo.value;
      const alvo = lerNumero(form.alvo.value);
      if (!(alvo > 0)) { erro.textContent = 'O alvo precisa ser maior que zero.'; form.alvo.focus(); return; }
      if ((tipo === 'deitar_ate' || tipo === 'passos_dias') && (alvo > 7 || !Number.isInteger(alvo))) { erro.textContent = 'Conta em dias: de 1 a 7.'; form.alvo.focus(); return; }
      const parametros = {};
      let titulo = form.titulo.value.trim();
      if (tipo === 'treinos') titulo = titulo || `Treinar ${fmt(alvo)}× na semana`;
      if (tipo === 'deitar_ate') {
        const hora = form.hora.value || '23:00';
        parametros.hora = hora;
        titulo = titulo || `Deitar até ${hora} em ${fmt(alvo)} noites`;
      }
      if (tipo === 'minutos_atividade') {
        if (!form.atividade.value) { erro.textContent = 'Cadastre uma atividade produtiva primeiro.'; return; }
        parametros.atividade_id = form.atividade.value;
        const nome = form.atividade.selectedOptions[0].textContent;
        titulo = titulo || `${nome}: ${fmt(alvo)} min na semana`;
      }
      if (tipo === 'passos_dias') {
        const meta = Math.round(lerNumero(form.meta.value));
        if (!(meta > 0)) { erro.textContent = 'Informe a meta de passos por dia.'; form.meta.focus(); return; }
        parametros.meta = meta;
        titulo = titulo || `${fmt(meta)} passos em ${fmt(alvo)} dias`;
      }
      erro.textContent = '';
      const btn = form.querySelector('button[type="submit"]');
      agir(btn, () => api.adicionarCompromisso({ semana: form.dataset.formComp, titulo, tipo, alvo, parametros }), 'Compromisso adicionado');
    });
  });

  const copiar = raiz.querySelector('[data-copiar-comps]');
  if (copiar) copiar.addEventListener('click', () => agir(copiar, async () => {
    for (const c of st.compsAtual) {
      await api.adicionarCompromisso({ semana: st.P, titulo: c.titulo, tipo: c.tipo, alvo: c.alvo, parametros: c.parametros || {}, meta_id: c.meta_id || null });
    }
  }, 'Compromissos repetidos na próxima semana'));
}
