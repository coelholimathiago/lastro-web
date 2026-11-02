// Plano financeiro guiado. Rotas: #/plano (lista), #/plano/novo?passo=N (entrevista, uma pergunta por tela)
// e #/plano/ver?id=… (o plano: resumo em tópicos, números, gráfico, mês a mês, o que ele cria, Aplicar).
// Contrato: docs/plano-financeiro.md e supabase/migrations/0006_plano_financeiro.sql.
// Os números vêm sempre de plano/simulacao.js; a IA só interpreta texto livre e escreve o resumo.

import { hojeBR, dataLonga, esc, ic, fmt, fReais } from '../ui.js';
import { simular, itensDoPlano, valoresAperto, variavelAlvo, somaMes, mesCurto, diasDoMes } from '../plano/simulacao.js';

const CHAVE = 'lastro-plano-rascunho';
const TOTAL = 10;
const MESES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const AVISO_LEGAL = 'O Lastro organiza orçamento, dívidas e reserva. Não recomenda investimentos nem produtos financeiros.';

// ------------------------------------------------------------ rascunho (localStorage)

function lerRascunho() {
  try {
    const r = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (!r || typeof r !== 'object' || !r.respostas || typeof r.respostas !== 'object') return null;
    return { ui: {}, texto: {}, entendi: {}, passo: 1, ...r };
  } catch { return null; }
}
function gravarRascunho(est) {
  try { est.atualizado = new Date().toISOString(); localStorage.setItem(CHAVE, JSON.stringify(est)); } catch { /* sem armazenamento */ }
}
function limparRascunho() {
  try { localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
}
const novoRascunho = () => ({ respostas: {}, ui: {}, texto: {}, entendi: {}, passo: 1 });
const temRespostas = (est) => !!est && Object.keys(est.respostas || {}).length > 0;

// ------------------------------------------------------------ números e caminhos

// aceita "15 mil", "6.091,87", "R$ 2k", "15000"
function lerReais(txt) {
  let t = String(txt ?? '').trim().toLowerCase().replace(/r\$/g, '').replace(/\s/g, '');
  if (!t) return NaN;
  let mult = 1;
  if (/(mil|k)$/.test(t)) { mult = 1000; t = t.replace(/(mil|k)$/, ''); }
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n * mult : NaN;
}
const fmtIn = (v) => {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '';
  return fmt(n, Math.abs(n % 1) > 0.004 ? 2 : 0);
};
const pos = (v) => Number.isFinite(Number(v)) && Number(v) > 0;
const soma = (lista, campo) => (Array.isArray(lista) ? lista : []).reduce((s, x) => s + (pos(x && x[campo]) ? Number(x[campo]) : 0), 0);

function pegar(obj, caminho) {
  return caminho.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}
function definir(obj, caminho, valor) {
  const ks = caminho.split('.');
  let o = obj;
  ks.slice(0, -1).forEach((k, i) => {
    if (o[k] === null || o[k] === undefined || typeof o[k] !== 'object') o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    o = o[k];
  });
  o[ks[ks.length - 1]] = valor;
}
function remover(obj, caminho) {
  const ks = caminho.split('.');
  const pai = pegar(obj, ks.slice(0, -1).join('.'));
  if (Array.isArray(pai)) pai.splice(Number(ks[ks.length - 1]), 1);
}
// junta os campos que a IA devolveu; objetos (cartão, últimos 3 meses) se mesclam, listas se trocam
function mesclar(dest, campos) {
  Object.entries(campos || {}).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'object' && !Array.isArray(v) && dest[k] && typeof dest[k] === 'object' && !Array.isArray(dest[k])) dest[k] = { ...dest[k], ...v };
    else dest[k] = v;
  });
}

// ------------------------------------------------------------ datas

const mesMedio = (m) => `${MESES_C[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const dataPrazo = (iso) => `${Number(iso.slice(8, 10))} ${MESES_C[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
function diaSP(ts) {
  if (!ts) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}
const diaCurto = (iso) => `${Number(iso.slice(8, 10))} ${MESES_C[Number(iso.slice(5, 7)) - 1]}`;

// ------------------------------------------------------------ peças de formulário

function chip(acao, id, rot, ativo, sub = '') {
  const marca = acao === 'alternar' || acao === 'bool' ? `<span class="pl-chip-marca" aria-hidden="true">${ativo ? ic.check(14) : ''}</span>` : '';
  return `<button type="button" class="pl-chip" data-${acao}="${esc(id)}" aria-pressed="${ativo ? 'true' : 'false'}">${marca}<span class="pl-chip-txt">${esc(rot)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
}
const grupoChips = (rot, html, cls = '') => `<div class="pl-chips${cls ? ' ' + cls : ''}" role="group" aria-label="${esc(rot)}">${html}</div>`;

function campoReais(caminho, rot, valor, { ajuda = '', placeholder = '' } = {}) {
  return `<label class="campo pl-campo">${esc(rot)}
<span class="pl-reais"><span aria-hidden="true">R$</span><input type="text" inputmode="decimal" autocomplete="off" data-campo="${caminho}" data-tipo="reais" value="${esc(fmtIn(valor))}" placeholder="${esc(placeholder)}"></span>
${ajuda ? `<span class="nota">${esc(ajuda)}</span>` : ''}</label>`;
}
function campoNumero(caminho, rot, valor, { tipo = 'inteiro', sufixo = '', placeholder = '', ajuda = '' } = {}) {
  return `<label class="campo pl-campo">${esc(rot)}
<span class="pl-reais pl-sufixo"><input type="text" inputmode="${tipo === 'inteiro' ? 'numeric' : 'decimal'}" autocomplete="off" data-campo="${caminho}" data-tipo="${tipo}" value="${esc(valor === null || valor === undefined ? '' : fmtIn(valor))}" placeholder="${esc(placeholder)}">${sufixo ? `<span aria-hidden="true">${esc(sufixo)}</span>` : ''}</span>
${ajuda ? `<span class="nota">${esc(ajuda)}</span>` : ''}</label>`;
}
function campoTexto(caminho, rot, valor, placeholder = '') {
  return `<label class="campo pl-campo">${esc(rot)}<input type="text" maxlength="80" autocomplete="off" data-campo="${caminho}" data-tipo="texto" value="${esc(valor || '')}" placeholder="${esc(placeholder)}"></label>`;
}
function opcoesMes(valor, de, ate) {
  const m0 = hojeBR().slice(0, 7);
  const lista = [];
  for (let i = de; i <= ate; i++) lista.push(somaMes(m0, i));
  if (valor && /^\d{4}-\d{2}$/.test(valor) && !lista.includes(valor)) { lista.push(valor); lista.sort(); }
  return `<option value="">Escolha o mês</option>${lista.map((m) => `<option value="${m}"${m === valor ? ' selected' : ''}>${esc(mesMedio(m))}</option>`).join('')}`;
}
function campoMes(caminho, rot, valor, de = 0, ate = 24) {
  return `<label class="campo pl-campo">${esc(rot)}<select data-campo="${caminho}" data-tipo="mes">${opcoesMes(valor, de, ate)}</select></label>`;
}
// linha "Moradia ......... R$ [    ] ×"
function linhaValor(caminho, nome, valor, rotRemover) {
  return `<div class="pl-linha"><span class="pl-linha-nome">${esc(nome)}</span>
<span class="pl-reais"><span aria-hidden="true">R$</span><input type="text" inputmode="decimal" autocomplete="off" data-campo="${caminho}" data-tipo="reais" value="${esc(fmtIn(valor))}" placeholder="0" aria-label="${esc(nome)} por mês"></span>
<button type="button" class="btn-icone leve" data-remover="${caminho.replace(/\.valor$/, '')}" aria-label="${esc(rotRemover)}">${ic.x(16)}</button></div>`;
}

// ------------------------------------------------------------ as 10 perguntas

const FAIXAS_RENDA = [
  { id: 'ate5', rot: 'até R$ 5 mil', min: 0, max: 5000, meio: 4000 },
  { id: '5a10', rot: 'R$ 5 a 10 mil', min: 5000, max: 10000, meio: 7500 },
  { id: '10a20', rot: 'R$ 10 a 20 mil', min: 10000, max: 20000, meio: 15000 },
  { id: 'mais20', rot: 'mais de R$ 20 mil', min: 20000, max: Infinity, meio: 25000 },
];
const FAIXAS_VARIAVEL = [
  { id: 'ate3', rot: 'até R$ 3 mil', min: 0, max: 3000, meio: 2500 },
  { id: '3a5', rot: 'R$ 3 a 5 mil', min: 3000, max: 5000, meio: 4000 },
  { id: '5a8', rot: 'R$ 5 a 8 mil', min: 5000, max: 8000, meio: 6500 },
  { id: 'mais8', rot: 'mais de R$ 8 mil', min: 8000, max: Infinity, meio: 10000 },
];
const faixaDe = (v, faixas) => (pos(v) ? (faixas.find((f) => Number(v) <= f.max) || faixas[faixas.length - 1]).id : null);

const FIXOS = ['Moradia', 'Família', 'Financiamento', 'Consórcio', 'Saúde', 'Educação', 'Assinaturas', 'Outros'];
const DIVIDAS = ['Empréstimo', 'Financiamento', 'Cheque especial', 'Acordo'];
const CATEGORIAS_VAR = ['Mercado', 'Uber e gasolina', 'Delivery e restaurante', 'Lazer', 'Farmácia', 'Outros'];
const SITUACOES = [
  { id: 'sobrou', rot: 'Sobrou' },
  { id: 'empatou', rot: 'Empatou' },
  { id: 'faltou_investimentos', rot: 'Faltou e tirei dos investimentos' },
  { id: 'faltou_vermelho', rot: 'Faltou e entrei no vermelho' },
];
const OBJETIVOS = [
  { tipo: 'contas_em_dia', rot: 'Contas em dia' },
  { tipo: 'viagem', rot: 'Viagem' },
  { tipo: 'reserva', rot: 'Reserva de emergência' },
  { tipo: 'recompor', rot: 'Recompor investimentos' },
  { tipo: 'quitar_divida', rot: 'Quitar dívida' },
  { tipo: 'compra', rot: 'Compra planejada' },
];
const CARTAO = [
  { id: 'total', rot: 'Pago a fatura inteira' },
  { id: 'rotativo', rot: 'Pago parte e entro no rotativo' },
  { id: 'parcelo', rot: 'Parcelo a fatura' },
];

// escolha de chip que dá para tirar das respostas (vale depois que a IA preenche)
function derivar(passo, R) {
  if (passo === 1) return faixaDe(R.renda_fixa, FAIXAS_RENDA);
  if (passo === 2) {
    if (pos(R.renda_investimentos)) return R.usa_rendimento ? 'usa' : 'reinveste';
    return 'renda_investimentos' in R || 'usa_rendimento' in R ? 'nao' : null;
  }
  if (passo === 4) {
    const c = R.cartao || {};
    if (c.paga_total) return 'total';
    if (c.rotativo) return 'rotativo';
    if (c.parcela_fatura === true) return 'parcelo';
    return null;
  }
  if (passo === 5) return Array.isArray(R.dividas) && R.dividas.length === 0 && R._sem_dividas ? 'nenhuma' : null;
  if (passo === 7) return faixaDe(R.variavel_atual, FAIXAS_VARIAVEL);
  return null;
}
const escolhaDe = (est, passo) => {
  const u = est.ui[passo];
  return u && u.escolha !== undefined ? u.escolha : derivar(passo, est.respostas);
};

const PASSOS = {
  1: {
    grupo: 'Renda',
    titulo: 'Quanto entra por mês, líquido?',
    ajuda: () => 'O que cai na conta depois dos impostos. Se vocês dividem as contas da casa, some a renda dos dois.',
    exemplo: 'Entra uns 15 mil líquidos por mês, fixo',
    corpo(R, est) {
      const e = escolhaDe(est, 1);
      let h = grupoChips('Faixa de renda', FAIXAS_RENDA.map((f) => chip('escolha', f.id, f.rot, e === f.id)).join(''), 'grade');
      if (e || pos(R.renda_fixa)) {
        h += `<div class="pl-abre">${campoReais('renda_fixa', 'Quanto, mais ou menos', R.renda_fixa, { ajuda: 'Um valor aproximado serve. Ajuste se souber o exato.' })}
${grupoChips('Renda variável', chip('bool', 'renda_varia', 'Varia de um mês para o outro', !!R.renda_varia))}</div>`;
      }
      return h;
    },
    escolher(id, R) {
      const f = FAIXAS_RENDA.find((x) => x.id === id);
      if (!(Number(R.renda_fixa) >= f.min && Number(R.renda_fixa) <= f.max)) R.renda_fixa = f.meio;
    },
    validar: (R) => (pos(R.renda_fixa) ? '' : 'Escolha uma faixa ou escreva quanto entra por mês.'),
  },
  2: {
    grupo: 'Renda',
    titulo: 'Você tem renda de investimentos todo mês?',
    ajuda: () => 'Rendimento que cai todo mês, como juros ou aluguel recebido.',
    exemplo: 'Rende uns 2 mil por mês e uso nas contas; tenho uns 250 mil investidos',
    corpo(R, est) {
      const e = escolhaDe(est, 2);
      let h = grupoChips('Renda de investimentos', [['nao', 'Não'], ['usa', 'Sim, uso nas contas'], ['reinveste', 'Sim, reinvisto']]
        .map(([id, rot]) => chip('escolha', id, rot, e === id)).join(''), 'coluna');
      if (e === 'usa' || e === 'reinveste') {
        h += `<div class="pl-abre">${campoReais('renda_investimentos', 'Quanto rende por mês', R.renda_investimentos, { placeholder: '2.000' })}
${campoReais('investido_total', 'Quanto tem investido, mais ou menos (opcional)', R.investido_total, { ajuda: 'Serve só para mostrar quanto custa cada resgate.', placeholder: '250.000' })}</div>`;
      }
      return h;
    },
    escolher(id, R) {
      if (id === 'nao') { R.renda_investimentos = 0; R.usa_rendimento = false; return; }
      R.usa_rendimento = id === 'usa';
      if (!pos(R.renda_investimentos)) delete R.renda_investimentos;
    },
    validar(R, est) {
      const e = escolhaDe(est, 2);
      if (!e) return 'Escolha uma opção.';
      if (e === 'usa' && !pos(R.renda_investimentos)) return 'Informe quanto rende por mês.';
      return '';
    },
  },
  3: {
    grupo: 'Contas e dívidas',
    titulo: 'Quais são seus gastos fixos?',
    ajuda: () => 'Toque em cada um que vocês têm e informe o valor por mês. Cartão e gastos do dia a dia vêm depois.',
    exemplo: 'Aluguel 3.500, escola 2.000, plano de saúde 600',
    corpo(R) {
      const lista = Array.isArray(R.fixos) ? R.fixos : [];
      const nomes = new Set(lista.map((f) => f.nome));
      let h = grupoChips('Categorias de gasto fixo', FIXOS.map((n) => chip('alternar', n, n, nomes.has(n))).join(''));
      if (lista.length) {
        h += `<div class="pl-linhas">${lista.map((f, i) => linhaValor(`fixos.${i}.valor`, f.nome, f.valor, `Tirar ${f.nome}`)).join('')}</div>
<div class="pl-total"><span>Total fixo por mês</span><b class="num" data-total="fixos">${fReais(soma(lista, 'valor'))}</b></div>`;
      }
      return h;
    },
    alternar(nome, R) {
      if (!Array.isArray(R.fixos)) R.fixos = [];
      const i = R.fixos.findIndex((f) => f.nome === nome);
      if (i >= 0) { R.fixos.splice(i, 1); return null; }
      R.fixos.push({ nome, valor: null });
      return `fixos.${R.fixos.length - 1}.valor`;
    },
    validar(R) {
      const vazio = (R.fixos || []).find((f) => !pos(f.valor));
      return vazio ? `Informe o valor de ${vazio.nome} ou tire da lista.` : '';
    },
  },
  4: {
    grupo: 'Contas e dívidas',
    titulo: 'Como está o cartão?',
    ajuda: () => 'A fatura deste mês e as parcelas que já estão lá. O plano supõe que o dia a dia é pago no cartão.',
    exemplo: 'A fatura de agora é 14.200 e vence dia 10. Depois tem 6.605 em dezembro, 6.091,87 em janeiro…',
    corpo(R, est) {
      const e = escolhaDe(est, 4);
      const c = R.cartao || {};
      let h = grupoChips('Situação do cartão', CARTAO.map((o) => chip('escolha', o.id, o.rot, e === o.id)).join(''), 'coluna');
      if (e || c.fatura_atual !== undefined || (c.parcelas_futuras || []).length) {
        const pf = Array.isArray(c.parcelas_futuras) ? c.parcelas_futuras : [];
        h += `<div class="pl-abre">
<div class="pl-par">${campoReais('cartao.fatura_atual', 'Fatura deste mês', c.fatura_atual, { placeholder: '14.200' })}
${campoNumero('cartao.vencimento_dia', 'Vence no dia', c.vencimento_dia, { placeholder: '10' })}</div>
<div class="pl-sub"><span class="grupo-rot">Parcelas que já estão no cartão, nos próximos meses</span>
${pf.length ? `<div class="pl-linhas">${pf.map((p, i) => `<div class="pl-linha pl-linha-mes">
<select data-campo="cartao.parcelas_futuras.${i}.mes" data-tipo="mes" aria-label="Mês da parcela">${opcoesMes(p.mes, 1, 24)}</select>
<span class="pl-reais"><span aria-hidden="true">R$</span><input type="text" inputmode="decimal" autocomplete="off" data-campo="cartao.parcelas_futuras.${i}.valor" data-tipo="reais" value="${esc(fmtIn(p.valor))}" placeholder="0" aria-label="Valor das parcelas nesse mês"></span>
<button type="button" class="btn-icone leve" data-remover="cartao.parcelas_futuras.${i}" aria-label="Tirar este mês">${ic.x(16)}</button></div>`).join('')}</div>` : ''}
<button type="button" class="btn tracejado" data-add="parcela">${ic.mais(16)}Adicionar mês</button>
<span class="nota">Mais rápido: escreva a lista no campo abaixo, do jeito que aparece no app do banco.</span></div></div>`;
      }
      return h;
    },
    escolher(id, R) {
      R.cartao = { ...(R.cartao || {}), paga_total: id === 'total', rotativo: id === 'rotativo', parcela_fatura: id === 'parcelo' };
    },
    validar(R, est) {
      if (!escolhaDe(est, 4)) return 'Escolha como está o cartão.';
      const c = R.cartao || {};
      if (!(Number(c.fatura_atual) >= 0) || c.fatura_atual === null || c.fatura_atual === undefined || c.fatura_atual === '') return 'Informe a fatura deste mês (pode ser 0).';
      const sem = (c.parcelas_futuras || []).find((p) => !p.mes || !pos(p.valor));
      return sem ? 'Complete o mês e o valor de cada parcela, ou tire a linha.' : '';
    },
  },
  5: {
    grupo: 'Contas e dívidas',
    titulo: 'Tem outras dívidas?',
    ajuda: () => 'Fora o cartão. Se já colocou o financiamento nos gastos fixos, não repita aqui.',
    exemplo: 'Um empréstimo de 12 mil, parcela de 900 por mês',
    corpo(R, est) {
      const lista = Array.isArray(R.dividas) ? R.dividas : [];
      const nenhuma = escolhaDe(est, 5) === 'nenhuma';
      const nomes = new Set(lista.map((d) => d.nome));
      let h = grupoChips('Tipos de dívida', chip('escolha', 'nenhuma', 'Nenhuma', nenhuma) + DIVIDAS.map((n) => chip('alternar', n, n, nomes.has(n))).join(''));
      if (lista.length) {
        h += `<div class="pl-abre">${lista.map((d, i) => `<div class="pl-bloco">
<div class="pl-bloco-cab"><b>${esc(d.nome)}</b><button type="button" class="btn-icone leve" data-remover="dividas.${i}" aria-label="Tirar ${esc(d.nome)}">${ic.x(16)}</button></div>
<div class="pl-par">${campoReais(`dividas.${i}.parcela`, 'Parcela por mês', d.parcela)}${campoReais(`dividas.${i}.saldo`, 'Quanto falta pagar', d.saldo)}</div>
${campoNumero(`dividas.${i}.juros_mes`, 'Juros ao mês (opcional)', d.juros_mes, { tipo: 'pct', sufixo: '% ao mês', placeholder: '2,5' })}
</div>`).join('')}</div>`;
      }
      return h;
    },
    escolher(id, R, est) {
      R.dividas = [];
      R._sem_dividas = true;
      est.ui[5] = { escolha: 'nenhuma' };
    },
    alternar(nome, R, est) {
      if (!Array.isArray(R.dividas)) R.dividas = [];
      delete R._sem_dividas;
      est.ui[5] = { escolha: null };
      const i = R.dividas.findIndex((d) => d.nome === nome);
      if (i >= 0) { R.dividas.splice(i, 1); return null; }
      R.dividas.push({ nome, saldo: null, parcela: null });
      return `dividas.${R.dividas.length - 1}.parcela`;
    },
    validar(R, est) {
      const lista = R.dividas || [];
      if (escolhaDe(est, 5) !== 'nenhuma' && !lista.length) return 'Escolha "Nenhuma" ou as dívidas que vocês têm.';
      const sem = lista.find((d) => !pos(d.parcela));
      return sem ? `Informe a parcela por mês de ${sem.nome}.` : '';
    },
  },
  6: {
    grupo: 'Dia a dia',
    titulo: 'Nos últimos 3 meses, o dinheiro…',
    ajuda: () => 'Uma ideia de como a conta tem fechado. Serve para saber quanto o plano precisa repor.',
    exemplo: 'Faltou, tirei uns 20 mil dos investimentos',
    corpo(R) {
      const u = R.ultimos_3m || {};
      let h = grupoChips('Como fechou', SITUACOES.map((s) => chip('escolha', s.id, s.rot, u.situacao === s.id)).join(''), 'coluna');
      if (u.situacao && u.situacao !== 'empatou') {
        const rot = u.situacao === 'sobrou' ? 'Quanto sobrou, somando os 3 meses' : u.situacao === 'faltou_investimentos' ? 'Quanto saiu dos investimentos, somando os 3 meses' : 'Quanto faltou, somando os 3 meses';
        h += `<div class="pl-abre">${campoReais('ultimos_3m.valor', rot, u.valor, { placeholder: '20.000' })}</div>`;
      }
      return h;
    },
    escolher(id, R) {
      R.ultimos_3m = { ...(R.ultimos_3m || {}), situacao: id };
      if (id === 'empatou') R.ultimos_3m.valor = 0;
    },
    validar(R) {
      const u = R.ultimos_3m || {};
      if (!u.situacao) return 'Escolha uma opção.';
      if (u.situacao === 'faltou_investimentos' && !pos(u.valor)) return 'Informe quanto saiu dos investimentos.';
      return '';
    },
  },
  7: {
    grupo: 'Dia a dia',
    titulo: 'Quanto vocês gastam no variável por mês hoje?',
    ajuda: () => 'Mercado, Uber, gasolina, delivery, restaurante, farmácia, lazer: tudo o que muda de um mês para o outro.',
    exemplo: 'Uns 6.700 por mês: mercado 2.500, Uber e gasolina 1.200…',
    corpo(R, est) {
      const e = escolhaDe(est, 7);
      let h = grupoChips('Faixa do variável', FAIXAS_VARIAVEL.map((f) => chip('escolha', f.id, f.rot, e === f.id)).join(''), 'grade');
      if (e || pos(R.variavel_atual)) {
        const cats = Array.isArray(R.categorias) ? R.categorias : [];
        const aberto = cats.some((c) => pos(c.valor));
        h += `<div class="pl-abre">${campoReais('variavel_atual', 'Quanto, mais ou menos, por mês', R.variavel_atual, { ajuda: 'Um valor aproximado serve.' })}
<details class="pl-detalhe"${aberto ? ' open' : ''}><summary>Detalhar por categoria (opcional)</summary>
<div class="pl-linhas">${CATEGORIAS_VAR.map((n) => {
          const i = cats.findIndex((c) => c.nome === n);
          return `<div class="pl-linha"><span class="pl-linha-nome">${esc(n)}</span><span class="pl-reais"><span aria-hidden="true">R$</span><input type="text" inputmode="decimal" autocomplete="off" data-cat="categorias" data-nome="${esc(n)}" value="${esc(fmtIn(i >= 0 ? cats[i].valor : null))}" placeholder="0" aria-label="${esc(n)} por mês"></span></div>`;
        }).join('')}</div>
<span class="nota">A soma das categorias vira o total.</span></details></div>`;
      }
      return h;
    },
    escolher(id, R) {
      const f = FAIXAS_VARIAVEL.find((x) => x.id === id);
      if (!(Number(R.variavel_atual) >= f.min && Number(R.variavel_atual) <= f.max)) R.variavel_atual = f.meio;
    },
    validar: (R) => (pos(R.variavel_atual) ? '' : 'Escolha uma faixa ou escreva quanto gastam hoje.'),
  },
  8: {
    grupo: 'Dia a dia',
    titulo: 'Qual o mínimo de variável que dá para viver bem?',
    ajuda: (R) => `O piso: abaixo disso o plano não aperta.${pos(R.variavel_atual) ? ` Hoje vocês gastam ${fReais(R.variavel_atual)} por mês.` : ''}`,
    exemplo: 'Dá para viver bem com 4.500: mercado 2.000, transporte 1.000…',
    corpo(R) {
      const lista = Array.isArray(R.piso_categorias) ? R.piso_categorias : [];
      const nomes = new Set(lista.map((c) => c.nome));
      let h = grupoChips('Categorias do mínimo', CATEGORIAS_VAR.map((n) => chip('alternar', n, n, nomes.has(n))).join(''));
      if (lista.length) h += `<div class="pl-linhas">${lista.map((c, i) => linhaValor(`piso_categorias.${i}.valor`, c.nome, c.valor, `Tirar ${c.nome}`)).join('')}</div>`;
      h += `<div class="pl-abre">${campoReais('piso_variavel', 'Mínimo por mês', R.piso_variavel, { ajuda: lista.length ? 'Soma das categorias. Dá para escrever o total direto.' : 'Escreva o total direto ou monte pelas categorias acima.', placeholder: '4.500' })}</div>`;
      return h;
    },
    alternar(nome, R) {
      if (!Array.isArray(R.piso_categorias)) R.piso_categorias = [];
      const i = R.piso_categorias.findIndex((c) => c.nome === nome);
      if (i >= 0) {
        R.piso_categorias.splice(i, 1);
        const s = soma(R.piso_categorias, 'valor');
        if (s > 0) R.piso_variavel = s;
        return null;
      }
      R.piso_categorias.push({ nome, valor: null });
      return `piso_categorias.${R.piso_categorias.length - 1}.valor`;
    },
    validar: (R) => (pos(R.piso_variavel) ? '' : 'Informe o mínimo por mês.'),
  },
  9: {
    grupo: 'Objetivo',
    titulo: 'Aonde você quer chegar?',
    ajuda: () => 'Pode escolher mais de um.',
    exemplo: 'Viagem de 40 mil em abril, parcelada em 10×, e recompor o que tirei',
    corpo(R) {
      const lista = Array.isArray(R.objetivos) ? R.objetivos : [];
      const tipos = new Set(lista.map((o) => o.tipo));
      let h = grupoChips('Objetivos', OBJETIVOS.map((o) => chip('alternar', o.tipo, o.rot, tipos.has(o.tipo))).join(''), 'coluna');
      const blocos = lista.map((o, i) => {
        const p = `objetivos.${i}`;
        const nome = (OBJETIVOS.find((x) => x.tipo === o.tipo) || { rot: o.tipo }).rot;
        if (o.tipo === 'viagem' || o.tipo === 'compra') {
          const formas = [['parcelado', 'Parcelado'], ['a_vista', 'À vista'], ['misto', 'Parte à vista, parte parcelado']];
          return `<div class="pl-bloco"><div class="pl-bloco-cab"><b>${esc(nome)}</b></div>
${campoTexto(`${p}.descricao`, o.tipo === 'viagem' ? 'Para onde' : 'O quê', o.descricao, o.tipo === 'viagem' ? 'Europa' : 'Carro')}
<div class="pl-par">${campoReais(`${p}.valor`, 'Quanto custa', o.valor, { placeholder: '40.000' })}${campoMes(`${p}.mes`, 'Quando', o.mes, 0, 24)}</div>
<span class="grupo-rot">Como pagar</span>
${grupoChips('Como pagar', formas.map(([id, rot]) => `<button type="button" class="pl-chip pl-chip-p" data-definir="${p}.forma" data-valor="${id}" aria-pressed="${o.forma === id}"><span class="pl-chip-txt">${esc(rot)}</span></button>`).join(''))}
${o.forma !== 'a_vista' ? campoNumero(`${p}.parcelas`, 'Em quantas vezes o que faltar', o.parcelas, { sufixo: 'vezes', placeholder: '10', ajuda: 'O que der para juntar até lá vai para um cofrinho; o resto entra parcelado.' }) : ''}
</div>`;
        }
        if (o.tipo === 'reserva') return `<div class="pl-bloco"><div class="pl-bloco-cab"><b>${esc(nome)}</b></div>${campoReais(`${p}.valor`, 'Quanto quer ter de reserva (opcional)', o.valor)}</div>`;
        if (o.tipo === 'recompor') return `<div class="pl-bloco"><div class="pl-bloco-cab"><b>${esc(nome)}</b></div>${campoReais(`${p}.valor`, 'Quanto quer repor, se souber (opcional)', o.valor, { ajuda: 'Sem valor, o plano repõe o que saiu dos investimentos.' })}</div>`;
        return '';
      }).join('');
      if (blocos) h += `<div class="pl-abre">${blocos}</div>`;
      return h;
    },
    alternar(tipo, R) {
      if (!Array.isArray(R.objetivos)) R.objetivos = [];
      const i = R.objetivos.findIndex((o) => o.tipo === tipo);
      if (i >= 0) { R.objetivos.splice(i, 1); return null; }
      const novo = { tipo };
      if (tipo === 'viagem' || tipo === 'compra') Object.assign(novo, { descricao: '', valor: null, mes: null, forma: 'parcelado', parcelas: 10 });
      R.objetivos.push(novo);
      const idx = R.objetivos.length - 1;
      return tipo === 'viagem' || tipo === 'compra' ? `objetivos.${idx}.descricao` : tipo === 'reserva' || tipo === 'recompor' ? `objetivos.${idx}.valor` : null;
    },
    validar(R) {
      const lista = R.objetivos || [];
      if (!lista.length) return 'Escolha pelo menos um objetivo.';
      const v = lista.find((o) => (o.tipo === 'viagem' || o.tipo === 'compra') && (!pos(o.valor) || !o.mes));
      if (v) return `Informe quanto custa e quando é a ${v.tipo === 'viagem' ? 'viagem' : 'compra'}.`;
      return '';
    },
  },
  10: {
    grupo: 'Objetivo',
    titulo: 'Quanto aperto vocês topam?',
    ajuda: (R) => `O variável desce em 3 degraus, um por mês, até o valor escolhido.${pos(R.variavel_atual) ? ` Hoje: ${fReais(R.variavel_atual)}.` : ''}${pos(R.piso_variavel) ? ` Mínimo: ${fReais(R.piso_variavel)}.` : ''}`,
    exemplo: 'Topo baixar para 5 mil',
    corpo(R) {
      const v = valoresAperto(R);
      const ap = R.aperto;
      const sub = (x) => (x ? `${fReais(x)} por mês` : '');
      let h = grupoChips('Nível de aperto', [
        chip('escolha', 'leve', 'Leve', ap === 'leve', sub(v.leve)),
        chip('escolha', 'medio', 'Médio', ap === 'medio', sub(v.medio)),
        chip('escolha', 'firme', 'Firme', ap === 'firme', sub(v.firme)),
        chip('escolha', 'outro', 'Outro valor', ap === 'outro'),
      ].join(''), 'coluna');
      if (ap === 'outro') h += `<div class="pl-abre">${campoReais('variavel_alvo', 'Variável por mês, depois dos degraus', R.variavel_alvo, { placeholder: '5.000' })}</div>`;
      h += `<div class="pl-previa" data-previa aria-live="polite">${previaAperto(R)}</div>`;
      return h;
    },
    escolher(id, R) {
      R.aperto = id;
      if (id !== 'outro') { R.variavel_alvo = valoresAperto(R)[id]; return null; }
      return 'variavel_alvo';
    },
    validar(R) {
      if (!R.aperto) return 'Escolha o nível de aperto.';
      return !outroSemValor(R) && variavelAlvo(R) > 0 ? '' : 'Informe o valor do variável por mês.';
    },
  },
};

// "Outro valor" só vale com o campo preenchido: sem ele, variavelAlvo() cairia no variável atual
const outroSemValor = (R) => R.aperto === 'outro' && !(Number(R.variavel_alvo) > 0);

function previaAperto(R) {
  if (!R.aperto || outroSemValor(R) || !(variavelAlvo(R) > 0)) return '';
  const sim = simular(R, { hoje: hojeBR() });
  const v = sim.variavel_por_mes;
  const k = sim.kpis;
  return `<ul class="pl-topicos-lista">
<li>Degraus: ${esc(mesCurto(v[0].mes))} ${fReais(v[0].valor)} · ${esc(mesCurto(v[1].mes))} ${fReais(v[1].valor)} · a partir de ${esc(mesCurto(v[2].mes))} ${fReais(v[2].valor)}.</li>
<li>Folga por mês com o variável no alvo, depois das contas fixas: <b class="${k.sobra_estrutural < 0 ? 'cor-no' : ''}">${fReais(k.sobra_estrutural, { sinal: true })}</b>.</li>
</ul>`;
}

// ------------------------------------------------------------ montar

export async function montar(ctx) {
  const { api, rota } = ctx;
  if (api.modo === 'demo' || typeof api.planos !== 'function') return telaDemo();
  if (rota.arg === 'novo') return montarEntrevista(ctx);
  if (rota.arg === 'ver') return montarVer(ctx);
  return montarLista(ctx);
}

function telaDemo() {
  return `<div class="tela pl-tela">
<div class="topo"><div><span class="quando">Metas</span><h1>Plano financeiro</h1></div><a class="btn-icone" href="#/metas" aria-label="Voltar para metas">${ic.x(18)}</a></div>
<section class="card hab"><div class="card-cab"><h2>${ic.cofre(18)}Disponível com a conta conectada</h2></div>
<ul class="pl-topicos-lista">
<li>10 perguntas curtas sobre renda, contas, cartão e objetivo.</li>
<li>Uma simulação mês a mês e um resumo em tópicos escrito pela IA.</li>
<li>Ao aprovar, o teto diário de gastos passa a seguir o plano.</li>
</ul>
<a class="btn largo" href="#/ajustes">Conectar nos ajustes</a></section>
</div>`;
}

// ------------------------------------------------------------ lista

async function montarLista({ api }) {
  const H = hojeBR();
  const planos = await api.planos();
  const est = lerRascunho();
  const aplicados = planos.filter((p) => p.status === 'aplicado');
  const rascunhos = planos.filter((p) => p.status === 'rascunho');

  const andamento = temRespostas(est) ? `<section class="card tmp pl-andamento">
<div class="card-cab"><h2>${ic.relogio(18)}Entrevista em andamento</h2><span class="lado">pergunta ${Math.min(TOTAL, est.passo || 1)} de ${TOTAL}</span></div>
<div class="pl-barra" aria-hidden="true"><div style="width:${(Math.min(TOTAL, est.passo || 1) / TOTAL) * 100}%"></div></div>
<div class="pl-botoes"><a class="btn primario" href="#/plano/novo?passo=${Math.min(TOTAL, est.passo || 1)}">Continuar</a><button type="button" class="btn fantasma" data-acao="descartar">Descartar</button></div>
</section>` : '';

  const cardAplicado = (p) => {
    const r = p.resumo || {};
    const topicos = [...(r.diagnostico || []), ...(r.regras || [])].filter(Boolean).slice(0, 3);
    const k = (p.simulacao || {}).kpis || {};
    const fallback = [
      k.resgate_total > 0 ? `Resgate de ${fReais(k.resgate_total)} até ${mesCurto(k.ultimo_resgate_mes)}.` : null,
      k.variavel_alvo ? `Variável de ${fReais(k.variavel_alvo)} por mês depois dos degraus.` : null,
      k.recompor_mes ? `Investimentos de volta em ${mesCurto(k.recompor_mes)}.` : null,
    ].filter(Boolean);
    const lista = topicos.length ? topicos : fallback;
    const dia = diaSP(p.aplicado_em);
    return `<section class="card din pl-card-plano">
<div class="card-cab"><h2>${ic.check(18)}${esc(p.titulo || 'Plano financeiro')}</h2><span class="lado">${dia ? `aplicado em ${esc(diaCurto(dia))}` : 'aplicado'}</span></div>
${lista.length ? `<ul class="pl-topicos-lista">${lista.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
<a class="btn largo" href="#/plano/ver?id=${encodeURIComponent(p.id)}">Ver plano${ic.seta(16)}</a></section>`;
  };

  const listaRasc = rascunhos.length ? `<section class="card"><div class="card-cab"><h2>Rascunhos</h2><span class="lado">ainda não aplicados</span></div>
<div class="lista">${rascunhos.map((p) => `<a class="item pl-item-link" href="#/plano/ver?id=${encodeURIComponent(p.id)}"><span class="txt"><span>${esc(p.titulo || 'Plano financeiro')}</span><small>criado em ${esc(diaCurto(diaSP(p.criado_em) || H))}</small></span>${ic.seta(18)}</a>`).join('')}</div></section>` : '';

  const intro = !planos.length && !andamento ? `<section class="card pl-intro">
<div class="card-cab"><h2>${ic.brilho(18)}Como funciona</h2><span class="lado">uns 5 minutos</span></div>
<ul class="pl-topicos-lista">
<li>10 perguntas, uma por tela: toque nas opções ou escreva do seu jeito.</li>
<li>O app simula mês a mês o cartão, o variável e o que sobra.</li>
<li>A IA escreve o resumo em tópicos; os números são sempre da simulação.</li>
<li>Ao aprovar, o plano cria o teto de cada mês, as metas e o cofrinho. O teto diário passa a seguir o plano.</li>
</ul>
<button type="button" class="btn primario largo" data-acao="novo">Começar</button>
<p class="nota" style="margin:0">${esc(AVISO_LEGAL)}</p></section>` : '';

  return `<div class="tela pl-tela pl-lista">
<div class="topo"><div><span class="quando">${esc(dataLonga(H))}</span><h1>Plano financeiro</h1></div>
${planos.length || andamento ? `<button type="button" class="btn primario" data-acao="novo">${ic.mais(16)}Novo plano</button>` : `<a class="btn-icone" href="#/metas" aria-label="Voltar para metas">${ic.x(18)}</a>`}</div>
${andamento}
${aplicados.map(cardAplicado).join('')}
${listaRasc}
${intro}
</div>`;
}

function ligarLista(raiz, { ir, recarregar }) {
  raiz.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    if (b.dataset.acao === 'descartar') {
      if (!window.confirm('Descartar a entrevista em andamento?')) return;
      limparRascunho();
      recarregar();
    } else if (b.dataset.acao === 'novo') {
      const est = lerRascunho();
      if (temRespostas(est) && !window.confirm('Começar do zero? A entrevista em andamento será descartada.')) return;
      gravarRascunho(novoRascunho());
      ir('#/plano/novo?passo=1');
    }
  });
}

// ------------------------------------------------------------ entrevista

let ent = null; // { est, passo }

function montarEntrevista({ rota }) {
  const est = lerRascunho() || novoRascunho();
  let passo = Number(rota.q.get('passo'));
  if (!(passo >= 1 && passo <= TOTAL)) passo = Math.min(TOTAL, Math.max(1, Number(est.passo) || 1));
  est.passo = passo;
  gravarRascunho(est);
  ent = { est, passo };
  const P = PASSOS[passo];
  const R = est.respostas;
  const voltar = passo > 1 ? `#/plano/novo?passo=${passo - 1}` : '#/plano';

  return `<div class="tela pl-tela pl-entrevista">
<div class="pl-cab">
<div class="pl-progresso"><span class="pl-progresso-rot"><b>Pergunta ${passo} de ${TOTAL}</b> · ${esc(P.grupo)}</span>
<div class="pl-barra" role="progressbar" aria-label="Progresso da entrevista" aria-valuemin="1" aria-valuemax="${TOTAL}" aria-valuenow="${passo}"><div style="width:${(passo / TOTAL) * 100}%"></div></div></div>
<a class="btn-icone leve" href="#/plano" aria-label="Fechar; as respostas ficam salvas">${ic.x(18)}</a>
</div>
<div class="pl-pergunta"><h1>${esc(P.titulo)}</h1><p class="nota">${esc(P.ajuda(R))}</p></div>
<div id="pl-corpo" class="pl-corpo">${P.corpo(R, est)}</div>
<div id="pl-livre">${blocoLivre(passo, est)}</div>
<div id="pl-erro" role="alert"></div>
<div class="pl-rodape">
<a class="btn fantasma" href="${voltar}">${ic.voltar(18)}Voltar</a>
<button type="button" class="btn primario" id="pl-continuar"${est.entendi[passo] ? ' hidden' : ''}>${passo === TOTAL ? 'Ver meu plano' : 'Continuar'}${ic.seta(18)}</button>
</div>
</div>`;
}

function blocoLivre(passo, est) {
  const entendi = est.entendi[passo];
  if (entendi) {
    return `<div class="pl-entendi" role="status">
<span class="pl-entendi-rot">${ic.brilho(14)}Entendi</span>
<p>${esc(entendi)}</p>
<span class="nota">Confira as opções acima: já estão preenchidas.</span>
<div class="pl-botoes"><button type="button" class="btn" data-acao="corrigir">Corrigir</button><button type="button" class="btn primario" data-acao="seguir">${passo === TOTAL ? 'Ver meu plano' : 'Continuar'}</button></div>
</div>`;
  }
  return `<div class="pl-livre">
<label for="pl-texto" class="pl-livre-rot">Ou escreva do seu jeito</label>
<textarea id="pl-texto" rows="2" maxlength="1500" placeholder="${esc(PASSOS[passo].exemplo)}">${esc(est.texto[passo] || '')}</textarea>
<button type="button" class="btn" data-acao="interpretar">${ic.brilho(16)}Interpretar</button>
</div>`;
}

function limparRespostas(R0) {
  const R = JSON.parse(JSON.stringify(R0 || {}));
  delete R._sem_dividas;
  const comValor = (lista, ...campos) => (Array.isArray(lista) ? lista.filter((x) => x && campos.some((c) => pos(x[c]))) : []);
  if (R.fixos) R.fixos = comValor(R.fixos, 'valor');
  if (R.dividas) R.dividas = comValor(R.dividas, 'parcela', 'saldo');
  if (R.categorias) R.categorias = comValor(R.categorias, 'valor');
  if (R.piso_categorias) R.piso_categorias = comValor(R.piso_categorias, 'valor');
  if (R.objetivos) R.objetivos = R.objetivos.filter((o) => o && o.tipo);
  if (R.cartao && Array.isArray(R.cartao.parcelas_futuras)) {
    R.cartao.parcelas_futuras = R.cartao.parcelas_futuras.filter((p) => p && p.mes && pos(p.valor)).sort((a, b) => a.mes.localeCompare(b.mes));
  }
  return R;
}

function ligarEntrevista(raiz, ctx) {
  const { api, ir } = ctx;
  const { est, passo } = ent;
  const P = PASSOS[passo];
  const R = est.respostas;
  const corpo = raiz.querySelector('#pl-corpo');
  const livre = raiz.querySelector('#pl-livre');
  const erro = raiz.querySelector('#pl-erro');
  const btnContinuar = raiz.querySelector('#pl-continuar');
  const salvar = () => gravarRascunho(est);
  const falha = (msg) => { erro.innerHTML = msg ? `<div class="aviso">${ic.x(16)}<span>${esc(msg)}</span></div>` : ''; };

  const redesenhar = (foco) => {
    corpo.innerHTML = P.corpo(R, est);
    if (foco) {
      const alvo = corpo.querySelector(foco);
      if (alvo) alvo.focus({ preventScroll: false });
    }
  };
  const redesenharLivre = () => {
    livre.innerHTML = blocoLivre(passo, est);
    btnContinuar.hidden = !!est.entendi[passo];
  };

  // números que dependem de outros: totais, faixa marcada, prévia do aperto
  const atualizarDerivados = () => {
    corpo.querySelectorAll('[data-total]').forEach((el) => { el.textContent = fReais(soma(R[el.dataset.total], 'valor')); });
    const faixas = passo === 1 ? [FAIXAS_RENDA, R.renda_fixa] : passo === 7 ? [FAIXAS_VARIAVEL, R.variavel_atual] : null;
    if (faixas && pos(faixas[1])) {
      const id = faixaDe(faixas[1], faixas[0]);
      est.ui[passo] = { escolha: id };
      corpo.querySelectorAll('[data-escolha]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.escolha === id)));
    }
    const previa = corpo.querySelector('[data-previa]');
    if (previa) previa.innerHTML = previaAperto(R);
  };

  const seguir = async () => {
    const msg = P.validar(R, est);
    if (msg) { falha(msg); return; }
    falha('');
    if (passo < TOTAL) {
      est.passo = passo + 1;
      salvar();
      ir(`#/plano/novo?passo=${passo + 1}`);
      return;
    }
    await finalizar(raiz, ctx);
  };

  corpo.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    falha('');
    let foco = null;
    if (b.dataset.escolha !== undefined) {
      const id = b.dataset.escolha;
      est.ui[passo] = { escolha: id };
      const campo = P.escolher ? P.escolher(id, R, est) : null;
      foco = typeof campo === 'string' ? `[data-campo="${campo}"]` : `[data-escolha="${id}"]`;
    } else if (b.dataset.alternar !== undefined) {
      const caminho = P.alternar ? P.alternar(b.dataset.alternar, R, est) : null;
      foco = caminho ? `[data-campo="${caminho}"]` : `[data-alternar="${b.dataset.alternar}"]`;
    } else if (b.dataset.bool !== undefined) {
      R[b.dataset.bool] = !R[b.dataset.bool];
      foco = `[data-bool="${b.dataset.bool}"]`;
    } else if (b.dataset.definir !== undefined) {
      definir(R, b.dataset.definir, b.dataset.valor);
      foco = `[data-definir="${b.dataset.definir}"][data-valor="${b.dataset.valor}"]`;
    } else if (b.dataset.remover !== undefined) {
      remover(R, b.dataset.remover);
    } else if (b.dataset.add === 'parcela') {
      R.cartao = R.cartao || {};
      const pf = Array.isArray(R.cartao.parcelas_futuras) ? R.cartao.parcelas_futuras : (R.cartao.parcelas_futuras = []);
      const ultimo = pf.map((p) => p.mes).filter(Boolean).sort().pop();
      pf.push({ mes: somaMes(ultimo || hojeBR().slice(0, 7), 1), valor: null });
      foco = `[data-campo="cartao.parcelas_futuras.${pf.length - 1}.valor"]`;
    } else {
      return;
    }
    salvar();
    redesenhar(foco);
  });

  const aoDigitar = (ev) => {
    const el = ev.target;
    if (el.dataset.cat) {
      // categorias do variável (pergunta 7): a soma vira o total
      if (!Array.isArray(R.categorias)) R.categorias = [];
      const v = lerReais(el.value);
      const i = R.categorias.findIndex((c) => c.nome === el.dataset.nome);
      if (i >= 0) R.categorias[i].valor = Number.isFinite(v) ? v : null;
      else R.categorias.push({ nome: el.dataset.nome, valor: Number.isFinite(v) ? v : null });
      const s = soma(R.categorias, 'valor');
      if (s > 0) {
        R.variavel_atual = s;
        const tot = corpo.querySelector('[data-campo="variavel_atual"]');
        if (tot) tot.value = fmtIn(s);
      }
    } else if (el.dataset.campo) {
      const t = el.dataset.tipo;
      let v;
      if (t === 'reais' || t === 'pct') { v = lerReais(el.value); v = Number.isFinite(v) ? v : null; }
      else if (t === 'inteiro') { v = parseInt(String(el.value).replace(/\D/g, ''), 10); v = Number.isFinite(v) ? v : null; }
      else v = el.value || (t === 'mes' ? null : '');
      definir(R, el.dataset.campo, v);
      if (el.dataset.campo.startsWith('piso_categorias.')) {
        const s = soma(R.piso_categorias, 'valor');
        if (s > 0) {
          R.piso_variavel = s;
          const tot = corpo.querySelector('[data-campo="piso_variavel"]');
          if (tot) tot.value = fmtIn(s);
        }
      }
    } else {
      return;
    }
    salvar();
    atualizarDerivados();
  };
  corpo.addEventListener('input', aoDigitar);
  corpo.addEventListener('change', (ev) => {
    aoDigitar(ev);
    // ao sair do campo, o valor volta escrito em reais
    const el = ev.target;
    if (el.dataset.tipo === 'reais' || el.dataset.cat) {
      const v = lerReais(el.value);
      if (Number.isFinite(v)) el.value = fmtIn(v);
    }
  });

  livre.addEventListener('input', (ev) => {
    if (ev.target.id === 'pl-texto') { est.texto[passo] = ev.target.value; salvar(); }
  });
  livre.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const acao = b.dataset.acao;
    if (acao === 'corrigir') {
      delete est.entendi[passo];
      salvar();
      redesenharLivre();
      const ta = livre.querySelector('#pl-texto');
      if (ta) ta.focus();
      return;
    }
    if (acao === 'seguir') { await seguir(); return; }
    if (acao !== 'interpretar') return;
    const ta = livre.querySelector('#pl-texto');
    const texto = ta.value.trim();
    if (!texto) { falha('Escreva a resposta antes de interpretar.'); ta.focus(); return; }
    falha('');
    b.disabled = true;
    b.innerHTML = `${ic.brilho(16)}Interpretando…`;
    try {
      const r = await api.interpretarResposta(passo, texto, limparRespostas(R));
      const campos = (r && r.campos) || {};
      if (passo === 5 && Array.isArray(campos.dividas) && campos.dividas.length === 0) R._sem_dividas = true;
      mesclar(R, campos);
      delete est.ui[passo]; // a escolha dos chips passa a sair das respostas
      est.entendi[passo] = (r && r.entendi) || 'Preenchi as opções acima com o que você escreveu.';
      salvar();
      redesenhar();
      redesenharLivre();
      livre.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (e) {
      falha(`${e.message || 'A IA não respondeu agora.'} Escolha nas opções acima ou tente de novo.`);
      b.disabled = false;
      b.innerHTML = `${ic.brilho(16)}Interpretar`;
    }
  });

  btnContinuar.addEventListener('click', seguir);
}

async function finalizar(raiz, { api, ir, toast, recarregar }) {
  const { est } = ent;
  const R = limparRespostas(est.respostas);
  const tela = raiz.querySelector('.pl-entrevista');
  tela.innerHTML = `<div class="pl-montando" role="status" aria-live="polite">
<div class="pl-pontos" aria-hidden="true"><span></span><span></span><span></span></div>
<h1>Montando seu plano</h1>
<ul class="pl-topicos-lista"><li>Simulando mês a mês o cartão, o variável e o que sobra.</li><li id="pl-passo-ia">Escrevendo o resumo em tópicos.</li></ul>
</div>`;
  const hoje = hojeBR();
  const sim = simular(R, { hoje });
  const itens = itensDoPlano(R, sim);
  let resumo = {};
  let comResumo = false;
  try {
    const r = await api.resumirPlano(R, sim);
    if (r && typeof r === 'object' && !r.erro) { resumo = { ...r, variavel_alvo: sim.kpis.variavel_alvo }; comResumo = true; }
  } catch { /* sem IA: o plano sai com a simulação e o aviso de resumo indisponível */ }
  try {
    const titulo = String((comResumo && resumo.titulo) || 'Plano financeiro').slice(0, 120);
    const p = await api.salvarPlano({ titulo, status: 'rascunho', respostas: R, simulacao: sim, resumo, itens });
    limparRascunho();
    toast(comResumo ? 'Plano pronto' : 'Plano pronto, sem o resumo da IA');
    ir(`#/plano/ver?id=${encodeURIComponent(p.id)}`);
  } catch (e) {
    toast(`Não deu para salvar o plano: ${e.message || e}`, 'erro');
    recarregar();
  }
}

// ------------------------------------------------------------ o plano

let ver = null;

const GRUPOS_RESUMO = [
  ['diagnostico', 'Diagnóstico'],
  ['regras', 'As regras do plano'],
  ['meses_chave', 'Meses que importam'],
  ['atencao', 'Atenção'],
];
const ROT_DESTINO = { resgate: 'resgate', cofrinho: 'cofrinho', recompor: 'recompor' };

async function montarVer({ api, rota }) {
  const id = rota.q.get('id');
  const p = id ? await api.plano(id) : null;
  if (!p) {
    return `<div class="tela pl-tela">
<div class="topo"><div><span class="quando">Plano financeiro</span><h1>Plano não encontrado</h1></div><a class="btn-icone" href="#/plano" aria-label="Voltar para planos">${ic.x(18)}</a></div>
<div class="aviso neutro">${ic.alvo(16)}<span>Este plano não existe mais ou foi arquivado.</span></div>
<a class="btn largo" href="#/plano">Ver planos</a></div>`;
  }
  const R = p.respostas || {};
  const salva = p.simulacao && Array.isArray(p.simulacao.meses) && p.simulacao.meses.length ? p.simulacao : null;
  const hoje = (salva && salva.hoje) || diaSP(p.criado_em) || hojeBR();
  const sim = salva || simular(R, { hoje });
  const itens = p.itens && Array.isArray(p.itens.tetos) ? p.itens : itensDoPlano(R, sim);
  ver = { plano: p, R, sim, itens, hoje, resumo: p.resumo || {}, alvo: sim.kpis.variavel_alvo, alvoSalvo: sim.kpis.variavel_alvo, sujo: false };

  const aplicado = p.status === 'aplicado';
  const dia = diaSP(p.aplicado_em);
  return `<div class="tela pl-tela pl-ver">
<div class="topo"><div><span class="quando">${aplicado ? `Plano aplicado${dia ? ` em ${esc(diaCurto(dia))}` : ''}` : 'Plano financeiro · rascunho'}</span><h1>${esc(p.titulo || 'Plano financeiro')}</h1></div>
<a class="btn-icone" href="#/plano" aria-label="Voltar para planos">${ic.x(18)}</a></div>
<section class="card pl-resumo" id="pl-resumo" aria-labelledby="pl-resumo-tit">${resumoHtml()}</section>
<section class="pl-numeros" id="pl-numeros" aria-label="Números do plano">${numerosHtml()}</section>
<section class="card pl-grafico-card" id="pl-grafico" aria-labelledby="pl-graf-tit">${graficoHtml()}</section>
${sliderHtml()}
<section class="card pl-meses-card" id="pl-meses" aria-labelledby="pl-meses-tit">${mesesHtml()}</section>
<section class="card pl-itens-card" id="pl-itens" aria-labelledby="pl-itens-tit">${itensHtml()}</section>
<div class="pl-acoes" id="pl-acoes">${acoesHtml()}</div>
</div>`;
}

function resumoDesatualizado() {
  const base = ver.resumo && ver.resumo.variavel_alvo !== undefined ? Number(ver.resumo.variavel_alvo) : ver.alvoSalvo;
  return base !== ver.alvo;
}

function resumoHtml() {
  const r = ver.resumo || {};
  const tem = GRUPOS_RESUMO.some(([k]) => Array.isArray(r[k]) && r[k].length);
  const velho = tem && resumoDesatualizado();
  let h = `<div class="card-cab"><h2 id="pl-resumo-tit">${ic.brilho(16)}Resumo em tópicos</h2>${velho ? `<span class="pilula hab">feito com ${fReais(r.variavel_alvo ?? ver.alvoSalvo)}</span>` : ''}</div>`;
  if (!tem) {
    h += `<div class="aviso neutro">${ic.relogio(16)}<span><b>Resumo indisponível agora.</b> A simulação abaixo vale do mesmo jeito.</span></div>
<button type="button" class="btn" data-acao="resumir">${ic.brilho(16)}Tentar o resumo de novo</button>`;
  } else {
    h += GRUPOS_RESUMO.filter(([k]) => Array.isArray(r[k]) && r[k].length).map(([k, rot]) => `<div class="pl-topicos">
<h3>${esc(rot)}</h3><ul class="pl-topicos-lista">${r[k].map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('');
    if (velho) h += `<button type="button" class="btn tracejado" data-acao="resumir">${ic.brilho(16)}Refazer resumo com ${fReais(ver.alvo)}</button>`;
  }
  h += `<p class="nota pl-legal">${esc(AVISO_LEGAL)}</p>`;
  return h;
}

function numerosHtml() {
  const k = ver.sim.kpis;
  const tiles = [
    {
      cls: k.resgate_total > 0 ? 'no' : '', rot: k.resgate_total > 0 ? `Resgate até ${mesCurto(k.ultimo_resgate_mes)}` : 'Resgate',
      v: k.resgate_total > 0 ? fReais(k.resgate_total) : 'Nenhum',
      det: k.resgate_total > 0 ? 'sai dos investimentos' : 'a conta fecha desde já',
    },
    {
      cls: 'hab', rot: 'Cofrinho da viagem', v: k.viagem_mes ? fReais(k.cofrinho) : '—',
      det: k.viagem_mes ? `juntado até ${mesCurto(k.viagem_mes)}` : 'sem viagem no plano',
    },
    {
      cls: 'hab', rot: 'Parcela da viagem', v: k.parcela_viagem > 0 ? fReais(k.parcela_viagem) : '—',
      det: k.parcela_viagem > 0
        ? (k.parcelas_viagem === 1 ? `à vista · ${mesCurto(k.viagem_parcelas_de)}` : `${k.parcelas_viagem}× · ${mesCurto(k.viagem_parcelas_de)} a ${mesCurto(k.viagem_parcelas_ate)}`)
        : k.viagem_mes ? 'o cofrinho paga tudo' : 'sem viagem no plano',
    },
    {
      cls: 'din', rot: 'Investimentos de volta em',
      v: k.recompor_mes ? mesCurto(k.recompor_mes) : k.recompor_meta > 0 ? `após ${mesCurto(k.horizonte_ate)}` : '—',
      det: k.recompor_meta > 0 ? `${fReais(k.recompor_meta)} a repor` : 'nada a repor',
    },
  ];
  let h = `<div class="pl-tiles">${tiles.map((t) => `<div class="pl-tile ${t.cls}"><span class="rot">${esc(t.rot)}</span><span class="v num">${esc(t.v)}</span><span class="det">${esc(t.det)}</span></div>`).join('')}</div>`;
  if (ver.sim.alertas.length) h += ver.sim.alertas.map((a) => `<div class="aviso pl-alerta">${ic.raio(16)}<span>${esc(a)}</span></div>`).join('');
  return h;
}

function graficoHtml() {
  const ms = ver.sim.meses;
  const n = ms.length;
  const W = 340, topo = 8, alto = 128, yRot = topo + alto + 14;
  const maxPos = Math.max(0, ...ms.map((m) => m.saldo));
  const maxNeg = Math.max(0, ...ms.map((m) => -m.saldo));
  const total = maxPos + maxNeg || 1;
  const y0 = topo + (alto * maxPos) / total;
  const larg = W / n;
  const cor = { resgate: 'var(--no)', cofrinho: 'var(--hab)', recompor: 'var(--din)' };
  let barras = '';
  ms.forEach((m, i) => {
    const h = Math.max(1.5, (Math.abs(m.saldo) / total) * alto);
    const x = i * larg + larg * 0.16;
    const y = m.saldo >= 0 ? y0 - h : y0;
    barras += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(larg * 0.68).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${cor[m.destino]}"><title>${esc(mesCurto(m.mes))}: ${esc(fReais(m.saldo, { sinal: true }))} · ${ROT_DESTINO[m.destino]}</title></rect>`;
    const mesTxt = MESES_C[Number(m.mes.slice(5, 7)) - 1];
    const cx = (i * larg + larg / 2).toFixed(1);
    barras += `<text x="${cx}" y="${yRot}" text-anchor="middle" class="pl-graf-mes">${mesTxt}</text>`;
    if (i === 0 || m.mes.endsWith('-01')) barras += `<text x="${cx}" y="${yRot + 11}" text-anchor="middle" class="pl-graf-ano">${m.mes.slice(0, 4)}</text>`;
  });
  const leg = `<div class="legenda pl-legenda"><span><i style="background:var(--no)"></i>Resgate</span><span><i style="background:var(--hab)"></i>Cofrinho</span><span><i style="background:var(--din)"></i>Recompor</span></div>`;
  const k = ver.sim.kpis;
  const notas = [...ver.sim.notas];
  if (k.custo_resgate_10mil) notas.push(`Cada R$ 10 mil resgatados custam ~${fReais(k.custo_resgate_10mil)} por mês de rendimento.`);
  return `<div class="card-cab"><h2 id="pl-graf-tit">Saldo de cada mês</h2><span class="lado">depois da fatura</span></div>
<svg class="pl-graf" viewBox="0 0 ${W} ${yRot + 14}" role="img" aria-label="Saldo por mês: negativo é resgate, depois cofrinho e recompor">
<line x1="0" x2="${W}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" stroke="var(--line2)" stroke-width="1"/>${barras}</svg>
${leg}
<ul class="pl-notas">${notas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

function mesAlvo() {
  const v = ver.sim.variavel_por_mes.find((x) => x.valor === ver.alvo);
  return v ? v.mes : ver.sim.meses[0].mes;
}
function degrausTxt() {
  const t = ver.itens.tetos || [];
  if (!t.length) return '';
  return 'Degraus: ' + t.map((x, i) => `${i === t.length - 1 && t.length > 1 ? 'a partir de ' : ''}${mesCurto(x.mes.slice(0, 7))} ${fReais(x.teto_mensal)}`).join(' · ') + '.';
}

function sliderHtml() {
  if (ver.plano.status !== 'rascunho') return '';
  const k = ver.sim.kpis;
  const atual = Number(k.variavel_atual);
  const piso = Number(k.piso_variavel) || Math.round(atual * 0.7);
  if (!(atual > piso)) return '';
  return `<section class="card pl-slider-card" aria-labelledby="pl-slider-tit">
<div class="card-cab"><h2 id="pl-slider-tit">Variável a partir de <span data-mes-alvo>${esc(mesCurto(mesAlvo()))}</span></h2><b class="num pl-slider-v" id="pl-slider-v">${fReais(ver.alvo)}</b></div>
<input type="range" id="pl-slider" class="pl-slider" min="${piso}" max="${atual}" step="50" value="${Math.min(atual, Math.max(piso, ver.alvo))}" aria-label="Variável por mês depois dos degraus" aria-valuetext="${esc(fReais(ver.alvo))}">
<div class="pl-slider-rot"><span>mínimo ${fReais(piso)}</span><span>hoje ${fReais(atual)}</span></div>
<p class="nota" id="pl-degraus" style="margin:0">${esc(degrausTxt())}</p>
</section>`;
}

function mesesHtml() {
  const linhas = ver.sim.meses.map((m) => `<div class="pl-mes"><span class="pl-mes-n">${esc(mesCurto(m.mes))}</span><span class="num">${fReais(m.fatura)}</span>
<span class="num ${m.saldo < 0 ? 'cor-no' : ''}">${fReais(m.saldo, { sinal: true })}</span><span class="pl-tag ${m.destino}">${ROT_DESTINO[m.destino]}</span></div>`).join('');
  return `<div class="card-cab"><h2 id="pl-meses-tit">Mês a mês</h2><span class="lado">${esc(mesCurto(ver.sim.meses[0].mes))} a ${esc(mesCurto(ver.sim.kpis.horizonte_ate))}</span></div>
<div class="pl-meses">
<div class="pl-mes pl-mes-cab" aria-hidden="true"><span>mês</span><span>fatura</span><span>saldo</span><span>destino</span></div>${linhas}</div>`;
}

function itensHtml() {
  const it = ver.itens;
  const tetos = it.tetos || [];
  const linhasTeto = tetos.map((t, i) => {
    const mes = t.mes.slice(0, 7);
    const dia = t.teto_mensal / diasDoMes(mes);
    const ult = i === tetos.length - 1 && tetos.length > 1;
    return `<li><b>${ult ? 'a partir de ' : ''}${esc(mesCurto(mes))}</b>: ${fReais(t.teto_mensal)} no mês · ≈ ${fReais(Math.round(dia))} por dia</li>`;
  }).join('');
  const metas = (it.metas || []).map((m) => `<div class="pl-item"><span class="pl-item-ico din">${ic.alvo(16)}</span><div><b>Meta: ${esc(m.titulo)}</b>
<span>${m.tipo === 'quitar' ? 'Quitar' : 'Juntar'} ${fReais(m.alvo)} até ${esc(dataPrazo(m.prazo))}</span></div></div>`).join('');
  const recs = (it.recompensas || []).map((r) => `<div class="pl-item"><span class="pl-item-ico hab">${ic.cofre(16)}</span><div><b>${r.tipo === 'cofrinho' ? 'Cofrinho' : 'Recompensa'}: ${esc(r.nome)}</b>
<span>${r.tipo === 'cofrinho' ? `Juntar ${fReais(r.cofrinho_alvo)} · ≈ ${fReais(Math.ceil(r.guardar_semana))} por semana · ` : ''}libera quando a onda do cartão zerar</span></div></div>`).join('');
  return `<div class="card-cab"><h2 id="pl-itens-tit">${ic.registrar(16)}O que o plano cria no Lastro</h2></div>
<div class="pl-itens">
<div class="pl-item"><span class="pl-item-ico tmp">${ic.cadeado(16)}</span><div><b>Teto do variável, mês a mês</b><ul class="pl-topicos-lista">${linhasTeto}</ul>
<span>O teto diário de gastos passa a seguir esses valores.</span></div></div>
${metas}${recs}
</div>`;
}

function acoesHtml() {
  const p = ver.plano;
  if (p.status === 'aplicado') {
    const dia = diaSP(p.aplicado_em);
    return `<section class="card din pl-aplicado">
<div class="card-cab"><h2>${ic.check(18)}Plano aplicado${dia ? ` em ${esc(dataLonga(dia).toLowerCase())}` : ''}</h2></div>
<p class="nota" style="margin:0;color:var(--ink)">O teto diário de gastos já segue o plano. As metas e o cofrinho estão em Metas.</p>
<div class="pl-botoes"><a class="btn" href="#/metas">${ic.alvo(16)}Ver metas</a><a class="btn" href="#/liberar">${ic.aberto(16)}Teto de hoje</a></div>
</section>`;
  }
  return `<button type="button" class="btn primario largo" data-acao="aplicar">${ic.check(18)}Aplicar plano</button>
<button type="button" class="btn largo" data-acao="salvar">${ver.sujo ? 'Salvar alterações' : 'Salvar rascunho'}</button>
<button type="button" class="btn fantasma largo" data-acao="refazer">Refazer as respostas</button>`;
}

function ligarVer(raiz, { api, ir, toast, recarregar }) {
  if (!ver) return;
  const el = (id) => raiz.querySelector(id);
  const pintar = () => {
    el('#pl-numeros').innerHTML = numerosHtml();
    el('#pl-grafico').innerHTML = graficoHtml();
    el('#pl-meses').innerHTML = mesesHtml();
    el('#pl-itens').innerHTML = itensHtml();
    el('#pl-resumo').innerHTML = resumoHtml();
    el('#pl-acoes').innerHTML = acoesHtml();
    const v = el('#pl-slider-v'); if (v) v.textContent = fReais(ver.alvo);
    const d = el('#pl-degraus'); if (d) d.textContent = degrausTxt();
    const m = raiz.querySelector('[data-mes-alvo]'); if (m) m.textContent = mesCurto(mesAlvo());
  };

  // slider do variável: re-simula ao vivo
  const slider = el('#pl-slider');
  if (slider) {
    let quadro = 0;
    slider.addEventListener('input', () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const v = Number(slider.value);
        ver.alvo = v;
        ver.R = { ...ver.R, aperto: 'outro', variavel_alvo: v };
        ver.sim = simular(ver.R, { hoje: ver.hoje });
        ver.itens = itensDoPlano(ver.R, ver.sim);
        ver.sujo = v !== ver.alvoSalvo || ver.sujo;
        slider.setAttribute('aria-valuetext', fReais(v));
        pintar();
      });
    });
  }

  const salvar = async (extra = {}) => {
    const p = await api.salvarPlano({
      id: ver.plano.id, titulo: ver.plano.titulo, respostas: ver.R, simulacao: ver.sim, itens: ver.itens, resumo: ver.resumo, ...extra,
    });
    ver.plano = p || ver.plano;
    ver.alvoSalvo = ver.alvo;
    ver.sujo = false;
  };

  raiz.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const acao = b.dataset.acao;
    const rotulo = b.innerHTML;
    const ocupado = (txt) => { b.disabled = true; b.textContent = txt; };
    const livre = () => { b.disabled = false; b.innerHTML = rotulo; };

    if (acao === 'resumir') {
      ocupado('Escrevendo o resumo…');
      try {
        const r = await api.resumirPlano(ver.R, ver.sim);
        if (!r || typeof r !== 'object') throw new Error('A IA não respondeu agora.');
        ver.resumo = { ...r, variavel_alvo: ver.alvo };
        await salvar({ resumo: ver.resumo, titulo: String(r.titulo || ver.plano.titulo || 'Plano financeiro').slice(0, 120) });
        toast('Resumo refeito');
        pintar();
      } catch (e) {
        toast(e.message || 'A IA não respondeu agora.', 'erro');
        livre();
      }
    } else if (acao === 'salvar') {
      ocupado('Salvando…');
      try {
        await salvar();
        toast('Rascunho salvo');
        pintar();
      } catch (e) {
        toast(e.message || String(e), 'erro');
        livre();
      }
    } else if (acao === 'refazer') {
      const est = novoRascunho();
      est.respostas = JSON.parse(JSON.stringify(ver.R));
      gravarRascunho(est);
      ir('#/plano/novo?passo=1');
    } else if (acao === 'aplicar') {
      const it = ver.itens;
      const nT = (it.tetos || []).length, nM = (it.metas || []).length, nR = (it.recompensas || []).length;
      const partes = [`${nT} ${nT === 1 ? 'teto mensal' : 'tetos mensais'} do variável`, `${nM} ${nM === 1 ? 'meta' : 'metas'}`];
      if (nR) partes.push(nR === 1 ? '1 cofrinho' : `${nR} cofrinhos`);
      if (!window.confirm(`Aplicar o plano?\n\nCria ${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}. O teto diário de gastos passa a seguir o plano.`)) return;
      ocupado('Aplicando…');
      try {
        if (ver.sujo) await salvar();
        await api.aplicarPlano(ver.plano.id);
        toast('Plano aplicado');
        recarregar();
      } catch (e) {
        toast(e.message || String(e), 'erro');
        livre();
      }
    }
  });
}

// ------------------------------------------------------------ ligar

export function ligar(raiz, ctx) {
  const { api, rota } = ctx;
  if (api.modo === 'demo' || typeof api.planos !== 'function') return;
  if (rota.arg === 'novo') ligarEntrevista(raiz, ctx);
  else if (rota.arg === 'ver') ligarVer(raiz, ctx);
  else ligarLista(raiz, ctx);
}
