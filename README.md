# QuizPortal: AI-Powered Multiplayer Trivia Platform

**QuizPortal** is a real-time, multiplayer quiz application that leverages Generative AI to create unlimited trivia content on the fly. Designed as a "bring-your-own-device" party game, it allows users to host game sessions where questions are generated instantly based on any topic provided.

## 🌟 Key Features

* **Generative AI Engine:** Integrated with **Google Gemini 1.5 Flash** to generate unique, context-aware trivia questions in Bahasa Indonesia.
* **Real-Time Multiplayer:** Full WebSocket implementation for sub-second state synchronization between Host and Clients.
* **Robust Game State Management:** Handles edge cases like player disconnections, late joiners, and automatic Host migration to prevent soft-locks.
* **Democratic Gameplay:** "Wait-for-all" answering logic and synchronized reveal phases to ensure fairness.
* **Responsive UI:** Mobile-first React frontend designed for seamless play on smartphones.

## 🛠️ Technical Stack

### Backend (Python)
* **Framework:** FastAPI (High-performance, async-ready).
* **Communication:** WebSockets (Real-time bi-directional events).
* **AI Integration:** Google Generative AI SDK (`google-generativeai`).
* **State Management:** In-memory object-based state machine.

### Frontend (JavaScript)
* **Framework:** React (Vite).
* **Styling:** CSS-in-JS for component-scoped dynamic styling.
* **Icons:** Lucide-React.

### Infrastructure (Hybrid Architecture)
* **Tunneling:** Ngrok (Exposing local WebSocket server securely).
* **Hosting:** GitHub Pages (Static frontend serving).

## 🏗️ Architecture Note

To maintain zero operating costs while supporting persistent WebSocket connections, this project utilizes a **Hybrid Deployment Strategy**:
1.  **The Backend** runs as a local server, tunneled securely to the public internet via **Ngrok**. This allows for persistent state and low-latency WebSocket handling without expensive cloud socket instance costs.
2.  **The Frontend** is a stateless Single Page Application (SPA) hosted globally on **GitHub Pages**.

## 🚀 Installation & Launch Guide

If you want to run this project locally or host a session for friends, follow the steps below.

### Prerequisites
1.  **Python 3.10+** installed.
2.  **Node.js** installed.
3.  **Ngrok** installed and authenticated.
4.  A **Google Gemini API Key**.

### Step 1: Start the Brain (Backend)
1.  Navigate to the project root.
2.  Activate your virtual environment (Windows: `.\venv\Scripts\activate`).
3.  Run the FastAPI server:
    ```bash
    uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
    ```

### Step 2: Open the Tunnel (Ngrok)
1.  Open a second terminal window.
2.  Create a public tunnel to your local backend:
    ```bash
    ngrok http 8000
    ```
3.  **Copy the Forwarding URL** (e.g., `https://a1b2-c3d4.ngrok-free.app`).
    * *Note: Ensure you copy the `https` link.*

### Step 3: Configure Frontend
1.  Open `frontend/src/App.jsx`.
2.  Update the `API_URL` constant with your active Ngrok URL:
    ```javascript
    const API_URL = "[https://your-new-url.ngrok-free.app](https://your-new-url.ngrok-free.app)"; 
    ```
    *(Ensure no trailing slash `/` is included).*

### Step 4: Launch Frontend
You can run the frontend locally or deploy it.

**Option A: Run Locally**
```bash
cd frontend
npm run dev
```

**Option B: Deploy to GitHub Pages**
```bash
cd frontend
npm run deploy
```

## 🎮 How to Play

1. **Host**: Keep the Python and Ngrok terminal windows open.
2. **Players**: Access the Frontend URL (Localhost or GitHub Pages link).
3. **Enjoy**: Enter a topic (e.g., "Sejarah Makassar") and let the AI build the quiz!

## ❓ Troubleshooting

* **"Site can't be reached"**: Check if the Ngrok URL in App.jsx matches the currently running Ngrok session.
* **Red Offline Icon**: Ensure the Python backend is running without errors.
* **Connection Issues**: If playing via LAN or Ngrok, ensure your Windows Firewall allows python.exe and ngrok.exe on Private Networks.
