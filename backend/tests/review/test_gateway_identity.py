import pytest
from fastapi import HTTPException
from starlette.requests import Request
import server


def request(headers):
    return Request({'type': 'http', 'headers': [(k.lower().encode(), v.encode()) for k, v in headers.items()]})


def test_gateway_forwards_original_identity(monkeypatch):
    monkeypatch.setenv('TRUST_API_GATEWAY', 'true')
    assert server.bearer(request({'Authorization': 'Bearer gateway-iam-token', 'X-Forwarded-Authorization': 'Bearer firebase-token'})) == 'firebase-token'


def test_direct_deployment_ignores_forwarded_header(monkeypatch):
    monkeypatch.delenv('TRUST_API_GATEWAY', raising=False)
    assert server.bearer(request({'Authorization': 'Bearer actual-token', 'X-Forwarded-Authorization': 'Bearer other-token'})) == 'actual-token'


def test_gateway_rejects_empty_original_token(monkeypatch):
    monkeypatch.setenv('TRUST_API_GATEWAY', 'true')
    with pytest.raises(HTTPException) as exc:
        server.bearer(request({'Authorization': 'Bearer gateway-token', 'X-Forwarded-Authorization': ''}))
    assert exc.value.status_code == 401
