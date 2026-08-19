"""
routes/avatar.py — replaces the Supabase `avatars` Storage bucket (backend/supabase/schema.sql)
with local disk storage under AVATAR_STORAGE_DIR, served back out via a public-read static
mount (main.py mounts AVATAR_STORAGE_DIR at /avatars, matching the old bucket's public-read
policy). Writes are owner-scoped by construction — the upload path is always
{AVATAR_STORAGE_DIR}/{caller's own user_id}/avatar.{ext}, taken from the verified token, never
from the request — mirroring the old bucket policy's
`(storage.foldername(name))[1] = auth.uid()::text` check.
"""
from __future__ import annotations

import os
import time

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import Profile
from api.db.session import get_db

router = APIRouter(prefix="/profile", tags=["profile"])

_ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}


def avatar_storage_dir() -> str:
    return os.environ.get("AVATAR_STORAGE_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "avatars"))


@router.post("/avatar")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    ext = (file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg").lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported image type '.{ext}'.")

    user_dir = os.path.join(avatar_storage_dir(), user_id)
    os.makedirs(user_dir, exist_ok=True)
    dest_path = os.path.join(user_dir, f"avatar.{ext}")
    contents = await file.read()
    with open(dest_path, "wb") as f:
        f.write(contents)

    # Absolute URL (not a bare path) — the frontend renders this straight into <img src>, and it
    # runs on a different origin/port than this API, so a relative path would resolve against
    # the frontend's own origin instead. Cache-bust query param: the URL path itself doesn't
    # change on re-upload (fixed filename), so a browser that already cached the old image would
    # otherwise keep showing it.
    avatar_url = f"{str(request.base_url).rstrip('/')}/avatars/{user_id}/avatar.{ext}?t={int(time.time())}"

    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="No profile found for this account.")
    profile.avatar_url = avatar_url
    return {"avatar_url": avatar_url}
