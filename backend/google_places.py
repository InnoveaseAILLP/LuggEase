"""Authenticated callers access Places through the API; credentials never reach clients."""
import os
from urllib.parse import quote
import httpx
from fastapi import HTTPException

async def places_request(path: str, *, body=None, params=None, fields=None):
    key = os.environ.get('GOOGLE_MAPS_API_KEY', '')
    if not key:
        raise HTTPException(503, 'Address suggestions are temporarily unavailable. You can enter the address manually.')
    headers = {'X-Goog-Api-Key': key}
    if fields:
        headers['X-Goog-FieldMask'] = fields
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.request('POST' if body is not None else 'GET',
                'https://places.googleapis.com/v1/' + path, headers=headers, json=body, params=params)
        if response.status_code != 200:
            raise HTTPException(503, 'Google Maps address search is unavailable. Please try again or enter the address manually.')
        return response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, 'Address search timed out. Please try again or enter the address manually.') from None

async def autocomplete(text: str, session: str):
    result = await places_request('places:autocomplete', body={
        'input': text.strip(), 'sessionToken': session, 'includedRegionCodes': ['in'],
        'languageCode': 'en', 'regionCode': 'IN',
    }, fields='suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat')
    return {'suggestions': [
        {'place_id': p['placeId'], 'title': p.get('structuredFormat', {}).get('mainText', {}).get('text', p.get('text', {}).get('text', '')),
         'subtitle': p.get('structuredFormat', {}).get('secondaryText', {}).get('text', '')}
        for item in result.get('suggestions', [])[:5] if (p := item.get('placePrediction', {})).get('placeId')
    ]}

async def details(place_id: str, session: str):
    result = await places_request('places/' + quote(place_id, safe=''),
        params={'sessionToken': session, 'languageCode': 'en', 'regionCode': 'IN'},
        fields='id,formattedAddress,addressComponents')
    components = result.get('addressComponents', [])
    country = next((c.get('shortText') for c in components if 'country' in c.get('types', [])), '')
    if country != 'IN':
        raise HTTPException(422, 'Please select an address in India.')
    state = next((c.get('longText', '') for c in components if 'administrative_area_level_1' in c.get('types', [])), '')
    if not result.get('formattedAddress'):
        raise HTTPException(422, 'This place has no address. Please choose another suggestion.')
    city = next((c.get('longText', '') for c in components if 'locality' in c.get('types', []) or 'postal_town' in c.get('types', [])), '')
    return {'place_id': result.get('id', place_id), 'address': result['formattedAddress'], 'state': state, 'city': city}
