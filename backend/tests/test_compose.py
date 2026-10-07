import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

COMPOSE_FILE = Path(__file__).resolve().parents[2] / "docker-compose.yml"


def test_postgres_password_has_no_fallback_in_compose_file() -> None:
    """Every ${POSTGRES_PASSWORD...} reference must be the required form (:?), never :- or -."""
    references = re.findall(r"\$\{POSTGRES_PASSWORD([^}]*)\}", COMPOSE_FILE.read_text())
    assert references, "docker-compose.yml no longer references POSTGRES_PASSWORD"
    assert all(ref.startswith(":?") for ref in references), references


@pytest.mark.skipif(shutil.which("docker") is None, reason="docker CLI not available")
class TestComposeConfig:
    @pytest.fixture
    def run_compose_config(self, tmp_path: Path):
        # Run from an empty directory so a developer's real .env cannot supply the password.
        (tmp_path / "docker-compose.yml").write_text(COMPOSE_FILE.read_text())

        def run(**env: str) -> subprocess.CompletedProcess[str]:
            inherited = {k: v for k, v in os.environ.items() if k != "POSTGRES_PASSWORD"}
            return subprocess.run(
                ["docker", "compose", "config"],
                cwd=tmp_path,
                env={**inherited, **env},
                capture_output=True,
                text=True,
            )

        return run

    @pytest.mark.parametrize("env", [{}, {"POSTGRES_PASSWORD": ""}], ids=["unset", "empty"])
    def test_fails_clearly_without_password(self, run_compose_config, env: dict[str, str]) -> None:
        result = run_compose_config(**env)
        assert result.returncode != 0
        assert "POSTGRES_PASSWORD" in result.stderr

    def test_database_url_matches_password(self, run_compose_config) -> None:
        password = "x" * 16
        result = run_compose_config(POSTGRES_PASSWORD=password)
        assert result.returncode == 0, result.stderr
        assert f"DATABASE_URL: postgresql+psycopg://rti:{password}@db:5432/rti_copilot" in result.stdout
