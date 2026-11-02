// Escolhe a implementação: Supabase quando config.js está preenchido; senão, modo demonstração (localStorage).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export let api = null;

export const configurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export async function carregarApi() {
  if (api) return api;
  if (configurado) {
    const m = await import('./api-supabase.js');
    api = await m.criar(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    const m = await import('./api-demo.js');
    api = m.criar();
  }
  return api;
}
