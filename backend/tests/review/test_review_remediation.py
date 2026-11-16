"""Regressions for the open code-review findings, without production credentials or data."""
import asyncio
from datetime import datetime,timedelta,timezone
from pathlib import Path
import importlib.util
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from pymongo.errors import ServerSelectionTimeoutError
from rate_limit import enforce_rate_limit
import server
from test_api_integration import app  # noqa: F401

@pytest.mark.asyncio
async def test_rate_limit_is_shared_across_independent_workers_and_expires(app):
    _,db=app;now=datetime.now(timezone.utc)
    # Independent handles represent separate workers using the same server-side collection.
    first=db.get_collection('request_limits');second=db.get_collection('request_limits')
    async def request(i):
        try: await enforce_rate_limit(first if i%2 else second,'shared-user',now);return 200
        except HTTPException as error:return error.status_code
    statuses=await asyncio.gather(*(request(i) for i in range(100)))
    assert statuses.count(200)==60 and statuses.count(429)==40
    record=await first.find_one({'_id':'shared-user'});assert len(record['requests'])==60
    await enforce_rate_limit(second,'different-user',now)
    await enforce_rate_limit(second,'shared-user',now+timedelta(seconds=61))
    assert len((await first.find_one({'_id':'shared-user'}))['requests'])==1

@pytest.mark.asyncio
async def test_rate_store_outage_fails_closed_without_worker_local_bypass():
    collection=SimpleNamespace(update_one=AsyncMock(side_effect=ServerSelectionTimeoutError('private database diagnostic')))
    with pytest.raises(HTTPException) as error:
        await enforce_rate_limit(collection,'test',datetime.now(timezone.utc))
    assert error.value.status_code==503 and 'private database' not in error.value.detail

@pytest.mark.parametrize('key,environment,secret,enabled',[
 ('rzp_live_synthetic','production','synthetic',True),
 ('rzp_test_synthetic','production','synthetic',False),
 ('unknown_future_format','production','synthetic',False),
 ('','production','synthetic',False),
 ('rzp_live_synthetic','production','',False),
 ('rzp_test_synthetic','qa','synthetic',True),
 ('unknown_future_format','qa','synthetic',False)])
def test_payment_mode_requires_recognized_keys_and_live_mode_in_production(monkeypatch,key,environment,secret,enabled):
    monkeypatch.setenv('RAZORPAY_KEY_ID',key);monkeypatch.setenv('RAZORPAY_KEY_SECRET',secret)
    monkeypatch.setattr(server,'APP_ENV',environment)
    assert server.payment_configuration()['enabled'] is enabled

@pytest.mark.asyncio
async def test_cors_allows_configured_web_origin_and_denies_unlisted_origin(app):
    client,_=app
    trusted=server.os.environ.get('CORS_ORIGINS','http://localhost:5173').split(',')[0].strip()
    assert trusted!='*'
    allowed=await client.options('/api/orders',headers={'Origin':trusted,'Access-Control-Request-Method':'POST'})
    assert allowed.status_code==200 and allowed.headers.get('access-control-allow-origin')==trusted
    denied=await client.options('/api/orders',headers={'Origin':'https://untrusted.invalid','Access-Control-Request-Method':'POST'})
    assert denied.status_code==400 and 'access-control-allow-origin' not in denied.headers

spec=importlib.util.spec_from_file_location('gateway_renderer',Path(__file__).resolve().parents[3]/'deployment/render_api_gateway.py')
gateway=importlib.util.module_from_spec(spec);spec.loader.exec_module(gateway)

def test_gateway_renderer_binds_issuer_audience_and_private_backend_consistently():
    rendered=gateway.render_gateway('luggease-innovease','https://luggease-api-366550426105.us-central1.run.app')
    current=(Path(__file__).resolve().parents[3]/'deployment/api-gateway.yaml').read_text()
    assert rendered==current
    migrated=gateway.render_gateway('example-project','https://example-api-123.us-central1.run.app')
    assert 'x-google-issuer: https://securetoken.google.com/example-project' in migrated
    assert 'x-google-audiences: example-project' in migrated
    assert migrated.count('https://example-api-123.us-central1.run.app')==2
    assert 'luggease-innovease' not in migrated

@pytest.mark.parametrize('project,url',[
 ('bad\nproject','https://example.run.app'),('valid-project','http://example.run.app'),
 ('valid-project','https://example.run.app.attacker.invalid'),('valid-project','https://user:pass@example.run.app'),
 ('valid-project','https://example.run.app/path'),('valid-project','https://example.run.app?override=1')])
def test_gateway_renderer_rejects_unsafe_substitutions(project,url):
    with pytest.raises(ValueError):gateway.render_gateway(project,url)
