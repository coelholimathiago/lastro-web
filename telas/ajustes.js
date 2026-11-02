// Ajustes: aparência, Garmin, regras vigentes, cadastros (em breve) e conta.

import { hojeBR, esc, ic, fNum, fReais, fFator, quandoFoi, dataCurta } from '../ui.js';

export const VERSAO = '0.1.0';

export async function montar({ api, temaSalvo }) {
  const H = hojeBR();
  const [regra, sessao, sinc, importado] = await Promise.all([
    api.regras(H), api.sessao(), api.ultimaSinc(), api.garminImportadoEm ? api.garminImportadoEm() : null,
  ]);
  const tema = temaSalvo();
  const opc = [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']]
    .map(([v, r]) => `<button type="button" class="sel" data-tema="${v}" aria-pressed="${tema === v}">${r}</button>`).join('');

  const dias = new Date(Date.UTC(+H.slice(0, 4), +H.slice(5, 7), 0)).getUTCDate();
  const regras = regra ? [
    ['Déficit meta', `${fNum(regra.deficit_meta)} kcal por dia`],
    ['Teto do mês', `${fReais(regra.teto_mensal)} · ${fReais(Math.round(Number(regra.teto_mensal) * 100 / dias) / 100)} por dia agora`],
    ['Fator do vício', `cada minuto custa × ${fFator(regra.fator_vicio)}`],
    ['Piso de consumo', `${fNum(regra.piso_consumo)} kcal`],
    ['Emergência', `espera ${regra.emergencia_espera_min} min · ${regra.emergencia_limite_mes} por mês · custa ${regra.emergencia_custo_min} min`],
    ['Vigente desde', `${dataCurta(regra.valido_desde)}/${regra.valido_desde.slice(0, 4)}`],
  ] : [];
  const demo = api.modo === 'demo';

  return `<div class="tela">
<div class="topo"><div><span class="quando">Lastro ${VERSAO}</span><h1>Ajustes</h1></div></div>

<section class="card" aria-labelledby="ap-tit">
<div class="card-cab"><h2 id="ap-tit">Aparência</h2><span class="lado">automático segue o iPhone</span></div>
<div class="seg" role="group" aria-label="Tema">${opc}</div>
</section>

<section class="card tmp" aria-labelledby="g-tit">
<div class="card-cab"><h2 id="g-tit">${ic.relogioPulso(18)}Garmin</h2><span class="lado">${sinc ? `último dia ${dataCurta(sinc.data)}` : 'sem dados'}</span></div>
<div class="linha-ajuste"><span>Última sincronização</span><span class="v">${sinc ? quandoFoi(sinc.sincronizado_em) : 'nunca'}</span></div>
${demo ? `<div class="linha-ajuste"><span>Origem</span><span class="v">${importado ? `CSV importado ${quandoFoi(importado)}` : 'dados de exemplo'}</span></div>
<label class="btn largo" style="cursor:pointer">${ic.upload(18)}Importar daily.csv e activities.csv
<input id="csv-garmin" class="sr" type="file" accept=".csv,text/csv" multiple></label>
<span class="nota">Pasta data do App Hábitos. Troca os dados de exemplo do Garmin pelos seus, com as mesmas regras do banco.</span>`
    : `<span class="nota">A coleta roda no computador: <code>python garmin_coleta.py --enviar</code> manda o dia de ontem para o Supabase. O crédito de calorias só confirma depois disso.</span>`}
</section>

<section class="card" aria-labelledby="r-tit">
<div class="card-cab"><h2 id="r-tit">Regras vigentes</h2><span class="lado">mudança vale na semana seguinte</span></div>
<div>${regras.map(([k, v]) => `<div class="linha-ajuste"><span>${k}</span><span class="v">${esc(v)}</span></div>`).join('') || '<div class="vazio">Sem regra cadastrada.</div>'}</div>
</section>

<section class="card" aria-labelledby="c-tit">
<div class="card-cab"><h2 id="c-tit">Cadastros</h2><span class="pilula hab">em breve</span></div>
<span class="nota">Hábitos, vícios, recompensas e regras. Por enquanto valem os pontos de partida do banco.</span>
</section>

<section class="card" aria-labelledby="i-tit">
<div class="card-cab"><h2 id="i-tit">${ic.celular(18)}Bloqueio de apps</h2><span class="pilula">app nativo</span></div>
<span class="nota">Bloquear e liberar Instagram, Netflix e outros exige a API de Tempo de Uso do iPhone, que só um app nativo acessa. No navegador, as trocas ficam registradas e o banco já cobra.</span>
</section>

<section class="card" aria-labelledby="conta-tit">
<div class="card-cab"><h2 id="conta-tit">Conta</h2><span class="lado">${demo ? 'modo demonstração' : 'Supabase'}</span></div>
${demo
    ? `<span class="nota">Para usar seus dados de verdade, preencha SUPABASE_URL e SUPABASE_ANON_KEY em config.js.</span>
<button type="button" class="btn largo" id="reiniciar">Recomeçar a demonstração</button>`
    : `<div class="linha-ajuste"><span>E-mail</span><span class="v">${esc(sessao ? sessao.email : '')}</span></div>
<button type="button" class="btn largo" id="sair">${ic.sair(18)}Sair</button>`}
</section>
</div>`;
}

export function ligar(raiz, { api, aplicarTema, recarregar, ir, toast }) {
  raiz.querySelectorAll('[data-tema]').forEach((b) => b.addEventListener('click', () => {
    aplicarTema(b.dataset.tema);
    raiz.querySelectorAll('[data-tema]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  raiz.querySelector('#sair')?.addEventListener('click', async () => {
    await api.sair();
    ir('#/login');
  });

  raiz.querySelector('#reiniciar')?.addEventListener('click', async () => {
    if (!window.confirm('Apagar os registros da demonstração e voltar aos dados de exemplo?')) return;
    await api.reiniciar();
    toast('Demonstração recomeçada');
    recarregar();
  });

  raiz.querySelector('#csv-garmin')?.addEventListener('change', async (ev) => {
    const arquivos = [...ev.target.files];
    if (!arquivos.length) return;
    let diario = null, atividades = null;
    for (const f of arquivos) {
      const txt = await f.text();
      const cab = txt.slice(0, 400);
      if (cab.includes('activity_id')) atividades = txt;
      else if (cab.includes('calorias_total')) diario = txt;
    }
    if (!diario && !atividades) { toast('Não reconheci o arquivo: use daily.csv e activities.csv', 'erro'); return; }
    try {
      const r = await api.importarGarmin(diario, atividades);
      toast(`Garmin importado: ${r.dias} dias, ${r.atividades} atividades`);
      recarregar();
    } catch (e) { toast(e.message, 'erro'); }
  });
}
