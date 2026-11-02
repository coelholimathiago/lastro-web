// Modo demonstração: o mesmo contrato do Supabase, guardado no localStorage.
// As contas seguem supabase/migrations/0001_lastro.sql (views credito_dia, banco, habito_dia e função trocar).

import { hojeBR, addDias } from './ui.js';

const CHAVE = 'lastro-demo-v1';
let memoria = null; // usado quando o localStorage não está disponível

function novoId() {
  try { if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch { /* contexto sem https */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

function ler() {
  try {
    const t = globalThis.localStorage && localStorage.getItem(CHAVE);
    if (t) return JSON.parse(t);
  } catch { /* sem armazenamento */ }
  return memoria;
}
function gravar(s) {
  memoria = s;
  try { if (globalThis.localStorage) localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* sem armazenamento */ }
}

// ------------------------------------------------------------ dados de exemplo (últimos 7 dias)

const ts = (data, hora) => `${data}T${hora}:00-03:00`; // horário de São Paulo
const local = (data, hora) => `${data}T${hora}`;        // timestamp sem fuso, como no garmin_dia

function semear() {
  const H = hojeBR();
  const d = (n) => addDias(H, -n);
  const s = {
    versao: 1,
    conta: { inicio: d(6) },
    garmin_importado_em: null,
    regras: [{ id: 1, valido_desde: '2026-01-01', deficit_meta: 500, teto_mensal: 1500, fator_vicio: 2.3, piso_consumo: 1400,
      emergencia_espera_min: 15, emergencia_limite_mes: 3, emergencia_custo_min: 35 }],
    garmin_dia: {}, garmin_atividade: [], atividade: [], habito: [], recompensa: [],
    refeicao: [], gasto: [], tempo_registro: [], habito_marca: [], troca: [],
  };

  // cadastros (pontos de partida do SQL)
  const atv = (nome, tipo, ordem, extra = {}) => ({ id: novoId(), nome, tipo, fator: null, limite_diario_min: null, apps: [], ativo: true, ordem, ...extra });
  s.atividade = [
    atv('Leitura', 'produtivo', 1), atv('Estudo', 'produtivo', 2), atv('Podcast', 'produtivo', 3), atv('Família', 'produtivo', 4),
    atv('Instagram', 'vicio', 10, { limite_diario_min: 30, apps: ['Instagram'] }),
    atv('YouTube', 'vicio', 11, { limite_diario_min: 20, apps: ['YouTube'] }),
    atv('Netflix', 'vicio', 12, { limite_diario_min: 45, apps: ['Netflix'] }),
    atv('TikTok', 'vicio', 13, { limite_diario_min: 0, apps: ['TikTok'] }),
  ];
  const hab = (nome, fonte, regra, parametros, ordem) => ({ id: novoId(), nome, fonte, regra, parametros, ativo: true, ordem });
  s.habito = [
    hab('Acordar até 6h30', 'garmin', 'acordar_ate', { hora: '06:30' }, 1),
    hab('Dormir até 23h', 'garmin', 'dormir_ate', { hora: '23:00' }, 2),
    hab('Sono 7h+ com score 70+', 'garmin', 'sono', { horas: 7, score: 70 }, 3),
    hab('8 mil passos', 'garmin', 'passos', { meta: 8000 }, 4),
    hab('Treino de 30 min', 'garmin', 'treino', { minutos: 30, excluir: ['walking'] }, 5),
    hab('Pesar', 'garmin', 'pesar', {}, 6),
    hab('Sem álcool', 'manual', null, {}, 10),
    hab('Sem doce', 'manual', null, {}, 11),
    hab('Sem delivery', 'manual', null, {}, 12),
  ];
  const rec = (nome, k, r, m, app, appMin, ordem) => ({ id: novoId(), nome, custo_kcal: k, custo_reais: r, custo_min: m, libera_app: app, libera_min: appMin, ativo: true, ordem });
  s.recompensa = [
    rec('iFood', 900, 60, 0, null, null, 1), rec('Doce', 350, 0, 0, null, null, 2),
    rec('Cerveja (2 long necks)', 300, 20, 0, null, null, 3), rec('Episódio de série', 0, 0, 104, 'Netflix', 45, 4),
    rec('30 min de Instagram', 0, 0, 69, 'Instagram', 30, 5), rec('Cinema', 0, 45, 120, null, null, 6),
  ];

  // Garmin: [dias atrás, kcal, passos, acordou, dormiu (data, hora), sono min, score, peso, fc, hrv, bb, atividade]
  const G = [
    [6, 2550, 9120, '06:10', [7, '22:50'], 455, 78, 83.4, 62, 36, 80, ['running', 'Corrida', 40]],
    [5, 2700, 11800, '06:25', [6, '22:40'], 470, 81, 83.1, 60, 39, 88, null],
    [4, 2400, 6100, '07:05', [4, '00:20'], 400, 61, 83.0, 64, 31, 62, ['strength_training', 'Força', 50]],
    [3, 2650, 8900, '06:15', [4, '23:10'], 430, 72, 82.8, 61, 35, 76, null],
    [2, 2480, 7400, '06:28', [3, '22:55'], 440, 74, 82.7, 61, 38, 79, ['strength_training', 'Força', 45]],
    [1, 2420, 8050, '06:40', [2, '23:20'], 410, 66, null, 62, 34, 70, ['running', 'Corrida', 35]],
    [0, 2500, 8430, '06:20', [1, '23:40'], 432, 68, 82.4, 61, 37, 84, ['strength_training', 'Força', 45]],
  ];
  let actId = 9000000001;
  for (const [n, kcal, passos, acordou, [dn, dh], sono, score, peso, fc, hrv, bb, at] of G) {
    const data = d(n);
    // ontem sincronizou antes do fim do dia (fica aguardando); hoje, há pouco
    const sinc = n === 0 ? new Date(Date.now() - 40 * 60000).toISOString() : n === 1 ? ts(data, '21:30') : ts(addDias(data, 1), '07:05');
    s.garmin_dia[data] = {
      data, calorias_total: kcal, calorias_ativas: kcal - 2028, calorias_bmr: 2028, passos, distancia_km: +(passos * 0.00075).toFixed(2),
      andares: null, min_moderada: null, min_vigorosa: null,
      sono_min: sono, sono_leve_min: null, sono_profundo_min: null, sono_rem_min: null, sono_acordado_min: null, sono_score: score,
      dormiu_as: local(d(dn), dh), acordou_as: local(data, acordou),
      fc_repouso: fc, hrv, hrv_status: 'BALANCED', body_battery_max: bb, body_battery_min: 10, estresse: 32,
      spo2: 95, respiracao: 15, vo2max: 44.9, status_treino: null, peso_kg: peso, gordura_pct: null, sincronizado_em: sinc,
    };
    if (at) {
      s.garmin_atividade.push({ activity_id: actId++, data, tipo: at[0], nome: at[1], inicio: local(data, '07:00'), duracao_min: at[2],
        distancia_km: null, calorias: at[2] * 8, fc_media: 128, fc_max: 160, zona1_min: null, zona2_min: null, zona3_min: null, zona4_min: null, zona5_min: null });
    }
  }

  // Refeições: [dias atrás, café, almoço, lanche, jantar]
  const R = [[6, 400, 700, 250, 400], [5, 380, 720, 230, 420], [4, 450, 650, 300, 350], [3, 420, 780, 250, 350],
    [2, 380, 700, 250, 400], [1, 450, 800, 250, 400], [0, 420, 780, 250, 350]];
  const nomes = [['Café da manhã', '07:30'], ['Almoço', '12:30'], ['Lanche', '16:00'], ['Jantar', '20:00']];
  for (const [n, ...kcals] of R) {
    kcals.forEach((k, i) => s.refeicao.push({ id: novoId(), data: d(n), hora: nomes[i][1], descricao: nomes[i][0], kcal: k, criado_em: ts(d(n), nomes[i][1]) }));
  }

  // Gastos
  const GS = [[6, 'Mercado', 22, 'Mercado'], [6, 'Café', 10, 'Restaurante'], [5, 'Almoço fora', 45, 'Restaurante'],
    [4, 'Café', 8, 'Restaurante'], [4, 'Farmácia', 10, 'Saúde'], [3, 'Mercado', 48, 'Mercado'], [3, 'Café', 12, 'Restaurante'],
    [2, 'Padaria', 17, 'Mercado'], [2, 'Café', 10, 'Restaurante'], [1, 'Uber', 22, 'Transporte'], [1, 'Café', 10, 'Restaurante'],
    [0, 'Mercado', 22, 'Mercado'], [0, 'Café', 10, 'Restaurante']];
  GS.forEach(([n, desc, valor, cat], i) => s.gasto.push({ id: novoId(), data: d(n), descricao: desc, valor, categoria: cat, criado_em: ts(d(n), `1${i % 10}:00`) }));

  // Tempo registrado à mão
  const porNome = (nome) => s.atividade.find((a) => a.nome === nome).id;
  const T = [[6, 'Leitura', 20], [6, 'Instagram', 45], [5, 'Leitura', 30], [5, 'Instagram', 30], [5, 'YouTube', 20],
    [4, 'Família', 30], [4, 'Instagram', 25], [3, 'Podcast', 25], [3, 'Netflix', 45], [2, 'Leitura', 30], [2, 'Instagram', 20],
    [1, 'Leitura', 40], [1, 'Família', 20], [1, 'Estudo', 45], [1, 'Instagram', 10],
    [0, 'Leitura', 30], [0, 'Podcast', 25], [0, 'Família', 20], [0, 'Instagram', 25]];
  T.forEach(([n, nome, minutos], i) => s.tempo_registro.push({ id: novoId(), data: d(n), atividade_id: porNome(nome), minutos, fonte: 'manual', criado_em: ts(d(n), `${String(8 + i % 12).padStart(2, '0')}:00`) }));

  // Hábitos manuais marcados
  const manuais = s.habito.filter((h) => h.fonte === 'manual');
  const M = { 6: ['fiz', 'fiz', 'fiz'], 5: ['fiz', 'nao', 'fiz'], 4: ['fiz', 'fiz', 'nao'], 3: ['nao', 'nao', 'fiz'], 2: ['fiz', 'fiz', 'fiz'], 1: ['fiz', 'fiz', 'fiz'], 0: ['fiz'] };
  for (const [n, sts] of Object.entries(M)) sts.forEach((st, i) => s.habito_marca.push({ habito_id: manuais[i].id, data: d(+n), status: st }));

  // Uma troca já feita
  const doce = s.recompensa.find((r) => r.nome === 'Doce');
  s.troca.push({ id: novoId(), criado_em: ts(d(3), '21:00'), data: d(3), recompensa_id: doce.id, nome: 'Doce', custo_kcal: 350, custo_reais: 0, custo_min: 0, emergencia: false, motivo: null });
  return s;
}

function estado() {
  let s = ler();
  if (!s || s.versao !== 1) { s = semear(); gravar(s); }
  return s;
}

// ------------------------------------------------------------ o cálculo (espelho do SQL)

const cents = (v) => Math.round(Number(v) * 100);
const diasDoMes = (data) => new Date(Date.UTC(+data.slice(0, 4), +data.slice(5, 7), 0)).getUTCDate();
const hhmm = (v) => (v ? String(v).replace(' ', 'T').slice(0, 16) : null); // 'AAAA-MM-DDTHH:MM'

function regraPara(s, data) {
  const ord = [...s.regras].sort((a, b) => (a.valido_desde < b.valido_desde ? 1 : -1));
  return ord.find((r) => r.valido_desde <= data) || null;
}

function listaDias(s) {
  const hoje = hojeBR();
  const gs = Object.keys(s.garmin_dia).sort();
  let ini = s.conta.inicio;
  if (gs.length && gs[0] < ini) ini = gs[0];
  if (ini > hoje) ini = hoje;
  const out = [];
  for (let d = ini; d <= hoje; d = addDias(d, 1)) out.push(d);
  return out;
}

function somaPor(lista, campo) {
  const m = {};
  for (const r of lista) m[r.data] = (m[r.data] || 0) + Number(r[campo]);
  return m;
}

function calcularCreditos(s) {
  const hoje = hojeBR();
  const atv = Object.fromEntries(s.atividade.map((a) => [a.id, a]));
  const consumo = somaPor(s.refeicao, 'kcal');
  const gastos = {};
  for (const g of s.gasto) gastos[g.data] = (gastos[g.data] || 0) + cents(g.valor);
  const treino = somaPor(s.garmin_atividade, 'duracao_min');
  const out = [];
  for (const data of listaDias(s)) {
    const rg = regraPara(s, data);
    if (!rg) continue;
    let prod = 0, vicioMin = 0, vicioCusto100 = 0;
    for (const t of s.tempo_registro) {
      if (t.data !== data) continue;
      const a = atv[t.atividade_id];
      if (!a) continue;
      if (a.tipo === 'produtivo') prod += t.minutos;
      else {
        vicioMin += t.minutos;
        vicioCusto100 += t.minutos * Math.round(Number(a.fator ?? rg.fator_vicio) * 100);
      }
    }
    const g = s.garmin_dia[data];
    const gastoKcal = g && g.calorias_total !== null && g.calorias_total !== undefined ? g.calorias_total : null;
    const consumoKcal = consumo[data] || 0;
    const tetoC = Math.round(cents(rg.teto_mensal) / diasDoMes(data));
    const gastoC = gastos[data] || 0;
    const treinoMin = Math.round(treino[data] || 0);
    const vicioCusto = Math.round(vicioCusto100 / 100);
    const produtivo = prod + treinoMin;
    const fimDoDia = new Date(addDias(data, 1) + 'T00:00:00-03:00').getTime();
    out.push({
      data,
      gasto_kcal: gastoKcal,
      consumo_kcal: consumoKcal,
      deficit_meta: rg.deficit_meta,
      credito_kcal: gastoKcal === null ? null : gastoKcal - consumoKcal - rg.deficit_meta,
      teto_reais: tetoC / 100,
      gasto_reais: gastoC / 100,
      credito_reais: (tetoC - gastoC) / 100,
      produtivo_min: produtivo,
      vicio_min: vicioMin,
      vicio_custo_min: vicioCusto,
      credito_min: produtivo - vicioCusto,
      confirmado_dia: data < hoje,
      confirmado_kcal: !!(data < hoje && g && g.sincronizado_em && new Date(g.sincronizado_em).getTime() >= fimDoDia),
    });
  }
  return out;
}

function calcularBanco(s) {
  const hoje = hojeBR();
  const c = calcularCreditos(s).filter((r) => r.data >= s.conta.inicio);
  let k = 0, rC = 0, m = 0, aguardando = 0;
  for (const r of c) {
    if (r.confirmado_kcal) k += r.credito_kcal;
    if (r.confirmado_dia) { rC += cents(r.credito_reais); m += r.credito_min; }
    if (!r.confirmado_kcal && r.data < hoje) aguardando++;
  }
  for (const t of s.troca) { k -= t.custo_kcal; rC -= cents(t.custo_reais); m -= t.custo_min; }
  return { kcal: k, reais: rC / 100, min: m, dias_aguardando_garmin: aguardando };
}

function avaliarHabito(s, h, data, hoje) {
  const g = s.garmin_dia[data];
  const p = h.parametros || {};
  if (h.fonte === 'manual') {
    const m = s.habito_marca.find((x) => x.habito_id === h.id && x.data === data);
    return m ? m.status : null;
  }
  switch (h.regra) {
    case 'acordar_ate':
      if (!g || !g.acordou_as) return null;
      return hhmm(g.acordou_as) <= `${data}T${p.hora.slice(0, 5)}` ? 'fiz' : 'nao';
    case 'dormir_ate':
      if (!g || !g.dormiu_as) return null;
      return hhmm(g.dormiu_as) <= `${addDias(data, -1)}T${p.hora.slice(0, 5)}` ? 'fiz' : 'nao';
    case 'sono':
      if (!g || g.sono_min === null || g.sono_min === undefined) return null;
      return g.sono_min >= Number(p.horas) * 60 && (g.sono_score || 0) >= Number(p.score) ? 'fiz' : 'nao';
    case 'passos':
      if (!g || g.passos === null || g.passos === undefined) return null;
      return g.passos >= Number(p.meta) ? 'fiz' : 'nao';
    case 'treino': {
      const excluir = p.excluir || [];
      const ok = s.garmin_atividade.some((a) => a.data === data && Number(a.duracao_min) >= Number(p.minutos) && a.tipo !== null && a.tipo !== undefined && !excluir.includes(a.tipo));
      return ok ? 'fiz' : data < hoje ? 'nao' : null;
    }
    case 'pesar':
      return g && g.peso_kg !== null && g.peso_kg !== undefined ? 'fiz' : data < hoje ? 'nao' : null;
    default:
      return null;
  }
}

function formatarFalta(n) { return Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ------------------------------------------------------------ importação do CSV do Garmin (data/daily.csv e data/activities.csv)

function lerCsv(texto) {
  const t = texto.replace(/^﻿/, '');
  const linhas = [];
  let campo = '', linhaAtual = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linhaAtual.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linhaAtual.push(campo); campo = '';
      if (linhaAtual.length > 1 || linhaAtual[0] !== '') linhas.push(linhaAtual);
      linhaAtual = [];
    } else campo += c;
  }
  if (campo !== '' || linhaAtual.length) { linhaAtual.push(campo); linhas.push(linhaAtual); }
  const [cab, ...resto] = linhas;
  return resto.map((l) => Object.fromEntries(cab.map((k, i) => [k.trim(), l[i]])));
}

// Mesmo mapa do garmin_coleta.py (MAPA_DIA / MAPA_ATIVIDADE)
const MAPA_DIA = [['data', 'data', 'txt'], ['calorias_total', 'calorias_total', 'int'], ['calorias_ativas', 'calorias_ativas', 'int'],
  ['calorias_bmr', 'calorias_bmr', 'int'], ['passos', 'passos', 'int'], ['distancia_km', 'distancia_km', 'num'], ['andares_subidos', 'andares', 'num'],
  ['min_intensidade_moderada', 'min_moderada', 'int'], ['min_intensidade_vigorosa', 'min_vigorosa', 'int'], ['sono_total_min', 'sono_min', 'int'],
  ['sono_leve_min', 'sono_leve_min', 'int'], ['sono_profundo_min', 'sono_profundo_min', 'int'], ['sono_rem_min', 'sono_rem_min', 'int'],
  ['sono_acordado_min', 'sono_acordado_min', 'int'], ['sono_score', 'sono_score', 'int'], ['dormiu_as', 'dormiu_as', 'txt'], ['acordou_as', 'acordou_as', 'txt'],
  ['fc_repouso', 'fc_repouso', 'int'], ['hrv_noite_media', 'hrv', 'int'], ['hrv_status', 'hrv_status', 'txt'], ['body_battery_max', 'body_battery_max', 'int'],
  ['body_battery_min', 'body_battery_min', 'int'], ['estresse_medio', 'estresse', 'int'], ['spo2_medio', 'spo2', 'num'], ['respiracao_media', 'respiracao', 'num'],
  ['vo2max', 'vo2max', 'num'], ['status_treino', 'status_treino', 'txt'], ['peso_kg', 'peso_kg', 'num'], ['gordura_pct', 'gordura_pct', 'num']];
const MAPA_ATIVIDADE = [['activity_id', 'activity_id', 'int'], ['data', 'data', 'txt'], ['tipo', 'tipo', 'txt'], ['nome', 'nome', 'txt'],
  ['inicio', 'inicio', 'txt'], ['duracao_min', 'duracao_min', 'num'], ['distancia_km', 'distancia_km', 'num'], ['calorias', 'calorias', 'int'],
  ['fc_media', 'fc_media', 'int'], ['fc_max', 'fc_max', 'int'], ...[1, 2, 3, 4, 5].map((n) => [`zona${n}_min`, `zona${n}_min`, 'num'])];

function converter(v, tipo) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  if (tipo === 'txt') return v;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return tipo === 'int' ? Math.round(n) : n;
}
const mapear = (linhas, mapa) => linhas.map((r) => Object.fromEntries(mapa.map(([c, t, tipo]) => [t, converter(r[c], tipo)])));

// ------------------------------------------------------------ a interface pública (igual à do api-supabase.js)

const porData = (lista, data) => lista.filter((r) => r.data === data).sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
const TABELAS = ['refeicao', 'gasto', 'tempo_registro'];

export function criar() {
  return {
    modo: 'demo',
    async sessao() { return { email: 'demonstração' }; },
    async entrar() {},
    async sair() {},

    async inicioConta() { return estado().conta.inicio; },
    async regras(data = hojeBR()) { return regraPara(estado(), data); },
    async banco() { return calcularBanco(estado()); },
    async creditoDia(data) { return calcularCreditos(estado()).find((r) => r.data === data) || null; },
    async creditos(de, ate) { return calcularCreditos(estado()).filter((r) => r.data >= de && r.data <= ate); },

    async garminDia(data) { return estado().garmin_dia[data] || null; },
    async garminPeriodo(de, ate) {
      const s = estado();
      return Object.values(s.garmin_dia).filter((g) => g.data >= de && g.data <= ate).sort((a, b) => (a.data < b.data ? -1 : 1));
    },
    async garminAtividades(data) { return estado().garmin_atividade.filter((a) => a.data === data); },
    async ultimaSinc() {
      const v = Object.values(estado().garmin_dia).sort((a, b) => (a.sincronizado_em < b.sincronizado_em ? 1 : -1))[0];
      return v ? { data: v.data, sincronizado_em: v.sincronizado_em } : null;
    },

    async habitosDia(data) {
      const s = estado();
      const hoje = hojeBR();
      if (!listaDias(s).includes(data)) return [];
      return s.habito.filter((h) => h.ativo).sort((a, b) => a.ordem - b.ordem).map((h) => ({
        habito_id: h.id, nome: h.nome, fonte: h.fonte, regra: h.regra, parametros: h.parametros, ordem: h.ordem, data,
        status: avaliarHabito(s, h, data, hoje),
      }));
    },
    async marcarHabito(habitoId, data, status) {
      const s = estado();
      s.habito_marca = s.habito_marca.filter((m) => !(m.habito_id === habitoId && m.data === data));
      if (status) s.habito_marca.push({ habito_id: habitoId, data, status });
      gravar(s);
    },

    async refeicoes(data) { return porData(estado().refeicao, data); },
    async gastos(data) { return porData(estado().gasto, data); },
    async tempos(data) {
      const s = estado();
      return porData(s.tempo_registro, data).map((t) => ({ ...t, atividade: s.atividade.find((a) => a.id === t.atividade_id) || null }));
    },
    async trocas(data) { return porData(estado().troca, data); },

    async adicionar(tabela, linha) {
      if (!TABELAS.includes(tabela)) throw new Error('Tabela não permitida');
      const s = estado();
      const r = { id: novoId(), data: hojeBR(), criado_em: new Date().toISOString(), ...linha };
      if (tabela === 'tempo_registro') r.fonte = r.fonte || 'manual';
      s[tabela].push(r);
      gravar(s);
      return r;
    },
    async excluir(tabela, id) {
      if (!TABELAS.includes(tabela)) throw new Error('Tabela não permitida');
      const s = estado();
      s[tabela] = s[tabela].filter((r) => r.id !== id);
      gravar(s);
    },

    async atividades() { return estado().atividade.filter((a) => a.ativo).sort((a, b) => a.ordem - b.ordem); },
    async recompensas() { return estado().recompensa.filter((r) => r.ativo).sort((a, b) => a.ordem - b.ordem); },

    // Espelho de trocar(): recusa quando o banco da moeda não cobre
    async trocar({ nome, kcal = 0, reais = 0, min = 0, recompensa = null }) {
      const s = estado();
      const b = calcularBanco(s);
      if (kcal > 0 && b.kcal < kcal) throw new Error(`Sem saldo de calorias: faltam ${kcal - b.kcal} kcal`);
      if (reais > 0 && cents(b.reais) < cents(reais)) throw new Error(`Sem saldo de dinheiro: faltam R$ ${formatarFalta(reais - b.reais)}`);
      if (min > 0 && b.min < min) throw new Error(`Sem saldo de tempo: faltam ${min - b.min} min`);
      const t = { id: novoId(), criado_em: new Date().toISOString(), data: hojeBR(), recompensa_id: recompensa, nome,
        custo_kcal: kcal || 0, custo_reais: reais || 0, custo_min: min || 0, emergencia: false, motivo: null };
      s.troca.push(t);
      gravar(s);
      return t;
    },

    // Só no modo demonstração
    async importarGarmin(textoDiario, textoAtividades) {
      const s = estado();
      const agora = new Date().toISOString();
      let dias = 0, atividades = 0;
      if (textoDiario) {
        const linhas = mapear(lerCsv(textoDiario), MAPA_DIA).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.data || ''));
        if (!linhas.length) throw new Error('O arquivo de dias não tem a coluna "data" do daily.csv');
        s.garmin_dia = {};
        for (const r of linhas) s.garmin_dia[r.data] = { ...r, sincronizado_em: agora };
        dias = linhas.length;
        s.garmin_atividade = [];
      }
      if (textoAtividades) {
        const linhas = mapear(lerCsv(textoAtividades), MAPA_ATIVIDADE).filter((r) => r.activity_id && r.data);
        const ids = new Set(linhas.map((r) => r.activity_id));
        s.garmin_atividade = s.garmin_atividade.filter((a) => !ids.has(a.activity_id)).concat(linhas);
        atividades = linhas.length;
      }
      s.garmin_importado_em = agora;
      gravar(s);
      return { dias, atividades };
    },
    async garminImportadoEm() { return estado().garmin_importado_em; },
    async reiniciar() { gravar(semear()); },
  };
}
