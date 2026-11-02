// Previsão do gasto calórico de hoje e da sobra para comer, a partir dos últimos 7 dias completos do Garmin.
// O total do dia só fecha à meia-noite: até lá o basal cresce e as ativas dependem do que ainda vai mexer.

import { fmt, fNum, horaBR, ic } from '../ui.js';

// garmin: linhas de garmin_dia (inclui as de hoje e as anteriores); H: hoje AAAA-MM-DD
export function previsaoDia(garmin, H) {
  const completos = (garmin || [])
    .filter((g) => g.data < H && g.calorias_total !== null && g.calorias_bmr !== null && g.calorias_ativas !== null)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(-7);
  if (!completos.length) return null;
  const media = (k) => completos.reduce((s, g) => s + Number(g[k] || 0), 0) / completos.length;
  const bmrDia = media('calorias_bmr');
  const ativasDia = media('calorias_ativas');
  const hoje = (garmin || []).find((g) => g.data === H);
  const [h, m] = horaBR().split(':').map(Number);
  const falta = Math.max(0, (24 * 60 - (h * 60 + m)) / (24 * 60));
  const ativasHoje = hoje ? Number(hoje.calorias_ativas || 0) : 0;
  // basal do dia inteiro + o que já mexeu + o ritmo médio de ativas no pedaço do dia que falta
  const previsto = Math.round(bmrDia + ativasHoje + ativasDia * falta);
  return { previsto, dias: completos.length, mediaTotal: Math.round(media('calorias_total')), bmrDia: Math.round(bmrDia), ativasDia: Math.round(ativasDia) };
}

// Bloco de texto: previsão do gasto e quanto ainda cabe comer mantendo o déficit
export function blocoPrevisao(prev, consumo, deficit) {
  if (!prev) return '';
  const sobra = prev.previsto - Number(consumo || 0) - Number(deficit || 0);
  const linha = sobra >= 0
    ? `Sobra estimada para comer hoje: <b class="num cor-cal">~${fmt(Math.round(sobra / 10) * 10)} kcal</b>, mantendo o déficit de ${fmt(deficit)}.`
    : `Pela previsão, você já passou <b class="num cor-no">~${fmt(Math.round(-sobra / 10) * 10)} kcal</b> do orçamento de hoje.`;
  return `<div class="previsao">
<div class="previsao-cab">${ic.relogio(14)}<span>Previsão para hoje</span></div>
<p>Gasto previsto até a meia-noite: <b class="num">~${fmt(prev.previsto)} kcal</b> (média dos últimos ${prev.dias} dias: ${fmt(prev.mediaTotal)}).</p>
<p>${linha}</p>
<span class="nota">Estimativa: basal de um dia inteiro + as ativas de hoje + o seu ritmo médio de ativas nas horas que faltam.</span>
</div>`;
}

export { fNum };
