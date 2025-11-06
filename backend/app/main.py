# app/main.py
import os
import logging
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import JSONResponse
from .schemas import HandIn, HandStored
from .repository import HandRepository
from .models_entity import HandEntity
from .poker_service import compute_payoffs_using_pokerkit, validate_hand_payload

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Poker Backend")


def get_repository() -> HandRepository:
    return HandRepository()  # reads DATABASE_URL from env


@app.post("/hands")
def post_hand(payload: dict, repo: HandRepository = Depends(get_repository)):
    # basic validation using pydantic
    is_valid, msg = validate_hand_payload(payload)
    if not is_valid:
        raise HTTPException(status_code=400, detail=msg)

    print(payload)
    print("Payload validated successfully")

    # try compute payoffs
    payoffs = None
    try:
        payoffs_map = compute_payoffs_using_pokerkit(payload)  # write this
        payoffs = payoffs_map
        print("Payoffs computed:", payoffs)
    except Exception as e:
        # return server error with helpful message
        logger.exception("pokerkit failed")
        raise HTTPException(status_code=500, detail=f"pokerkit evaluation error: {e}")

    # build entity and persist
    hand_entity = HandEntity(
        id=payload["id"], payload_json=payload, payoffs_json=payoffs
    )
    saved = repo.save(hand_entity)
    print("Hand saved with id:", saved.id)

    return JSONResponse({"message": "Hand saved", "id": saved.id, "payoffs": payoffs})


@app.get("/hands")
def get_hands(repo: HandRepository = Depends(get_repository)):
    hands = repo.list_all()
    # return list of simple dicts
    return [
        {
            "id": h.id,
            "payload": h.payload_json,
            "payoffs": h.payoffs_json,
            "created_at": h.created_at.isoformat(),
        }
        for h in hands
    ]
