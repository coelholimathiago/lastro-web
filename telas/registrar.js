// Registrar: refeição (descrição + kcal), gasto (descrição + valor + categoria), tempo (atividade + minutos).

import { hojeBR, horaBR, dataLonga, esc, ic, fNum, fReais, fFator, fmt, lerNumero, MENOS } from '../ui.js';

const TIPOS = [
  { id: 'refeicao', nome: 'Refeição', cls: 'cal' },
  { id: 'gasto', nome: 'Gasto', cls: 'din' },
  { id: 'tempo', nome: 'Tempo', cls: 'tmp' },
];
const CATEGORIAS = ['Mercado', 'Restaurante', 'Transporte', 'Casa', 'Saúde', 'Lazer', 'Outros'];

let ctxForm = null;

export async function montar({ api, rota }) {
  const H = hojeBR();
  const tipo = TIPOS.some((t) => t.id === rota.q.get('tipo')) ? rota.q.get('tipo') : 'refeicao';
  let D = rota.q.get('data') || H;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(D) || D > H) D = H;
  const [c, atividades, regra] = await Promise.all([api.creditoDia(D), api.atividades(), api.regras(D)]);
  const calculadora = tipo === 'refeicao' && typeof api.estimarRefeicao === 'function';
  ctxForm = { tipo, D, H, c, atividades, regra, calculadora, estimativa: null };

  const abas = TIPOS.map((t) => `<button type="button" role="tab" data-tipo="${t.id}" aria-selected="${t.id === tipo}"><span class="ponto ${t.cls}"></span>${t.nome}</button>`).join('');

  let corpo = '';
  if (tipo === 'refeicao' && calculadora) {
    // calculadora: o texto vira itens e calorias pelo Claude Haiku; o total só se ajusta se quiser
    corpo = `
<label class="campo">O que comeu<textarea name="descricao" required maxlength="500" rows="3" placeholder="2 ovos mexidos, 1 pão francês com manteiga e café com leite"></textarea></label>
<button type="button" class="btn largo" id="calcular">${ic.raio ? ic.raio(18) : ''}Calcular calorias</button>
<div id="estimativa" aria-live="polite"></div>
<input type="hidden" name="kcal" value="">
<label class="campo">Hora<input name="hora" type="time" value="${D === H ? horaBR() : ''}"></label>`;
  } else if (tipo === 'refeicao') {
    corpo = `
<label class="campo">O que comeu<input name="descricao" type="text" required maxlength="120" placeholder="2 ovos e pão" autocomplete="off"></label>
${stepper('kcal', 'Calorias', 'kcal', 400, 50, 'cal')}
<label class="campo">Hora<input name="hora" type="time" value="${D === H ? horaBR() : ''}"></label>`;
  } else if (tipo === 'gasto') {
    corpo = `
<label class="campo">Com o quê<input name="descricao" type="text" required maxlength="120" placeholder="Mercado" autocomplete="off"></label>
${stepper('valor', 'Valor', 'R$', 20, 5, 'din', true)}
<fieldset style="border:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px"><legend class="grupo-rot" style="padding:0;margin-bottom:8px">Categoria</legend>
<div class="opcoes">${CATEGORIAS.map((k, i) => `<label class="opcao"><input class="sr" type="radio" name="categoria" value="${k}"${i === 0 ? ' checked' : ''}>${k}</label>`).join('')}</div></fieldset>`;
  } else {
    const fator = regra ? Number(regra.fator_vicio) : 2.3;
    const grupo = (tp, rot) => {
      const lista = atividades.filter((a) => a.tipo === tp);
      if (!lista.length) return '';
      return `<span class="grupo-rot">${rot}</span><div class="opcoes">${lista.map((a, i) => {
        const det = tp === 'vicio' ? `× ${fFator(a.fator ?? fator)}${a.limite_diario_min !== null ? ` · limite ${a.limite_diario_min}` : ''}` : '+1/min';
        return `<label class="opcao"><input class="sr" type="radio" name="atividade" value="${esc(a.id)}" data-tipo="${tp}" data-fator="${a.fator ?? fator}"${tp === 'produtivo' && i === 0 ? ' checked' : ''}>${esc(a.nome)} <small>${det}</small></label>`;
      }).join('')}</div>`;
    };
    corpo = `<fieldset style="border:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px"><legend class="sr">Atividade</legend>
${grupo('produtivo', 'Produtivo · cada minuto vale +1')}
${grupo('vicio', 'Vício · cada minuto custa × fator')}</fieldset>
${stepper('minutos', 'Minutos', 'min', 30, 5, 'tmp')}
<div class="opcoes" aria-label="Atalhos de minutos">${[15, 30, 45, 60].map((m) => `<button type="button" class="opcao" data-min="${m}">${m} min</button>`).join('')}</div>`;
  }

  return `<div class="tela">
<div class="topo"><div><span class="quando">${esc(dataLonga(D))}</span><h1>Registrar</h1></div>
<a class="btn-icone" href="#/dia?data=${D}" aria-label="Fechar e ver o dia">${ic.x(18)}</a></div>
<div class="abas" role="tablist" aria-label="Tipo de registro">${abas}</div>
<form id="form-reg" class="tela" novalidate>
${corpo}
<label class="campo">Dia<input name="data" type="date" value="${D}" max="${H}" required></label>
<div id="previa"></div>
<div id="erro-reg" role="alert"></div>
<button type="submit" class="btn primario largo">Salvar ${TIPOS.find((t) => t.id === tipo).nome.toLowerCase()}</button>
</form>
</div>`;
}

function stepper(nome, rot, un, valor, passo, cls, decimal = false) {
  return `<div class="stepper ${cls}">
<label class="rot-s" style="flex:1"><span><span class="ponto ${cls}"></span>${rot} (${un})</span>
<input class="valor-s num" name="${nome}" type="text" inputmode="${decimal ? 'decimal' : 'numeric'}" value="${valor}" required></label>
<div class="botoes">
<button type="button" data-passo="${nome}" data-delta="${-passo}" aria-label="Diminuir ${passo} ${un}">${ic.menos(20)}</button>
<button type="button" data-passo="${nome}" data-delta="${passo}" aria-label="Aumentar ${passo} ${un}">${ic.mais(20)}</button>
</div></div>`;
}

function cartaoEstimativa(est) {
  const linhas = est.itens.length
    ? est.itens.map((i) => `<div class="item"><span class="txt"><span>${esc(i.alimento)}</span><small>${esc(i.quantidade)}</small></span><span class="val">${fmt(i.kcal)} kcal</span></div>`).join('')
    : '<div class="vazio">Nenhum alimento reconhecido.</div>';
  return `<section class="card cal" aria-label="Calorias estimadas">
<div class="card-cab"><h2><span class="ponto"></span>Estimativa</h2><span class="lado num" style="font-size:22px;font-weight:600;color:var(--cal)">${fmt(est.total_kcal)} kcal</span></div>
<div class="lista">${linhas}</div>
${est.observacao ? `<span class="nota">${esc(est.observacao)}</span>` : ''}
<details><summary class="nota" style="cursor:pointer">Ajustar o total</summary>
<label class="campo" style="margin-top:8px">Total em kcal<input name="ajuste" type="text" inputmode="numeric" value="${est.total_kcal}"></label></details>
</section>`;
}

function previa(form) {
  const { tipo, c } = ctxForm;
  if (!c) return '';
  const linhaPrevia = (cls, rot, antes, depois) =>
    `<div class="stepper ${cls}" style="padding:12px 14px"><span class="nota" style="color:var(--ink)">${rot}</span><span class="num" style="font-weight:600;white-space:nowrap"><span class="cor-sub" style="font-weight:400">${antes} → </span><span class="${depois.startsWith(MENOS) ? 'cor-no' : `cor-${cls}`}">${depois}</span></span></div>`;
  if (tipo === 'refeicao') {
    const k = lerNumero(form.kcal.value) || 0;
    if (c.gasto_kcal === null) return linhaPrevia('cal', 'Consumo do dia', `${fmt(c.consumo_kcal)} kcal`, `${fmt(Number(c.consumo_kcal) + k)} kcal`);
    return linhaPrevia('cal', 'Crédito de calorias do dia', fNum(c.credito_kcal, { sinal: true }), fNum(Number(c.credito_kcal) - k, { sinal: true }));
  }
  if (tipo === 'gasto') {
    const v = lerNumero(form.valor.value) || 0;
    return linhaPrevia('din', 'Crédito de dinheiro do dia', fReais(c.credito_reais, { sinal: true }), fReais(Number(c.credito_reais) - v, { sinal: true }));
  }
  const m = lerNumero(form.minutos.value) || 0;
  const sel = form.querySelector('input[name="atividade"]:checked');
  if (!sel) return '';
  const delta = sel.dataset.tipo === 'vicio' ? -Math.round((m * Math.round(Number(sel.dataset.fator) * 100)) / 100) : m;
  return linhaPrevia('tmp', 'Crédito de tempo do dia', fNum(c.credito_min, { sinal: true }), '≈ ' + fNum(Number(c.credito_min) + delta, { sinal: true }));
}

export function ligar(raiz, { api, ir, toast }) {
  const form = raiz.querySelector('#form-reg');
  const prev = raiz.querySelector('#previa');
  const erro = raiz.querySelector('#erro-reg');
  const atualizar = () => { prev.innerHTML = previa(form); };
  atualizar();

  raiz.querySelector('.abas').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tipo]');
    if (b) ir(`#/registrar?tipo=${b.dataset.tipo}&data=${form.data.value || ctxForm.D}`);
  });
  form.addEventListener('click', (ev) => {
    const p = ev.target.closest('[data-passo]');
    if (p) {
      const campo = form[p.dataset.passo];
      const atual = lerNumero(campo.value) || 0;
      const novo = Math.max(0, atual + Number(p.dataset.delta));
      campo.value = p.dataset.passo === 'valor' ? fmt(novo, novo % 1 ? 2 : 0).replace(/\./g, '') : String(Math.round(novo));
      atualizar();
    }
    const m = ev.target.closest('[data-min]');
    if (m) { form.minutos.value = m.dataset.min; atualizar(); }
  });
  form.addEventListener('input', (ev) => {
    // mudou o texto depois de calcular: a estimativa antiga deixa de valer
    if (ctxForm.calculadora && ev.target.name === 'descricao' && ctxForm.estimativa) {
      ctxForm.estimativa = null;
      form.kcal.value = '';
      raiz.querySelector('#estimativa').innerHTML = '<p class="nota">O texto mudou. Calcule de novo.</p>';
    }
    if (ev.target.name === 'ajuste' && ctxForm.estimativa) {
      const k = lerNumero(ev.target.value);
      form.kcal.value = Number.isFinite(k) && k >= 0 ? String(Math.round(k)) : '';
    }
    atualizar();
  });

  const btnCalc = raiz.querySelector('#calcular');
  if (btnCalc) {
    btnCalc.addEventListener('click', async () => {
      erro.innerHTML = '';
      const texto = form.descricao.value.trim();
      const caixa = raiz.querySelector('#estimativa');
      if (!texto) { erro.innerHTML = `<div class="aviso">${ic.x(16)}<span>Descreva o que comeu.</span></div>`; return; }
      btnCalc.disabled = true;
      btnCalc.textContent = 'Calculando…';
      try {
        const est = await api.estimarRefeicao(texto);
        ctxForm.estimativa = est;
        form.kcal.value = String(est.total_kcal);
        caixa.innerHTML = cartaoEstimativa(est);
        atualizar();
      } catch (e) {
        caixa.innerHTML = '';
        erro.innerHTML = `<div class="aviso">${ic.x(16)}<span>${esc(e.message || String(e))}</span></div>`;
      } finally {
        btnCalc.disabled = false;
        btnCalc.textContent = ctxForm.estimativa ? 'Calcular de novo' : 'Calcular calorias';
      }
    });
  }
  form.addEventListener('change', (ev) => {
    if (ev.target.name === 'data' && ev.target.value && ev.target.value !== ctxForm.D) {
      ir(`#/registrar?tipo=${ctxForm.tipo}&data=${ev.target.value}`);
    }
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.innerHTML = '';
    const { tipo } = ctxForm;
    const data = form.data.value || ctxForm.D;
    const falha = (msg) => { erro.innerHTML = `<div class="aviso">${ic.x(16)}<span>${esc(msg)}</span></div>`; };
    if (data > ctxForm.H) return falha('Não dá para registrar no futuro.');
    let tabela, linha;
    if (tipo === 'refeicao') {
      const kcal = lerNumero(form.kcal.value);
      if (!form.descricao.value.trim()) return falha('Descreva a refeição.');
      if (ctxForm.calculadora && !ctxForm.estimativa) return falha('Calcule as calorias antes de salvar.');
      if (!Number.isFinite(kcal) || kcal < 0) return falha('Informe as calorias em número.');
      tabela = 'refeicao';
      linha = { data, descricao: form.descricao.value.trim(), kcal: Math.round(kcal), hora: form.hora.value || null };
      if (ctxForm.estimativa) linha.itens = ctxForm.estimativa.itens;
    } else if (tipo === 'gasto') {
      const valor = lerNumero(form.valor.value);
      if (!form.descricao.value.trim()) return falha('Descreva o gasto.');
      if (!Number.isFinite(valor) || valor < 0) return falha('Informe o valor em reais.');
      tabela = 'gasto';
      linha = { data, descricao: form.descricao.value.trim(), valor: Math.round(valor * 100) / 100, categoria: (form.querySelector('input[name="categoria"]:checked') || {}).value || null };
    } else {
      const minutos = lerNumero(form.minutos.value);
      const sel = form.querySelector('input[name="atividade"]:checked');
      if (!sel) return falha('Escolha a atividade.');
      if (!Number.isFinite(minutos) || minutos <= 0) return falha('Informe os minutos (maior que zero).');
      tabela = 'tempo_registro';
      linha = { data, atividade_id: sel.value, minutos: Math.round(minutos) };
    }
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await api.adicionar(tabela, linha);
      toast({ refeicao: 'Refeição registrada', gasto: 'Gasto registrado', tempo_registro: 'Tempo registrado' }[tabela]);
      ir(`#/dia?data=${data}`);
    } catch (e) {
      falha(e.message || String(e));
      btn.disabled = false;
    }
  });
}
