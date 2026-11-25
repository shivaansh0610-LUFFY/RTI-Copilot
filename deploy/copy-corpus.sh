#!/bin/sh
# Copies the corpus (the sources, their documents and every passage with its embedding) from
# your local database into the hosted one, so the hosted one never has to embed the passages
# again (about 27 minutes on a laptop). Cases and requests are not copied: they stay local.
#
#   DATABASE_URL         the local database (read from .env when not set)
#   DEPLOY_DATABASE_URL  the hosted database, with its schema already made by
#                        `alembic upgrade head` (the server does that when it starts)
#
# Both may be written the SQLAlchemy way (postgresql+psycopg://...). Needs Docker: the copy runs
# pg_dump and psql from the same PostgreSQL 16 image the database uses. Run from the repo root:
#   sh deploy/copy-corpus.sh
set -eu

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")
fi
: "${DATABASE_URL:?Set DATABASE_URL to the local database}"
: "${DEPLOY_DATABASE_URL:?Set DEPLOY_DATABASE_URL to the hosted database}"

# libpq wants postgresql://, and inside the container the local database is on the host.
SRC=$(printf '%s' "$DATABASE_URL" | sed -e 's#^postgresql+psycopg://#postgresql://#' \
  -e 's#@localhost:#@host.docker.internal:#' -e 's#@127\.0\.0\.1:#@host.docker.internal:#')
DST=$(printf '%s' "$DEPLOY_DATABASE_URL" | sed -e 's#^postgresql+psycopg://#postgresql://#')
export SRC DST

# The URLs go in as environment variables, so they never show in the process list.
docker run --rm -e SRC -e DST --add-host=host.docker.internal:host-gateway pgvector/pgvector:pg16 sh -ec '
  have=$(psql "$DST" -Atc "select count(*) from passages")
  if [ "$have" != "0" ]; then
    echo "The hosted database already has $have passages: nothing to copy."
    exit 0
  fi
  pg_dump "$SRC" --data-only --no-owner --no-privileges -t sources -t documents -t passages \
    | psql "$DST" -q -v ON_ERROR_STOP=1 --single-transaction > /dev/null
  echo "Copied $(psql "$DST" -Atc "select count(*) from passages") passages," \
    "$(psql "$DST" -Atc "select count(embedding) from passages") with embeddings," \
    "from $(psql "$DST" -Atc "select count(*) from sources") sources."
'
