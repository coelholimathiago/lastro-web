// Calorias de hoje em duas contas separadas:
//   até agora (real): o gasto que o Garmin já registrou − o que comeu − a meta de déficit
//   até a meia-noite (previsão): o gasto previsto para o dia inteiro − o que comeu − a meta de déficit
// A previsão vem dos últimos 7 dias completos do Garmin.

import { fmt, fNum, horaBR, MENOS } from '../ui.js';

// garmin: linhas de garmin_dia (inclui as de hoje e as anteriores); H: hoje AAAA-MM-DD
export function previsaoDia(garmin, H) {
  const completos = (garmin || [])
    .filter((g) => g.data < H && g.calorias_total !== null && g.calorias_bmr !== null && g.calorias_ativas !== null)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(-7);
  if (!completos.length) return null;
  const media = (k) => completos.reduce((s, g) => s + Number(g[k] || 0), 0) / completos.length;
  const hoje = (garmin || []).find((g) => g.data === H);
  const [h, m] = horaBR().split(':').map(Number);
  const falta = Math.max(0, (24 * 60 - (h * 60 + m)) / (24 * 60));
  // basal de um dia inteiro + o que já mexeu hoje + o ritmo médio de ativas nas horas que faltam
  const bmrDia = Math.round(media('calorias_bmr'));
  const ativasHoje = hoje ? Math.round(Number(hoje.calorias_ativas || 0)) : 0;
  const ativasRestantes = Math.round(media('calorias_ativas') * falta);
  return { previsto: bmrDia + ativasHoje + ativasRestantes, bmrDia, ativasHoje, ativasRestantes, dias: completos.length };
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
    previsao = `<div class="cal-bloco cal-prev">
<div class="cal-bloco-cab"><b>Até a meia-noite</b><span class="cal-etiqueta">previsão</span></div>
${contaLinhas([
    { rot: 'Gasto previsto do dia', v: fmt(prev.previsto),
      nota: `${fmt(prev.bmrDia)} basal do dia (média de ${prev.dias} dias) + ${fmt(prev.ativasHoje)} ativas de hoje + ${fmt(prev.ativasRestantes)} ativas previstas até a meia-noite` },
    comeu, meta,
  ], pode >= 0
    ? { rot: 'Ainda pode comer', v: `~${fmt(arred(pode))} kcal`, cls: 'cor-cal' }
    : { rot: 'Vai passar', v: `~${fmt(arred(-pode))} kcal`, cls: 'cor-no' })}
</div>`;
  }

  return `<div class="cal-bloco">
<div class="cal-bloco-cab"><b>Até agora</b><span class="cal-etiqueta real">real${quando ? ' · Garmin ' + quando : ''}</span></div>
${real}
</div>
${previsao}
<span class="nota">O crédito que vai para o banco é o real, calculado quando o dia fecha.</span>`;
}
