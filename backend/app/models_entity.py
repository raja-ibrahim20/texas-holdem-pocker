# app/models_entity.py
from dataclasses import dataclass
from typing import Any
from datetime import datetime


@dataclass
class HandEntity:
    id: str
    payload_json: dict
    payoffs_json: dict | None
    created_at: datetime = datetime.utcnow()
