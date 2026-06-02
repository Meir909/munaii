from datetime import datetime, timedelta, timezone
from typing import Optional
import os
import uuid
import bcrypt
import jwt
from jwt.exceptions import InvalidTokenError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlite3 import Connection
from app.config import settings
from app.database import get_db
from app import schemas

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except InvalidTokenError:
        supabase_secret = os.getenv("SUPABASE_JWT_SECRET")
        if not supabase_secret:
            return None
        try:
            return jwt.decode(token, supabase_secret, algorithms=["HS256"], audience="authenticated")
        except InvalidTokenError:
            try:
                return jwt.decode(token, supabase_secret, algorithms=["HS256"], options={"verify_aud": False})
            except InvalidTokenError:
                return None


def _role_from_email(email: str) -> str:
    return {
        "manager@munai.kz": "manager",
        "director@munai.kz": "director",
        "admin@munai.kz": "admin",
    }.get(email.lower(), "operator")


def _ensure_user_from_claims(payload: dict, db: Connection):
    user_id = payload.get("sub")
    if not user_id:
        return None
    row = db.execute("SELECT * FROM users WHERE id=? AND active=1", (user_id,)).fetchone()
    if row:
        return row

    email = payload.get("email") or f"{user_id}@supabase.local"
    meta = payload.get("user_metadata") or {}
    name = meta.get("name") or email.split("@")[0]
    role = meta.get("role") or _role_from_email(email)
    if role not in ("operator", "manager", "director", "admin"):
        role = "operator"
    position = meta.get("position") or ""
    region = meta.get("region") or ""
    db.execute(
        "INSERT INTO users(id,name,email,hashed_password,role,position,region,active) VALUES(?,?,?,?,?,?,?,1)",
        (user_id, name, email, hash_password(str(uuid.uuid4())), role, position, region),
    )
    return db.execute("SELECT * FROM users WHERE id=? AND active=1", (user_id,)).fetchone()


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Connection = Depends(get_db),
) -> schemas.UserOut:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    row = db.execute("SELECT * FROM users WHERE id=? AND active=1", (user_id,)).fetchone()
    if not row:
        row = _ensure_user_from_claims(payload, db)
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return schemas.UserOut(
        id=row["id"], name=row["name"], email=row["email"],
        role=row["role"], position=row["position"] or "",
        region=row["region"] or "", active=bool(row["active"])
    )


def require_roles(*roles: str):
    def dependency(current_user: schemas.UserOut = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return dependency
