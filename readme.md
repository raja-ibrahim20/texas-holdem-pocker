# **♠️ Full-Stack Texas Hold'em Simulator & Analyzer**

This is a **Full-Stack Texas Hold'em Simulation and Analysis** application. The **frontend** allows the user to play hands against AI or simulate a game, while the **backend** verifies the results using the robust pokerkit engine and stores them as persistent hand history records.

The entire application runs as a cohesive unit managed by **Docker Compose**.

## **🏛️ Architecture Overview**

The project is structured into three primary services that communicate over a shared Docker network:

| Service | Technology | Role | Access Port |
| :---- | :---- | :---- | :---- |
| frontend | Next.js (Node.js) | **Interactive Texas Hold'em interface;** allows user simulation and submits raw hand data for verification. | 3000 |
| backend | FastAPI (Python) | **Verification and Persistence Layer.** Validates hand data, calculates official payoffs using pokerkit, and stores the complete hand history. | 8000 |
| db | PostgreSQL | Persistent storage for all calculated poker hands. | 5432 |

## **🛠️ Quick Start (Prerequisites & Running)**

### **Prerequisites**

* **Docker** and **Docker Compose** installed on your system.

### **1\. Configuration (.env)**

Ensure the .env file in the root directory is present and contains your database credentials:

POSTGRES\_DB=pokerdb

POSTGRES\_PASSWORD=pokerpass

DATABASE\_URL=postgresql://postgres:pokerpass@db:5432/pokerdb

*(The backend service uses these values to connect to the db service.)*

### **2\. Build and Start the Stack**

Run this command from the root directory to build the necessary images and start all three services in detached mode:

docker-compose up \--build \-d

### **3\. Access the Application**

Once the containers are up (this may take a minute or two):

| Component | URL |
| :---- | :---- |
| Frontend App | **http://localhost:3000** |
| Backend API | http://localhost:8000 (FastAPI Docs/Testing) |

### **4\. Stopping and Cleanup**

To stop the containers, remove the network, and delete the database volume (resetting all persistent data):

docker-compose down \-v

## **📂 Project Structure**

.  
.

├── backend

│   ├── Dockerfile.backend

│   ├── README.md

│   ├── app

│   │   ├── \_\_init\_\_.py

│   │   ├── db.py

│   │   ├── main.py

│   │   ├── models\_entity.py

│   │   ├── poker\_service.py

│   │   ├── repository.py

│   │   ├── schemas.py

│   │   └── test\_main.py

│   ├── poetry.lock

│   ├── pyproject.toml

│   ├── sql

│   │   └── init.sql

│   ├── tests

│   └── uv.lock

├── docker-compose.yml

├── frontend

│   ├── Dockerfile.frontend

│   └── poker-app

│       ├── README.md

│       ├── components.json

│       ├── eslint.config.mjs

│       ├── jest.config.js

│       ├── next-env.d.ts

│       ├── next.config.ts

│       ├── package-lock.json

│       ├── package.json

│       ├── postcss.config.mjs

│       ├── public

│       ├── src

│       ├── tailwind.config.ts

│       └── tsconfig.json

└── structure.txt

9 directories, 28 files

## **🧑‍💻 Development & Debugging**

* **View Logs:** To view the combined real-time logs from all services:  
  docker-compose logs \-f

* **Run Backend Tests:** To execute the Python unit and integration tests (using pytest), first exec into the container:  
  docker exec \-it backend sh  
  uv run pytest  
