// Calorias de hoje em duas contas separadas:
//   até agora (real): o gasto que o Garmin já registrou − o que comeu − a meta de déficit
//   até a meia-noite (previsão): o gasto de hoje + o gasto em repouso nas horas que faltam − comeu − déficit

import { fmt, fNum, FUSO, MENOS } from '../ui.js';

// hora do dia (0–24, com fração) de um instante, no fuso de São Paulo
function horaDoDia(iso) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const v = (t) => Number(p.find((x) => x.type === t).value);
  return (v('hour') % 24) + v('minute') / 60;
}

// garmin: linhas de garmin_dia (inclui as de hoje e as anteriores); H: hoje AAAA-MM-DD.
// Previsão = o que já gastou hoje + o ritmo de repouso de hoje (basal até agora ÷ horas passadas) × as horas que faltam.
// Exercício novo depois disso não entra: se treinar de novo, o gasto real sobe.
export function previsaoDia(garmin, H) {
  const hoje = (garmin || []).find((g) => g.data === H);
  if (hoje && hoje.calorias_total !== null && hoje.calorias_bmr !== null && (hoje.dados_ate || hoje.sincronizado_em)) {
    // as horas passadas contam até o momento dos dados: até onde o relógio já mandou (dados_ate, hora local);
    // sem essa informação, a hora da coleta
    const horas = hoje.dados_ate
      ? Number(String(hoje.dados_ate).slice(11, 13)) + Number(String(hoje.dados_ate).slice(14, 16)) / 60
      : horaDoDia(hoje.sincronizado_em);
    if (horas >= 1) {
      const porHora = Number(hoje.calorias_bmr) / horas;
      const faltam = Math.max(0, 24 - horas);
      const repousoRestante = Math.round(porHora * faltam);
      const gastoAgora = Math.round(Number(hoje.calorias_total));
      return {
        previsto: gastoAgora + repousoRestante, gastoAgora, repousoRestante,
        horas: Math.round(horas * 10) / 10, faltam: Math.round(faltam * 10) / 10, porHora: Math.round(porHora),
        ativasHoje: Math.round(Number(hoje.calorias_ativas || 0)), fonte: 'hoje',
      };
    }
  }
  // sem dados de hoje: a média dos últimos 7 dias completos
  const completos = (garmin || [])
    .filter((g) => g.data < H && g.calorias_total !== null)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(-7);
  if (!completos.length) return null;
  const media = Math.round(completos.reduce((s, g) => s + Number(g.calorias_total), 0) / completos.length);
  return { previsto: media, dias: completos.length, fonte: 'media' };
}

// A conta em linhas: cada parcela numa linha (rótulo à esquerda, valor à direita) e o resultado embaixo,
// separado por um traço — para a conta ser óbvia de ler
export function contaLinhas(linhas, resultado) {
  return `<div class="conta-linhas">
${linhas.map((l) => `<div class="cl-linha"><span class="cl-rot">${l.rot}${l.nota ? `<small>${l.nota}</small>` : ''}</span><span class="cl-v num">${l.v}</span></div>`).join('')}
<div class="cl-linha cl-res"><span class="cl-rot">= ${resultado.rot}</span><span class="cl-v num ${resultado.cls || ''}">${resultado.v}</span></div>
</div>`;
}

const arred = (v) => Math.round(v / 10) * 10;

// As duas contas de hoje, uma embaixo da outra. g = garmin_dia de hoje (pode faltar); quando = "há 3 h"
export function contasDeHoje({ g, consumo, deficit, prev, quando }) {
  const comeu = { rot: 'Comeu', v: `${MENOS} ${fmt(consumo)}` };
  const meta = { rot: 'Meta de déficit', v: `${MENOS} ${fmt(deficit)}` };

  let real;
  if (g && g.calorias_total !== null) {
    const gasto = Number(g.calorias_total);
    const cred = gasto - consumo - deficit;
    real = contaLinhas([
      { rot: 'Gasto até agora', v: fmt(gasto), nota: `basal ${fmt(g.calorias_bmr)} + ativas ${fmt(g.calorias_ativas)}` },
      comeu, meta,
    ], { rot: 'Crédito até agora', v: `${fNum(cred, { sinal: true })} kcal`, cls: cred < 0 ? 'cor-no' : 'cor-cal' });
    if (cred < 0) real += '<span class="nota">Durante o dia é normal ficar negativo: o basal continua subindo até a meia-noite.</span>';
  } else {
    real = contaLinhas([{ rot: 'Gasto até agora', v: '—', nota: 'o Garmin ainda não mandou o dia' }, comeu, meta],
      { rot: 'Crédito até agora', v: 'aguarda o Garmin', cls: 'cor-sub' });
  }

  let previsao = '';
  if (prev) {
    const pode = prev.previsto - consumo - deficit;
    const linhasGasto = prev.fonte === 'hoje'
      ? [
          { rot: `Gasto até agora`, v: fmt(prev.gastoAgora), nota: `${fmt(prev.horas, prev.horas % 1 ? 1 : 0)} h de dia, com ${fmt(prev.ativasHoje)} kcal de atividade` },
          { rot: `Repouso nas ${fmt(prev.faltam, prev.faltam % 1 ? 1 : 0)} h que faltam`, v: `+ ${fmt(prev.repousoRestante)}`, nota: `${fmt(prev.porHora)} kcal por hora, o seu ritmo em repouso hoje` },
        ]
      : [{ rot: 'Gasto previsto do dia', v: fmt(prev.previsto), nota: `média dos últimos ${prev.dias} dias (ainda sem dados de hoje)` }];
    previsao = `<div class="cal-prev">
<div class="cal-prev-cab"><span>Até a meia-noite</span><span class="cal-prev-etq">previsão</span></div>
<div class="cal-prev-res"><span class="num ${pode >= 0 ? 'ok' : 'no'}">${pode >= 0 ? '~' : MENOS + '~'}${fmt(arred(Math.abs(pode)))}</span><small>kcal · ${pode >= 0 ? 'ainda pode comer hoje' : 'acima do previsto'}</small></div>
${contaLinhas([
    ...linhasGasto,
    { rot: '= Gasto previsto do dia', v: fmt(prev.previsto) },
    comeu, meta,
  ], pode >= 0
    ? { rot: 'Ainda pode comer', v: `~${fmt(arred(pode))} kcal`, cls: 'ok' }
    : { rot: 'Acima do previsto', v: `~${fmt(arred(-pode))} kcal`, cls: 'no' })}
<span class="cal-prev-nota">Se treinar de novo hoje, o gasto sobe e sobra mais.</span>
</div>`;
  }

  return `<div class="cal-bloco">
<div class="cal-bloco-cab"><b>Até agora</b><span class="cal-etiqueta real">real${quando ? ' · Garmin ' + quando : ''}</span></div>
${real}
</div>
${previsao}
<span class="nota">O crédito que vai para o banco é o real, calculado quando o dia fecha.</span>`;
}
