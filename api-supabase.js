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

    // A regra de saldo mora no servidor: se recusar, a mensagem do Postgres sobe como erro
    async trocar({ nome, kcal = 0, reais = 0, min = 0, recompensa = null }) {
      return ok(await sb.rpc('trocar', { p_nome: nome, p_kcal: kcal, p_reais: reais, p_min: min, p_recompensa: recompensa }));
    },
  };
}
