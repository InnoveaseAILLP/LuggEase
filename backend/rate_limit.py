"""Shared rolling-window admission using one bounded MongoDB document per user."""
from datetime import timedelta
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

async def enforce_rate_limit(collection, user_id, now, limit=60):
    cutoff=now-timedelta(seconds=60)
    try:
        await collection.update_one({'_id':user_id},{'$pull':{'requests':{'$lte':cutoff}}})
        # Predicate and append are atomic. No worker-local counter can bypass this limit.
        query={'_id':user_id,f'requests.{limit-1}':{'$exists':False}}
        update={'$push':{'requests':now},'$set':{'expires_at':now+timedelta(minutes=2)}}
        try:
            admitted=await collection.find_one_and_update(query,update,upsert=True,
                return_document=ReturnDocument.AFTER,projection={'_id':1})
        except DuplicateKeyError:
            # A concurrent first insert or a full window can collide with the unique _id.
            admitted=await collection.find_one_and_update(query,update,upsert=False,
                return_document=ReturnDocument.AFTER,projection={'_id':1})
    except PyMongoError:
        raise HTTPException(503,'The service is busy. Please try again shortly.') from None
    if admitted is None:
        raise HTTPException(429,'Too many requests. Please wait a minute.',headers={'Retry-After':'60'})
