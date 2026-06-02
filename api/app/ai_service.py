"""AI helpers — OpenAI when OPENAI_API_KEY is set, rule-based fallback otherwise."""
import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

try:
    import httpx
except ImportError:
    httpx = None

from app.ai_budget import AiBudgetExceeded, assert_budget_available, get_usage_snapshot, record_chat_usage, record_whisper_usage


def is_ai_blocked() -> bool:
    return get_usage_snapshot().blocked


def get_ai_usage() -> dict[str, Any]:
    return get_usage_snapshot().to_dict()


def _openai_available() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip()) and not is_ai_blocked()


def _chat_completion(system: str, user: str, max_tokens: int = 250) -> str | None:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    try:
        assert_budget_available()
    except AiBudgetExceeded:
        return None

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        usage = data.get("usage") or {}
        record_chat_usage(
            int(usage.get("prompt_tokens", 0)),
            int(usage.get("completion_tokens", 0)),
        )
        return data["choices"][0]["message"]["content"].strip()
    except AiBudgetExceeded:
        return None
    except (urllib.error.URLError, urllib.error.HTTPError, KeyError, TimeoutError):
        return None


def _parse_json_block(text: str) -> dict[str, Any] | None:
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return None


def rule_score_report(data: dict) -> tuple[int, str, str | None, int]:
    score = 100
    flag = None
    issues: list[str] = []
    temp = data.get("temperature") or 0
    prod = data.get("production24h")
    pressure = data.get("tubing_internal_p") or 0
    strokes = data.get("pump_strokes")

    if temp > 90:
        score -= 30
        issues.append("критически высокая температура")
        flag = "Аномалия температуры"
    elif temp > 80:
        score -= 15
        issues.append("повышенная температура")
    if prod is not None and prod < 10:
        score -= 20
        issues.append("низкая суточная добыча")
    if pressure > 160:
        score -= 25
        issues.append("высокое давление в НКТ")
        flag = flag or "Превышение давления"
    if strokes is not None and strokes < 3:
        score -= 20
        issues.append("низкая частота качания")

    score = max(0, score)
    summary = "Параметры в норме." if not issues else f"Выявлено: {'; '.join(issues)}."
    confidence = 62 if not issues else 58
    return score, summary, flag, confidence


def analyze_report(well_code: str, data: dict) -> tuple[int, str, str | None, int]:
    if not _openai_available():
        return rule_score_report(data)

    prompt = (
        f"Скважина {well_code}. Параметры замера:\n"
        f"- Температура: {data.get('temperature')} °C\n"
        f"- Добыча/24ч: {data.get('production24h')} м³\n"
        f"- P внутри НКТ: {data.get('tubing_internal_p')} атм\n"
        f"- P снаружи НКТ: {data.get('tubing_external_p')} атм\n"
        f"- Затрубное P: {data.get('annulus_p')} атм\n"
        f"- Качаний/мин: {data.get('pump_strokes')}\n"
        f"- Комментарий: {data.get('comment') or 'нет'}\n\n"
        "Оцени качество замера для нефтедобычи. Верни ТОЛЬКО JSON:\n"
        '{"ai_score": 0-100, "ai_confidence": 0-100, "summary": "краткий вывод", '
        '"flag": null или "название аномалии"}'
    )
    raw = _chat_completion(
        "Ты AI-аналитик нефтедобычи MUNAI. Отвечай только валидным JSON на русском.",
        prompt,
        max_tokens=180,
    )
    if not raw:
        return rule_score_report(data)

    parsed = _parse_json_block(raw)
    if not parsed:
        return rule_score_report(data)

    score = max(0, min(100, int(parsed.get("ai_score", 80))))
    confidence = max(0, min(100, int(parsed.get("ai_confidence", 88))))
    summary = str(parsed.get("summary") or "AI-анализ выполнен.")
    flag = parsed.get("flag")
    if flag in ("null", "None", ""):
        flag = None
    return score, summary, flag, confidence


def generate_well_report(well: dict, operator_note: str | None = None) -> dict[str, Any]:
    """Generate a full daily report draft for a well (AI-authored)."""
    base = {
        "temperature": well.get("temperature") or 72.0,
        "production24h": well.get("production24h") or 45.0,
        "tubing_internal_p": well.get("tubing_internal_p") or 118.0,
        "tubing_external_p": well.get("tubing_external_p") or 52.0,
        "annulus_p": well.get("annulus_p") or 8.0,
        "pump_strokes": well.get("pump_strokes") or 6,
        "comment": operator_note or "",
    }

    if not _openai_available():
        score, summary, flag, confidence = rule_score_report(base)
        return {
            **base,
            "ai_score": score,
            "ai_confidence": max(confidence, 72),
            "summary": f"[AI-черновик] {summary}",
            "flag": flag,
            "ai_generated": True,
        }

    prompt = (
        f"Сгенерируй суточный отчёт оператора по скважине {well.get('code')} ({well.get('name')}).\n"
        f"Текущие данные: статус={well.get('status')}, продукт={well.get('product')}, "
        f"добыча={well.get('production24h')} м³, темп={well.get('temperature')}°C.\n"
        f"Заметка оператора: {operator_note or 'нет'}\n\n"
        "Верни ТОЛЬКО JSON:\n"
        '{"temperature": число, "production24h": число, "tubing_internal_p": число, '
        '"tubing_external_p": число, "annulus_p": число, "pump_strokes": целое, '
        '"comment": "текст отчёта 2-3 предложения", "summary": "вывод AI", '
        '"ai_score": 0-100 качество замера, "ai_confidence": 85-98 насколько отчёт сформирован AI, '
        '"flag": null или "аномалия"}'
    )
    raw = _chat_completion(
        "Ты AI-инженер нефтедобычи MUNAI. Генерируй реалистичные параметры для Казахстана, Узень. "
        "Только JSON на русском.",
        prompt,
        max_tokens=320,
    )
    if not raw:
        score, summary, flag, confidence = rule_score_report(base)
        return {**base, "ai_score": score, "ai_confidence": 75, "summary": summary, "flag": flag, "ai_generated": True}

    parsed = _parse_json_block(raw)
    if not parsed:
        score, summary, flag, confidence = rule_score_report(base)
        return {**base, "ai_score": score, "ai_confidence": 75, "summary": summary, "flag": flag, "ai_generated": True}

    flag = parsed.get("flag")
    if flag in ("null", "None", ""):
        flag = None

    return {
        "temperature": float(parsed.get("temperature", base["temperature"])),
        "production24h": float(parsed.get("production24h", base["production24h"])),
        "tubing_internal_p": float(parsed.get("tubing_internal_p", base["tubing_internal_p"])),
        "tubing_external_p": float(parsed.get("tubing_external_p", base["tubing_external_p"])),
        "annulus_p": float(parsed.get("annulus_p", base["annulus_p"])),
        "pump_strokes": int(parsed.get("pump_strokes", base["pump_strokes"])),
        "comment": str(parsed.get("comment") or operator_note or ""),
        "summary": str(parsed.get("summary") or "AI сформировал суточный отчёт."),
        "ai_score": max(0, min(100, int(parsed.get("ai_score", 85)))),
        "ai_confidence": max(85, min(100, int(parsed.get("ai_confidence", 92)))),
        "flag": flag,
        "ai_generated": True,
    }


def chat_with_context(message: str, context: dict) -> tuple[str, list[str]] | None:
    if not _openai_available():
        return None

    ctx_text = (
        f"Скважин: {context.get('wells_total', 0)}, активных: {context.get('wells_active', 0)}, "
        f"warning/broken: {context.get('wells_warning', 0)}.\n"
        f"Суточная добыча (сумма активных): {context.get('production', 0):.0f} м³.\n"
        f"Отчётов на проверке: {context.get('pending', 0)}, с аномалиями: {context.get('flagged', 0)}.\n"
        f"Скважины warning: {', '.join(context.get('warning_codes', [])[:5]) or 'нет'}."
    )
    reply = _chat_completion(
        "Ты AI-ассистент платформы MUNAI (нефтедобыча, Казахстан). "
        "Отвечай кратко на русском, по делу, используя контекст. "
        "Предлагай 2-3 следующих действия в конце через строку SUGGESTIONS: действие1 | действие2",
        f"Контекст платформы:\n{ctx_text}\n\nВопрос пользователя: {message}",
        max_tokens=220,
    )
    if not reply:
        return None

    suggestions: list[str] = []
    if "SUGGESTIONS:" in reply:
        body, sug = reply.split("SUGGESTIONS:", 1)
        reply = body.strip()
        suggestions = [s.strip() for s in sug.split("|") if s.strip()][:3]

    if not suggestions:
        suggestions = ["Открыть карту скважин", "Создать отчёт", "Показать KPI"]

    return reply, suggestions


def transcribe_audio(audio_bytes: bytes, filename: str = "voice.webm") -> str | None:
    """OpenAI Whisper — speech to text (Russian)."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key or not audio_bytes:
        return None

    try:
        assert_budget_available()
    except AiBudgetExceeded:
        return None

    content_type = "audio/webm"
    if filename.endswith(".mp4"):
        content_type = "audio/mp4"
    elif filename.endswith(".wav"):
        content_type = "audio/wav"
    elif filename.endswith(".mpeg") or filename.endswith(".mp3"):
        content_type = "audio/mpeg"

    if httpx:
        try:
            with httpx.Client(timeout=90) as client:
                response = client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    files={"file": (filename, audio_bytes, content_type)},
                    data={"model": "whisper-1", "language": "ru"},
                )
                response.raise_for_status()
                text = (response.json().get("text") or "").strip()
                if text:
                    record_whisper_usage(audio_bytes)
                return text
        except AiBudgetExceeded:
            return None
        except Exception:
            pass

    return None


def parse_voice_to_report(text: str, wells: list[dict]) -> dict[str, Any] | None:
    """Extract report fields from Russian speech transcript."""
    codes = [w.get("code", "") for w in wells if w.get("code")]
    base = {
        "well_code": codes[0] if codes else None,
        "temperature": None,
        "production24h": None,
        "tubing_internal_p": None,
        "tubing_external_p": None,
        "annulus_p": None,
        "pump_strokes": None,
        "comment": text[:500],
    }

    if not _openai_available():
        return _parse_voice_fallback(text, wells, base)

    prompt = (
        f"Распознанная речь оператора нефтескважины:\n{text}\n\n"
        f"Доступные скважины: {', '.join(codes) or 'нет'}\n"
        "Извлеки параметры суточного отчёта. Верни ТОЛЬКО JSON:\n"
        '{"well_code":"UZ-101 или null","temperature":число или null,'
        '"production24h":число или null,"tubing_internal_p":число или null,'
        '"tubing_external_p":число или null,"annulus_p":число или null,'
        '"pump_strokes":целое или null,"comment":"краткий комментарий"}'
    )
    raw = _chat_completion(
        "Ты помощник MUNAI. Извлекай числа из русской речи оператора. Только JSON.",
        prompt,
        max_tokens=180,
    )
    if not raw:
        return _parse_voice_fallback(text, wells, base)

    parsed = _parse_json_block(raw)
    if not parsed:
        return _parse_voice_fallback(text, wells, base)

    result = dict(base)
    for key in base:
        if parsed.get(key) is not None:
            result[key] = parsed[key]
    if parsed.get("well_code"):
        result["well_code"] = parsed["well_code"]
    return result


def _parse_voice_fallback(text: str, wells: list[dict], base: dict) -> dict:
    codes = [w.get("code", "") for w in wells if w.get("code")]
    result = dict(base)
    for code in codes:
        if code.lower() in text.lower():
            result["well_code"] = code
            break
    nums = [float(x.replace(",", ".")) for x in re.findall(r"\d+(?:[.,]\d+)?", text)]
    if len(nums) > 0:
        result["temperature"] = nums[0]
    if len(nums) > 1:
        result["production24h"] = nums[1]
    if len(nums) > 2:
        result["tubing_internal_p"] = nums[2]
    if len(nums) > 3:
        result["pump_strokes"] = int(nums[3])
    return result


def draft_from_well(well: dict, note: str | None = None) -> dict[str, Any]:
    """Public wrapper for report draft generation."""
    return generate_well_report(well, note)


def generate_insights(context: dict) -> list[dict] | None:
    if not _openai_available():
        return None

    raw = _chat_completion(
        "Ты AI-аналитик MUNAI. Верни ТОЛЬКО JSON-массив из 3 объектов: "
        '[{"tone":"warning|destructive|info|success","title":"...","desc":"..."}]',
        f"Данные: {json.dumps(context, ensure_ascii=False)}",
        max_tokens=220,
    )
    if not raw:
        return None
    match = re.search(r"\[[\s\S]*\]", raw)
    if not match:
        return None
    try:
        items = json.loads(match.group())
        if isinstance(items, list) and len(items) >= 1:
            return items[:3]
    except json.JSONDecodeError:
        pass
    return None
