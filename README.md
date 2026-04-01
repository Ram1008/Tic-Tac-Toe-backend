# Tic-Tac-Toe Multiplayer (Backend)

The Nakama-powered authoritative server for real-time Tic-Tac-Toe games. Handles match logic, win/loss recording, and timed game modes.

## 🚀 Setup and Installation

### Prerequisites
- **Docker Desktop**: v4.0.0 or later
- **Docker Compose**: Installed and running

### Quick Start
1.  **Clone the repository**.
2.  **Navigate to the backend directory**:
    ```bash
    cd tic-tac-toe-backend
    ```
3.  **Start Services**:
    ```bash
    docker compose up -d
    ```
4.  **Verify Setup**:
    - **Nakama API**: [http://127.0.0.1:7350](http://127.0.0.1:7350)
    - **Nakama Console**: [http://127.0.0.1:7351](http://127.0.0.1:7351) (User: `admin`, Pass: `password`)
    - **PostgreSQL**: Accessible on port **5433** (configured to avoid local conflicts).

---

## 🏗️ Architecture and Design Decisions

### Tech Stack
- **Server**: Nakama 3.17.0 (Heroic Labs)
- **Database**: PostgreSQL 13
- **Runtime**: JavaScript (Nakama runtime)

### Design Strategy
- **Authoritative Match Logic**: The server handles all game calculations (wins, draws, valid moves).
- **Match Labeling**: Matches use a JSON-encoded label (`{"gameCode": "XYZ123", "mode": "timed", "status": "open"}`) for dynamic discovery and filtering.
- **Timed Mode**: A server-side 30-second timer per move, strictly enforced to prevent client-side manipulation.

---

## 🌐 API/Server Configuration

The backend provides several key functionalities through the Nakama SDK:
-   **RPC `create_match`**:
    - Expects: `{ "mode": "classic" | "timed" }`
    - Returns: `{ "matchId": "...", "gameCode": "..." }`
-   **RPC `find_match_by_code`**:
    - Expects: `{ "code": "...", "mode": "..." }`
    - Returns: `{ "matchId": "..." }`
-   **Match Handlers**: Implementation of `match_init`, `match_join`, `match_loop`, and `match_terminate`.

### Shared Port Configurations:
- **7350**: Client API (gRPC/Websockets)
- **7351**: Web Console
- **5433**: Local PostgreSQL host port

---

## 🛠️ How to Test Multiplayer

Testing the backend directly:
1.  **Use the Nakama Console**: Navigate to [http://localhost:7351/](http://localhost:7351/) to inspect active matches and leaderboards.
2.  **API Explorer**: Use the built-in API Explorer in the console to test the `create_match` and `find_match_by_code` RPCs manually.
3.  **Multiple Clients**: Connect two separate frontend instances to verify real-time state synchronization via the `match_loop`.

---

## 🚢 Deployment Process

### Heroic Cloud
The easiest way to deploy is through [Heroic Cloud](https://heroiclabs.com/cloud/).
1.  Sync your repository to a Heroic Cloud project.
2.  Set up the managed PostgreSQL instance.
3.  Deploy!

### Self-Hosting (Linux/Docker)
1.  Provision a Linux VPS.
2.  Install Docker and Docker Compose.
3.  Clone this repository and run `docker compose up -d`.
4.  Ensure ports 7350 and 7351 are open in your cloud firewall.

---

## 📊 Leaderboard Configuration

The backend initializes a `global_rankings` leaderboard on startup with:
- **Sort Order**: Descending (best wins first).
- **Operator**: Increment (total win count).
- **Metadata**: Stores `losses` and current `streak` values for every player.
