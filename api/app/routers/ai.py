from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlite3 import Connection
from app.database import get_db
from app import schemas
from app.auth import get_current_user
from app.ai_budget import AiBudgetExceeded, get_usage_snapshot
from app.ai_service import (
    chat_with_context,
    draft_from_well,
    generate_insights,
    get_ai_usage,
    is_ai_blocked,
    parse_voice_to_report,
    transcribe_audio,
)

router = APIRouter(prefix="/ai", tags=["ai"])

_RESPONSES = {
    ("скважин", "well"): (
        "На платформе {n} скважин. {active} активных, {warning} требуют внимания.",
        ["Показать карту скважин", "Отчёты по скважинам"],
    ),
    ("добыч", "production"): (
        "Суммарная суточная добыча составляет {production:.0f} м³/сут.",
        ["Показать KPI дашборд", "Детализация по скважинам"],
    ),
    ("отчёт", "report"): (
        "Ожидают проверки {pending} отчётов. {flagged} помечены AI как аномальные.",
        ["Перейти к согласованиям", "Создать новый отчёт"],
    ),
    ("темпер", "temperat"): (
        "Проверьте скважины со статусом warning.",
        ["Карта скважин", "Список отчётов"],
    ),
    ("аномал", "anomal"): (
        "AI выявил {flagged} аномалий.",
        ["Согласования", "Карта скважин"],
    ),
    ("привет", "hello", "hi", "здравствуй"): (
        "Привет! Я AI-ассистент MUNAI.",
        ["Статистика добычи", "Статус скважин"],
    ),
}

_DEFAULT = (
    "Я обрабатываю данные платформы MUNAI. Спросите о скважинах, добыче, отчётах или аномалиях.",
    ["Статистика добычи", "Статус скважин"],
)


def _platform_context(db: Connection) -> dict:
    n_wells = db.execute("SELECT COUNT(*) FROM wells").fetchone()[0]
    active = db.execute("SELECT COUNT(*) FROM wells WHERE status='active'").fetchone()[0]
    warning = db.execute(
        "SELECT COUNT(*) FROM wells WHERE status IN ('warning','broken')"
    ).fetchone()[0]
    pending = db.execute("SELECT COUNT(*) FROM reports WHERE status='pending'").fetchone()[0]
    flagged = db.execute("SELECT COUNT(*) FROM reports WHERE status='flagged'").fetchone()[0]
    production = db.execute(
        "SELECT COALESCE(SUM(production24h),0) FROM wells WHERE status='active'"
    ).fetchone()[0]
    warning_codes = [
        r["code"]
        for r in db.execute(
            "SELECT code FROM wells WHERE status IN ('warning','broken') ORDER BY code LIMIT 8"
        ).fetchall()
    ]
    return {
        "wells_total": n_wells,
        "wells_active": active,
        "wells_warning": warning,
        "pending": pending,
        "flagged": flagged,
        "production": production,
        "warning_codes": warning_codes,
    }


def _rule_chat(msg: str, ctx: dict) -> schemas.AIChatResponse:
    for keys, (template, suggestions) in _RESPONSES.items():
        if any(k in msg for k in keys):
            reply = template.format(
                n=ctx["wells_total"],
                active=ctx["wells_active"],
                warning=ctx["wells_warning"],
                pending=ctx["pending"],
                flagged=ctx["flagged"],
                production=ctx["production"],
            )
            return schemas.AIChatResponse(reply=reply, suggestions=suggestions)
    return schemas.AIChatResponse(reply=_DEFAULT[0], suggestions=list(_DEFAULT[1]))


def _budget_error() -> HTTPException:
    usage = get_usage_snapshot()
    return HTTPException(
        status_code=429,
        detail=usage.block_reason or "Лимит OpenAI исчерпан. AI временно заблокирован.",
    )


@router.get("/usage", response_model=schemas.AIUsageResponse)
def ai_usage(current_user=Depends(get_current_user)):
    return schemas.AIUsageResponse(**get_ai_usage())


@router.post("/transcribe", response_model=schemas.TranscribeResponse)
async def transcribe(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    if is_ai_blocked():
        raise _budget_error()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Пустой аудиофайл")
    try:
        text = transcribe_audio(data, file.filename or "voice.webm")
    except AiBudgetExceeded:
        raise _budget_error()
    if not text:
        if is_ai_blocked():
            raise _budget_error()
        raise HTTPException(
            status_code=502,
            detail="Не удалось распознать речь. Добавьте OPENAI_API_KEY в переменные окружения Vercel.",
        )
    return schemas.TranscribeResponse(text=text)


@router.post("/parse-voice")
def parse_voice(body: schemas.VoiceParseRequest, current_user=Depends(get_current_user)):
    wells = [w.dict() for w in body.wells]
    parsed = parse_voice_to_report(body.text, wells)
    if not parsed:
        raise HTTPException(status_code=502, detail="Не удалось разобрать голосовой ввод")
    return parsed


@router.post("/generate-report-draft")
def generate_report_draft(
    body: schemas.GenerateReportDraftRequest,
    db: Connection = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if body.well:
        well_dict = body.well.dict()
    else:
        row = db.execute("SELECT * FROM wells WHERE id=?", (body.well_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Скважина не найдена")
        well_dict = dict(row)

    op_id = well_dict.get("operator_id")
    if current_user.role == "operator" and op_id and op_id != current_user.id:
        raise HTTPException(status_code=403, detail="Можно создавать отчёт только по своим скважинам")

    draft = draft_from_well(well_dict, body.note)
    return draft


@router.post("/chat", response_model=schemas.AIChatResponse)
def chat(
    body: schemas.AIChatRequest,
    db: Connection = Depends(get_db),
    current_user=Depends(get_current_user),
):
    usage = get_ai_usage()
    if usage["blocked"]:
        return schemas.AIChatResponse(
            reply=usage["block_reason"] or "AI заблокирован: лимит OpenAI исчерпан.",
            suggestions=["Показать KPI", "Открыть отчёты"],
            ai_blocked=True,
            usage=usage,
        )

    ctx = _platform_context(db)
    ai = chat_with_context(body.message, ctx)
    if ai:
        reply, suggestions = ai
        return schemas.AIChatResponse(
            reply=reply,
            suggestions=suggestions,
            ai_blocked=False,
            usage=get_ai_usage(),
        )
    if is_ai_blocked():
        usage = get_ai_usage()
        return schemas.AIChatResponse(
            reply=usage["block_reason"] or "AI заблокирован: лимит OpenAI исчерпан.",
            suggestions=["Показать KPI", "Открыть отчёты"],
            ai_blocked=True,
            usage=usage,
        )
    return _rule_chat(body.message.lower(), ctx)


@router.get("/insights")
def insights(db: Connection = Depends(get_db), current_user=Depends(get_current_user)):
    ctx = _platform_context(db)
    low_production = db.execute("SELECT COUNT(*) FROM wells WHERE production24h < 15").fetchone()[0]

    ai_items = generate_insights({**ctx, "low_production": low_production})
    if ai_items:
        return {
            "insights": ai_items,
            "suggestions": [
                "Какие скважины показывают снижение добычи?",
                "Какие отчёты требуют проверки?",
                "Покажи скважины со статусом warning",
            ],
        }

    return {
        "insights": [
            {
                "tone": "warning",
                "title": f"{ctx['wells_warning']} скважин требуют внимания",
                "desc": "Проверьте статусы warning/broken на карте",
            },
            {
                "tone": "destructive",
                "title": f"{ctx['flagged']} AI-анализов с аномалиями",
                "desc": "Отчёты требуют ручной проверки",
            },
            {
                "tone": "info",
                "title": f"{low_production} скважин с низкой добычей",
                "desc": "Сверьте давление и режим насоса",
            },
        ],
        "suggestions": [
            "Какие скважины показывают снижение добычи?",
            "Какие отчёты требуют проверки?",
            "Покажи скважины со статусом warning",
        ],
    }
