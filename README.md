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
5. Na aba **✨ Primeira vez**, crie a conta do casal: um e-mail + um **PIN de 4 dígitos**. Nos dois celulares é o mesmo e-mail e o mesmo PIN.

> Como funciona: o PIN nunca vai ao servidor — o app o expande numa senha forte e determinística (PBKDF2) que é o que o Supabase recebe. Por isso o mesmo e-mail + PIN funciona em qualquer aparelho.

> Dicas no painel do Supabase: em **Authentication → Sign In / Up → Email**, desative **Confirm email** para não precisar confirmar o e-mail no primeiro acesso — e depois de criar a conta de vocês, desative **Allow new users to sign up**.

### Recomendado: deixar as chaves embutidas no app

Para pular a tela de colar URL/chave, defina as variáveis de ambiente no Vercel
(*Project Settings → Environment Variables*, ver seção Publicação abaixo):

| Nome | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | a Project URL do Supabase (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | a chave `anon public` do Supabase |

A anon key é pública por design — a segurança vem das políticas de RLS criadas pelo `schema.sql`.

## 🤖 Assistente de IA (opcional)

O botão ✨ na tela inicial abre um assistente que conhece as contas de vocês: relatórios do mês,
comparações, preparação de números pro tax return (ano fiscal australiano, jul–jun) e análise de
extratos CSV do banco (anexe o export do CommBank direto no chat).

Para ativar, adicione no Vercel (*Project Settings → Environment Variables*):

| Nome | Valor |
| --- | --- |
| `OPENAI_API_KEY` | sua chave em [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | opcional — padrão `gpt-4o-mini` |

Como funciona a segurança: a chave **nunca vai ao navegador** (sem prefixo `VITE_`) — quem chama a
OpenAI é a função serverless em `api/ai.ts`, que antes **valida o token de login do Supabase**.
Sem estar logado na conta do casal, o endpoint recusa a chamada, então ninguém consome seus créditos.
Os dados enviados ao modelo são um resumo do snapshot local (itens, rendas e pagamentos recentes).

## 🔔 Notificações push (opcional)

Aviso no celular na noite anterior a cada vencimento ("pagar conta X amanhã"). Um cron da Vercel
(`api/notify.ts`, todo dia 08:00 UTC ≈ 18h de Sydney) lê as inscrições e envia via Web Push.

1. Gere as chaves VAPID (uma vez): `npx web-push generate-vapid-keys`
2. No Vercel → Environment Variables, adicione:

| Nome | Valor |
| --- | --- |
| `VAPID_PUBLIC_KEY` | a Public Key gerada |
| `VAPID_PRIVATE_KEY` | a Private Key gerada |
| `VAPID_SUBJECT` | `mailto:seu-email@exemplo.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` (⚠️ secreta — só na Vercel) |
| `CRON_SECRET` | qualquer string longa aleatória (protege o endpoint do cron) |
| `RESEND_API_KEY` | opcional — chave em [resend.com](https://resend.com) pra receber o aviso também **por e-mail** |
| `RESEND_FROM` | opcional — remetente, ex: `Contas do Casal <contas@seudominio.com>` |

**E-mail pros dois**: com a `RESEND_API_KEY` configurada, cadastre os dois e-mails em
**Ajustes → Notificações → E-mails de aviso** e o resumo "vence amanhã" chega pra vocês dois.
No plano grátis do Resend, o remetente padrão (`onboarding@resend.dev`) só entrega pro e-mail
da própria conta Resend — pra enviar pros dois, verifique um domínio seu em Resend → Domains
e use ele no `RESEND_FROM`.

3. Rode o `supabase/schema.sql` de novo no SQL Editor (cria a tabela `push_subscriptions` e o
   bucket de recibos — o script é idempotente, pode rodar quantas vezes quiser).
4. Faça redeploy, abra o app **instalado na tela de início** (iOS 16.4+) e ative em
   **Ajustes → Notificações no celular** em cada aparelho.

## 💾 Backups automáticos

Toda madrugada (~1h de Sydney) o cron `api/backup.ts` salva um snapshot completo por conta na
tabela `backups` (últimos 30 dias). Restaurar: **Ajustes → Backups automáticos → toque na data**.
Aos domingos, se `RESEND_API_KEY` estiver configurada e houver e-mails em Ajustes → Notificações,
o JSON completo também chega **em anexo por e-mail** (cópia fora do Supabase). Usa as mesmas
variáveis do push (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) — só rode o `schema.sql` de novo
pra criar a tabela.

## 📅 Calendário (Apple e Google)

Em **Ajustes → Calendário → Ativar calendário sincronizado**, o app cria um link secreto de feed
(`/api/calendar?t=…`) e mostra botões de um toque:

- **iPhone**: "Adicionar no Calendário do iPhone" abre a assinatura nativa (webcal). Os lembretes
  "💸 Pagar X amanhã — valor" aparecem no dia anterior a cada vencimento, com alerta às 9h, e se
  **atualizam sozinhos** quando as contas mudam no app.
- **Google Calendar**: "Adicionar no Google Calendar" abre o Google já com o feed preenchido
  (o Google atualiza feeds externos a cada ~12h).

O link é uma *capability URL*: só quem tem o token vê os lembretes (nunca os valores completos da
conta — só nome/valor/vencimento dos eventos), e dá pra revogar a qualquer momento em Ajustes.
Também existe o export manual `.ics` (por conta ou tudo de uma vez) que funciona até no modo local.

## 🚀 Publicação (Vercel)

1. Entre em [vercel.com](https://vercel.com) com a conta do GitHub e clique em **Add New → Project**.
2. Importe o repositório `contas-casal`. O Vercel detecta Vite sozinho — não mude build command nem output.
3. Antes do primeiro deploy, abra **Environment Variables** e adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (valores acima). Marque os três ambientes (Production/Preview/Development).
4. **Deploy**. O app fica em `https://<nome-do-projeto>.vercel.app` — e todo push na branch de produção redeploya sozinho.

O arquivo `vercel.json` já configura os headers de segurança (CSP `frame-ancestors`, nosniff, referrer/permissions policy) e o cache correto do service worker e dos assets.

> O workflow `.github/workflows/ci.yml` roda os testes a cada push. O GitHub Pages foi descontinuado em favor do Vercel.

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
