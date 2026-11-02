# Lastro — versão web (PWA)

App de hábitos por troca em três moedas (calorias, dinheiro, tempo). Sem etapa de build: HTML, CSS e módulos ES.

## Rodar no computador

```
cd "C:\Users\thiag\App Hábitos\web"
python -m http.server 8765
```

Abra http://localhost:8765. Precisa ser por servidor (módulos ES não carregam de `file://`).

## Modo demonstração

Com `config.js` vazio, o app roda sozinho no navegador, com 7 dias de exemplo e as mesmas regras do SQL
(crédito do dia, teto do mês ÷ dias, vício × fator, banco só com dias confirmados, troca recusada sem saldo).
Os dados ficam só naquele navegador.

Para ver os seus dados do Garmin sem Supabase: Ajustes › Garmin › **Importar daily.csv e activities.csv**
(arquivos da pasta `data`, gerados pelo `garmin_coleta.py`). Ajustes › Conta › Recomeçar volta ao exemplo.

## Ligar no Supabase

1. Rode `supabase/migrations/0001_lastro.sql` no projeto.
2. Crie seu usuário em Authentication › Users (e-mail e senha) e grave o id dele em `conta.dono`:
   `update conta set dono = '<id do usuário>' where id = 1;`
3. Preencha `config.js` com Project Settings › API:
   ```js
   export const SUPABASE_URL = 'https://<projeto>.supabase.co';
   export const SUPABASE_ANON_KEY = '<anon public key>';
   ```
   A anon key é pública por desenho; quem protege os dados é o RLS (só o dono lê e escreve).
4. O Garmin chega com `python garmin_coleta.py --enviar` (usa a service role do `.env`, nunca a do app).

## No iPhone

"Adicionar à Tela de Início" e o modo offline (service worker) exigem HTTPS. Pela rede local (`http://192.168…`)
o app abre, mas não instala. Para instalar, sirva a pasta `web` por HTTPS (Netlify, Vercel ou GitHub Pages).

Bloquear e liberar apps do iPhone não é possível na web: depende da API de Tempo de Uso, só em app nativo.
Aqui a troca fica registrada e o banco já cobra.

## Arquivos

- `index.html`, `styles.css`, `app.js` (rotas `#/inicio`, `#/dia`, `#/liberar`, `#/registrar`, `#/ajustes`)
- `api.js` escolhe `api-supabase.js` ou `api-demo.js` (mesma interface)
- `telas/` uma tela por arquivo; `ui.js` formatação, ícones, anéis e barras
- `manifest.webmanifest`, `service-worker.js`, `icons/`
