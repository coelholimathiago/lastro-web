// Atualizar os dados do Garmin: primeiro confirma que o relógio já sincronizou com o Garmin Connect,
// depois pede à função sincronizar-garmin que dispare a coleta na nuvem e espera os dados novos chegarem.

import { ic, esc, quandoFoi } from '../ui.js';

const ESPERA_MAX_MS = 4 * 60 * 1000;
const INTERVALO_MS = 8000;

export function botaoSincronizar(rotulo = 'Atualizar dados do Garmin') {
  return `<button type="button" class="btn tracejado sinc-botao" data-sincronizar>${ic.troca(16)}${esc(rotulo)}</button>`;
}

export function ligarSincronizar(raiz, { api, recarregar, toast }) {
  if (typeof api.sincronizarGarmin !== 'function') return;
  raiz.querySelectorAll('[data-sincronizar]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.preventDefault();
    abrir({ api, recarregar, toast });
  }));
}

function abrir({ api, recarregar, toast }) {
  const d = document.createElement('dialog');
  d.className = 'sinc';
  d.setAttribute('aria-labelledby', 'sinc-tit');
  document.body.appendChild(d);
  const fechar = () => { d.close(); d.remove(); };
  d.addEventListener('cancel', fechar);

  const tela = (html) => { d.innerHTML = `<div class="sinc-corpo">${html}</div>`; };

  const perguntar = () => {
    tela(`<div class="sinc-icone">${ic.relogioPulso(28)}</div>
<h2 id="sinc-tit">Antes de atualizar</h2>
<p>O Lastro busca os dados no Garmin Connect. Você já abriu o app <b>Garmin Connect</b> no celular e esperou o relógio sincronizar?</p>
<div class="sinc-botoes">
<button type="button" class="btn primario largo" data-r="sim">Sim, já sincronizei</button>
<button type="button" class="btn largo" data-r="nao">Ainda não</button>
<button type="button" class="btn fantasma largo" data-r="cancelar">Cancelar</button>
</div>`);
    d.querySelector('[data-r="sim"]').onclick = buscar;
    d.querySelector('[data-r="nao"]').onclick = instruir;
    d.querySelector('[data-r="cancelar"]').onclick = fechar;
  };

  const instruir = () => {
    tela(`<div class="sinc-icone">${ic.celular ? ic.celular(28) : ic.relogioPulso(28)}</div>
<h2 id="sinc-tit">Sincronize o relógio primeiro</h2>
<ol class="sinc-passos">
<li>Abra o app <b>Garmin Connect</b> no celular, com o Bluetooth ligado.</li>
<li>Espere a barra de sincronização no topo terminar (uns 30 segundos).</li>
<li>Volte aqui e toque em "Pronto".</li>
</ol>
<div class="sinc-botoes">
<button type="button" class="btn primario largo" data-r="pronto">Pronto, sincronizei</button>
<button type="button" class="btn fantasma largo" data-r="cancelar">Cancelar</button>
</div>`);
    d.querySelector('[data-r="pronto"]').onclick = buscar;
    d.querySelector('[data-r="cancelar"]').onclick = fechar;
  };

  const buscar = async () => {
    tela(`<div class="sinc-icone girando">${ic.troca(28)}</div>
<h2 id="sinc-tit">Buscando seus dados</h2>
<p>A coleta roda na nuvem e leva cerca de 1 minuto. Pode deixar esta tela aberta.</p>
<p class="nota" id="sinc-estado">Pedindo a coleta…</p>`);
    const estado = () => d.querySelector('#sinc-estado');
    try {
      const antes = await api.ultimaSinc();
      const marco = antes ? Date.parse(antes.sincronizado_em) : 0;
      await api.sincronizarGarmin();
      const inicio = Date.now();
      estado().textContent = 'Coleta pedida. Esperando os dados chegarem…';
      while (Date.now() - inicio < ESPERA_MAX_MS) {
        await new Promise((r) => setTimeout(r, INTERVALO_MS));
        if (!d.isConnected) return;
        const agora = await api.ultimaSinc();
        if (agora && Date.parse(agora.sincronizado_em) > marco) {
          tela(`<div class="sinc-icone ok">${ic.check(28)}</div>
<h2 id="sinc-tit">Dados atualizados</h2>
<p>O Garmin sincronizou ${esc(quandoFoi(agora.sincronizado_em))}.</p>
<div class="sinc-botoes"><button type="button" class="btn primario largo" data-r="ok">Ver os números</button></div>`);
          d.querySelector('[data-r="ok"]').onclick = () => { fechar(); recarregar(); };
          return;
        }
        estado().textContent = `Ainda buscando… ${Math.round((Date.now() - inicio) / 1000)} s`;
      }
      falhou('A coleta está demorando mais que o normal. Os dados aparecem sozinhos quando ela terminar; tente recarregar em alguns minutos.');
    } catch (e) {
      falhou(e.message || String(e));
    }
  };

  const falhou = (msg) => {
    if (!d.isConnected) return;
    tela(`<div class="sinc-icone no">${ic.x(28)}</div>
<h2 id="sinc-tit">Não deu para atualizar agora</h2>
<p>${esc(msg)}</p>
<div class="sinc-botoes"><button type="button" class="btn largo" data-r="fechar">Fechar</button></div>`);
    d.querySelector('[data-r="fechar"]').onclick = fechar;
    if (toast) toast('Não deu para atualizar o Garmin', 'erro');
  };

  perguntar();
  d.showModal();
}
