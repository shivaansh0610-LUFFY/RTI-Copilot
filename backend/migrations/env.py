from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

import app.models  # noqa: F401  (registers the tables on Base.metadata)
from app.config import get_settings
from app.db import Base

config = context.config

if config.config_file_name is not None:
    # Keep existing loggers: this file also runs in-process from the tests.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata

# `alembic upgrade head --sql` never connects, but still needs to know the SQL dialect.
# This placeholder carries no host or credentials.
OFFLINE_FALLBACK_URL = "postgresql+psycopg://"


def get_url(offline: bool) -> str:
    # Not config.set_main_option: configparser would choke on a "%" in the password.
    url = get_settings().database_url
    if url:
        return url
    if offline:
        return OFFLINE_FALLBACK_URL
    raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a database connection."""
    context.configure(
        url=get_url(offline=True),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(get_url(offline=False), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
