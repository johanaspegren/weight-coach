from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


# config.py lives at api/src/weight_coach/config.py
# parents: [0] weight_coach, [1] src, [2] api, [3] repo root
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    wc_db_path: str = "./data/weight.db"
    wc_api_host: str = "127.0.0.1"
    wc_api_port: int = 8765
    wc_web_dist: str = "./web/dist"

    oura_token: str = ""

    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:you@example.com"

    checkin_hour: int = 23
    checkin_minute: int = 0

    program_start: str = "2026-07-27"
    maintenance_kcal: int = 2500
    bmr_kcal: int = 1700

    garmin_email: str = ""
    garmin_password: str = ""
    garmin_tokenstore: str = "~/.garminconnect"

    tuya_endpoint: str = "https://openapi.tuyaeu.com"
    tuya_access_id: str = ""
    tuya_access_secret: str = ""
    tuya_device_id: str = ""
    tuya_uid: str = ""

    discord_token: str = ""
    discord_user_id: str = ""
    discord_guild_id: str = ""

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4:12b"
    ollama_alt_url: str = ""
    ollama_alt_model: str = ""
    # Vision-capable model for meal-photo estimation (defaults to qwen3-vl:8b
    # which is already pulled on the homeAI box). Uses the primary ollama_url.
    ollama_vision_model: str = "qwen3-vl:8b"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    @property
    def db_path(self) -> Path:
        p = Path(self.wc_db_path)
        return p if p.is_absolute() else (REPO_ROOT / p).resolve()

    @property
    def web_dist(self) -> Path:
        p = Path(self.wc_web_dist)
        return p if p.is_absolute() else (REPO_ROOT / p).resolve()

    @property
    def ollama_targets(self) -> list[tuple[str, str]]:
        targets: list[tuple[str, str]] = []
        if self.ollama_url.strip():
            targets.append((self.ollama_url.strip().rstrip("/"), self.ollama_model.strip()))
        if self.ollama_alt_url.strip():
            alt_model = self.ollama_alt_model.strip() or self.ollama_model.strip()
            targets.append((self.ollama_alt_url.strip().rstrip("/"), alt_model))

        # Deduplicate while preserving order.
        seen: set[tuple[str, str]] = set()
        out: list[tuple[str, str]] = []
        for t in targets:
            if t not in seen:
                seen.add(t)
                out.append(t)
        return out


settings = Settings()
