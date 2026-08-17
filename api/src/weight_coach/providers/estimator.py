"""Meal macro estimator: template lookup first, Ollama fallback."""
from __future__ import annotations

import json
import logging
import re
from uuid import uuid4
from datetime import datetime
from typing import TypedDict

import httpx

from ..config import settings
from ..db import connect

log = logging.getLogger(__name__)


class MealEstimate(TypedDict):
    kcal: int | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None
    food_groups: str | None
    source: str  # 'template' | 'llm'
    template_id: int | None
    model: str | None


_WORD_RE = re.compile(r"[a-zåäö0-9]+", re.IGNORECASE)


def signature_for(description: str) -> str:
    """Normalize a meal description into a stable lookup key."""
    words = sorted(w.lower() for w in _WORD_RE.findall(description))
    # Drop 1-char noise but keep short meaningful tokens like "ml", "g".
    return " ".join(w for w in words if len(w) > 1)


def find_template(description: str) -> dict | None:
    sig = signature_for(description)
    if not sig:
        return None
    with connect() as c:
        row = c.execute(
            "SELECT * FROM meal_templates WHERE signature = ?", (sig,)
        ).fetchone()
    return dict(row) if row else None


def bump_template(
    description: str,
    kcal: int | None,
    protein_g: float | None,
    carbs_g: float | None,
    fat_g: float | None,
    food_groups: str | None,
) -> int | None:
    """Insert or update a template row for this description. Returns template id."""
    sig = signature_for(description)
    if not sig:
        return None
    now = datetime.utcnow().isoformat()
    with connect() as c:
        c.execute(
            """
            INSERT INTO meal_templates
                (signature, display_name, kcal, protein_g, carbs_g, fat_g, food_groups, day_type, occurrences, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'any', 1, ?)
            ON CONFLICT(signature) DO UPDATE SET
                occurrences = meal_templates.occurrences + 1,
                last_seen = excluded.last_seen,
                -- refresh macros only if they're currently NULL
                kcal = COALESCE(meal_templates.kcal, excluded.kcal),
                protein_g = COALESCE(meal_templates.protein_g, excluded.protein_g),
                carbs_g = COALESCE(meal_templates.carbs_g, excluded.carbs_g),
                fat_g = COALESCE(meal_templates.fat_g, excluded.fat_g),
                food_groups = COALESCE(meal_templates.food_groups, excluded.food_groups)
            """,
            (sig, description[:120], kcal, protein_g, carbs_g, fat_g, food_groups, now),
        )
        row = c.execute("SELECT id FROM meal_templates WHERE signature = ?", (sig,)).fetchone()
    return row["id"] if row else None


PROMPT = """Output ONE JSON object and NOTHING else. No thinking, no reasoning, no preamble, no code fences, no explanation. Just the JSON.

Schema:
{"kcal": integer, "protein_g": number, "carbs_g": number, "fat_g": number, "food_groups": "comma-separated tags from: protein, grain, veg, fruit, dairy, fat, alcohol, sweets, other"}

Give realistic estimates for a typical adult portion of the meal below. Use the quantity if given, otherwise assume a standard portion. Be realistic, not generous.

Meal: {description}
JSON:"""


_JSON_OBJ_RE = re.compile(r"\{.*\}", re.DOTALL)


def _short(text: str, max_len: int = 220) -> str:
    text = (text or "").replace("\n", "\\n")
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."


def _extract_json_object(raw: str) -> str | None:
    """Grab the first {...} substring if the model wrapped it in prose."""
    m = _JSON_OBJ_RE.search(raw)
    return m.group(0) if m else None


def _parse_llm_json(
    raw: str,
    model_name: str,
    *,
    provider: str = "unknown",
    trace_id: str = "-",
) -> MealEstimate | None:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        salvaged = _extract_json_object(raw)
        if not salvaged:
            log.warning(
                "llm_trace[%s] parse failed provider=%s model=%s raw=%r",
                trace_id,
                provider,
                model_name,
                _short(raw),
            )
            return None
        try:
            data = json.loads(salvaged)
        except (json.JSONDecodeError, ValueError):
            log.warning(
                "llm_trace[%s] salvage parse failed provider=%s model=%s salvaged=%r",
                trace_id,
                provider,
                model_name,
                _short(salvaged),
            )
            return None
    if data.get("kcal") is None:
        log.warning(
            "llm_trace[%s] parsed JSON missing kcal provider=%s model=%s payload=%r",
            trace_id,
            provider,
            model_name,
            _short(json.dumps(data)),
        )
        return None

    def _num(k, cast):
        v = data.get(k)
        try:
            return cast(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    fg = data.get("food_groups")
    return MealEstimate(
        kcal=_num("kcal", int),
        protein_g=_num("protein_g", float),
        carbs_g=_num("carbs_g", float),
        fat_g=_num("fat_g", float),
        food_groups=fg if isinstance(fg, str) else None,
        source="llm",
        template_id=None,
        model=model_name,
    )


def _ollama_estimate(description: str, *, trace_id: str = "-") -> MealEstimate | None:
    candidates = settings.ollama_targets
    log.info(
        "llm_trace[%s] provider=ollama candidates=%d targets=%s",
        trace_id,
        len(candidates),
        candidates,
    )
    for idx, (base, model_name) in enumerate(candidates, start=1):
        url = f"{base}/api/generate"
        log.info(
            "llm_trace[%s] provider=ollama attempt=%d/%d url=%s model=%s",
            trace_id,
            idx,
            len(candidates),
            url,
            model_name,
        )
        try:
            r = httpx.post(
                url,
                json={
                    "model": model_name,
                    "prompt": PROMPT.replace("{description}", description),
                    "stream": False,
                    "format": "json",
                    "think": False,  # disable reasoning for models that support it
                    "options": {"temperature": 0.2, "num_predict": 256},
                },
                timeout=120,
            )
        except httpx.HTTPError as e:
            log.warning("llm_trace[%s] provider=ollama connect failed url=%s err=%r", trace_id, url, e)
            continue
        if r.status_code != 200:
            log.warning(
                "llm_trace[%s] provider=ollama HTTP %s url=%s body=%r",
                trace_id,
                r.status_code,
                url,
                _short(r.text, 300),
            )
            continue
        try:
            payload = r.json()
        except ValueError:
            log.warning(
                "llm_trace[%s] provider=ollama invalid JSON envelope url=%s body=%r",
                trace_id,
                url,
                _short(r.text, 300),
            )
            continue
        raw = (payload.get("response") or "").strip()
        log.info("llm_trace[%s] provider=ollama raw=%r", trace_id, _short(raw))
        parsed = _parse_llm_json(
            raw,
            model_name,
            provider="ollama",
            trace_id=trace_id,
        )
        if parsed is not None:
            log.info(
                "llm_trace[%s] provider=ollama success kcal=%s protein_g=%s carbs_g=%s fat_g=%s",
                trace_id,
                parsed["kcal"],
                parsed["protein_g"],
                parsed["carbs_g"],
                parsed["fat_g"],
            )
            return parsed
        log.warning("llm_trace[%s] provider=ollama parse returned None url=%s", trace_id, url)
    return None


def _openai_estimate(description: str, *, trace_id: str = "-") -> MealEstimate | None:
    if not settings.openai_api_key:
        log.info("llm_trace[%s] provider=openai skipped reason=no_api_key", trace_id)
        return None
    url = f"{settings.openai_base_url}/chat/completions"
    log.info("llm_trace[%s] provider=openai url=%s model=%s", trace_id, url, settings.openai_model)
    try:
        r = httpx.post(
            url,
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": settings.openai_model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": "Return only the JSON object requested."},
                    {"role": "user", "content": PROMPT.replace("{description}", description)},
                ],
            },
            timeout=30,
        )
    except httpx.HTTPError as e:
        log.warning("llm_trace[%s] provider=openai request failed err=%r", trace_id, e)
        return None
    if r.status_code >= 400:
        log.warning(
            "llm_trace[%s] provider=openai HTTP %s url=%s body=%r",
            trace_id,
            r.status_code,
            url,
            _short(r.text, 300),
        )
        return None
    try:
        payload = r.json()
        raw = payload["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError) as e:
        log.warning(
            "llm_trace[%s] provider=openai invalid response err=%r body=%r",
            trace_id,
            e,
            _short(r.text, 300),
        )
        return None
    log.info("llm_trace[%s] provider=openai raw=%r", trace_id, _short(raw))
    parsed = _parse_llm_json(
        raw,
        settings.openai_model,
        provider="openai",
        trace_id=trace_id,
    )
    if parsed is not None:
        log.info(
            "llm_trace[%s] provider=openai success kcal=%s protein_g=%s carbs_g=%s fat_g=%s",
            trace_id,
            parsed["kcal"],
            parsed["protein_g"],
            parsed["carbs_g"],
            parsed["fat_g"],
        )
    return parsed


VISION_PROMPT = """Look at this meal photo. Estimate what's on the plate and output ONE JSON object and NOTHING else. No thinking, no reasoning, no preamble, no code fences, no explanation. Just the JSON.

Schema:
{"kcal": integer, "protein_g": number, "carbs_g": number, "fat_g": number, "food_groups": "comma-separated tags from: protein, grain, veg, fruit, dairy, fat, alcohol, sweets, other", "description": "short human name for this meal (e.g. 'chicken salad with feta')"}

Give realistic estimates for the portion shown. If unclear, assume a typical adult serving. Be realistic, not generous.
JSON:"""


def _ollama_vision(image_b64: str, *, trace_id: str = "-") -> tuple[MealEstimate | None, str | None]:
    """Call Ollama with an image; return (estimate, described-name)."""
    base = settings.ollama_url.strip().rstrip("/")
    if not base:
        log.info("llm_trace[%s] provider=ollama_vision skipped: no ollama_url", trace_id)
        return None, None
    model_name = settings.ollama_vision_model.strip() or "qwen3-vl:8b"
    url = f"{base}/api/generate"
    log.info("llm_trace[%s] provider=ollama_vision url=%s model=%s", trace_id, url, model_name)
    try:
        r = httpx.post(
            url,
            json={
                "model": model_name,
                "prompt": VISION_PROMPT,
                "images": [image_b64],
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.2, "num_predict": 300},
            },
            timeout=180,
        )
    except httpx.HTTPError as e:
        log.warning("llm_trace[%s] provider=ollama_vision connect failed err=%r", trace_id, e)
        return None, None
    if r.status_code != 200:
        log.warning(
            "llm_trace[%s] provider=ollama_vision HTTP %s body=%r",
            trace_id, r.status_code, _short(r.text, 300),
        )
        return None, None
    try:
        raw = (r.json().get("response") or "").strip()
    except ValueError:
        log.warning("llm_trace[%s] provider=ollama_vision non-JSON envelope", trace_id)
        return None, None
    log.info("llm_trace[%s] provider=ollama_vision raw=%r", trace_id, _short(raw))

    # Vision output includes a "description" the plain estimator doesn't; parse manually first.
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        salvaged = _extract_json_object(raw)
        if not salvaged:
            return None, None
        try:
            data = json.loads(salvaged)
        except (json.JSONDecodeError, ValueError):
            return None, None
    if data.get("kcal") is None:
        return None, None
    description = data.get("description") if isinstance(data.get("description"), str) else None
    est = MealEstimate(
        kcal=int(data["kcal"]) if data.get("kcal") is not None else None,
        protein_g=float(data["protein_g"]) if data.get("protein_g") is not None else None,
        carbs_g=float(data["carbs_g"]) if data.get("carbs_g") is not None else None,
        fat_g=float(data["fat_g"]) if data.get("fat_g") is not None else None,
        food_groups=data.get("food_groups") if isinstance(data.get("food_groups"), str) else None,
        source="llm",
        template_id=None,
        model=model_name,
    )
    return est, description


def estimate_from_image(image_bytes: bytes) -> tuple[MealEstimate, str | None]:
    """Take an image, return (MealEstimate, best-effort description).
    Falls through to a pending shell if Ollama vision is unavailable."""
    import base64

    trace_id = uuid4().hex[:8]
    b64 = base64.b64encode(image_bytes).decode("ascii")
    log.info(
        "llm_trace[%s] estimate_from_image start bytes=%d", trace_id, len(image_bytes),
    )
    est, desc = _ollama_vision(b64, trace_id=trace_id)
    if est is not None:
        log.info("llm_trace[%s] vision success kcal=%s desc=%r", trace_id, est["kcal"], desc)
        return est, desc
    log.warning("llm_trace[%s] vision failed; returning pending", trace_id)
    return _pending_shell(), None


def _pending_shell() -> MealEstimate:
    return MealEstimate(
        kcal=None, protein_g=None, carbs_g=None, fat_g=None,
        food_groups=None, source="pending", template_id=None, model=None,
    )


def estimate(description: str, *, caller: str = "unknown") -> MealEstimate:
    """Try template → Ollama → OpenAI. If all fail, return a 'pending' shell
    so the caller can save the meal now and retry later from the worker."""
    trace_id = uuid4().hex[:8]
    log.info(
        "llm_trace[%s] estimate start caller=%s desc_len=%d desc=%r",
        trace_id,
        caller,
        len(description or ""),
        _short(description or "", 180),
    )
    tpl = find_template(description)
    if tpl and tpl.get("kcal") is not None:
        log.info("llm_trace[%s] template hit template_id=%s kcal=%s", trace_id, tpl.get("id"), tpl.get("kcal"))
        return MealEstimate(
            kcal=tpl["kcal"],
            protein_g=tpl["protein_g"],
            carbs_g=tpl["carbs_g"],
            fat_g=tpl["fat_g"],
            food_groups=tpl["food_groups"],
            source="template",
            template_id=tpl["id"],
            model=None,
        )

    log.info("llm_trace[%s] template miss; trying providers=ollama,openai", trace_id)
    for provider_name, provider in (("ollama", _ollama_estimate), ("openai", _openai_estimate)):
        log.info("llm_trace[%s] trying provider=%s", trace_id, provider_name)
        est = provider(description, trace_id=trace_id)
        if est is not None:
            log.info(
                "llm_trace[%s] estimate success provider=%s source=%s model=%s kcal=%s",
                trace_id,
                provider_name,
                est.get("source"),
                est.get("model"),
                est.get("kcal"),
            )
            return est
        log.warning("llm_trace[%s] provider=%s returned None", trace_id, provider_name)

    log.warning("llm_trace[%s] all providers failed; returning pending", trace_id)
    return _pending_shell()


def retry_pending() -> int:
    """Estimate every meal with kcal IS NULL. Returns count filled in."""
    from ..routes.meals import _resum_daily_kcal_in  # avoid import cycle at module load

    with connect() as c:
        rows = c.execute(
            "SELECT id, date, raw_text FROM meals WHERE kcal IS NULL AND raw_text IS NOT NULL"
        ).fetchall()

    filled = 0
    dates_touched: set[str] = set()

    for row in rows:
        est = estimate(row["raw_text"] or "", caller="worker.retry_pending")
        if est["kcal"] is None:
            continue
        tid = bump_template(
            row["raw_text"],
            est["kcal"], est["protein_g"], est["carbs_g"], est["fat_g"], est["food_groups"],
        )
        with connect() as c:
            c.execute(
                """
                UPDATE meals
                SET kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?,
                    food_groups = ?, source = 'manual', template_id = COALESCE(template_id, ?)
                WHERE id = ?
                """,
                (est["kcal"], est["protein_g"], est["carbs_g"], est["fat_g"],
                 est["food_groups"], tid, row["id"]),
            )
        dates_touched.add(row["date"])
        filled += 1

    with connect() as c:
        for d in dates_touched:
            _resum_daily_kcal_in(c, d)

    if filled:
        log.info("Backfilled %d pending meal(s)", filled)
    return filled
