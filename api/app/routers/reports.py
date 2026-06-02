import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlite3 import Connection
from app.database import get_db
from app import schemas
from app.auth import get_current_user
from app.ai_service import analyze_report, generate_well_report
from app.notify import broadcast_notification

router = APIRouter(prefix="/reports", tags=["reports"])


def _ai_score(body: schemas.ReportCreate, well_code: str) -> tuple[int, str, str | None, int]:
    data = body.dict()
    return analyze_report(well_code, data)


def _row_get(row, key: str, default=None):
    try:
        return row[key]
    except (KeyError, IndexError):
        return default


def _row_to_out(row, db: Connection) -> schemas.ReportOut:
    well = db.execute("SELECT code, name FROM wells WHERE id=?", (row["well_id"],)).fetchone()
    op = db.execute("SELECT name FROM users WHERE id=?", (row["operator_id"],)).fetchone()
    return schemas.ReportOut(
        id=row["id"], well_id=row["well_id"],
        well_code=well["code"] if well else None,
        well_name=well["name"] if well else None,
        operator_id=row["operator_id"],
        operator_name=op["name"] if op else None,
        status=row["status"], ai_score=row["ai_score"],
        ai_confidence=int(_row_get(row, "ai_confidence", 0) or 0),
        ai_generated=bool(_row_get(row, "ai_generated", 0)),
        summary=row["summary"] or "", flag=row["flag"],
        temperature=row["temperature"], production24h=row["production24h"],
        tubing_internal_p=row["tubing_internal_p"], tubing_external_p=row["tubing_external_p"],
        annulus_p=row["annulus_p"], pump_strokes=row["pump_strokes"],
        comment=row["comment"], created_at=row["created_at"], reviewed_at=row["reviewed_at"],
    )


@router.get("", response_model=list[schemas.ReportOut])
def list_reports(
    q: str = Query(default=""),
    status: str = Query(default="all"),
    db: Connection = Depends(get_db),
    current_user=Depends(get_current_user),
):
    sql = "SELECT r.* FROM reports r WHERE 1=1"
    params = []
    if current_user.role == "operator":
        sql += " AND r.operator_id=?"
        params.append(current_user.id)
    if status != "all":
        sql += " AND r.status=?"
        params.append(status)
    if q:
        sql += " AND (r.id LIKE ? OR r.well_id LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    sql += " ORDER BY r.created_at DESC"
    rows = db.execute(sql, params).fetchall()
    return [_row_to_out(r, db) for r in rows]


@router.get("/pending", response_model=list[schemas.ReportOut])
def pending_reports(db: Connection = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role not in ("manager", "director", "admin"):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    rows = db.execute(
        "SELECT * FROM reports WHERE status IN ('pending','flagged') ORDER BY created_at DESC"
    ).fetchall()
    return [_row_to_out(r, db) for r in rows]


@router.get("/{report_id}", response_model=schemas.ReportOut)
def get_report(report_id: str, db: Connection = Depends(get_db), current_user=Depends(get_current_user)):
    row = db.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Отчёт не найден")
    return _row_to_out(row, db)


@router.post("/generate-ai", response_model=schemas.ReportOut)
def generate_ai_report(
    body: schemas.ReportGenerateAI,
    db: Connection = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = db.execute("SELECT * FROM wells WHERE id=?", (body.well_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Скважина не найдена")
    if current_user.role == "operator" and row["operator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Можно создавать отчёт только по своим скважинам")

    well_dict = dict(row)
    draft = generate_well_report(well_dict, body.note)
    flag = draft.get("flag")
    score = int(draft["ai_score"])
    confidence = int(draft["ai_confidence"])
    summary = str(draft["summary"])
    rid = str(uuid.uuid4())
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    status = "flagged" if flag else "pending"

    db.execute(
        "INSERT INTO reports(id,well_id,operator_id,status,ai_score,ai_confidence,ai_generated,"
        "summary,flag,temperature,production24h,tubing_internal_p,tubing_external_p,annulus_p,"
        "pump_strokes,comment,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            rid, body.well_id, current_user.id, status, score, confidence, 1,
            summary, flag,
            draft["temperature"], draft["production24h"], draft["tubing_internal_p"],
            draft["tubing_external_p"], draft["annulus_p"], draft["pump_strokes"],
            draft.get("comment"), now,
        ),
    )
    db.execute(
        "UPDATE wells SET production24h=?, temperature=?, tubing_internal_p=?, "
        "tubing_external_p=?, annulus_p=?, pump_strokes=?, status=?, updated_at=? WHERE id=?",
        (
            draft["production24h"], draft["temperature"], draft["tubing_internal_p"],
            draft["tubing_external_p"], draft["annulus_p"], draft["pump_strokes"],
            "warning" if flag else "active", now, body.well_id,
        ),
    )
    broadcast_notification(
        db,
        icon="sparkles",
        title=f"AI-отчёт: {row['code']}",
        body=f"{current_user.name} создал AI-отчёт. AI-оценка: {confidence}/100",
        tone="info",
    )
    if flag:
        broadcast_notification(
            db,
            icon="alert",
            title=f"AI: аномалия на {row['code']}",
            body=f"{summary} (качество {score}/100)",
            tone="warning",
        )
    db.execute(
        "INSERT INTO audit_logs(id,who,action,target,created_at) VALUES(?,?,?,?,?)",
        (str(uuid.uuid4()), f"{current_user.name} ({current_user.role})", "Создал AI-отчёт", row["code"], now),
    )
    row = db.execute("SELECT * FROM reports WHERE id=?", (rid,)).fetchone()
    return _row_to_out(row, db)


@router.post("", response_model=schemas.ReportOut)
def create_report(body: schemas.ReportCreate, db: Connection = Depends(get_db), current_user=Depends(get_current_user)):
    well = db.execute("SELECT id, code FROM wells WHERE id=?", (body.well_id,)).fetchone()
    if not well:
        raise HTTPException(status_code=404, detail="Скважина не найдена")
    score, summary, flag, confidence = _ai_score(body, well["code"])
    rid = str(uuid.uuid4())
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    status = "flagged" if flag else "pending"
    db.execute(
        "INSERT INTO reports(id,well_id,operator_id,status,ai_score,ai_confidence,ai_generated,"
        "summary,flag,temperature,production24h,tubing_internal_p,tubing_external_p,annulus_p,"
        "pump_strokes,comment,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            rid, body.well_id, current_user.id, status, score, confidence, 0,
            summary, flag,
            body.temperature, body.production24h, body.tubing_internal_p,
            body.tubing_external_p, body.annulus_p, body.pump_strokes, body.comment, now,
        ),
    )
    db.execute(
        "UPDATE wells SET production24h=?, temperature=?, tubing_internal_p=?, "
        "tubing_external_p=?, annulus_p=?, pump_strokes=?, status=?, updated_at=? WHERE id=?",
        (
            body.production24h or 0,
            body.temperature or 0,
            body.tubing_internal_p or 0,
            body.tubing_external_p or 0,
            body.annulus_p or 0,
            body.pump_strokes or 0,
            "warning" if flag else "active",
            now,
            body.well_id,
        ),
    )
    if flag:
        broadcast_notification(
            db,
            icon="alert",
            title=f"AI: аномалия на {well['code']}",
            body=f"{summary} (оценка {score}/100)",
            tone="warning",
        )
    db.execute(
        "INSERT INTO audit_logs(id,who,action,target,created_at) VALUES(?,?,?,?,?)",
        (str(uuid.uuid4()), f"{current_user.name} ({current_user.role})", "Создал отчёт", well["code"], now)
    )
    row = db.execute("SELECT * FROM reports WHERE id=?", (rid,)).fetchone()
    return _row_to_out(row, db)


@router.post("/{report_id}/review", response_model=schemas.ReportOut)
def review_report(report_id: str, body: schemas.ReportReview, db: Connection = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role not in ("manager", "director", "admin"):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    row = db.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Отчёт не найден")
    if body.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Статус должен быть approved или rejected")
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        "UPDATE reports SET status=?, reviewed_at=?, reviewed_by=? WHERE id=?",
        (body.status, now, current_user.id, report_id)
    )
    tone = "success" if body.status == "approved" else "destructive"
    title = "Отчёт одобрен" if body.status == "approved" else "Отчёт отклонён"
    db.execute(
        "INSERT INTO notifications(id,user_id,icon,title,body,tone,unread,created_at) VALUES(?,?,?,?,?,?,1,?)",
        (str(uuid.uuid4()), row["operator_id"], "check" if body.status == "approved" else "x",
         title, body.comment or "", tone, now)
    )
    db.execute(
        "INSERT INTO audit_logs(id,who,action,target,created_at) VALUES(?,?,?,?,?)",
        (str(uuid.uuid4()), f"{current_user.name} ({current_user.role})",
         "Одобрил отчёт" if body.status == "approved" else "Отклонил отчёт", report_id, now)
    )
    row = db.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
    return _row_to_out(row, db)


@router.delete("/{report_id}")
def delete_report(report_id: str, db: Connection = Depends(get_db), current_user=Depends(get_current_user)):
    row = db.execute("SELECT operator_id FROM reports WHERE id=?", (report_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Отчёт не найден")
    if current_user.role not in ("manager", "director", "admin") and row["operator_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    db.execute("DELETE FROM reports WHERE id=?", (report_id,))
    return {"ok": True}
