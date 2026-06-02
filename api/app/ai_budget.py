"""OpenAI spend guard — $2 budget + token cap with persistent tracking."""
from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from typing import Any

_lock = threading.Lock()

# gpt-4o-mini (USD per 1M tokens)
_INPUT_COST_PER_1M = 0.15
_OUTPUT_COST_PER_1M = 0.60
_WHISPER_COST_PER_MINUTE = 0.006
# Rough token equivalent when Whisper returns no usage metadata
_WHISPER_TOKENS_PER_MINUTE = 1500


class AiBudgetExceeded(Exception):
    """Raised when OpenAI budget or token limit is exhausted."""

    def __init__(self, usage: "AiUsageSnapshot"):
        self.usage = usage
        super().__init__(usage.block_reason or "AI budget exhausted")


@dataclass(frozen=True)
class AiUsageSnapshot:
    total_tokens: int
    total_cost_usd: float
    budget_usd: float
    max_tokens: int
    blocked: bool
    block_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_tokens": self.total_tokens,
            "total_cost_usd": round(self.total_cost_usd, 6),
            "budget_usd": self.budget_usd,
            "max_tokens": self.max_tokens,
            "tokens_remaining": max(0, self.max_tokens - self.total_tokens),
            "budget_remaining_usd": round(max(0.0, self.budget_usd - self.total_cost_usd), 4),
            "blocked": self.blocked,
            "block_reason": self.block_reason,
            "usage_percent_tokens": round(min(100.0, self.total_tokens / self.max_tokens * 100), 1)
            if self.max_tokens
            else 0.0,
            "usage_percent_budget": round(min(100.0, self.total_cost_usd / self.budget_usd * 100), 1)
            if self.budget_usd
            else 0.0,
        }


def _budget_usd() -> float:
    try:
        return max(0.01, float(os.getenv("OPENAI_BUDGET_USD", "2")))
    except ValueError:
        return 2.0


def _max_tokens() -> int:
    try:
        return max(1000, int(os.getenv("OPENAI_MAX_TOKENS", "100000")))
    except ValueError:
        return 100_000


def _usage_file() -> str:
    custom = os.getenv("AI_USAGE_FILE", "").strip()
    if custom:
        return custom
    db_path = os.getenv("DATABASE_URL", "sqlite:////tmp/munai.db")
    if db_path.startswith("sqlite:"):
        base = db_path.replace("sqlite:////", "/").replace("sqlite:///", "")
        return os.path.join(os.path.dirname(base) or "/tmp", "munai_ai_usage.json")
    return "/tmp/munai_ai_usage.json"


def _load_raw() -> dict[str, float | int]:
    path = _usage_file()
    if os.path.isfile(path):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            return {
                "total_tokens": int(data.get("total_tokens", 0)),
                "total_cost_usd": float(data.get("total_cost_usd", 0)),
            }
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            pass

    try:
        from app.database import get_connection

        conn = get_connection()
        try:
            row = conn.execute("SELECT total_tokens, total_cost_usd FROM ai_usage WHERE id=1").fetchone()
            if row:
                return {"total_tokens": int(row["total_tokens"]), "total_cost_usd": float(row["total_cost_usd"])}
        finally:
            conn.close()
    except Exception:
        pass

    return {"total_tokens": 0, "total_cost_usd": 0.0}


def _save_raw(total_tokens: int, total_cost_usd: float) -> None:
    payload = {"total_tokens": total_tokens, "total_cost_usd": round(total_cost_usd, 8)}
    path = _usage_file()
    directory = os.path.dirname(path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh)

    try:
        from app.database import get_connection

        conn = get_connection()
        try:
            conn.execute(
                """
                INSERT INTO ai_usage (id, total_tokens, total_cost_usd, updated_at)
                VALUES (1, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                    total_tokens=excluded.total_tokens,
                    total_cost_usd=excluded.total_cost_usd,
                    updated_at=datetime('now')
                """,
                (total_tokens, total_cost_usd),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass


def get_usage_snapshot() -> AiUsageSnapshot:
    raw = _load_raw()
    total_tokens = int(raw["total_tokens"])
    total_cost = float(raw["total_cost_usd"])
    budget = _budget_usd()
    cap = _max_tokens()
    blocked = total_cost >= budget or total_tokens >= cap
    reason = None
    if blocked:
        if total_cost >= budget:
            reason = f"Лимит OpenAI ${budget:.2f} исчерпан. AI заблокирован."
        else:
            reason = f"Лимит {cap:,} токенов исчерпан. AI заблокирован."
    return AiUsageSnapshot(
        total_tokens=total_tokens,
        total_cost_usd=total_cost,
        budget_usd=budget,
        max_tokens=cap,
        blocked=blocked,
        block_reason=reason,
    )


def assert_budget_available() -> None:
    snap = get_usage_snapshot()
    if snap.blocked:
        raise AiBudgetExceeded(snap)


def _chat_cost(prompt_tokens: int, completion_tokens: int) -> float:
    return (prompt_tokens / 1_000_000 * _INPUT_COST_PER_1M) + (
        completion_tokens / 1_000_000 * _OUTPUT_COST_PER_1M
    )


def record_chat_usage(prompt_tokens: int, completion_tokens: int) -> AiUsageSnapshot:
    total_tokens = max(0, prompt_tokens) + max(0, completion_tokens)
    cost = _chat_cost(prompt_tokens, completion_tokens)
    with _lock:
        raw = _load_raw()
        new_tokens = int(raw["total_tokens"]) + total_tokens
        new_cost = float(raw["total_cost_usd"]) + cost
        _save_raw(new_tokens, new_cost)
    return get_usage_snapshot()


def record_whisper_usage(audio_bytes: bytes) -> AiUsageSnapshot:
    # ~128 kbps webm ≈ 16 KB/s → estimate duration from size
    seconds = max(1.0, len(audio_bytes) / 16_000)
    minutes = seconds / 60.0
    cost = minutes * _WHISPER_COST_PER_MINUTE
    tokens = int(minutes * _WHISPER_TOKENS_PER_MINUTE)
    with _lock:
        raw = _load_raw()
        new_tokens = int(raw["total_tokens"]) + tokens
        new_cost = float(raw["total_cost_usd"]) + cost
        _save_raw(new_tokens, new_cost)
    return get_usage_snapshot()
