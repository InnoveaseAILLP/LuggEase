from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
import google_places

@pytest.mark.asyncio
async def test_google_payload_minimal_and_india_only(monkeypatch):
    request = AsyncMock(return_value={'suggestions':[{'placePrediction':{'placeId':'id1','structuredFormat':{'mainText':{'text':'Nethaji Garden'}, 'secondaryText':{'text':'Coimbatore'}}}}, {'queryPrediction':{}}]})
    monkeypatch.setattr(google_places, 'places_request', request)
    result = await google_places.autocomplete(' Nethaji ', 'session')
    assert result['suggestions'] == [{'place_id':'id1','title':'Nethaji Garden','subtitle':'Coimbatore'}]
    assert request.call_args.kwargs['body']['includedRegionCodes'] == ['in']
    assert request.call_args.kwargs['body']['sessionToken'] == 'session'

@pytest.mark.asyncio
async def test_details_reject_foreign_and_fill_state(monkeypatch):
    request = AsyncMock(return_value={'id':'id1', 'formattedAddress':'Coimbatore, India', 'addressComponents':[
        {'types':['country'], 'shortText':'IN'}, {'types':['administrative_area_level_1'], 'longText':'Tamil Nadu'}]})
    monkeypatch.setattr(google_places, 'places_request', request)
    assert (await google_places.details('id1','session'))['state'] == 'Tamil Nadu'
    request.return_value['addressComponents'][0]['shortText'] = 'US'
    with pytest.raises(HTTPException) as error: await google_places.details('id1','session')
    assert error.value.status_code == 422

@pytest.mark.asyncio
async def test_missing_key_is_safe_manual_fallback(monkeypatch):
    monkeypatch.delenv('GOOGLE_MAPS_API_KEY', raising=False)
    with pytest.raises(HTTPException) as error: await google_places.places_request('places:autocomplete', body={})
    assert error.value.status_code == 503 and 'manually' in error.value.detail
