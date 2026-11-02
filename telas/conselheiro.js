// Conselheiro: cartões de sugestão (Aplicar / Agora não) usados no Início, na Semana e nas Metas.
// As sugestões vêm da tabela sugestao, preenchida pela função conselheiro (Claude) a partir das metas e do histórico.

import { esc, ic, toast } from '../ui.js';

export function cartoesConselheiro(sugestoes, { max = 2, vazio = true } = {}) {
  const lista = (sugestoes || []).slice(0, max);
  const cartoes = lista.map((s) => `<div class="conselho" data-sugestao="${esc(s.id)}">
<div class="conselho-cab">${ic.brilho(16)}<span>Conselheiro</span></div>
<p class="conselho-tit">${esc(s.titulo)}</p>
<p class="conselho-txt">${esc(s.texto)}</p>
<div class="conselho-botoes">
${s.acao && s.acao.tipo === 'compromisso' ? '<button type="button" class="btn conselho-aplicar" data-acao="aplicar">Aplicar</button>' : '<button type="button" class="btn conselho-aplicar" data-acao="aplicar">Entendi</button>'}
<button type="button" class="btn fantasma" data-acao="dispensar">Agora não</button>
</div></div>`).join('');
  if (cartoes) return cartoes;
  if (!vazio) return '';
  return `<div class="conselho vazio-c"><div class="conselho-cab">${ic.brilho(16)}<span>Conselheiro</span></div>
<p class="conselho-txt">Sem sugestões novas. Peça uma leitura das suas metas e do seu histórico.</p>
<div class="conselho-botoes"><button type="button" class="btn conselho-aplicar" data-acao="gerar">Pedir sugestões</button></div></div>`;
}

// Liga os botões dos cartões dentro de `raiz`. `sugestoes` é a mesma lista que gerou o HTML.
export function ligarConselheiro(raiz, { api, recarregar }, sugestoes) {
  raiz.querySelectorAll('.conselho [data-acao]').forEach((b) => b.addEventListener('click', async () => {
    const cartao = b.closest('.conselho');
    const s = (sugestoes || []).find((x) => x.id === cartao.dataset.sugestao);
    b.disabled = true;
    try {
      if (b.dataset.acao === 'gerar') {
        b.textContent = 'Lendo seus dados…';
        await api.gerarSugestoes(true);
      } else if (b.dataset.acao === 'aplicar' && s) {
        await api.aplicarSugestao(s);
        toast(s.acao && s.acao.tipo === 'compromisso' ? 'Virou compromisso da semana' : 'Anotado');
      } else if (b.dataset.acao === 'dispensar' && s) {
        await api.dispensarSugestao(s.id);
      }
      recarregar();
    } catch (e) {
      toast(e.message || String(e), 'erro');
      b.disabled = false;
    }
  }));
}
