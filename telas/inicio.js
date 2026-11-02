// Início: recompensas da semana no topo (com quanto o banco livre já cobre), banco das três moedas,
// Conselheiro, o dia de hoje em anéis, compromissos da semana, hábitos, Garmin e vícios.

import { hojeBR, addDias, dataLonga, quandoFoi, esc, ic, anel, barra, linha, fNum, fReais, fDuracao, fmt, clamp01, MENOS } from '../ui.js';
import { bancoHtml, avaliar } from './comum.js';
import { cartoesConselheiro, ligarConselheiro } from './conselheiro.js';
import { previsaoDia } from './previsao.js';
import { ligarSincronizar, chipGarmin } from './sincronizar.js';
import { segundaDe, intervaloSemana, livreDe, taxasDiarias, custoEfetivo, cartaoRecompensa, compromissoHtml } from './semana.js';

let estado = null;

export async function montar({ api }) {
  const H = hojeBR();
  const de = addDias(H, -6);
  const S = segundaDe(H);
  const de28 = addDias(S, -28), ate28 = addDias(S, -1);
  const novo = typeof api.metas === 'function';

  const [banco, creditosTodos, habitos, garmin, tempos, atividades, recompensas, sinc, plano] = await Promise.all([
    novo ? api.bancoDisponivel().catch(() => api.banco()) : api.banco(),
    api.creditos(de28 < de ? de28 : de, H), api.habitosDia(H), api.garminPeriodo(addDias(H, -13), H),
    api.tempos(H), api.atividades(), api.recompensas(), api.ultimaSinc(),
    // plano da semana: se falhar (migração não aplicada, rede), o resto do Início continua de pé
    novo
      ? Promise.all([api.recompensasStatus(), api.semanaRecompensas(S), api.compromissos(S), api.sugestoes(S)])
        .then(([status, ids, comps, sugs]) => ({ status, ids, comps, sugs }))
        .catch((e) => ({ erro: e.message || String(e) }))
      : Promise.resolve(null),
  ]);
  const creditos = creditosTodos.filter((c) => c.data >= de);
  const hoje = creditos.find((c) => c.data === H) || null;
  const gHoje = garmin.find((g) => g.data === H) || null;
  const livre = livreDe(banco);
  const taxas = taxasDiarias(creditosTodos, de28, ate28);
  estado = { sugs: plano && !plano.erro ? plano.sugs : [] };

  // ---- recompensas da semana (faixa do topo)
  let faixa;
  if (!plano) {
    faixa = `<section class="rec-faixa" aria-labelledby="rec-tit">
<div class="rec-cab"><div><h2 id="rec-tit">Recompensas da semana</h2><span class="nota">${intervaloSemana(S)}</span></div></div>
<div class="aviso neutro">${ic.cadeado(16)}<span><b>Disponível com a conta conectada.</b> No modo demonstração o plano da semana não é salvo.</span></div>
</section>`;
  } else if (plano.erro) {
    faixa = `<section class="rec-faixa" aria-labelledby="rec-tit">
<div class="rec-cab"><div><h2 id="rec-tit">Recompensas da semana</h2><span class="nota">${intervaloSemana(S)}</span></div></div>
<div class="aviso neutro">${ic.x(16)}<span>Não deu para carregar o plano da semana: ${esc(plano.erro)}</span></div>
</section>`;
  } else {
    const escolhidas = plano.status.filter((r) => plano.ids.includes(r.id));
    faixa = `<section class="rec-faixa" aria-labelledby="rec-tit">
<div class="rec-cab"><div><h2 id="rec-tit">Recompensas da semana</h2><span class="nota">${intervaloSemana(S)}${escolhidas.length ? ' · a barra é o que o banco livre já cobre' : ''}</span></div>
<a class="sem-link" href="#/semana">${escolhidas.length ? 'Semana' : 'Escolher'}${ic.seta(14)}</a></div>
${escolhidas.length
    ? `<div class="rec-grade">${escolhidas.map((r) => cartaoRecompensa(r, livre, taxas, H)).join('')}</div>`
    : `<a class="rec-convite" href="#/semana"><span class="rec-convite-ico">${ic.estrela(22)}</span>
<span class="rec-convite-txt"><b>Escolha o que quer ganhar esta semana</b><span>De 2 a 4 recompensas. A barra mostra quanto o banco já cobre de cada uma.</span></span>${ic.seta(18)}</a>`}
</section>`;
  }

  // ---- banco
  const aguardando = Number(banco.dias_aguardando_garmin) || 0;
  const resK = Number(banco.kcal_reservado) || 0, resR = Number(banco.reais_reservado) || 0;
  const pilulas = [
    aguardando ? `<span class="pilula hab">${ic.relogio(14)}${aguardando === 1 ? '1 dia aguarda o Garmin' : `${aguardando} dias aguardam o Garmin`}</span>` : '',
    resK || resR ? `<a class="pilula" href="#/semana">${ic.cadeado(14)}reservado ${[resK ? `${fNum(resK)} kcal` : '', resR ? fReais(resR) : ''].filter(Boolean).join(' · ')}</a>` : '',
  ].join('');

  // ---- trocas disponíveis: com o plano, pelo saldo livre e o multiplicador da semana
  let disp;
  if (plano && !plano.erro) {
    disp = plano.status.filter((r) => {
      if (r.condicao_ok === false) return false;
      const c = custoEfetivo(r);
      return !avaliar({ custo_kcal: c.kcal, custo_reais: c.reais, custo_min: c.min }, livre).bloq;
    }).length;
  } else {
    disp = recompensas.filter((r) => !avaliar(r, banco).bloq).length;
  }

  // ---- hoje em anéis
  const tiles = [];
  const prev = previsaoDia(garmin, H);
  if (hoje && hoje.gasto_kcal !== null && prev) {
    // centro: o crédito real até agora (o mesmo do Dia); embaixo, separada, a previsão até a meia-noite
    const orc = Math.max(0, Number(hoje.gasto_kcal) - Number(hoje.deficit_meta));
    const comeu = Number(hoje.consumo_kcal);
    const cred = Number(hoje.credito_kcal);
    const pode = prev.previsto - comeu - Number(hoje.deficit_meta);
    const cor = cred < 0 ? 'var(--no)' : 'var(--cal)';
    const arred = (v) => Math.round(v / 10) * 10;
    tiles.push(tile('cal', 'Calorias', anel({ pct: orc > 0 ? comeu / orc : 1, cor, trilho: 'var(--cal-soft)', tam: 84, esp: 9,
      centro: `<span class="medio num" style="color:${cor}">${fNum(cred, { sinal: true })}</span><span class="mini">até agora</span>`,
      rotulo: `Crédito real até agora ${fNum(cred, { sinal: true })} kcal; pela previsão ${pode >= 0 ? 'ainda pode comer' : 'vai passar'} cerca de ${fmt(arred(Math.abs(pode)))}` }),
      `previsão: ${pode >= 0 ? `pode comer ~${fmt(arred(pode))}` : `passa ~${fmt(arred(-pode))}`}`));
  } else if (hoje && hoje.gasto_kcal !== null) {
    const orc = Number(hoje.gasto_kcal) - Number(hoje.deficit_meta);
    const p = orc > 0 ? Number(hoje.consumo_kcal) / orc : 1;
    const cor = Number(hoje.credito_kcal) < 0 ? 'var(--no)' : 'var(--cal)';
    tiles.push(tile('cal', 'Calorias', anel({ pct: p, cor, trilho: 'var(--cal-soft)', tam: 84, esp: 9,
      centro: `<span class="medio num" style="color:${cor}">${fNum(hoje.credito_kcal, { sinal: true })}</span><span class="mini">kcal</span>`,
      rotulo: `Consumiu ${fmt(hoje.consumo_kcal)} de ${fmt(orc)} kcal` }), `${fmt(hoje.consumo_kcal)} de ${fmt(Math.max(0, orc))} kcal`));
  } else {
    tiles.push(tile('cal', 'Calorias', anel({ pct: 0, cor: 'var(--cal)', trilho: 'var(--cal-soft)', tam: 84, esp: 9, tracejado: true,
      centro: `<span class="medio">—</span><span class="mini">kcal</span>`, rotulo: 'Calorias aguardam o Garmin' }),
    `${fmt(hoje ? hoje.consumo_kcal : 0)} kcal comidas · aguarda o Garmin`));
  }
  if (hoje) {
    const teto = Number(hoje.teto_reais), gasto = Number(hoje.gasto_reais);
    const corD = Number(hoje.credito_reais) < 0 ? 'var(--no)' : 'var(--din)';
    tiles.push(tile('din', 'Dinheiro', anel({ pct: teto > 0 ? gasto / teto : 1, cor: corD, trilho: 'var(--din-soft)', tam: 84, esp: 9,
      centro: `<span class="medio num" style="color:${corD}">${fReais(hoje.credito_reais, { sinal: true })}</span><span class="mini">sobra</span>`,
      rotulo: `Gastou ${fReais(gasto)} de ${fReais(teto)}` }), `${fReais(gasto)} de ${fReais(teto)}`));
    const prod = Number(hoje.produtivo_min), custo = Number(hoje.vicio_custo_min);
    const corT = Number(hoje.credito_min) < 0 ? 'var(--no)' : 'var(--tmp)';
    tiles.push(tile('tmp', 'Tempo', anel({ pct: prod + custo > 0 ? prod / (prod + custo) : 0, cor: corT, trilho: custo > 0 ? 'var(--no-soft)' : 'var(--tmp-soft)', tam: 84, esp: 9,
      centro: `<span class="medio num" style="color:${corT}">${fNum(hoje.credito_min, { sinal: true })}</span><span class="mini">min</span>`,
      rotulo: `${prod} minutos produtivos e ${custo} de custo de vício` }), `+${prod} produtivo · ${custo ? MENOS + custo : '0'} vício`));
  }

  // ---- compromissos da semana
  let compsHtml = '';
  if (plano && !plano.erro) {
    compsHtml = `<section class="card hab" aria-labelledby="comp-tit">
<div class="card-cab"><div class="sem-cab-txt"><h2 id="comp-tit"><span class="ponto hab"></span>Compromissos da semana</h2><span class="nota">saem das suas metas</span></div>
<a class="sem-link" href="#/semana?aba=planejar">Planejar${ic.seta(14)}</a></div>
${plano.comps.length
    ? `<div class="csem-lista">${plano.comps.map((c) => compromissoHtml(c, atividades)).join('')}</div>`
    : '<p class="vazio">Nenhum compromisso nesta semana. Planeje treinos, sono e leitura na Semana.</p>'}
</section>`;
  }

  // ---- hábitos
  const total = habitos.length;
  const feitos = habitos.filter((h) => h.status === 'fiz').length;
  const falhos = habitos.filter((h) => h.status === 'nao').length;
  const abertos = habitos.filter((h) => !h.status);
  const semMarca = abertos.filter((h) => h.fonte === 'manual').length;
  const fichas = habitos.map((h) => {
    const cls = h.status === 'fiz' ? 'fiz' : h.status === 'nao' ? 'nao' : 'pend';
    const icone = h.status === 'fiz' ? ic.check(14) : h.status === 'nao' ? ic.x(14) : ic.pendente(14);
    return `<span class="ficha ${cls}">${icone}${esc(h.nome)}</span>`;
  }).join('');

  // ---- Garmin
  const metaPassos = Number((habitos.find((h) => h.regra === 'passos') || {}).parametros?.meta) || 8000;
  const habSono = habitos.find((h) => h.regra === 'sono');
  const metaSonoH = Number(habSono?.parametros?.horas) || 7;
  const metaScore = Number(habSono?.parametros?.score) || 70;
  const pesos = garmin.map((g) => (g.peso_kg === null || g.peso_kg === undefined ? null : Number(g.peso_kg)));
  const ult7 = pesos.slice(-7).filter((p) => p !== null);
  const media7 = ult7.length ? ult7.reduce((a, b) => a + b, 0) / ult7.length : null;
  const ultimoPeso = [...garmin].reverse().find((g) => g.peso_kg !== null && g.peso_kg !== undefined);
  let garminHtml;
  if (gHoje) {
    const m = [];
    if (gHoje.passos !== null) m.push(metrica(ic.passos(16), 'Passos', `<b class="num">${fmt(gHoje.passos)}</b> / ${fmt(metaPassos)}`, gHoje.passos, metaPassos));
    if (gHoje.sono_min !== null) m.push(metrica(ic.lua(16), 'Sono', `<b class="num">${fDuracao(gHoje.sono_min)}</b> / ${metaSonoH}h`, gHoje.sono_min, metaSonoH * 60));
    if (gHoje.sono_score !== null) m.push(metrica(ic.alvo(16), 'Score do sono', `<b class="num">${gHoje.sono_score}</b> / ${metaScore}`, gHoje.sono_score, metaScore));
    if (gHoje.body_battery_max !== null) m.push(metrica(ic.raio(16), 'Body Battery', `<b class="num">${gHoje.body_battery_max}</b> / 100`, gHoje.body_battery_max, 100, 'var(--tmp)'));
    garminHtml = `<div class="metricas">${m.join('')}</div>`;
  } else {
    garminHtml = `<div class="aviso neutro">${ic.relogio(16)}<span>O Garmin ainda não mandou o dia de hoje. Rode a coleta para ver passos, sono e peso.</span></div>`;
  }
  const pesoHtml = ultimoPeso ? `<div class="item" style="border-top:1px solid var(--line)">
<span class="ico-m" style="background:var(--soft)">${ic.peso(16)}</span>
<span class="txt"><span><b class="num" style="font-size:18px">${fmt(ultimoPeso.peso_kg, 1)}</b> kg</span><small>${media7 !== null ? `média 7 dias ${fmt(media7, 1)} kg` : ''}${ultimoPeso.data !== H ? ` · pesou em ${ultimoPeso.data.slice(8, 10)}/${ultimoPeso.data.slice(5, 7)}` : ''}</small></span>
${linha(pesos, { cor: 'var(--din)' })}</div>` : '';

  // ---- vícios de hoje (registro de tempo)
  const usoPorAtv = {};
  for (const t of tempos) usoPorAtv[t.atividade_id] = (usoPorAtv[t.atividade_id] || 0) + Number(t.minutos);
  const vicios = atividades.filter((a) => a.tipo === 'vicio');
  const viciosHtml = vicios.map((a) => {
    const uso = usoPorAtv[a.id] || 0;
    const lim = a.limite_diario_min;
    if (lim === 0) {
      return `<div class="metrica"><div class="topo-m"><span class="nome-m">${esc(a.nome)}</span><span class="valor-m cor-no" style="display:flex;gap:4px;align-items:center">${ic.cadeado(14)}bloqueado</span></div>${barra(1, 1, { cor: 'var(--no-soft)', rotulo: `${a.nome} bloqueado` })}</div>`;
    }
    const resta = lim !== null ? lim - uso : null;
    const txt = lim !== null ? `<b class="num">${uso}</b> / ${lim} min` : `<b class="num">${uso}</b> min`;
    const sub = resta === null ? '' : resta >= 0 ? `${resta} min restantes` : `${-resta} min acima do limite`;
    return `<div class="metrica"><div class="topo-m"><span class="nome-m">${esc(a.nome)}</span><span class="valor-m">${txt}</span></div>
${barra(uso, lim ?? Math.max(uso, 1), { cor: 'var(--tmp)', rotulo: `${a.nome}: ${uso} de ${lim ?? '—'} minutos` })}
<span class="nota${resta !== null && resta < 0 ? ' cor-no' : ''}">${sub}</span></div>`;
  }).join('');

  const conselho = plano && !plano.erro ? cartoesConselheiro(plano.sugs, { max: 1, vazio: false }) : '';

  return `<div class="tela">
<div class="topo"><div><span class="quando">${esc(dataLonga(H))}</span><h1>Início</h1></div>
<div class="ini-topo-dir">${chipGarmin(sinc)}<a class="btn-icone" href="#/ajustes" aria-label="Ajustes">${ic.ajustes(20)}</a></div></div>

${faixa}

${bancoHtml(banco, creditos, { lado: 'últimos 7 dias nas barras' })}
<div class="banco-rodape">${pilulas}</div>

<div class="ini-acoes">
<a class="cta" href="#/liberar"><span class="esq">${ic.aberto(22)}Liberar</span><span class="dir">${disp === 1 ? '1 troca disponível' : `${disp} trocas disponíveis`}${ic.seta(16)}</span></a>
<a class="btn ini-registrar" href="#/registrar">${ic.registrar(20)}Registrar</a>
</div>

${conselho}

<section class="card" aria-labelledby="hoje-tit">
<div class="card-cab"><h2 id="hoje-tit">Hoje</h2><a class="lado" href="#/dia" style="display:flex;align-items:center;gap:4px;min-height:44px;margin:-8px 0">ver o dia${ic.seta(14)}</a></div>
<div class="hoje-aneis">${tiles.join('')}</div>
<span class="nota">Calorias: no centro, o crédito real até agora (gasto do Garmin − comeu − déficit); embaixo, a previsão até a meia-noite. Dinheiro: quanto do teto do dia já foi. Tempo: parte produtiva do dia. O crédito entra no banco quando o dia fecha.</span>
</section>

${compsHtml}

<section class="card hab" aria-labelledby="hab-tit">
<div class="card-cab"><h2 id="hab-tit"><span class="ponto hab"></span>Hábitos de hoje</h2><span class="lado">${semMarca ? `${semMarca} sem marcação` : 'tudo marcado'}</span></div>
<div class="habitos-topo">
${anel({ pct: total ? feitos / total : 0, cor: 'var(--hab)', trilho: 'var(--hab-soft)', tam: 104, esp: 11,
    centro: `<span class="grande num">${feitos}<span style="font-size:15px;color:var(--sub);font-weight:500">/${total}</span></span><span class="mini">cumpridos</span>`,
    rotulo: `${feitos} de ${total} hábitos cumpridos` })}
<div class="resumo">
<b>${feitos} de ${total} cumpridos</b>
<span class="nota">${falhos ? `${falhos} não ${falhos === 1 ? 'cumprido' : 'cumpridos'} · ` : ''}${abertos.length} em aberto</span>
${semMarca ? `<a class="btn tracejado" href="#/dia" style="align-self:flex-start;margin-top:4px">Marcar fiz / não fiz</a>` : ''}
</div>
</div>
<div class="fichas">${fichas}</div>
</section>

<section class="card" aria-labelledby="garmin-tit">
<div class="card-cab"><h2 id="garmin-tit">${ic.relogioPulso(18)}Do Garmin</h2><span class="lado">${gHoje ? 'hoje, até agora' : 'sem dados de hoje'}</span></div>
${garminHtml}
${pesoHtml}
</section>

${vicios.length ? `<section class="card tmp" aria-labelledby="vicio-tit">
<div class="card-cab"><h2 id="vicio-tit"><span class="ponto tmp"></span>Vícios hoje</h2><span class="lado">uso × limite do dia</span></div>
<div class="metricas">${viciosHtml}</div>
<span class="nota">Uso registrado no Lastro. Minuto de vício custa × fator no tempo. WhatsApp e apps essenciais ficam sempre liberados.</span>
</section>` : ''}
</div>`;
}

export function ligar(raiz, ctx) {
  if (estado && estado.sugs.length) ligarConselheiro(raiz, ctx, estado.sugs);
  ligarSincronizar(raiz, ctx);
}

function tile(cls, nome, anelHtml, det) {
  return `<div class="hoje-moeda ${cls}"><span class="nome"><span class="ponto ${cls}"></span>${nome}</span>${anelHtml}<span class="det">${det}</span></div>`;
}

function metrica(icone, nome, valor, v, meta, cor) {
  const ok = v >= meta;
  return `<div class="metrica"><div class="topo-m"><span class="nome-m"><span class="ico-m" style="background:var(--soft)">${icone}</span>${nome}</span><span class="valor-m">${valor}</span></div>
<div class="barra" style="height:8px" role="img" aria-label="${esc(nome)}: ${Math.round(clamp01(v / meta) * 100)}% da meta"><div style="width:${(clamp01(v / meta) * 100).toFixed(1)}%;background:${ok ? 'var(--ok)' : (cor || 'var(--hab)')}"></div></div></div>`;
}
