// Início: banco das três moedas, o dia de hoje em anéis, hábitos x de y, Garmin e vícios com barra, atalho Liberar.

import { hojeBR, addDias, dataLonga, quandoFoi, esc, ic, anel, barra, linha, fNum, fReais, fDuracao, fmt, clamp01, MENOS } from '../ui.js';
import { bancoHtml, avaliar } from './comum.js';

export async function montar({ api }) {
  const H = hojeBR();
  const de = addDias(H, -6);
  const [banco, creditos, habitos, garmin, tempos, atividades, recompensas, sinc] = await Promise.all([
    api.banco(), api.creditos(de, H), api.habitosDia(H), api.garminPeriodo(addDias(H, -13), H),
    api.tempos(H), api.atividades(), api.recompensas(), api.ultimaSinc(),
  ]);
  const hoje = creditos.find((c) => c.data === H) || null;
  const gHoje = garmin.find((g) => g.data === H) || null;

  // ---- banco
  const aguardando = Number(banco.dias_aguardando_garmin) || 0;
  const pilulas = [
    aguardando ? `<span class="pilula hab">${ic.relogio(14)}${aguardando === 1 ? '1 dia aguarda o Garmin' : `${aguardando} dias aguardam o Garmin`}</span>` : '',
    `<span class="pilula">${ic.relogioPulso(14)}Garmin ${sinc ? 'sincronizou ' + quandoFoi(sinc.sincronizado_em) : 'ainda não sincronizou'}</span>`,
  ].join('');

  // ---- hoje em anéis
  const tiles = [];
  if (hoje && hoje.gasto_kcal !== null) {
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

  // ---- trocas disponíveis
  const disp = recompensas.filter((r) => !avaliar(r, banco).bloq).length;

  return `<div class="tela">
<div class="topo"><div><span class="quando">${esc(dataLonga(H))}</span><h1>Início</h1></div><span class="pilula">dia aberto</span></div>

${bancoHtml(banco, creditos, { lado: 'últimos 7 dias nas barras' })}
<div class="banco-rodape">${pilulas}</div>

<a class="cta" href="#/liberar"><span class="esq">${ic.aberto(22)}Liberar</span><span class="dir">${disp === 1 ? '1 troca disponível' : `${disp} trocas disponíveis`}${ic.seta(16)}</span></a>

<section class="card" aria-labelledby="hoje-tit">
<div class="card-cab"><h2 id="hoje-tit">Hoje</h2><a class="lado" href="#/dia" style="display:flex;align-items:center;gap:4px;min-height:44px;margin:-8px 0">ver o dia${ic.seta(14)}</a></div>
<div class="hoje-aneis">${tiles.join('')}</div>
<span class="nota">Anel de calorias e dinheiro: quanto do orçamento do dia já foi. Tempo: parte produtiva do dia. O crédito entra no banco quando o dia fecha${hoje && hoje.gasto_kcal !== null ? '' : ' e o Garmin sincroniza'}.</span>
</section>

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

function tile(cls, nome, anelHtml, det) {
  return `<div class="hoje-moeda ${cls}"><span class="nome"><span class="ponto ${cls}"></span>${nome}</span>${anelHtml}<span class="det">${det}</span></div>`;
}

function metrica(icone, nome, valor, v, meta, cor) {
  const ok = v >= meta;
  return `<div class="metrica"><div class="topo-m"><span class="nome-m"><span class="ico-m" style="background:var(--soft)">${icone}</span>${nome}</span><span class="valor-m">${valor}</span></div>
<div class="barra" style="height:8px" role="img" aria-label="${esc(nome)}: ${Math.round(clamp01(v / meta) * 100)}% da meta"><div style="width:${(clamp01(v / meta) * 100).toFixed(1)}%;background:${ok ? 'var(--ok)' : (cor || 'var(--hab)')}"></div></div></div>`;
}
