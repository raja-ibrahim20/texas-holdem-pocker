# app/repository.py
import os
import json
import psycopg2
import psycopg2.extras
from typing import List
from .models_entity import HandEntity

DB_URL = os.getenv("DATABASE_URL")  ## "postgresql://ibrahim@localhost:5432/pokerdb"  ##


class HandRepository:
    def __init__(self, db_url: str | None = None):
        url = db_url or DB_URL
        if not url:
            raise RuntimeError("DATABASE_URL not provided (set environment variable).")
        self._db_url = url

    def _get_conn(self):
        # psycopg2.connect accepts a DSN string
        return psycopg2.connect(self._db_url)

    def save(self, hand: HandEntity) -> HandEntity:
        conn = self._get_conn()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO hands (id, payload, payoffs, created_at)
                        VALUES (%s, %s::jsonb, %s::jsonb, NOW())
                        RETURNING created_at
                        """,
                        (
                            hand.id,
                            json.dumps(hand.payload_json),
                            (
                                json.dumps(hand.payoffs_json)
                                if hand.payoffs_json is not None
                                else None
                            ),
                        ),
                    )
                    created_at = cur.fetchone()[0]
                    hand.created_at = created_at
            return hand
        finally:
            conn.close()

    def list_all(self) -> List[HandEntity]:
        conn = self._get_conn()
        try:
            with conn:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute(
                        "SELECT id, payload, payoffs, created_at FROM hands ORDER BY created_at DESC;"
                    )
                    rows = cur.fetchall()
                    res = []
                    for r in rows:
                        res.append(
                            HandEntity(
                                id=r["id"],
                                payload_json=r["payload"],
                                payoffs_json=r["payoffs"],
                                created_at=r["created_at"],
                            )
                        )
                    return res
        finally:
            conn.close()
