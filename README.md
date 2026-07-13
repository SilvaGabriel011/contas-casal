# 💞 Contas do Casal

App mobile (PWA) para o casal cuidar das finanças na Austrália **e** no Brasil, num lugar só.

- 🇦🇺 **AUD** e 🇧🇷 **BRL** como carteiras totalmente separadas
- 👤👤❤️ **3 perfis**: cada um de vocês + a visão "Casal" com o resumo combinado
- 🧾 Contas, 🔁 assinaturas e 💳 **compras parceladas no cartão do Brasil** (com progresso "parcela 3/12")
- 💰 Renda **semanal / quinzenal / mensal** (do jeito que se recebe na Austrália), com "quanto vence até o próximo pagamento" e sobra estimada do mês
- ☁️ **Sincronização em tempo real** entre os dois celulares via Supabase (grátis)
- 🧪 **Modo demo** para testar sem criar nada
- 🌗 Tema claro/escuro · 🌐 Português/English · 📱 feito para Safari do iPhone (instala na tela de início)

## Como usar no iPhone

1. Abra o link do app no Safari.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Pronto — abre como um app normal, em tela cheia.

## <a name="supabase"></a>☁️ Configurar a nuvem (Supabase) — ~5 minutos, grátis

A nuvem é o que faz o celular de um atualizar na hora no celular do outro.

1. Crie uma conta grátis em [supabase.com](https://supabase.com) e clique em **New project** (o plano Free basta).
2. Com o projeto criado, abra **SQL Editor** no menu lateral, cole o conteúdo inteiro do arquivo [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Vá em **Project Settings → API** e copie dois valores:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **anon public key**
4. Abra o app, toque em **Entrar com a nuvem** e cole os dois valores.
5. Crie a conta do casal (um e-mail + senha que os dois vão usar) e entre com **a mesma conta nos dois celulares**.

> Dica: em **Authentication → Sign In / Up → Email**, você pode desativar **Confirm email** para não precisar confirmar o e-mail no primeiro acesso.

### Opcional: deixar as chaves embutidas no app

Para pular a tela de colar URL/chave, defina as variáveis no ambiente de build:

- **GitHub Pages**: em *Settings → Secrets and variables → Actions → Variables*, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e rode o deploy de novo.
- **Vercel**: em *Project Settings → Environment Variables*, crie as mesmas duas variáveis.

A anon key é pública por design — a segurança vem das políticas de RLS criadas pelo `schema.sql`.

## 🚀 Publicação

### GitHub Pages (já configurado)

O workflow em `.github/workflows/deploy.yml` publica automaticamente a cada push.
Só é preciso ativar uma vez: **Settings → Pages → Source: GitHub Actions**.

O app fica em `https://silvagabriel011.github.io/contas-casal/`.

### Vercel (alternativa)

Importe o repositório em [vercel.com/new](https://vercel.com/new) — é um projeto Vite padrão, nenhuma configuração extra é necessária.

## 🛠️ Desenvolvimento

```bash
npm install
npm run dev      # servidor local
npm run build    # build de produção (tsc + vite)
npm run icons    # regenera os ícones PNG (usa Chromium via Playwright)
```

Stack: React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Supabase (auth, Postgres, realtime).

Estrutura:

```
src/
  lib/        datas, recorrência, dinheiro, i18n, tema
  data/       adaptadores (demo local / Supabase) + estado global
  components/ UI compartilhada (tab bar, sheets, cards…)
  screens/    Início, Contas, Renda, Ajustes, Boas-vindas
supabase/     schema.sql (tabelas, RLS, realtime)
```
