# **🐍 Poker Hand History Backend (FastAPI)**

This service is a Python API built with **FastAPI** that handles the core business logic of the Poker App: receiving raw hand history data, validating it, computing the hand's true results using pokerkit, and persisting the results to the PostgreSQL database.

## **🚀 Technology Stack**

| Component | Purpose |
| :---- | :---- |
| **Framework** | **FastAPI** (Python) for high-performance API routes. |
| **Logic Engine** | **pokerkit** library for robust hand parsing and payoff calculation. |
| **Dependency Mgmt** | **uv** for fast and efficient dependency resolution and execution. |
| **Database** | **PostgreSQL** (via psycopg2) for persistence. |
| **Containerization** | **Docker** and **Uvicorn** (as the ASGI server). |

## **🛠️ Local Setup (Using uv)**

If you need to run or test the backend *outside* of Docker (e.g., for faster debugging):

1. **Install Dependencies:** Ensure you are in the backend/ directory and have uv installed.  
   uv sync

2. **Set Environment:** The application requires the DATABASE\_URL environment variable. You'll need to source this or pass it directly. *Example local URL:* export DATABASE\_URL="postgresql://postgres:devpassword@localhost:5432/pokerdb" *(Note: This assumes your PostgreSQL database is running and accessible on port 5432).*  
3. **Run the Server:**  
   uv run uvicorn app.main:app \--reload \--host 0.0.0.0 \--port 8000

## **🐳 Running within Docker Compose**

This is the preferred method, as the database and service networking are handled automatically.

1. From the project root directory, run:  
   docker-compose up \--build \-d backend

2. The service will be accessible via the Docker network at http://backend:8000 (from the frontend) and via your host machine at http://localhost:8000.

## **📜 API Endpoints**

The API is responsible for persistence and complex poker calculations.

| Method | Endpoint | Description | Details |
| :---- | :---- | :---- | :---- |
| POST | /hands | **Submit Hand History.** Validates the incoming raw hand data, uses pokerkit to calculate the final payoffs, and saves the complete record to the PostgreSQL hands table. | **Request Body:** HandHistoryEntry (JSON payload) |
| GET | /hands | **List All Hands.** Retrieves a list of all recorded poker hands from the database, ordered by creation time. | **Response Body:** HandRecord\[\] (List of saved entities) |
| GET | /hands/{id} | **Retrieve Single Hand.** Fetches a specific saved hand record by its unique ID. | **Response Body:** HandRecord (Single saved entity) |

## **✅ Testing**

Tests are written using **pytest** and utilize FastAPI's TestClient for isolated testing. We use dependency injection to **mock** the HandRepository, ensuring tests do not hit the actual database.

1. Ensure dependencies (pytest, httpx) are installed via uv sync.  
2. Run tests from the backend/ directory:  
   uv run pytest  
