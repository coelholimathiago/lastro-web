// Simulação do plano financeiro, mês a mês. Determinística: a IA nunca calcula números.
// Contrato: docs/plano-financeiro.md (seção "Simulação" e "O que Aplicar plano cria").
// Sem dependências: roda no navegador e no Node (teste do caso da especificação).
// Toda a conta é feita em centavos inteiros; a saída volta em reais com 2 casas.

export const HORIZONTE_MESES = 16; // do mês corrente até 16 meses à frente (17 meses ao todo)
export const PARCELAS_VIAGEM_PADRAO = 10;
export const FATOR_TETO_PARCELAS = 0.65;

const MESES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ------------------------------------------------------------ utilidades

const num = (v) => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const cent = (v) => {
  const n = num(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const reais = (c) => Math.round(c) / 100;
const somaC = (lista, campo) => (Array.isArray(lista) ? lista : []).reduce((s, x) => s + Math.max(0, cent(x && x[campo])), 0);

export function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function somaMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function diasDoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}
export function ultimoDia(mes) {
  return `${mes}-${String(diasDoMes(mes)).padStart(2, '0')}`;
}
// "abr/27"
export function mesCurto(mes) {
  if (!mes) return '';
  return `${MESES_C[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
}
const MES_OK = (m) => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m);
const reaisTxt = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: Math.abs(v % 1) > 0.004 ? 2 : 0, maximumFractionDigits: 2 });

// ------------------------------------------------------------ o variável

// Valores de cada nível de aperto (pergunta 10), em reais inteiros.
// leve = máx(piso, atual × 0,9); médio = máx(piso, atual × 0,8); firme = piso.
export function valoresAperto(respostas = {}) {
  const atual = num(respostas.variavel_atual);
  const pisoN = num(respostas.piso_variavel);
  if (!Number.isFinite(atual) || atual <= 0) {
    const p = Number.isFinite(pisoN) && pisoN > 0 ? Math.round(pisoN) : null;
    return { leve: p, medio: p, firme: p };
  }
  const piso = Number.isFinite(pisoN) && pisoN > 0 ? pisoN : null;
  const firme = piso !== null ? Math.round(piso) : Math.round(atual * 0.7);
  return {
    leve: Math.round(Math.max(piso ?? 0, atual * 0.9)),
    medio: Math.round(Math.max(piso ?? 0, atual * 0.8)),
    firme,
  };
}

// O alvo do variável: o valor escrito vale; sem ele, o do nível de aperto; sem nada, o atual.
export function variavelAlvo(respostas = {}) {
  const v = num(respostas.variavel_alvo);
  if (Number.isFinite(v) && v > 0) return Math.round(v);
  const ap = String(respostas.aperto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const vals = valoresAperto(respostas);
  if (ap in vals && vals[ap]) return vals[ap];
  const atual = num(respostas.variavel_atual);
  return Number.isFinite(atual) && atual > 0 ? Math.round(atual) : 0;
}

// Degraus: do atual até o alvo em 3 meses lineares, começando no mês corrente.
function degraus(atual, alvo, n) {
  return Array.from({ length: n }, (_, k) => (k < 2 ? Math.round(atual - ((atual - alvo) * (k + 1)) / 3) : alvo));
}

// ------------------------------------------------------------ objetivos

function acharViagem(respostas) {
  const lista = Array.isArray(respostas.objetivos) ? respostas.objetivos : [];
  return lista.find((o) => o && o.tipo === 'viagem') || null;
}
const tirouDosInvestimentos = (sit) => /invest/i.test(String(sit || ''));

// ------------------------------------------------------------ simular

export function simular(respostas = {}, { hoje } = {}) {
  const R = respostas || {};
  const H = hoje || hojeSP();
  const mes0 = H.slice(0, 7);
  const alertas = [];
  const notas = [];

  // quanto sobra por mês antes do cartão
  const rendaC = cent(R.renda_fixa);
  const rendimentoC = R.usa_rendimento ? cent(R.renda_investimentos) : 0;
  const fixosC = somaC(R.fixos, 'valor');
  const dividasC = somaC(R.dividas, 'parcela');
  const livreC = rendaC + rendimentoC - fixosC - dividasC;

  // o variável em degraus (reais inteiros)
  const alvo = variavelAlvo(R);
  const atualN = num(R.variavel_atual);
  const atual = Number.isFinite(atualN) && atualN > 0 ? Math.round(atualN) : alvo;
  const n = HORIZONTE_MESES + 1;
  const variavel = degraus(atual, alvo, n);
  const pisoN = num(R.piso_variavel);

  // parcelas antigas do cartão por mês
  const cartao = R.cartao || {};
  const parcelas = {};
  (Array.isArray(cartao.parcelas_futuras) ? cartao.parcelas_futuras : []).forEach((p) => {
    if (!p || !MES_OK(p.mes)) return;
    parcelas[p.mes] = (parcelas[p.mes] || 0) + Math.max(0, cent(p.valor));
  });
  // fatura do mês corrente: a informada (já contém o variável do mês anterior); sem ela, estima
  const faturaAtualN = num(cartao.fatura_atual);
  const faturaAtualC = Number.isFinite(faturaAtualN) ? Math.max(0, Math.round(faturaAtualN * 100)) : (parcelas[mes0] || 0) + atual * 100;
  if (!Number.isFinite(faturaAtualN)) alertas.push(`Sem a fatura deste mês: estimada em ${reaisTxt(reais(faturaAtualC))} (parcelas + variável atual).`);

  // viagem
  const vg = acharViagem(R);
  let viagem = null;
  if (vg) {
    const valorC = cent(vg.valor);
    if (valorC > 0 && MES_OK(vg.mes) && vg.mes >= mes0) {
      // à vista ignora o campo de parcelas (o objetivo nasce com 10 e o chip só esconde o campo)
      const np = vg.forma === 'a_vista' ? 1 : Math.max(1, Math.round(num(vg.parcelas)) || PARCELAS_VIAGEM_PADRAO);
      viagem = { mes: vg.mes, valorC, parcelas: np, descricao: vg.descricao || '' };
    } else if (valorC > 0 && MES_OK(vg.mes) && vg.mes < mes0) {
      alertas.push('A viagem está num mês que já passou: ficou fora da simulação.');
    } else {
      alertas.push('A viagem está sem valor ou sem mês: ficou fora da simulação.');
    }
  }

  const meses = [];
  let cofrinhoC = 0;
  let parcelaViagemC = 0;
  let parceladoC = 0;
  let viagemIni = null, viagemFim = null;
  const fecharViagem = () => {
    parceladoC = Math.max(0, viagem.valorC - cofrinhoC);
    parcelaViagemC = Math.round(parceladoC / viagem.parcelas);
    viagemIni = somaMes(viagem.mes, 1);
    viagemFim = somaMes(viagem.mes, viagem.parcelas);
  };

  for (let i = 0; i < n; i++) {
    const mes = somaMes(mes0, i);
    const antigasC = i === 0 ? 0 : parcelas[mes] || 0;
    const varFatC = i === 0 ? 0 : variavel[i - 1] * 100;
    const pvC = viagemIni && mes >= viagemIni && mes <= viagemFim ? parcelaViagemC : 0;
    const faturaC = i === 0 ? faturaAtualC : antigasC + varFatC + pvC;
    const saldoC = livreC - faturaC;
    let destino;
    if (saldoC < 0) destino = 'resgate';
    else if (viagem && mes <= viagem.mes) destino = 'cofrinho';
    else destino = 'recompor';
    if (destino === 'cofrinho') cofrinhoC += saldoC;
    meses.push({
      mes,
      parcelas_antigas: reais(antigasC),
      variavel_fatura: reais(varFatC),
      parcela_viagem: reais(pvC),
      fatura: reais(faturaC),
      saldo: reais(saldoC),
      destino,
      _saldoC: saldoC,
    });
    if (viagem && mes === viagem.mes) fecharViagem();
  }
  if (viagem && !viagemIni) {
    fecharViagem(); // viagem depois do horizonte: o cofrinho é o que deu para juntar até o fim
    alertas.push(`A viagem (${mesCurto(viagem.mes)}) passa do horizonte da simulação: o cofrinho considera só até ${mesCurto(meses[n - 1].mes)}.`);
  }

  // resgate
  const negativos = meses.filter((m) => m._saldoC < 0);
  const resgateC = negativos.reduce((s, m) => s - m._saldoC, 0);
  const ultimoResgate = negativos.length ? negativos[negativos.length - 1].mes : null;
  const primeiroPositivo = (meses.find((m) => m._saldoC >= 0) || {}).mes || null;

  // recompor
  const u3 = R.ultimos_3m || {};
  const tirouC = tirouDosInvestimentos(u3.situacao) ? Math.max(0, cent(u3.valor)) : 0;
  const metaRecomporC = tirouC + resgateC;
  let acum = 0, recomporMes = null;
  meses.forEach((m) => {
    if (m.destino !== 'recompor' || m._saldoC <= 0) return;
    acum += m._saldoC;
    if (!recomporMes && metaRecomporC > 0 && acum >= metaRecomporC) recomporMes = m.mes;
  });

  // teto de parcelas novas: 65% da sobra estrutural, arredondado à centena
  const sobraC = livreC - alvo * 100;
  const tetoParcelas = sobraC > 0 ? Math.round((reais(sobraC) * FATOR_TETO_PARCELAS) / 100) * 100 : 0;

  // custo do resgate
  const investido = num(R.investido_total);
  const rendInv = num(R.renda_investimentos);
  let taxa = null, custo10mil = null;
  if (investido > 0 && rendInv > 0) {
    taxa = rendInv / investido;
    custo10mil = Math.round(10000 * taxa);
  }

  // alertas
  if (sobraC <= 0) alertas.push(`Mesmo com o variável em ${reaisTxt(alvo)}, a conta não fecha: faltam ${reaisTxt(reais(-sobraC))} por mês.`);
  if (viagem && parcelaViagemC > 0 && reais(parcelaViagemC) > tetoParcelas) {
    alertas.push(`A parcela da viagem (${reaisTxt(reais(parcelaViagemC))}) passa do teto de parcelas novas (${reaisTxt(tetoParcelas)}).`);
  }
  if (Number.isFinite(pisoN) && pisoN > 0 && alvo < pisoN) alertas.push(`O variável escolhido (${reaisTxt(alvo)}) fica abaixo do mínimo que você disse (${reaisTxt(Math.round(pisoN))}).`);
  if (metaRecomporC > 0 && !recomporMes) alertas.push(`Os investimentos não voltam dentro do horizonte: a recomposição fica para depois de ${mesCurto(meses[n - 1].mes)}.`);
  if (primeiroPositivo && negativos.some((m) => m.mes > primeiroPositivo)) {
    alertas.push('Há meses negativos depois de meses positivos: o resgate não acontece de uma vez.');
  }

  notas.push('Supõe que o variável é pago no cartão: o que se gasta num mês entra na fatura do mês seguinte.');
  if (dividasC > 0) notas.push('As parcelas das outras dívidas ficam iguais em todo o horizonte.');
  if (R.renda_varia) notas.push('A renda varia: a simulação usa o valor informado como renda de todo mês.');

  return {
    versao: 1,
    hoje: H,
    meses: meses.map(({ _saldoC, ...m }) => m),
    variavel_por_mes: meses.map((m, i) => ({ mes: m.mes, valor: variavel[i] })),
    kpis: {
      livre: reais(livreC),
      renda: reais(rendaC + rendimentoC),
      fixos: reais(fixosC),
      parcelas_dividas: reais(dividasC),
      variavel_atual: atual,
      variavel_alvo: alvo,
      piso_variavel: Number.isFinite(pisoN) && pisoN > 0 ? Math.round(pisoN) : null,
      fatura_atual: reais(faturaAtualC),
      resgate_total: reais(resgateC),
      ultimo_resgate_mes: ultimoResgate,
      primeiro_positivo_mes: primeiroPositivo,
      cofrinho: reais(cofrinhoC),
      viagem_mes: viagem ? viagem.mes : null,
      viagem_valor: viagem ? reais(viagem.valorC) : null,
      parcelado_viagem: reais(parceladoC),
      parcela_viagem: reais(parcelaViagemC),
      parcelas_viagem: viagem ? viagem.parcelas : 0,
      viagem_parcelas_de: viagemIni,
      viagem_parcelas_ate: viagemFim,
      recompor_meta: reais(metaRecomporC),
      recompor_mes: recomporMes,
      recompor_acumulado: reais(acum),
      sobra_estrutural: reais(sobraC),
      teto_parcelas: tetoParcelas,
      taxa_investimentos: taxa,
      custo_resgate_10mil: custo10mil,
      horizonte_ate: meses[n - 1].mes,
    },
    alertas,
    notas,
  };
}

// ------------------------------------------------------------ o que "Aplicar plano" cria

export function itensDoPlano(respostas = {}, sim) {
  const R = respostas || {};
  const k = sim.kpis;
  const mes0 = sim.meses[0].mes;

  // tetos: um por mês até o variável chegar ao alvo, inclusive; dali em diante vale o último
  const tetos = [];
  for (const v of sim.variavel_por_mes) {
    tetos.push({ mes: `${v.mes}-01`, teto_mensal: v.valor });
    if (v.valor === k.variavel_alvo) break;
  }

  // metas
  const metas = [];
  const ultimoResg = k.ultimo_resgate_mes || mes0;
  let ondaC = Math.round(sim.meses[0].fatura * 100);
  sim.meses.forEach((m, i) => { if (i > 0 && m.mes <= ultimoResg) ondaC += Math.round(m.parcelas_antigas * 100); });
  const onda = reais(ondaC);
  metas.push({
    chave: 'onda', titulo: 'Zerar a onda do cartão', horizonte: '3m', tipo: 'quitar',
    valor_inicial: onda, alvo: onda, unidade: 'R$', prazo: ultimoDia(ultimoResg),
  });
  const objetivos = Array.isArray(R.objetivos) ? R.objetivos : [];
  const objRecompor = objetivos.find((o) => o && o.tipo === 'recompor');
  if (k.resgate_total > 0 || objRecompor) {
    let alvo = k.recompor_meta;
    if (!(alvo > 0) && objRecompor && num(objRecompor.valor) > 0) alvo = Math.round(num(objRecompor.valor) * 100) / 100;
    if (alvo > 0) {
      metas.push({
        chave: 'recompor', titulo: 'Recompor investimentos', horizonte: '12m', tipo: 'juntar',
        valor_inicial: 0, alvo, unidade: 'R$', prazo: ultimoDia(k.recompor_mes || somaMes(mes0, 12)),
      });
    }
  }

  // recompensas: a viagem vira cofrinho, condicionado a zerar a onda
  const recompensas = [];
  const vg = acharViagem(R);
  if (vg && k.viagem_mes) {
    const nome = `Viagem — ${String(vg.descricao || '').trim() || mesCurto(k.viagem_mes)}`.slice(0, 80);
    const partes = [];
    if (k.cofrinho > 0) partes.push(`cofrinho até ${mesCurto(k.viagem_mes)}`);
    if (k.parcela_viagem > 0) {
      partes.push(k.parcelas_viagem === 1
        ? `o resto à vista, ${reaisTxt(k.parcela_viagem)} em ${mesCurto(k.viagem_parcelas_de)}`
        : `o resto em ${k.parcelas_viagem}× de ${reaisTxt(k.parcela_viagem)} a partir de ${mesCurto(k.viagem_parcelas_de)}`);
    }
    const descricao = partes.length ? partes.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.' : null;
    if (k.cofrinho > 0) {
      const primeiro = sim.meses.find((m) => m.destino === 'cofrinho' && m.saldo > 0);
      const ini = primeiro ? primeiro.mes : mes0;
      const dias = (Date.parse(ultimoDia(k.viagem_mes) + 'T12:00:00Z') - Date.parse(ini + '-01T12:00:00Z')) / 864e5 + 1;
      const semanas = Math.max(1, dias / 7);
      recompensas.push({
        nome, nivel: 'grande', tipo: 'cofrinho', cofrinho_alvo: k.cofrinho,
        guardar_semana: Math.round((k.cofrinho * 100) / semanas) / 100, meta_chave: 'onda', descricao,
      });
    } else {
      recompensas.push({ nome, nivel: 'grande', tipo: 'compra', meta_chave: 'onda', descricao });
    }
  }

  return { tetos, metas, recompensas };
}
