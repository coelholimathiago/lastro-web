// Cadastro de recompensa com calculadora de preço: #/recompensa/nova e #/recompensa/<id>.
// Tempo em app = minutos × fator do vício; comida = kcal estimadas pela IA (+ R$ opcional); compra = R$;
// cofrinho = valor-alvo, quanto guardar por semana e a meta que precisa estar cumprida para liberar.

import { hojeBR, addDias, esc, ic, fmt, fNum, fReais, fFator, pct, clamp01, lerNumero, MOEDAS } from '../ui.js';
import { comUnidade, ORDEM } from './comum.js';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const CREDITO = { kcal: 'credito_kcal', reais: 'credito_reais', min: 'credito_min' };
const HORIZONTE = { '3m': '3 meses', '6m': '6 meses', '12m': '1 ano' };
const APPS = ['Instagram', 'YouTube', 'Netflix', 'TikTok'];

const TIPOS = [
  { id: 'tempo_app', rot: 'Tempo em app', sub: 'minutos × fator', cls: 'tmp' },
  { id: 'comida', rot: 'Comida ou bebida', sub: 'kcal da IA + R$', cls: 'cal' },
  { id: 'compra', rot: 'Compra ou passeio', sub: 'custo real em R$', cls: 'din' },
  { id: 'cofrinho', rot: 'Cofrinho', sub: 'R$ + meta cumprida', cls: 'hab' },
];
const NIVEIS = [
  { id: 'pequena', rot: 'Pequena', sub: 'dia a dia', secao: 'Pequenas' },
  { id: 'media', rot: 'Média', sub: 'da semana', secao: 'Médias' },
  { id: 'grande', rot: 'Grande', sub: 'cofrinho', secao: 'Grandes' },
];
const NIVEL_PADRAO = { tempo_app: 'pequena', comida: 'media', compra: 'media', cofrinho: 'grande' };
const CALC_NOTA = { tempo_app: 'tempo = uso × fator', comida: 'kcal 1 para 1 com o banco', compra: 'dinheiro = custo real', cofrinho: 'cofrinho + meta' };
const EXEMPLO = { tempo_app: '30 min de Instagram', comida: 'Pizza no sábado', compra: 'Camiseta de corrida', cofrinho: 'Bicicleta nova' };

let f = null; // estado do formulário

// ------------------------------------------------------------ utilidades

function mesAno(iso) { return `${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`; }
function diasEntre(de, ate) { return Math.round((new Date(ate + 'T12:00:00Z') - new Date(de + 'T12:00:00Z')) / 86400000); }
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const valorTxt = (n, casas) => fmt(n, casas ?? (Number(n) % 1 ? 2 : 0));

// Crédito médio por semana em cada moeda, pelos dias com número das últimas 4 semanas.
function ritmoSemanal(creditos) {
  const r = {};
  for (const m of ORDEM) {
    const vals = (creditos || []).map((c) => c[CREDITO[m]]).filter((v) => v !== null && v !== undefined).map(Number);
    r[m] = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) * 7 : null;
  }
  return r;
}

function preco() {
  if (f.tipo === 'tempo_app') return { kcal: 0, reais: 0, min: Math.round(f.minutos * f.fator) };
  if (f.tipo === 'comida') return { kcal: Math.round(f.kcal || 0), reais: r2(f.reaisComida || 0), min: 0 };
  if (f.tipo === 'compra') return { kcal: 0, reais: r2(f.reaisCompra || 0), min: 0 };
  return { kcal: 0, reais: r2(f.alvo || 0), min: 0 };
}

function barraProgresso(p, { cls, rotulo }) {
  const n = Math.round(clamp01(p) * 100);
  return `<div class="lb-barra lb-${cls}" style="height:8px" role="progressbar" aria-label="${esc(rotulo)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${n}"><div style="width:${pct(p)}"></div></div>`;
}

// ------------------------------------------------------------ montar

export async function montar(ctx) {
  const { api, rota } = ctx;
  f = null;
  if (typeof api.salvarRecompensa !== 'function' || typeof api.metas !== 'function') {
    return `<div class="tela rc-tela">
<div class="rc-topo"><a class="rc-voltar" href="#/liberar">${ic.voltar(18)}Liberar</a></div>
<h1>Nova recompensa</h1>
<div class="aviso neutro" role="status">${ic.cadeado(16)}<span><b>Disponível com a conta conectada.</b> O cadastro de recompensas, os níveis e os cofrinhos moram no Supabase. No modo demonstração, as recompensas são as do exemplo.</span></div>
<a class="btn largo" href="#/liberar">Voltar para Liberar</a>
</div>`;
  }

  const H = hojeBR();
  const editando = rota.arg && rota.arg !== 'nova';
  const [regras, metas, creditos, saldo, lista] = await Promise.all([
    api.regras().catch(() => null),
    api.metas().catch(() => []),
    api.creditos(addDias(H, -28), addDias(H, -1)).catch(() => []),
    typeof api.bancoDisponivel === 'function' ? api.bancoDisponivel().catch(() => null) : Promise.resolve(null),
    editando ? api.recompensasStatus() : Promise.resolve([]),
  ]);
  const fatorPadrao = Number(regras && regras.fator_vicio) || 2.3;
  const r = editando ? lista.find((x) => String(x.id) === String(rota.arg)) : null;
  if (editando && !r) {
    return `<div class="tela rc-tela">
<div class="rc-topo"><a class="rc-voltar" href="#/liberar">${ic.voltar(18)}Liberar</a></div>
<h1>Recompensa não encontrada</h1>
<p class="nota">Ela pode ter sido usada ou desativada.</p>
<a class="btn largo" href="#/liberar">Voltar para Liberar</a></div>`;
  }

  f = {
    H, metas: (metas || []).filter((m) => m.status !== 'abandonada'), fatorPadrao,
    ritmo: ritmoSemanal(creditos),
    livre: saldo ? { kcal: Number(saldo.kcal_livre ?? saldo.kcal), reais: Number(saldo.reais_livre ?? saldo.reais), min: Number(saldo.min) } : { kcal: 0, reais: 0, min: 0 },
    temIa: typeof api.estimarRefeicao === 'function',
    id: null, nome: '', tipo: 'comida', nivel: 'media', nivelManual: false,
    app: 'Instagram', minutos: 30, fator: fatorPadrao,
    descricao: '', kcal: null, iaDesc: null, itensIa: [], obsIa: '', estimando: false, erroIa: null,
    reaisComida: 0, reaisCompra: 50, alvo: 1000, guardar: 50, metaId: null, guardado: 0,
    salvando: false, salvo: false, erro: null,
  };
  if (r) {
    const tipo = r.tipo || (r.libera_app ? 'tempo_app' : Number(r.custo_kcal) > 0 ? 'comida' : 'compra');
    Object.assign(f, {
      id: r.id, nome: r.nome || '', tipo, nivel: r.nivel || NIVEL_PADRAO[tipo], nivelManual: true,
      descricao: tipo === 'comida' ? r.descricao || '' : '',
      guardado: Number(r.guardado) || 0,
    });
    if (tipo === 'tempo_app') {
      f.app = r.libera_app || '';
      f.minutos = Number(r.libera_min) || Math.max(5, Math.round(Number(r.custo_min) / fatorPadrao));
      f.fator = Number(r.libera_min) > 0 && Number(r.custo_min) > 0 ? Math.round((Number(r.custo_min) / Number(r.libera_min)) * 10) / 10 : fatorPadrao;
    } else if (tipo === 'comida') {
      f.kcal = Number(r.custo_kcal) || 0;
      f.iaDesc = f.descricao;
      f.reaisComida = Number(r.custo_reais) || 0;
    } else if (tipo === 'compra') {
      f.reaisCompra = Number(r.custo_reais) || 0;
    } else {
      f.alvo = Number(r.cofrinho_alvo) || 0;
      f.guardar = Number(r.guardar_semana) || 0;
      f.metaId = r.meta_condicao_id || null;
    }
  }

  return `<div class="tela rc-tela">
<div class="rc-topo"><a class="rc-voltar" href="#/liberar">${ic.voltar(18)}Liberar</a><span class="pilula" id="rc-pilula">${f.id ? 'editando' : 'rascunho'}</span></div>
<div class="rc-cab"><span class="quando">${f.id ? 'Editar recompensa' : 'Nova recompensa'}</span><h1 id="rc-titulo">${esc(f.nome || 'Sem nome')}</h1></div>
<div id="rc-form" class="rc-grade"></div>
</div>`;
}

// ------------------------------------------------------------ desenho

// Linha de stepper: rótulo e nota à esquerda; −, valor editável e + à direita.
function passo({ campo, rot, nota, valor, txt, cls = '', delta, unidade = '', modo = 'numeric' }) {
  return `<div class="rc-passo">
<div class="rc-passo-txt"><span class="rc-passo-rot">${rot}</span>${nota ? `<span class="nota">${nota}</span>` : ''}</div>
<div class="rc-passo-ctl">
<button type="button" class="rc-mm" data-passo="${campo}" data-delta="${-delta}" data-foco="${campo}-menos" aria-label="Diminuir ${esc(rot.toLowerCase())}">${ic.menos(18)}</button>
<label class="rc-valor ${cls}"><span class="sr">${esc(rot)}</span>${unidade && unidade !== 'min' && unidade !== 'kcal' ? `<span class="rc-un">${unidade}</span>` : ''}<input type="text" inputmode="${modo}" data-num="${campo}" data-foco="${campo}-campo" value="${esc(txt ?? valorTxt(valor))}">${unidade === 'min' || unidade === 'kcal' ? `<span class="rc-un">${unidade}</span>` : ''}</label>
<button type="button" class="rc-mm" data-passo="${campo}" data-delta="${delta}" data-foco="${campo}-mais" aria-label="Aumentar ${esc(rot.toLowerCase())}">${ic.mais(18)}</button>
</div></div>`;
}

function htmlFormula() {
  const p = preco();
  if (f.tipo === 'tempo_app') return { cls: 'tmp', txt: `${fmt(f.minutos)} min × ${fFator(f.fator)} = ${fNum(p.min)} min` };
  if (f.tipo === 'comida') {
    if (f.kcal === null) return { cls: 'neutro', txt: `${p.reais ? fReais(p.reais) + ' + ' : ''}calorias a estimar` };
    return { cls: 'cal', txt: `${fNum(p.kcal)} kcal 1 para 1${p.reais ? ' + ' + fReais(p.reais) : ''}` };
  }
  if (f.tipo === 'compra') return { cls: 'din', txt: `${fReais(p.reais)} saem do banco de dinheiro` };
  const resto = Math.max(0, f.alvo - f.guardado);
  if (!(f.guardar > 0)) return { cls: 'neutro', txt: 'Defina quanto guardar por semana' };
  const sem = Math.ceil(resto / f.guardar);
  return { cls: 'din', txt: `${f.guardado > 0 ? `(${fReais(f.alvo)} − ${fReais(f.guardado)} guardados)` : fReais(f.alvo)} ÷ ${fReais(f.guardar)} = ${sem} ${sem === 1 ? 'semana' : 'semanas'}` };
}

function htmlCalculadora() {
  let corpo = '';
  if (f.tipo === 'tempo_app') {
    corpo = `<div class="rc-bloco">
<label class="campo">App<input type="text" data-texto="app" data-foco="app" value="${esc(f.app)}" maxlength="40" placeholder="Instagram" autocomplete="off"></label>
<div class="rc-apps" role="group" aria-label="Apps comuns">${APPS.map((a) => `<button type="button" class="rc-app${a === f.app ? ' on' : ''}" data-app="${a}" data-foco="app-${a}" aria-pressed="${a === f.app}">${a}</button>`).join('')}</div>
<span class="nota">medido pelo Tempo de Uso do iOS quando o app nativo chegar</span>
</div>
${passo({ campo: 'minutos', rot: 'Minutos de uso', nota: `quanto tempo no ${esc(f.app || 'app')}`, valor: f.minutos, delta: 5, unidade: 'min' })}
${passo({ campo: 'fator', rot: 'Fator do vício', nota: `padrão de Ajustes: ${fFator(f.fatorPadrao)}`, valor: f.fator, txt: fFator(f.fator), delta: 0.1, unidade: '×', modo: 'decimal' })}`;
  } else if (f.tipo === 'comida') {
    const mudou = f.kcal !== null && f.iaDesc !== null && f.descricao.trim() !== (f.iaDesc || '').trim();
    const itens = (f.itensIa || []).slice(0, 4).map((i) => `${esc(i.quantidade ? i.quantidade + ' ' : '')}${esc(i.alimento)} ≈ ${fNum(i.kcal)} kcal`).join(' · ');
    corpo = `<div class="rc-bloco">
<label class="campo">O que vai comer ou beber<input type="text" data-texto="descricao" data-foco="descricao" value="${esc(f.descricao)}" maxlength="500" placeholder="Pizza média de calabresa, 3 fatias + refrigerante lata" autocomplete="off"></label>
${f.temIa ? `<button type="button" class="rc-ia" data-acao="estimar" data-foco="estimar"${f.estimando ? ' disabled' : ''}>${ic.brilho(18)}${f.estimando ? 'Estimando…' : f.kcal !== null && f.iaDesc ? 'Estimar de novo com IA' : 'Estimar com IA'}</button>` : ''}
${f.erroIa ? `<div class="aviso" role="alert">${ic.x(16)}<span>${esc(f.erroIa)}</span></div>` : ''}
${f.kcal !== null ? `<div class="rc-kcal" role="status">
<div class="rc-kcal-topo">
<label class="rc-kcal-num"><span class="rc-kcal-rot">${f.iaDesc && f.itensIa.length ? 'estimativa da IA' : 'calorias'}</span><span class="rc-kcal-linha">≈ <input type="text" inputmode="numeric" data-num="kcal" data-foco="kcal-campo" value="${fmt(f.kcal)}" aria-label="Calorias"> kcal</span></label>
<div class="rc-kcal-ctl">
<button type="button" class="rc-mm" data-passo="kcal" data-delta="-50" data-foco="kcal-menos" aria-label="Diminuir calorias em 50">${ic.menos(18)}</button>
<button type="button" class="rc-mm" data-passo="kcal" data-delta="50" data-foco="kcal-mais" aria-label="Aumentar calorias em 50">${ic.mais(18)}</button>
</div></div>
<span class="rc-kcal-nota">${itens ? itens + '. ' : ''}${f.obsIa ? esc(f.obsIa) + ' ' : ''}Ajuste se souber o número.</span>
${mudou ? '<span class="rc-kcal-nota cor-hab">A descrição mudou. Toque em Estimar com IA para recalcular as calorias.</span>' : ''}
</div>` : `<button type="button" class="btn fantasma rc-sei" data-acao="manual" data-foco="manual">Sei o número das calorias</button>`}
</div>
${passo({ campo: 'reaisComida', rot: 'Valor', nota: 'quanto vai pagar · opcional', valor: f.reaisComida, delta: 5, unidade: 'R$', cls: 'din', modo: 'decimal' })}`;
  } else if (f.tipo === 'compra') {
    corpo = passo({ campo: 'reaisCompra', rot: 'Valor', nota: 'custo real, sai do dinheiro', valor: f.reaisCompra, delta: 5, unidade: 'R$', cls: 'din', modo: 'decimal' });
  } else {
    const opcoes = [{ id: null, titulo: 'Sem meta-condição', nota: 'libera só com o cofrinho cheio' }].concat(f.metas.map((m) => ({
      id: m.id, titulo: m.titulo, nota: `${HORIZONTE[m.horizonte] || m.horizonte} · vence ${mesAno(m.prazo)} · ${Math.round(clamp01(m.progresso) * 100)}%`,
    })));
    corpo = `${passo({ campo: 'alvo', rot: 'Valor do cofrinho', nota: 'quanto a recompensa custa', valor: f.alvo, delta: 500, unidade: 'R$', cls: 'din', modo: 'decimal' })}
${passo({ campo: 'guardar', rot: 'Guardar por semana', nota: 'sai do saldo livre de dinheiro', valor: f.guardar, delta: 10, unidade: 'R$', cls: 'din', modo: 'decimal' })}
<div class="rc-metas">
<span class="rc-passo-rot" id="rc-meta-rot">Meta-condição</span>
<span class="nota">Só libera com o cofrinho cheio e esta meta cumprida.</span>
<div class="rc-metas-lista" role="radiogroup" aria-labelledby="rc-meta-rot">
${opcoes.map((o) => {
    const on = String(o.id) === String(f.metaId);
    return `<button type="button" class="rc-meta${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-meta="${o.id === null ? '' : esc(o.id)}" data-foco="meta-${o.id === null ? 'nenhuma' : esc(o.id)}"><span class="rc-radio" aria-hidden="true"></span><span class="rc-meta-txt"><span class="rc-meta-tit">${esc(o.titulo)}</span><span class="nota">${esc(o.nota)}</span></span></button>`;
  }).join('')}
</div>
${f.metas.length ? '' : '<span class="nota">Nenhuma meta ativa. Crie em <a href="#/metas">Metas</a> para usar como condição.</span>'}
</div>`;
  }
  const fo = htmlFormula();
  return `<section class="card rc-calc" aria-labelledby="rc-calc-tit">
<div class="card-cab"><h2 id="rc-calc-tit">Calculadora de preço</h2><span class="lado">${CALC_NOTA[f.tipo]}</span></div>
${corpo}
<div id="rc-formula" class="rc-formula ${fo.cls}">${ic.raio(16)}<span>${esc(fo.txt)}</span></div>
</section>`;
}

function htmlLado() {
  const p = preco();
  const nivel = NIVEIS.find((n) => n.id === f.nivel) || NIVEIS[1];
  const ks = ORDEM.filter((k) => p[k] > 0);
  const ritmoTxt = (k) => (f.ritmo[k] === null ? null : comUnidade(k, Math.round(f.ritmo[k]), { sinal: true }));

  let chips = ks.map((k) => `<span class="rc-chip ${MOEDAS[k].cls}">${esc(comUnidade(k, p[k]))}</span>`).join('');
  let barras = '', junta = '', alinhar = '', regra = '';
  const semPreco = f.tipo === 'comida' ? f.kcal === null && !p.reais : ks.length === 0;

  if (f.tipo === 'cofrinho') {
    const meta = f.metas.find((m) => String(m.id) === String(f.metaId)) || null;
    if (meta) chips += `<span class="rc-chip hab">meta de ${esc(HORIZONTE[meta.horizonte] || meta.horizonte)}</span>`;
    const resto = Math.max(0, f.alvo - f.guardado);
    const rd = f.ritmo.reais;
    if (f.guardar > 0) {
      const sem = Math.ceil(resto / f.guardar);
      const fim = addDias(f.H, sem * 7);
      barras = rd > 0
        ? `<div class="rc-barra-l"><span class="nota">${fReais(f.guardar)} por semana = ${Math.round((f.guardar / rd) * 100)}% do seu crédito de dinheiro (${fReais(Math.round(rd))})</span>${barraProgresso(f.guardar / rd, { cls: 'din', rotulo: 'Parte do crédito semanal de dinheiro' })}</div>`
        : `<span class="nota">${fReais(f.guardar)} por semana · sem crédito de dinheiro nas últimas 4 semanas para comparar.</span>`;
      junta = `<div class="rc-junta"><span class="rc-junta-num num">${sem} ${sem === 1 ? 'semana' : 'semanas'}</span><span class="rc-junta-txt">no seu ritmo, para encher o cofrinho · ≈ ${mesAno(fim)}</span></div>
<span class="nota">${meta ? `E a meta "${esc(meta.titulo)}" cumprida até ${mesAno(meta.prazo)}.` : 'Sem meta-condição: libera com o cofrinho cheio.'}</span>`;
      if (meta) {
        const semMeta = Math.ceil(diasEntre(f.H, meta.prazo) / 7);
        let txt;
        if (semMeta <= 0) txt = 'O prazo dessa meta já passou. Escolha outra ou ajuste o prazo em Metas.';
        else if (sem > semMeta) {
          const certo = Math.ceil(resto / semMeta / 5) * 5;
          txt = `O dinheiro chega em ${mesAno(fim)}, depois da meta (${mesAno(meta.prazo)}). Para chegar junto, guarde ${fReais(certo)} por semana${rd > 0 && certo > rd ? ', acima do seu crédito de dinheiro da semana.' : '.'}`;
        } else txt = 'O dinheiro chega antes da meta. A recompensa libera quando a meta for cumprida.';
        alinhar = `<div class="lb-aviso-hab" role="status">${txt}</div>`;
      }
    } else {
      junta = '<span class="nota">Defina quanto guardar por semana para ver em quanto tempo o cofrinho enche.</span>';
    }
    regra = '<b>Cofrinho não repete.</b> Depois de usado, ele sai de Liberar.';
  } else {
    barras = ks.map((k) => {
      const rs = f.ritmo[k];
      if (!(rs > 0)) return `<span class="nota">Sem crédito de ${MOEDAS[k].nome.toLowerCase()} nas últimas 4 semanas para comparar.</span>`;
      const n = Math.round((p[k] / rs) * 100);
      return `<div class="rc-barra-l"><span class="nota">${n}% da sua semana de ${MOEDAS[k].nome.toLowerCase()}</span>${barraProgresso(p[k] / rs, { cls: MOEDAS[k].cls, rotulo: `${n}% da sua semana de ${MOEDAS[k].nome.toLowerCase()}` })}</div>`;
    }).join('');
    if (ks.length) {
      let dias = 0, trava = null;
      const negativos = [];
      for (const k of ks) {
        const rs = f.ritmo[k];
        const deficit = f.livre[k] < 0 ? -f.livre[k] : 0;
        if (deficit) negativos.push(`${MOEDAS[k].nome.toLowerCase()} (${comUnidade(k, -deficit)})`);
        if (!(rs > 0)) { trava = k; break; }
        dias = Math.max(dias, ((p[k] + deficit) / rs) * 7);
      }
      const ritmos = ks.map(ritmoTxt).filter(Boolean);
      if (trava) {
        junta = `<div class="rc-junta"><span class="rc-junta-num num">—</span><span class="rc-junta-txt">no ritmo atual, o crédito de ${MOEDAS[trava].nome.toLowerCase()} não sobe</span></div>`;
      } else {
        const d = Math.max(1, Math.ceil(dias));
        const num = d <= 7 ? `${d} ${d === 1 ? 'dia' : 'dias'}` : `${Math.ceil(dias / 7)} semanas`;
        junta = `<div class="rc-junta"><span class="rc-junta-num num">${num}</span><span class="rc-junta-txt">para juntar no seu ritmo atual</span></div>`;
      }
      junta += `<span class="nota">${ritmos.length ? `Ritmo das últimas 4 semanas: ${ritmos.join(', ').replace(/, ([^,]*)$/, ' e $1')} por semana.` : ''}${negativos.length ? ` Inclui tirar do negativo: ${negativos.join(' e ')}.` : ''}</span>`;
    }
    regra = ks.length
      ? `<b>Regra da repetição.</b> A 2ª vez na mesma semana custa × 1,5: ${ks.map((k) => esc(comUnidade(k, k === 'reais' ? r2(p[k] * 1.5) : Math.round(p[k] * 1.5)))).join(' + ')}.`
      : '<b>Regra da repetição.</b> A 2ª vez na mesma semana custa × 1,5.';
  }

  return `<section class="card rc-preco" aria-labelledby="rc-preco-tit">
<div class="card-cab"><h2 id="rc-preco-tit">Preço final</h2><span class="pilula">${nivel.rot} · ${nivel.sub}</span></div>
<div class="rc-chips">${chips}${semPreco ? `<span class="nota">${f.tipo === 'comida' ? 'Estime as calorias para fechar o preço.' : 'Defina o valor para fechar o preço.'}</span>` : ''}</div>
${barras ? `<div class="rc-barras">${barras}</div>` : ''}
${junta ? `<div class="rc-junta-bloco">${junta}</div>` : ''}
${alinhar}
</section>
<div class="rc-regra">${ic.troca(18)}<span>${regra}</span></div>
${f.erro ? `<div class="aviso" role="alert">${ic.x(16)}<span>${esc(f.erro)}</span></div>` : ''}
<button type="button" class="btn primario largo" data-acao="salvar" data-foco="salvar"${f.salvando ? ' disabled' : ''}>${f.salvando ? 'Salvando…' : f.salvo ? 'Salva' : f.id ? 'Salvar alterações' : 'Salvar recompensa'}</button>
${f.salvo ? `<div class="rc-salvo" role="status"><span>${ic.check(16)}Entrou em Liberar › ${nivel.secao}.</span><a class="lb-link" href="#/liberar">Ver em Liberar</a></div>` : ''}`;
}

function desenhar(el) {
  const ehCofrinho = f.tipo === 'cofrinho';
  el.innerHTML = `<div class="rc-col">
<section class="card" aria-labelledby="rc-nome-rot">
<label class="campo" id="rc-nome-rot">Nome<input type="text" data-texto="nome" data-foco="nome" value="${esc(f.nome)}" maxlength="80" placeholder="Ex.: ${esc(EXEMPLO[f.tipo])}" autocomplete="off"></label>
</section>

<section class="card" aria-labelledby="rc-tipo-rot">
<h2 class="rc-h2" id="rc-tipo-rot">Tipo</h2>
<div class="rc-tipos" role="group" aria-labelledby="rc-tipo-rot">
${TIPOS.map((t) => `<button type="button" class="rc-tipo ${t.cls}${t.id === f.tipo ? ' on' : ''}" data-tipo="${t.id}" data-foco="tipo-${t.id}" aria-pressed="${t.id === f.tipo}"><span class="rc-tipo-rot">${t.rot}</span><span class="rc-tipo-sub">${t.sub}</span></button>`).join('')}
</div>
<span class="grupo-rot" id="rc-nivel-rot">Nível em Liberar</span>
<div class="seg" role="group" aria-labelledby="rc-nivel-rot">
${NIVEIS.map((n) => {
    const on = n.id === f.nivel;
    const bloq = ehCofrinho && n.id !== 'grande';
    return `<button type="button" class="${on ? 'sel' : ''}" data-nivel="${n.id}" data-foco="nivel-${n.id}" aria-pressed="${on}"${bloq ? ' disabled' : ''}>${n.rot} · ${n.sub}</button>`;
  }).join('')}
</div>
${ehCofrinho ? '<span class="nota">Cofrinho fica sempre em Grandes.</span>' : ''}
</section>

<div id="rc-calc">${htmlCalculadora()}</div>
</div>
<div class="rc-col rc-lado" id="rc-lado">${htmlLado()}</div>`;
}

// Atualiza só o que depende dos números (sem trocar os campos em que a pessoa digita).
function atualizarDerivados(el) {
  const fo = htmlFormula();
  const caixa = el.querySelector('#rc-formula');
  if (caixa) { caixa.className = `rc-formula ${fo.cls}`; caixa.innerHTML = `${ic.raio(16)}<span>${esc(fo.txt)}</span>`; }
  const lado = el.querySelector('#rc-lado');
  if (lado) lado.innerHTML = htmlLado();
}

function marcarRascunho(raiz) {
  if (!f.salvo && !f.erro) return;
  f.salvo = false; f.erro = null;
  const p = raiz.querySelector('#rc-pilula');
  if (p) { p.textContent = f.id ? 'editando' : 'rascunho'; p.className = 'pilula'; }
}

// ------------------------------------------------------------ eventos

const LIMITES = {
  minutos: [5, 600], fator: [1, 5], kcal: [0, 5000], reaisComida: [0, 5000], reaisCompra: [0, 50000], alvo: [0, 500000], guardar: [0, 50000],
};
function ajustar(campo, v) {
  const [lo, hi] = LIMITES[campo];
  let n = Math.min(hi, Math.max(lo, v));
  if (campo === 'fator') n = Math.round(n * 10) / 10;
  else if (campo === 'minutos' || campo === 'kcal') n = Math.round(n);
  else n = r2(n);
  return n;
}

export function ligar(raiz, { api, toast }) {
  if (!f) return;
  const el = raiz.querySelector('#rc-form');
  if (!el) return;
  desenhar(el);

  const redesenhar = () => {
    const ativo = document.activeElement;
    const chave = ativo && el.contains(ativo) ? ativo.dataset.foco : null;
    desenhar(el);
    if (chave) el.querySelector(`[data-foco="${CSS.escape(chave)}"]`)?.focus();
  };

  el.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.texto) {
      f[t.dataset.texto] = t.value;
      marcarRascunho(raiz);
      if (t.dataset.texto === 'nome') {
        const h = raiz.querySelector('#rc-titulo');
        if (h) h.textContent = t.value.trim() || 'Sem nome';
      }
      atualizarDerivados(el);
      return;
    }
    if (t.dataset.num) {
      const n = lerNumero(t.value);
      if (Number.isFinite(n)) { f[t.dataset.num] = ajustar(t.dataset.num, n); marcarRascunho(raiz); atualizarDerivados(el); }
    }
  });
  // ao sair do campo, normaliza o número exibido (sem redesenhar: o clique seguinte não se perde)
  el.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.num) t.value = t.dataset.num === 'fator' ? fFator(f.fator) : valorTxt(f[t.dataset.num]);
    if (t.dataset.texto === 'descricao') {
      const mudou = f.kcal !== null && f.iaDesc && f.descricao.trim() !== f.iaDesc.trim();
      if (mudou) redesenhar();
    }
  });

  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;

    if (b.dataset.tipo) {
      if (b.dataset.tipo === f.tipo) return;
      f.tipo = b.dataset.tipo;
      if (f.tipo === 'cofrinho') f.nivel = 'grande';
      else if (!f.nivelManual || f.nivel === 'grande') f.nivel = NIVEL_PADRAO[f.tipo];
      marcarRascunho(raiz);
      redesenhar();
      return;
    }
    if (b.dataset.nivel) {
      f.nivel = b.dataset.nivel; f.nivelManual = true;
      marcarRascunho(raiz);
      redesenhar();
      return;
    }
    if (b.dataset.passo) {
      const campo = b.dataset.passo;
      const base = campo === 'kcal' && f.kcal === null ? 0 : Number(f[campo]) || 0;
      f[campo] = ajustar(campo, base + Number(b.dataset.delta));
      marcarRascunho(raiz);
      redesenhar();
      return;
    }
    if (b.dataset.app) {
      f.app = b.dataset.app;
      marcarRascunho(raiz);
      redesenhar();
      return;
    }
    if (b.dataset.meta !== undefined) {
      f.metaId = b.dataset.meta || null;
      marcarRascunho(raiz);
      redesenhar();
      return;
    }

    const acao = b.dataset.acao;
    if (acao === 'manual') {
      f.kcal = 0; f.iaDesc = null; f.itensIa = []; f.obsIa = '';
      redesenhar();
      el.querySelector('[data-foco="kcal-campo"]')?.focus();
      return;
    }
    if (acao === 'estimar') {
      const texto = f.descricao.trim();
      if (!texto) { f.erroIa = 'Descreva o que vai comer ou beber para a IA estimar.'; redesenhar(); return; }
      f.estimando = true; f.erroIa = null;
      redesenhar();
      try {
        const est = await api.estimarRefeicao(texto);
        f.kcal = Math.round(Number(est.total_kcal) || 0);
        f.iaDesc = texto;
        f.itensIa = Array.isArray(est.itens) ? est.itens : [];
        f.obsIa = est.observacao && !f.itensIa.length ? est.observacao : '';
        marcarRascunho(raiz);
      } catch (e) {
        f.erroIa = e.message || String(e);
      }
      f.estimando = false;
      redesenhar();
      return;
    }
    if (acao === 'salvar') await salvar(raiz, el, api, toast, redesenhar);
  });
}

function validar() {
  if (!f.nome.trim()) return 'Dê um nome para a recompensa.';
  if (f.tipo === 'tempo_app' && !(f.minutos > 0)) return 'Defina os minutos de uso.';
  if (f.tipo === 'comida' && !(f.kcal > 0) && !(f.reaisComida > 0)) return 'Estime as calorias (ou informe o valor) para fechar o preço.';
  if (f.tipo === 'compra' && !(f.reaisCompra > 0)) return 'Defina o valor da compra.';
  if (f.tipo === 'cofrinho' && !(f.alvo > 0)) return 'Defina o valor do cofrinho.';
  if (f.tipo === 'cofrinho' && !(f.guardar > 0)) return 'Defina quanto guardar por semana.';
  return null;
}

function payload() {
  const p = preco();
  const base = {
    nome: f.nome.trim(), nivel: f.tipo === 'cofrinho' ? 'grande' : f.nivel, tipo: f.tipo,
    custo_kcal: 0, custo_reais: 0, custo_min: 0,
    libera_app: null, libera_min: null,
    cofrinho_alvo: null, guardar_semana: null, meta_condicao_id: null,
    descricao: null,
  };
  if (f.tipo === 'tempo_app') Object.assign(base, { custo_min: p.min, libera_app: f.app.trim() || null, libera_min: Math.round(f.minutos) });
  else if (f.tipo === 'comida') Object.assign(base, { custo_kcal: p.kcal, custo_reais: p.reais, descricao: f.descricao.trim() || null });
  else if (f.tipo === 'compra') Object.assign(base, { custo_reais: p.reais });
  else Object.assign(base, { cofrinho_alvo: r2(f.alvo), guardar_semana: r2(f.guardar), meta_condicao_id: f.metaId || null });
  if (f.id) base.id = f.id;
  return base;
}

async function salvar(raiz, el, api, toast, redesenhar) {
  const erro = validar();
  if (erro) { f.erro = erro; redesenhar(); return; }
  f.salvando = true; f.erro = null;
  redesenhar();
  try {
    const salvo = await api.salvarRecompensa(payload());
    if (salvo && salvo.id) f.id = salvo.id;
    f.salvo = true;
    toast('Recompensa salva');
    const p = raiz.querySelector('#rc-pilula');
    if (p) { p.textContent = 'salva'; p.className = 'pilula ok'; }
  } catch (e) {
    f.erro = e.message || String(e);
  }
  f.salvando = false;
  redesenhar();
}
