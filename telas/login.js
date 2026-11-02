// Login por e-mail e senha (Supabase Auth). Só aparece quando config.js está preenchido.

import { esc, ic } from '../ui.js';

export async function montar() {
  return `<div class="login">
<div class="marca"><img src="icons/icon.svg" alt=""><div><h1>Lastro</h1><span class="nota">Hábitos por troca: calorias, dinheiro e tempo.</span></div></div>
<form id="form-login" class="card" novalidate>
<label class="campo">E-mail<input name="email" type="email" autocomplete="username" required inputmode="email"></label>
<label class="campo">Senha<input name="senha" type="password" autocomplete="current-password" required></label>
<div id="erro-login" role="alert"></div>
<button type="submit" class="btn primario largo">Entrar</button>
</form>
</div>`;
}

export function ligar(raiz, { api, ir }) {
  const form = raiz.querySelector('#form-login');
  const erro = raiz.querySelector('#erro-login');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.innerHTML = '';
    const email = form.email.value.trim();
    const senha = form.senha.value;
    if (!email || !senha) {
      erro.innerHTML = `<div class="aviso">${ic.x(16)}<span>Preencha e-mail e senha.</span></div>`;
      return;
    }
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      await api.entrar(email, senha);
      ir('#/inicio');
    } catch (e) {
      erro.innerHTML = `<div class="aviso">${ic.x(16)}<span>${esc(e.message)}</span></div>`;
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
}
