// Guarda a casca do app para abrir sem rede. Nunca cacheia chamadas do Supabase.

const VERSAO = 'lastro-v9';
const CASCA = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './css/inicio.css', './css/semana.css', './css/metas.css', './css/recompensas.css', './css/plano.css',
  './app.js', './api.js', './api-demo.js', './api-supabase.js', './config.js', './ui.js',
  './telas/comum.js', './telas/inicio.js', './telas/dia.js', './telas/liberar.js', './telas/registrar.js',
  './telas/ajustes.js', './telas/login.js', './telas/semana.js', './telas/metas.js', './telas/recompensa.js',
  './telas/conselheiro.js', './telas/plano.js', './plano/simulacao.js', './telas/previsao.js', './telas/sincronizar.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
// bibliotecas e fontes de endereço fixo (versão no caminho): cache primeiro
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase (dados e login) e qualquer outro host: direto na rede, sem cache
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  if (CDN.includes(url.hostname)) {
    ev.respondWith(
      caches.match(req).then((achou) => achou || fetch(req).then((resp) => {
        if (resp.ok || resp.type === 'opaque') {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia));
        }
        return resp;
      })),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // casca: rede primeiro (pega a versão nova), cache quando estiver sem rede
  ev.respondWith(
    fetch(req).then((resp) => {
      if (resp.ok) {
        const copia = resp.clone();
        caches.open(VERSAO).then((c) => c.put(req, copia));
      }
      return resp;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
