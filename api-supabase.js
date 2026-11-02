// Modo real: lê as views do Supabase e chama rpc('trocar'). Contrato: supabase/migrations/0001_lastro.sql.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { hojeBR } from './ui.js';

const TABELAS = ['refeicao', 'gasto', 'tempo_registro'];

function traduzirAuth(msg) {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado no Supabase.';
  if (/fetch|network/i.test(msg)) return 'Sem conexão com o Supabase.';
  return msg;
}

export async function criar(url, chave) {
  const sb = createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lastro-auth' } });

  const ok = ({ data, error }) => {
    if (error) throw new Error(error.message || 'Erro no Supabase');
    return data;
  };

  return {
    modo: 'supabase',

    async sessao() {
      const { data } = await sb.auth.getSession();
      return data.session ? { email: data.session.user.email } : null;
    },
    async entrar(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error(traduzirAuth(error.message));
    },
    async sair() { await sb.auth.signOut(); },

    async inicioConta() {
      const r = ok(await sb.from('conta').select('inicio').eq('id', 1).maybeSingle());
      return r ? r.inicio : null;
    },
    async regras(data = hojeBR()) {
      return ok(await sb.from('regras').select('*').lte('valido_desde', data).order('valido_desde', { ascending: false }).limit(1).maybeSingle());
    },
    async banco() {
      return ok(await sb.from('banco').select('*').maybeSingle()) || { kcal: 0, reais: 0, min: 0, dias_aguardando_garmin: 0 };
    },
    async creditoDia(data) {
      return ok(await sb.from('credito_dia').select('*').eq('data', data).maybeSingle());
    },
    async creditos(de, ate) {
      return ok(await sb.from('credito_dia').select('*').gte('data', de).lte('data', ate).order('data'));
    },

    async garminDia(data) {
      return ok(await sb.from('garmin_dia').select('*').eq('data', data).maybeSingle());
    },
    async garminPeriodo(de, ate) {
      return ok(await sb.from('garmin_dia').select('*').gte('data', de).lte('data', ate).order('data'));
    },
    async garminAtividades(data) {
      return ok(await sb.from('garmin_atividade').select('*').eq('data', data).order('inicio'));
    },
    async ultimaSinc() {
      const r = ok(await sb.from('garmin_dia').select('data, sincronizado_em').order('sincronizado_em', { ascending: false }).limit(1));
      return r[0] || null;
    },

    async habitosDia(data) {
      return ok(await sb.from('habito_dia').select('*').eq('data', data).order('ordem'));
    },
    async marcarHabito(habitoId, data, status) {
      if (!status) {
        ok(await sb.from('habito_marca').delete().eq('habito_id', habitoId).eq('data', data));
      } else {
        ok(await sb.from('habito_marca').upsert({ habito_id: habitoId, data, status }, { onConflict: 'habito_id,data' }));
      }
    },

    async refeicoes(data) {
      return ok(await sb.from('refeicao').select('*').eq('data', data).order('criado_em'));
    },
    async gastos(data) {
      return ok(await sb.from('gasto').select('*').eq('data', data).order('criado_em'));
    },
    async tempos(data) {
      return ok(await sb.from('tempo_registro').select('*, atividade(id, nome, tipo, fator, limite_diario_min)').eq('data', data).order('criado_em'));
    },
    async trocas(data) {
      return ok(await sb.from('troca').select('*').eq('data', data).order('criado_em'));
    },

    async adicionar(tabela, linha) {
      if (!TABELAS.includes(tabela)) throw new Error('Tabela não permitida');
      return ok(await sb.from(tabela).insert(linha).select().single());
    },
    async excluir(tabela, id) {
      if (!TABELAS.includes(tabela)) throw new Error('Tabela não permitida');
      ok(await sb.from(tabela).delete().eq('id', id));
    },

    async atividades() {
      return ok(await sb.from('atividade').select('*').eq('ativo', true).order('ordem'));
    },
    async recompensas() {
      return ok(await sb.from('recompensa').select('*').eq('ativo', true).order('ordem'));
    },

    // Calculadora de refeição: a função estimar-refeicao chama o Claude Haiku com a chave guardada no Supabase
    async estimarRefeicao(texto) {
      const { data, error } = await sb.functions.invoke('estimar-refeicao', { body: { texto } });
      if (error) {
        let msg = 'Não deu para calcular agora.';
        try { const corpo = await error.context.json(); if (corpo && corpo.erro) msg = corpo.erro; } catch { /* corpo não é JSON */ }
        throw new Error(msg);
      }
      return data;
    },

    // ---- banco com reservas da semana (eventos ainda não realizados)
    async bancoDisponivel() {
      return ok(await sb.from('banco_disponivel').select('*').maybeSingle())
        || { kcal: 0, reais: 0, min: 0, dias_aguardando_garmin: 0, kcal_reservado: 0, reais_reservado: 0, kcal_livre: 0, reais_livre: 0 };
    },

    // ---- peso (a pesagem manual vale sobre a do Garmin)
    async pesoMedia(de, ate) {
      return ok(await sb.from('peso_media7').select('*').gte('data', de).lte('data', ate).order('data'));
    },
    async registrarPeso(data, kg) {
      ok(await sb.from('pesagem').upsert({ data, kg }, { onConflict: 'data' }));
    },

    // ---- metas de 3, 6 e 12 meses
    async metas() {
      return ok(await sb.from('meta_progresso').select('*').neq('status', 'abandonada').order('prazo'));
    },
    async salvarMeta(m) {
      if (m.id) return ok(await sb.from('meta').update(m).eq('id', m.id).select().single());
      return ok(await sb.from('meta').insert(m).select().single());
    },
    // ---- plano financeiro guiado (docs/plano-financeiro.md)
    async planos() {
      return ok(await sb.from('plano_financeiro').select('*').neq('status', 'arquivado').order('criado_em', { ascending: false }));
    },
    async plano(id) {
      return ok(await sb.from('plano_financeiro').select('*').eq('id', id).maybeSingle());
    },
    async salvarPlano(p) {
      if (p.id) return ok(await sb.from('plano_financeiro').update(p).eq('id', p.id).select().single());
      return ok(await sb.from('plano_financeiro').insert(p).select().single());
    },
    async aplicarPlano(id) {
      return ok(await sb.rpc('aplicar_plano', { p_plano: id }));
    },
    async planoIA(corpo) {
      const { data, error } = await sb.functions.invoke('plano-financeiro', { body: corpo });
      if (error) {
        let msg = 'A IA não respondeu agora.';
        try { const c = await error.context.json(); if (c && c.erro) msg = c.erro; } catch { /* corpo não é JSON */ }
        throw new Error(msg);
      }
      return data;
    },
    interpretarResposta(passo, texto, respostas) { return this.planoIA({ acao: 'interpretar', passo, texto, respostas }); },
    resumirPlano(respostas, simulacao) { return this.planoIA({ acao: 'resumir', respostas, simulacao }); },

    // metas financeiras: aporte (juntar) ou pagamento (quitar)
    async registrarAporte(metaId, valor, data = hojeBR()) {
      ok(await sb.from('aporte').insert({ meta_id: metaId, valor, data }));
    },
    async somarContagem(id, delta) {
      const atual = ok(await sb.from('meta').select('contagem_atual').eq('id', id).single());
      ok(await sb.from('meta').update({ contagem_atual: Math.max(0, Number(atual.contagem_atual) + delta) }).eq('id', id));
    },

    // ---- recompensas com nível, multiplicador da semana e cofrinho
    async recompensasStatus() {
      return ok(await sb.from('recompensa_status').select('*').eq('ativo', true).order('ordem'));
    },
    async salvarRecompensa(r) {
      if (r.id) return ok(await sb.from('recompensa').update(r).eq('id', r.id).select().single());
      return ok(await sb.from('recompensa').insert(r).select().single());
    },

    // ---- plano da semana (semana = segunda-feira, AAAA-MM-DD)
    async semanaRecompensas(semana) {
      return ok(await sb.from('semana_recompensa').select('recompensa_id').eq('semana', semana)).map((x) => x.recompensa_id);
    },
    async marcarRecompensaSemana(semana, recompensaId, quer) {
      if (quer) ok(await sb.from('semana_recompensa').upsert({ semana, recompensa_id: recompensaId }, { onConflict: 'semana,recompensa_id' }));
      else ok(await sb.from('semana_recompensa').delete().eq('semana', semana).eq('recompensa_id', recompensaId));
    },
    async semanaEventos(semana) {
      return ok(await sb.from('semana_evento').select('*').eq('semana', semana).order('data', { nullsFirst: false }));
    },
    async adicionarEvento(ev) {
      return ok(await sb.from('semana_evento').insert(ev).select().single());
    },
    async marcarEventoRealizado(id, realizado = true) {
      ok(await sb.from('semana_evento').update({ realizado }).eq('id', id));
    },
    async excluirEvento(id) {
      ok(await sb.from('semana_evento').delete().eq('id', id));
    },
    async compromissos(semana) {
      return ok(await sb.from('compromisso_progresso').select('*').eq('semana', semana).order('criado_em'));
    },
    async adicionarCompromisso(c) {
      return ok(await sb.from('semana_compromisso').insert(c).select().single());
    },
    async excluirCompromisso(id) {
      ok(await sb.from('semana_compromisso').delete().eq('id', id));
    },

    // ---- conselheiro: a função conselheiro gera sugestões com o Claude a partir das metas e do histórico
    async sugestoes(semana) {
      return ok(await sb.from('sugestao').select('*').eq('semana', semana).eq('status', 'nova').order('criado_em', { ascending: false }));
    },
    async gerarSugestoes(forcar = false) {
      const { data, error } = await sb.functions.invoke('conselheiro', { body: { forcar } });
      if (error) {
        let msg = 'O conselheiro não respondeu agora.';
        try { const corpo = await error.context.json(); if (corpo && corpo.erro) msg = corpo.erro; } catch { /* corpo não é JSON */ }
        throw new Error(msg);
      }
      return data;
    },
    async aplicarSugestao(s) {
      const a = s.acao || {};
      if (a.tipo === 'compromisso') {
        ok(await sb.from('semana_compromisso').insert({
          semana: s.semana, titulo: a.titulo || s.titulo, tipo: a.tipo_compromisso, alvo: a.alvo, parametros: a.parametros || {}, meta_id: s.meta_id,
        }));
      }
      ok(await sb.from('sugestao').update({ status: 'aplicada' }).eq('id', s.id));
    },
    async dispensarSugestao(id) {
      ok(await sb.from('sugestao').update({ status: 'dispensada' }).eq('id', id));
    },

    // A regra de saldo mora no servidor: se recusar, a mensagem do Postgres sobe como erro
    async trocar({ nome, kcal = 0, reais = 0, min = 0, recompensa = null }) {
      return ok(await sb.rpc('trocar', { p_nome: nome, p_kcal: kcal, p_reais: reais, p_min: min, p_recompensa: recompensa }));
    },
  };
}
