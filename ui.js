// Utilidades de interface: datas no fuso de São Paulo, números em pt-BR, ícones e gráficos (anel, barra).

export const FUSO = 'America/Sao_Paulo';
export const MENOS = '−';

// ------------------------------------------------------------ datas

export function hojeBR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function horaBR() {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

export function addDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dataLonga(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}
export function diaSemana(iso) { return DIAS[new Date(iso + 'T12:00:00Z').getUTCDay()].toLowerCase(); }
export function diaCurto(iso) { return DIAS_CURTOS[new Date(iso + 'T12:00:00Z').getUTCDay()]; }
export function dataCurta(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); }

export function quandoFoi(isoTs) {
  if (!isoTs) return 'nunca';
  const min = Math.round((Date.now() - new Date(isoTs).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

// ------------------------------------------------------------ números

export function fmt(n, casas = 0) {
  return Math.abs(Number(n)).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function prefixo(n, comSinal) {
  if (n < 0) return MENOS;
  return comSinal && n > 0 ? '+' : '';
}
// kcal e min: inteiros
export function fNum(n, { sinal = false } = {}) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Math.round(Number(n));
  return prefixo(v, sinal) + fmt(v);
}
export function fReais(n, { sinal = false } = {}) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Math.round(Number(n) * 100) / 100;
  const casas = Math.abs(v % 1) > 0.004 ? 2 : 0;
  return prefixo(v, sinal) + 'R$ ' + fmt(v, casas);
}
export function fDuracao(min) {
  if (min === null || min === undefined) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}
export function fFator(f) { return fmt(Number(f), Number(f) % 1 ? (Number(f) * 10 % 1 ? 2 : 1) : 0); }

// Lê "12,50" ou "12.50"
export function lerNumero(txt) {
  if (txt === null || txt === undefined) return NaN;
  const t = String(txt).trim().replace(/\s/g, '').replace(/^R\$/, '');
  if (!t) return NaN;
  const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return Number(n);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
export const pct = (x) => (clamp01(x) * 100).toFixed(1) + '%';

// ------------------------------------------------------------ moedas

export const MOEDAS = {
  kcal: { nome: 'Calorias', cls: 'cal', unidade: 'kcal', f: (n, o) => fNum(n, o) },
  reais: { nome: 'Dinheiro', cls: 'din', unidade: 'reais', f: (n, o) => fReais(n, o) },
  min: { nome: 'Tempo', cls: 'tmp', unidade: 'min', f: (n, o) => fNum(n, o) },
};

// ------------------------------------------------------------ ícones (traço, currentColor)

const svg = (d, w = 20, sw = 2) =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ic = {
  casa: (w) => svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>', w),
  dia: (w) => svg('<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>', w),
  cadeado: (w) => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', w),
  aberto: (w) => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>', w),
  mais: (w) => svg('<path d="M12 5v14M5 12h14"/>', w),
  menos: (w) => svg('<path d="M5 12h14"/>', w),
  ajustes: (w) => svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>', w),
  registrar: (w) => svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>', w),
  check: (w) => svg('<path d="M5 12l5 5L20 7"/>', w, 2.4),
  x: (w) => svg('<path d="M6 6l12 12M18 6L6 18"/>', w, 2.4),
  relogio: (w) => svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/>', w),
  pendente: (w) => svg('<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>', w),
  seta: (w) => svg('<path d="M9 6l6 6-6 6"/>', w),
  voltar: (w) => svg('<path d="M15 6l-6 6 6 6"/>', w),
  lixeira: (w) => svg('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>', w),
  relogioPulso: (w) => svg('<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 3h6M9 21h6"/>', w),
  passos: (w) => svg('<path d="M8 16c-2 0-3-1.5-3-4s1-5 3-5 2.5 2 2.5 4.5S10 16 8 16z"/><path d="M16 20c-1.6 0-2.5-1.2-2.5-3.2s.8-4 2.5-4 2 1.6 2 3.6S17.6 20 16 20z"/>', w),
  lua: (w) => svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', w),
  peso: (w) => svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9.5a4 4 0 0 1 6 0l-2 2.5"/>', w),
  raio: (w) => svg('<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>', w),
  coracao: (w) => svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', w),
  celular: (w) => svg('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>', w),
  sair: (w) => svg('<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>', w),
  upload: (w) => svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/>', w),
  alvo: (w) => svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>', w),
  troca: (w) => svg('<path d="M4 8h13l-3-3M20 16H7l3 3"/>', w),
};

// ------------------------------------------------------------ gráficos

// Anel de progresso. pct 0..1 (acima de 1 desenha cheio). cor e trilho são valores CSS.
export function anel({ pct: p, cor, trilho = 'var(--track)', tam = 72, esp = 8, centro = '', rotulo = '', tracejado = false }) {
  const r = (tam - esp) / 2;
  const c = 2 * Math.PI * r;
  const v = clamp01(p);
  const meio = tam / 2;
  const arco = v > 0
    ? `<circle cx="${meio}" cy="${meio}" r="${r}" fill="none" stroke="${cor}" stroke-width="${esp}" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${meio} ${meio})"/>`
    : '';
  return `<div class="anel" style="width:${tam}px;height:${tam}px" role="img" aria-label="${esc(rotulo)}">
<svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true"><circle cx="${meio}" cy="${meio}" r="${r}" fill="none" stroke="${trilho}" stroke-width="${esp}"${tracejado ? ' stroke-dasharray="4 5"' : ''}/>${arco}</svg>
<div class="anel-centro">${centro}</div></div>`;
}

// Anéis concêntricos (um por moeda).
export function aneis(lista, { tam = 132, esp = 11, gap = 4, rotulo = '' } = {}) {
  const meio = tam / 2;
  let partes = '';
  lista.forEach((a, i) => {
    const r = meio - esp / 2 - i * (esp + gap);
    const c = 2 * Math.PI * r;
    const v = clamp01(a.pct);
    partes += `<circle cx="${meio}" cy="${meio}" r="${r}" fill="none" stroke="${a.trilho}" stroke-width="${esp}"/>`;
    if (v > 0) partes += `<circle cx="${meio}" cy="${meio}" r="${r}" fill="none" stroke="${a.cor}" stroke-width="${esp}" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${meio} ${meio})"/>`;
  });
  return `<div class="anel" style="width:${tam}px;height:${tam}px" role="img" aria-label="${esc(rotulo)}"><svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true">${partes}</svg></div>`;
}

// Barra simples: valor/limite. cor do preenchimento; estoura em vermelho.
export function barra(valor, limite, { cor = 'var(--ink)', alto = 8, rotulo = '' } = {}) {
  const v = limite > 0 ? valor / limite : (valor > 0 ? 1 : 0);
  const estourou = limite >= 0 && valor > limite && limite !== null;
  return `<div class="barra" style="height:${alto}px" role="img" aria-label="${esc(rotulo)}"><div style="width:${pct(v)};background:${estourou ? 'var(--no)' : cor}"></div></div>`;
}

// Barrinhas de 7 dias, positivas para cima e negativas para baixo do eixo.
export function barrinhas(valores, { cor, alto = 34, rotulo = '' } = {}) {
  const max = Math.max(1, ...valores.map((v) => Math.abs(v ?? 0)));
  const meio = alto / 2;
  const n = valores.length;
  const larg = 100 / n;
  let rects = '';
  valores.forEach((v, i) => {
    const x = (i * larg + larg * 0.18).toFixed(2);
    const w = (larg * 0.64).toFixed(2);
    if (v === null || v === undefined) {
      rects += `<rect x="${x}%" y="${meio - 1}" width="${w}%" height="2" rx="1" fill="var(--line2)"/>`;
      return;
    }
    const h = Math.max(2, (Math.abs(v) / max) * (meio - 1));
    const y = v >= 0 ? meio - h : meio;
    rects += `<rect x="${x}%" y="${y.toFixed(1)}" width="${w}%" height="${h.toFixed(1)}" rx="2" fill="${v >= 0 ? cor : 'var(--no)'}"/>`;
  });
  return `<svg class="barrinhas" width="100%" height="${alto}" role="img" aria-label="${esc(rotulo)}"><line x1="0" x2="100%" y1="${meio}" y2="${meio}" stroke="var(--line2)" stroke-width="1"/>${rects}</svg>`;
}

// Linha de tendência (peso, por exemplo).
export function linha(valores, { cor = 'var(--ink)', alto = 40, larg = 120 } = {}) {
  const pts = valores.map((v, i) => ({ v, i })).filter((p) => p.v !== null && p.v !== undefined);
  if (pts.length < 2) return '';
  const min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v));
  const amp = max - min || 1;
  const n = valores.length - 1 || 1;
  const xy = pts.map((p) => `${((p.i / n) * (larg - 6) + 3).toFixed(1)},${(3 + (1 - (p.v - min) / amp) * (alto - 6)).toFixed(1)}`);
  const ult = xy[xy.length - 1].split(',');
  return `<svg width="${larg}" height="${alto}" viewBox="0 0 ${larg} ${alto}" aria-hidden="true"><polyline points="${xy.join(' ')}" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${ult[0]}" cy="${ult[1]}" r="3" fill="${cor}"/></svg>`;
}

// ------------------------------------------------------------ avisos

let toastTimer;
export function toast(msg, tipo = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.dataset.tipo = tipo;
  el.classList.add('visivel');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visivel'), 2600);
}
