# app/schemas.py
from pydantic import BaseModel, Field, conlist
from typing import List, Literal


class PlayerIn(BaseModel):
    id: str
    name: str
    stack: int
    cards: str  # e.g. "AsKd" or "As Kd"
    winnings: int


class HandIn(BaseModel):
    id: str
    dealer: str
    smallBlind: str
    bigBlind: str
    players: List[PlayerIn] = Field(..., min_length=2, max_length=6)
    actions: List[str]
    communityCards: List[str] = Field(default_factory=list)
    finalPot: int


class HandStored(BaseModel):
    id: str
    payload: dict
    payoffs: dict | None = None
    created_at: str
