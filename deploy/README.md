# Deploying RTI Copilot for free

Three free services, one for each part of the app:

| Part | Service | Why this one |
| --- | --- | --- |
| Website (the built React app) | Vercel | Hosts the static files from `npm run build` and rebuilds on every push to `main`. |
| API (FastAPI in Docker) | Hugging Face Spaces, free "CPU basic" | 16 GB of memory: enough for the 1.3 GB embedding model that finds the manual passages each request cites. Most free hosts give 512 MB. |
| Database (PostgreSQL with pgvector) | Neon, free plan | Has pgvector. The corpus takes about 50 MB of the free 0.5 GB. |

Nothing goes live without passing the tests: the live website is built only from `main`, `main`
only takes pull requests whose CI passed (step 5), and the API is deployed by
[`deploy-backend.yml`](../.github/workflows/deploy-backend.yml) only after CI has passed on `main`.

Do the steps in order. Keep every URL, key and token out of git: they go only into each
service's settings.

## 1. The database (Neon)

1. Sign up at [neon.tech](https://neon.tech) and create a project named `rti-copilot`
   (PostgreSQL 16 or newer). Pick a US East region: Hugging Face's free servers run in the US,
   and the API talks to the database several times for each request.
2. Copy its connection string (Connect). Write it the SQLAlchemy way, with `+psycopg` and
   `sslmode=require`:
   `postgresql+psycopg://USER:PASSWORD@HOST/neondb?sslmode=require`
3. On your computer, from the repo root, with Docker running, your local database started and
   the backend's virtual environment in `backend/.venv` (see Running locally in the main
   README), make the tables and copy the corpus into it:

   ```sh
   export DEPLOY_DATABASE_URL='postgresql+psycopg://USER:PASSWORD@HOST/neondb?sslmode=require'
   (cd backend && DATABASE_URL="$DEPLOY_DATABASE_URL" .venv/bin/alembic upgrade head)
   sh deploy/copy-corpus.sh
   ```

   It should end with `Copied 4789 passages, 4789 with embeddings, from 8 sources.` It copies
   only the corpus; your local cases stay on your computer. Running it again does nothing.

## 2. The API (Hugging Face Spaces)

1. Sign up at [huggingface.co](https://huggingface.co). Create a Space named `rti-copilot-api`:
   SDK **Docker** (blank), hardware **CPU basic (free)**, visibility **Public** (the website has
   to reach it, and the code is already public on GitHub).
2. In the Space's Settings, under Variables and secrets, add:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Secret | `DATABASE_URL` | the Neon URL from step 1 |
   | Secret | `LLM_API_KEY` | your Groq key |
   | Variable | `LLM_MODEL` | `openai/gpt-oss-120b` |
   | Variable | `USE_LLM_DRAFTING` | `true` |
   | Variable | `USE_CORPUS_CITATIONS` | `true` |
   | Variable | `USE_PUBLIC_INFO_LOOKUP` | `false` |
   | Variable | `CORS_ORIGINS` | `["https://rti-copilot.vercel.app"]`: the website's address from step 3, in this exact form |

3. Make a Hugging Face access token that can write to this Space (your profile, Access Tokens).
4. In this GitHub repository, Settings, Secrets and variables, Actions, add:
   - the secret `HF_TOKEN`: that token
   - the variable `HF_SPACE`: `your-hf-username/rti-copilot-api`
5. On the Actions tab, open **Deploy backend** and press **Run workflow** (branch `main`).
   The Space then builds the image (about 10 minutes the first time: PyTorch and the model)
   and starts. When it is up, `https://your-hf-username-rti-copilot-api.hf.space/health`
   answers `{"status":"ok"}`.

From then on, every push to `main` that passes CI deploys the API by itself.

## 3. The website (Vercel)

1. Sign up at [vercel.com](https://vercel.com) with GitHub, then Add New, Project, and import
   this repository. Vercel recognises Vite: build `npm run build`, output `dist`.
2. Name the project `rti-copilot`, so the site is `https://rti-copilot.vercel.app` (if that
   name is taken, use the address Vercel gives you, and put it in `CORS_ORIGINS` in step 2).
3. Add the environment variable `VITE_API_URL` = `https://your-hf-username-rti-copilot-api.hf.space`
   for **Production** only. Preview builds (one per pull request) then run on the built-in
   sample data instead of failing against the live API.
4. Deploy. Every push to `main` rebuilds the site.

## 4. Check it works

On the live site:

1. Draft your RTI: describe a problem, go through the steps, and check the draft cites
   manual passages ("Why ask for this").
2. On the Draft step, press "Check like a PIO": it gives a score out of 10 with notes.
3. Analyse the reply: upload `demo/sample-pio-reply.pdf` and get the findings and an appeal.

If the site shows sample answers, `VITE_API_URL` is missing (rebuild after setting it). If
every request fails, `CORS_ORIGINS` does not match the site's address exactly.

## 5. Keep `main` tested

In GitHub, Settings, Rules (or Branches), protect `main`: require a pull request, and require
the checks **Frontend (lint, types, tests, build)** and **Backend (pytest, with PostgreSQL +
pgvector)** to pass. Then nothing reaches `main`, and so nothing reaches the live site, without
passing the tests.

## Good to know

- **Sleep:** a free Space sleeps after 48 hours without visitors. The next visit wakes it,
  which takes a minute or two. Neon pauses after a few idle minutes and wakes in about a second.
- **Updates:** merge a pull request; CI runs; the website and the API redeploy on their own.
  New database migrations run when the API starts.
- **Going back:** Vercel can promote an earlier deployment (Deployments). For the API, revert
  the change on GitHub, or run Deploy backend from an earlier commit.
- **Before a real launch:** there is no login (a case's link is its only key), and the AI
  endpoints have no rate limit, so strangers could use up the Groq free quota (8,000 tokens a
  minute).
