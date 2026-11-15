from unittest.mock import Mock
import pytest
from fastapi import HTTPException
import firebase_identity as identity

@pytest.mark.asyncio
@pytest.mark.parametrize('claims,status', [
    ({'uid':'u','email':'a@example.com','email_verified':True},None),
    ({'uid':'u','email':'a@example.com','email_verified':False},403),
    ({'uid':'u','email':'a@example.com'},403),
    ({'email':'a@example.com','email_verified':True},401),
    ({'uid':'u','email_verified':True},401),
])
async def test_identity_claim_requirements(monkeypatch, claims, status):
    app = object()
    monkeypatch.setattr(identity, 'firebase_app', lambda:app)
    verify = Mock(return_value=claims)
    monkeypatch.setattr(identity.auth, 'verify_id_token', verify)
    if status:
        with pytest.raises(HTTPException) as error:
            await identity.verify_identity('signed-token')
        assert error.value.status_code == status
    else:
        assert await identity.verify_identity('signed-token') == claims
    verify.assert_called_once_with('signed-token', app=app, check_revoked=True)

@pytest.mark.asyncio
@pytest.mark.parametrize('exception,status', [(ValueError('malformed'),401), (RuntimeError('unavailable'),503)])
async def test_identity_failures(monkeypatch, exception, status):
    monkeypatch.setattr(identity, 'firebase_app', lambda:object())
    monkeypatch.setattr(identity.auth, 'verify_id_token', Mock(side_effect=exception))
    with pytest.raises(HTTPException) as error:
        await identity.verify_identity('bad-token')
    assert error.value.status_code == status
