"""Public error descriptions must be actionable without exposing provider diagnostics."""
import ast
from pathlib import Path
from unittest.mock import Mock
import pytest
from fastapi import HTTPException
import firebase_identity as identity


def test_http_error_descriptions_do_not_contain_auth_provider_branding():
    for source in Path(__file__).resolve().parents[2].glob('*.py'):
        tree = ast.parse(source.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'HTTPException':
                details = node.args[1:2] + [kw.value for kw in node.keywords if kw.arg == 'detail']
                for detail in details:
                    for part in ast.walk(detail):
                        if isinstance(part, ast.Constant) and isinstance(part.value, str):
                            assert 'firebase' not in part.value.lower(), f'{source.name}:{node.lineno}'


@pytest.mark.asyncio
@pytest.mark.parametrize('failure,status,expected', [
    (ValueError('Firebase: secret=private'), 401, 'Please sign in again'),
    (RuntimeError('internal credentials secret=private'), 503, 'Please try again shortly'),
])
async def test_identity_errors_do_not_expose_provider_diagnostics(monkeypatch, failure, status, expected):
    monkeypatch.setattr(identity, 'firebase_app', lambda:object())
    monkeypatch.setattr(identity.auth, 'verify_id_token', Mock(side_effect=failure))
    with pytest.raises(HTTPException) as result:
        await identity.verify_identity('synthetic-invalid-token')
    assert result.value.status_code == status
    assert expected in result.value.detail
    assert 'Firebase' not in result.value.detail
    assert 'private' not in result.value.detail
