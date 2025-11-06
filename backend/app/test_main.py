import pytest
from fastapi.testclient import TestClient
from datetime import datetime
from typing import List

# Import your FastAPI app and the dependency we need to override
from .main import app, get_repository

# Import the repository class and entity we need to mock
from .repository import HandRepository
from .models_entity import HandEntity

# --- Mock Data and Dependencies ---

# 1. Create a minimal mock payload that the repository would return
MOCK_PAYLOAD = {
    "id": "test-payload-id",
    "dealer": "Player 1",
    "smallBlind": "Player 2",
    "bigBlind": "Player 3",
    "players": [],
    "actions": [],
    "communityCards": [],
    "finalPot": 100,
}
MOCK_PAYOFFS = {"p1": 100, "p2": -50, "p3": -50}

# 2. Create a mock entity (this is what the real repository returns)
mock_entity = HandEntity(
    id="test-uuid-123",
    payload_json=MOCK_PAYLOAD,
    payoffs_json=MOCK_PAYOFFS,
    created_at=datetime.utcnow(),
)


# 3. Create a Mock Repository class
class MockHandRepository(HandRepository):
    """A mock repository that returns fake data instead of hitting the DB."""

    def __init__(self):
        # We don't call super().__init__() so it never tries to read DATABASE_URL
        pass

    def list_all(self) -> List[HandEntity]:
        # Return a list containing our single mock entity
        return [mock_entity]

    def save(self, hand: HandEntity) -> HandEntity:
        # A simple mock save that just returns the hand
        return hand


# 4. Override the dependency
# This tells FastAPI: "When get_repository is called, use MockHandRepository instead."
app.dependency_overrides[get_repository] = lambda: MockHandRepository()


# --- Test Client ---
client = TestClient(app)

# --- The Test ---


def test_get_hands_returns_list_of_hands():
    """
    A simple test to ensure the GET /hands endpoint
    1. Returns a 200 OK status
    2. Returns a list
    3. The list contains our mock hand data
    """
    # 1. Act: Call the API endpoint
    response = client.get("/hands")

    # 2. Assert: Check the response
    assert response.status_code == 200

    data = response.json()

    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["id"] == "test-uuid-123"
    assert data[0]["payload"]["id"] == "test-payload-id"
    assert data[0]["payoffs"]["p1"] == 100
    assert "created_at" in data[0]
