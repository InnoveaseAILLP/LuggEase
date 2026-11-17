"""Verify Firebase bearer tokens in a worker thread; never accept client identity claims."""
import asyncio
import os
from functools import lru_cache
import firebase_admin
from firebase_admin import auth
from fastapi import HTTPException

@lru_cache(maxsize=1)
def firebase_app():
    if os.environ.get("APP_ENV") == "production" and os.environ.get("FIREBASE_AUTH_EMULATOR_HOST"):
        raise HTTPException(503, "Sign-in is temporarily unavailable. Please contact support.")
    project = os.environ.get("FIREBASE_PROJECT_ID")
    if not project:
        raise HTTPException(503, "Sign-in is temporarily unavailable. Please try again later.")
    try:
        return firebase_admin.get_app("luggease")
    except ValueError:
        return firebase_admin.initialize_app(options={"projectId": project}, name="luggease")

async def verify_identity(token: str) -> dict:
    app = firebase_app()
    try:
        claims = await asyncio.to_thread(auth.verify_id_token, token, app=app, check_revoked=True)
    except (auth.ExpiredIdTokenError, auth.RevokedIdTokenError, auth.UserDisabledError, auth.InvalidIdTokenError, ValueError):
        raise HTTPException(401, "Your sign-in session has expired. Please sign in again.")
    except Exception:
        raise HTTPException(503, "Sign-in is temporarily unavailable. Please try again shortly.")
    if not claims.get("uid") or not claims.get("email"):
        raise HTTPException(401, "Sign in with an account that has an email address.")
    if claims.get("email_verified") is not True:
        raise HTTPException(403, "Verify your email before continuing")
    return claims
