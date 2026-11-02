// Casca do Lastro: tema, rotas por hash (#/inicio, #/dia, #/liberar, #/registrar, #/ajustes), barra no rodapé.

import { carregarApi, configurado } from './api.js';
import { ic, esc, toast } from './ui.js';

const TELAS = {
  inicio: () => import('./telas/inicio.js'),
  dia: () => import('./telas/dia.js'),
  liberar: () => import('./telas/liberar.js'),
  registrar: () => import('./telas/registrar.js'),
  ajustes: () => import('./telas/ajustes.js'),
  login: () => import('./telas/login.js'),
};

// ------------------------------------------------------------ tema

// chave nova: a antiga guardou "auto" sozinha no primeiro acesso e prendia o tema do sistema
const CHAVE_TEMA = 'lastro-tema-v2';
export function temaSalvo() {
  try { return localStorage.getItem(CHAVE_TEMA) || 'light'; } catch { return 'light'; }
}
export function aplicarTema(pref) {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.dataset.theme = pref;
  else delete root.dataset.theme;
  try { localStorage.setItem(CHAVE_TEMA, pref); } catch { /* sem armazenamento */ }
  const escuro = pref === 'dark' || (pref !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.getElementById('cor-tema');
  if (meta) meta.setAttribute('content', escuro ? '#121211' : '#FAFAF7');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => aplicarTema(temaSalvo()));

// ------------------------------------------------------------ rotas

export function rotaAtual() {
  const h = location.hash.replace(/^#\/?/, '');
  const [caminho, qs] = h.split('?');
  const partes = (caminho || '').split('/').filter(Boolean);
  return { nome: partes[0] || 'inicio', arg: partes[1] ? decodeURIComponent(partes[1]) : null, q: new URLSearchParams(qs || '') };
}
export function ir(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

const NAV = [
  { nome: 'inicio', rot: 'Início', icone: ic.casa },
  { nome: 'dia', rot: 'Dia', icone: ic.dia },
  { nome: 'liberar', rot: 'Liberar', icone: ic.aberto, centro: true },
  { nome: 'registrar', rot: 'Registrar', icone: ic.registrar },
  { nome: 'ajustes', rot: 'Ajustes', icone: ic.ajustes },
];

function desenharNav(ativa) {
  const nav = document.getElementById('nav');
  if (ativa === 'login') { nav.hidden = true; document.body.classList.add('sem-nav'); return; }
  nav.hidden = false;
  document.body.classList.remove('sem-nav');
  nav.innerHTML = NAV.map((n) => {
    const atual = n.nome === ativa ? ' aria-current="page"' : '';
    if (n.centro) return `<a href="#/${n.nome}" class="centro"${atual}><span class="bola">${n.icone(24)}</span>${n.rot}</a>`;
    return `<a href="#/${n.nome}"${atual}>${n.icone(22)}${n.rot}</a>`;
  }).join('');
}

function desenharFaixa(api) {
  const f = document.getElementById('faixa');
  if (api.modo === 'demo') {
    f.className = 'faixa-demo';
    f.innerHTML = `Modo demonstração · dados só neste aparelho · <a href="#/ajustes">ajustar</a>`;
    document.body.classList.remove('sem-faixa');
  } else {
    f.className = '';
    f.innerHTML = '';
    document.body.classList.add('sem-faixa');
  }
}

// ------------------------------------------------------------ render

let api = null;
let geracao = 0;
let ultimaTela = null;

async function render() {
  const minha = ++geracao;
  const main = document.getElementById('tela');
  let rota = rotaAtual();

  if (api.modo === 'supabase') {
    const sessao = await api.sessao();
    if (!sessao && rota.nome !== 'login') { location.replace('#/login'); return; }
    if (sessao && rota.nome === 'login') { location.replace('#/inicio'); return; }
  }
  if (!TELAS[rota.nome]) { location.replace('#/inicio'); return; }

  desenharNav(rota.nome);
  document.body.dataset.rota = rota.nome;
  if (ultimaTela !== rota.nome) {
    main.innerHTML = '<div class="carregando" aria-label="Carregando"><div></div><div></div><div></div></div>';
    window.scrollTo(0, 0);
  }
  try {
    const mod = await TELAS[rota.nome]();
    const ctx = { api, rota, ir, toast, recarregar: render, aplicarTema, temaSalvo, atual: () => minha === geracao };
    const html = await mod.montar(ctx);
    if (minha !== geracao) return;
    // contêiner novo a cada render: os ouvintes de eventos não se acumulam
    const raiz = document.createElement('div');
    raiz.innerHTML = html;
    main.replaceChildren(raiz);
    if (mod.ligar) mod.ligar(raiz, ctx);
    if (ultimaTela !== rota.nome) main.focus({ preventScroll: true });
    ultimaTela = rota.nome;
    const titulo = main.querySelector('h1');
    document.title = titulo ? `${titulo.textContent.trim()} · Lastro` : 'Lastro';
  } catch (e) {
    if (minha !== geracao) return;
    console.error(e);
    main.innerHTML = `<div class="tela"><div class="card no"><div class="card-cab"><h2>Não deu para carregar</h2></div>
<p class="nota" style="margin:0">${esc(e.message || String(e))}</p>
<button class="btn primario" type="button" id="tentar">Tentar de novo</button></div></div>`;
    main.querySelector('#tentar').addEventListener('click', render);
    ultimaTela = null;
  }
}

async function iniciar() {
  aplicarTema(temaSalvo());
  try {
    api = await carregarApi();
  } catch (e) {
    document.getElementById('tela').innerHTML = `<div class="card no"><h2>Sem conexão com o Supabase</h2><p class="nota">${esc(e.message)}</p></div>`;
    return;
  }
  desenharFaixa(api);
  window.addEventListener('hashchange', render);
  // volta do segundo plano: recarrega a tela (o dia pode ter virado, o Garmin pode ter sincronizado)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });
  render();

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('service-worker.js').catch((e) => console.warn('service worker', e));
  }
}

export const modoConfigurado = configurado;
iniciar();
