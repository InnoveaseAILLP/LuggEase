"""Road routing and delivery-window calculations. All timestamps use explicit zones."""
import math
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import httpx
from fastapi import HTTPException

IST = ZoneInfo('Asia/Kolkata')

def departure_at(move_date=None, time_slot=None, now=None):
    now = (now or datetime.now(timezone.utc)).astimezone(IST)
    if not move_date and time_slot in (None, '', 'Now'):
        return now
    try:
        day = datetime.strptime(move_date, '%d-%m-%Y').date() if move_date else now.date()
        if time_slot in (None, '', 'Now'):
            value = now if day == now.date() else datetime.combine(day, datetime.min.time(), IST).replace(hour=9)
        else:
            if time_slot not in ('08:00-10:00','10:00-12:00','12:00-14:00','14:00-16:00','16:00-18:00','18:00-20:00'):
                raise ValueError()
            hour, minute = map(int, time_slot.split('-')[0].split(':'))
            value = datetime.combine(day, datetime.min.time(), IST).replace(hour=hour, minute=minute)
        if value < now - timedelta(minutes=1):
            raise ValueError()
        return max(value, now)
    except (ValueError, TypeError):
        raise HTTPException(422, 'Choose a future pickup date and time slot.') from None


def delivery_window(departure, travel_seconds, handling_hours=0):
    # Explicit operating estimate, not a guarantee of road/vehicle suitability.
    breaks = max(0, math.ceil(travel_seconds / (4 * 3600)) - 1) * 45 * 60
    arrival = departure + timedelta(seconds=travel_seconds + breaks + max(1800, handling_hours * 3600))
    arrival = arrival.astimezone(IST)
    rolled = False
    if arrival.hour > 21 or (arrival.hour == 21 and (arrival.minute or arrival.second or arrival.microsecond)):
        arrival = (arrival + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        rolled = True
    elif arrival.hour < 9:
        arrival = arrival.replace(hour=9, minute=0, second=0, microsecond=0)
        rolled = True
    return {'expected_delivery_at': arrival.isoformat(), 'departure_at': departure.isoformat(),
        'travel_seconds': int(travel_seconds), 'break_seconds': breaks,
        'delivery_window_adjusted': rolled, 'timezone':'Asia/Kolkata', 'source':'google_routes',
        'note':'Approximate arrival, including handling and 45-minute breaks per four driving hours. Arrivals after 9 PM move to 9 AM the next day. Partner may revise with a reason.'}


async def road_route(pickup, drop, stops, departure):
    key = os.environ.get('GOOGLE_MAPS_API_KEY')
    if not key:
        raise HTTPException(503, 'Road routing is unavailable. Please try again later.')
    payload = {'origin':pickup if isinstance(pickup,dict) else {'address':pickup}, 'destination':{'address':drop},
        'intermediates':[{'address':stop} for stop in stops], 'travelMode':'DRIVE',
        'routingPreference':'TRAFFIC_AWARE', 'departureTime':departure.astimezone(timezone.utc).isoformat(),
        'languageCode':'en-IN', 'units':'METRIC'}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post('https://routes.googleapis.com/directions/v2:computeRoutes', json=payload,
                headers={'X-Goog-Api-Key':key, 'X-Goog-FieldMask':'routes.distanceMeters,routes.duration,routes.staticDuration'})
        if response.status_code != 200:
            raise HTTPException(503, 'Google Maps road routing is unavailable. Please try again later.')
        routes = response.json().get('routes', [])
        if not routes:
            raise HTTPException(422, 'No drivable route found between these addresses.')
        route = routes[0]
        seconds = float(route['duration'].removesuffix('s'))
        distance = route['distanceMeters'] / 1000
        if not 0 < distance <= 3000 or not 0 < seconds <= 14 * 86400:
            raise HTTPException(422, 'Route is outside the supported delivery range.')
        return {'distance_km':round(max(distance, 0.1), 1), 'duration_seconds':int(seconds),
                'static_duration_seconds':int(float(route.get('staticDuration', route['duration']).removesuffix('s'))),
                'departure_at':departure.isoformat(), 'source':'google_routes'}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise HTTPException(503, 'Unable to calculate a road route. Please try again later.') from None
