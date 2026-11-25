# Deploying RTI Copilot for free

Four free services, each doing one part:

| Part | Service | Free plan used |
| --- | --- | --- |
| Website (the built React app) | Vercel | Hobby |
| API (FastAPI in Docker) | Render | Free web service: 512 MB, 0.1 CPU |
| Search queries for the citations | Cloudflare Workers AI | 10,000 "neurons" a day |
| Database (PostgreSQL with pgvector) | Neon | Free: the corpus takes about 50 MB |

Why Cloudflare: the citations need the embedding model BAAI/bge-large-en-v1.5, which takes about
1.3 GB of memory to load. Free servers give 512 MB. Cloudflare runs the same model for free, so
the API sends it each search query instead of loading the model (see
`app/services/embeddings.py`). The corpus in the database was embedded with the same model on a
laptop, and Cloudflare's vectors match it (checked before going live). Without the two Cloudflare
settings the API loads the model itself, as on a laptop.

Nothing goes live without passing the tests: Vercel builds the live site only from `main`, Render
deploys only after the CI checks pass on `main` (`autoDeployTrigger: checksPass` in
[`render.yaml`](../render.yaml)), and `main` only takes pull requests whose checks passed (step 6).

Keep every URL, key and token out of git: they go only into each service's settings, or into
your own `.env` (which git ignores).

## 1. The database (Neon)

1. Sign up at [neon.tech](https://neon.tech) and create a project (PostgreSQL 16 or newer) in
   **AWS US East (N. Virginia)**, next to the Render server.
2. Click Connect, turn connection pooling off, and copy the connection string. Add it to your
   `.env` as `DEPLOY_DATABASE_URL=`, starting `postgresql+psycopg://` instead of `postgresql://`.
3. From the repo root, with Docker running, your local database started and the backend's virtual
   environment in `backend/.venv`, make the tables and copy the corpus:

   ```sh
   export DEPLOY_DATABASE_URL='postgresql+psycopg://USER:PASSWORD@HOST/DBNAME?sslmode=require'
   (cd backend && DATABASE_URL="$DEPLOY_DATABASE_URL" .venv/bin/alembic upgrade head)
   sh deploy/copy-corpus.sh
   ```

   It ends with `Copied 4789 passages, 4789 with embeddings, from 8 sources.` Only the corpus is
   copied; your local cases stay on your computer. Running it again does nothing.

## 2. The search model (Cloudflare Workers AI)

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) (free, no card).
2. Copy your **Account ID**: it is on the account's home page (or Workers & Pages, right side).
3. Make an API token: your profile icon, My Profile, API Tokens, Create Token, use the
   **Workers AI** template, Continue to summary, Create Token. Copy it (shown once).
4. Keep both for step 3 (`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`).

## 3. The API (Render)

1. Sign up at [render.com](https://render.com) with GitHub (free, no card), and let Render see
   this repository.
2. New, **Blueprint**, pick this repository. Render reads `render.yaml` and shows one free web
   service, `rti-copilot-api`, in Virginia.
3. It asks for the four secrets:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon URL from step 1 (`postgresql+psycopg://...`) |
   | `LLM_API_KEY` | your Groq key |
   | `CLOUDFLARE_ACCOUNT_ID` | from step 2 |
   | `CLOUDFLARE_API_TOKEN` | from step 2 |

4. Apply. The first build takes a few minutes. When it is live, the address Render shows plus
   `/health` answers `{"status":"ok"}`. This project's API is
   `https://rti-copilot-api-mp4y.onrender.com` (Render added `-mp4y` to the service name).

If the server stops at start with "connection to server at 127.0.0.1", `DATABASE_URL` holds a
laptop database: set it to the Neon URL (Environment, then Save, rebuild, and deploy).

From then on, every push to `main` that passes CI redeploys the API by itself.

## 4. The website (Vercel)

1. Sign up at [vercel.com](https://vercel.com) with GitHub, then Add New, Project, and import
   this repository. Vercel finds two apps in it: choose **Import single project** on the
   **app (Vite)** row. The API runs on Render, so no `vercel.json` and no "Services". Build
   `npm run build`, output `dist`.
2. Name the project. This one is `rti-copilot-app01`, so the site is
   `https://rti-copilot-app01.vercel.app` (`rti-copilot.vercel.app` belongs to someone else).
3. Add the environment variable `VITE_API_URL` = the Render address from step 3 (no `/` at the
   end), for **Production**, before the first deploy. It is built into the site, so adding or
   changing it later needs a Redeploy (Deployments, ⋯, Redeploy). Without it the site runs on
   the built-in sample data.
4. Deploy. Every push to `main` rebuilds the site.

The API only answers the site address in `CORS_ORIGINS` in [`render.yaml`](../render.yaml), in
exactly this form: `["https://the-address.vercel.app"]`. If the site's address changes, change it
there, not only in Render's dashboard, which a later Blueprint sync can overwrite.

## 5. Check it works

On the live site:

1. Draft your RTI: describe a problem, go through the steps, and check the requests cite the
   manuals ("Why ask for this").
2. On the Draft step, press "Check like a PIO": a score out of 10 with notes.
3. Analyse the reply: upload `demo/sample-pio-reply.pdf` and get the findings and an appeal.

If the site shows sample answers, `VITE_API_URL` is missing (redeploy after setting it). If every
request fails, `CORS_ORIGINS` does not match the site's address exactly.

## 6. Keep `main` tested

In GitHub, Settings, Rules (or Branches), protect `main`: require a pull request, and require the
checks **Frontend (lint, types, tests, build)** and **Backend (pytest, with PostgreSQL +
pgvector)** to pass. Then nothing reaches `main`, and so nothing reaches the live site, without
passing the tests.

## Good to know

- **Sleep:** the free Render service sleeps after 15 minutes without visitors; the next visit
  wakes it, which takes about a minute. Neon also pauses when idle and wakes in about a second.
- **Scanned replies are slow:** the free server has a tenth of a CPU, and reading a scanned page
  (OCR) takes about a minute per page there, even at the lower resolution it uses (`OCR_DPI`
  200 in `render.yaml`; 300 elsewhere). Replies with real text (most PDFs from the online RTI
  portal) are read at once.
- **Limits:** Cloudflare's free 10,000 neurons a day cover thousands of drafts (each embeds six
  short queries). Groq's free tier allows 8,000 tokens a minute; when it is busy the PIO review
  falls back to its fixed checks.
- **Updates:** merge a pull request; CI runs; the website and the API redeploy on their own. New
  database migrations run when the API starts.
- **Going back:** Vercel can promote an earlier deployment; Render can roll back to an earlier
  deploy (Events).
- **Before a real launch:** there is no login (a case's link is its only key), and the AI
  endpoints have no rate limit, so strangers could use up the free Groq and Cloudflare quotas.
