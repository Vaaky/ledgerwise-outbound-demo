# Deploy to Vercel

The app is a Next.js 15 project. Vercel runs the build and the serverless functions; Neon stores the data.

The important constraint: **Vercel functions cannot reach your laptop's `localhost`.** A local Qwen endpoint at `http://localhost:8000/v1` will time out on Vercel and fall back to the deterministic templates. You need one of the LLM options below.

---

## 1. Pick the LLM path first

| Option | What to set | When to use it |
|---|---|---|
| **Groq (recommended free path)** | `GROQ_API_KEY`, optionally `GROQ_MODEL` | Fast, hosted, no tunnel. Best for the 2-week public demo. |
| **Hosted Qwen (OpenAI-compatible)** | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, optionally `LLM_NO_THINK=1` | If the demo must say “Qwen” but run in the cloud. Use a provider that serves Qwen. |
| **Local Qwen through a tunnel** | `LLM_BASE_URL=https://<tunnel>/v1`, `LLM_MODEL`, `LLM_NO_THINK=1` | Only for a live interview. Your PC and tunnel must stay online; quick-tunnel URLs change. |
| **Deterministic mock** | `FORCE_MOCK=1` | Failsafe if no key or quota. No live model. |

Pick **one** of Groq or the `LLM_*` trio. Do not set `LLM_BASE_URL` to localhost on Vercel.

The app default is **`openai/gpt-oss-20b`** — fast and cheap. For better writing quality use **`openai/gpt-oss-120b`**. Groq's current model IDs are listed at [console.groq.com/docs/models](https://console.groq.com/docs/models). Do not use `llama-3.3-70b-versatile`; it is now an Enterprise-only model and will fail on a standard key.

---

## 2. Create Neon Postgres

1. Create a free project at [neon.tech](https://neon.tech).
2. Open **Connect** and copy the **pooled** connection string.
3. It looks like:

```text
postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

Set that as `DATABASE_URL` in Vercel.

Why Neon: the app imports `drizzle-orm/neon-http` and `@neondatabase/serverless`. A generic Postgres URL (for example Supabase) will not work without changing the adapter.

No migration command is needed. On the first request, `ensureDb()` creates the tables and seeds the 30-company demo corpus. The first request can take 5–15 seconds; if it times out, reload once.

To reset the demo later, point `DATABASE_URL` at a fresh Neon database or branch. Deleting only the companies is not enough because the `settings` table records that seeding already ran.

---

## 3. Get the free keys

- **Groq:** [console.groq.com](https://console.groq.com) → API key.
- **Tavily:** [tavily.com](https://tavily.com) → free key (1,000 credits/month). Strongly recommended: Vercel's shared IPs are much more likely to get DuckDuckGo/Bing rate limits than your home IP.
- **Resend (optional):** only if you want real email. Free tier only delivers to your own verified address, so set `DEMO_INBOX` to that address.

---

## 4. Push to a public GitHub repo

From `U:\unscale`:

```powershell
git init
git add .
git status
```

Before committing, confirm these are **not** staged:

- `.env.local`
- `.pglite/`
- `.next/`
- `node_modules/`
- `*.log`
- `tsconfig.tsbuildinfo`

The existing `.gitignore` covers those.

`export_ai/` is the full session export (about 4 MB). Decide intentionally whether it belongs in the public repo. It contains the whole conversation and may contain environment details or secrets. If not, keep it out:

```powershell
Add-Content .gitignore "`nexport_ai/"
```

Then:

```powershell
git commit -m "Ledgerwise outbound agent demo"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Or create the repo with GitHub CLI:

```powershell
gh repo create ledgerwise-outbound-demo --public --source=. --remote=origin --push
```

Make sure the repo is public for the submission.

---

## 5. Deploy with the Vercel dashboard

1. Vercel → **Add New → Project** → import the GitHub repo.
2. Framework preset: **Next.js** (detected automatically).
3. Build command: `npm run build`. Install command: `npm install`.
4. Add environment variables for **Production**:

| Variable | Required | Example / notes |
|---|---|---|
| `DATABASE_URL` | Yes for persistence | Neon pooled URL |
| `GROQ_API_KEY` | Groq path | `gsk_...` |
| `GROQ_MODEL` | Optional | current Groq model ID |
| `LLM_BASE_URL` | Hosted Qwen path | `https://provider.example/v1` |
| `LLM_API_KEY` | Hosted Qwen path | provider key |
| `LLM_MODEL` | Hosted Qwen path | model ID |
| `LLM_NO_THINK` | Qwen3 only | `1` |
| `LLM_TIMEOUT_MS` | Recommended | `25000` on Vercel |
| `TAVILY_API_KEY` | Strongly recommended | `tvly-...` |
| `RESEND_API_KEY` | Optional | real email only |
| `RESEND_FROM` | Optional | `Ledgerwise Demo <onboarding@resend.dev>` |
| `DEMO_INBOX` | Optional | your verified email |
| `FORCE_MOCK` | Optional | leave empty; `1` forces mock |

5. Deploy.
6. Vercel → Project → Settings → **Deployment Protection**: make sure the production URL is public. If Vercel Authentication is on, graders will hit a Vercel login instead of the demo.

Environment variable changes do not apply to an existing deployment. Redeploy after editing them.

---

## 6. Deploy with the Vercel CLI (alternative)

```powershell
npm i -g vercel
vercel login
cd U:\unscale
vercel
```

Add variables one at a time:

```powershell
vercel env add DATABASE_URL production
vercel env add GROQ_API_KEY production
vercel env add TAVILY_API_KEY production
vercel env add LLM_TIMEOUT_MS production
```

Then:

```powershell
vercel --prod
```

---

## 7. Smoke-test the deployment

1. Open `https://<project>.vercel.app/login`.
2. Sign in as **Maya · Sales**.
3. `/companies` → 30 synthetic companies.
4. `/review` → approve one draft (send is simulated unless Resend is configured).
5. `/inbox` → simulate “Are you a bot?” and an opt-out.
6. `/stats` → funnel loads.
7. Sign in as **Sam · Admin** → `/admin` → prompt test and publish.
8. Search: use the default ICP brief. With Tavily this normally finishes in 10–30 seconds. The route allows up to 60 seconds.
9. Vercel → Project → Logs / Functions: confirm there are no `LLM 401/429` or timeout errors. A failed model call falls back to templates, so the UI can still work while the run trace shows the error.

Warm the deployment once before the interview so Neon and the function are not cold.

---

## 8. Local Qwen on Vercel (optional, not recommended)

A quick Cloudflare tunnel:

```powershell
# with your Qwen server already running on localhost:8000
cloudflared tunnel --url http://localhost:8000
```

Set on Vercel:

```text
LLM_BASE_URL=https://<random>.trycloudflare.com/v1
LLM_MODEL=<the model your server reports>
LLM_NO_THINK=1
LLM_TIMEOUT_MS=45000
```

Problems:

- The quick-tunnel URL changes when it restarts.
- Your PC and the tunnel must stay online for the whole grading window.
- Vercel's 60-second function limit still applies.
- A 1.7B model is weak for the writing/reply quality; 7B+ is better.

For a stable setup, use a named Cloudflare tunnel with your own domain. For the public 2-week link, Groq or hosted Qwen is the safer choice.

---

## 9. Common failures

| Symptom | Cause | Fix |
|---|---|---|
| State resets after a while | `DATABASE_URL` missing; Vercel used in-memory PGlite | Set the Neon pooled URL |
| `FUNCTION_INVOCATION_TIMEOUT` | LLM or crawl exceeded 60s | Lower `LLM_TIMEOUT_MS`; use Groq/Tavily; retry |
| `model_not_found` | Stale Groq model ID | Set `GROQ_MODEL` to a current ID |
| `401` / `429` | Bad key or rate limit | Check key; use fallback or another provider |
| Header says “Live model” but drafts are templates | Configured endpoint unreachable | Check the run trace and function logs |
| Search returns little or nothing | DuckDuckGo/Bing rate-limited from Vercel | Add `TAVILY_API_KEY` |
| Build fails around PGlite | No `DATABASE_URL` at build/runtime | Set Neon; PGlite is externalized for local use |
| Vercel login wall | Deployment Protection | Disable it for the production URL |
| Login loop | Cookies blocked | Use the `https://` production URL, not an embedded preview |

---

## 10. Submission checklist

- [ ] Public GitHub repo contains the code, not `.env.local` or secrets.
- [ ] Vercel production URL is public.
- [ ] Neon `DATABASE_URL` set; first request seeded.
- [ ] `GROQ_API_KEY` or hosted Qwen configured; one live draft/reply tested.
- [ ] `TAVILY_API_KEY` set for reliable live search.
- [ ] Login seats and all six sales pages tested on the deployed URL.
- [ ] Admin prompt test/publish tested as Sam.
- [ ] `HOW_I_WORKED.md` live URL and repo URL filled.
- [ ] Full OpenCode session exported unedited.
- [ ] Vercel and Neon projects left active for the two-week window.
