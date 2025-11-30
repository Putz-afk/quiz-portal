import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Union
import json

from .game_engine import GameManager, GameState
from .gemini_service import GeminiService

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

game_manager = GameManager()
gemini_service = GeminiService()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_code: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = []
        self.active_connections[room_code].append(websocket)

    def disconnect(self, websocket: WebSocket, room_code: str):
        if room_code in self.active_connections:
            if websocket in self.active_connections[room_code]:
                self.active_connections[room_code].remove(websocket)
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

    async def broadcast(self, message: dict, room_code: str):
        if room_code in self.active_connections:
            for connection in self.active_connections[room_code]:
                await connection.send_json(message)

manager = ConnectionManager()

# --- SECURITY HELPER ---
def get_public_question(q: Union[dict, object]) -> dict:
    """Removes the answer key from the question object"""
    # Handle Pydantic model or Dict
    if hasattr(q, "dict"): 
        q = q.dict()
    
    return {
        "question": q["question"],
        "options": q["options"],
        # We deliberately EXCLUDE 'correct_index' and 'explanation'
    }

def get_full_question(q: Union[dict, object]) -> dict:
    """Returns everything (used only for REVEAL phase)"""
    if hasattr(q, "dict"): 
        q = q.dict()
    return q
# -----------------------

@app.get("/")
def read_root():
    return {"status": "QuizPortal API is running"}

@app.post("/create-room")
def create_room():
    room_code = game_manager.create_game()
    return {"room_code": room_code}

@app.get("/check-room/{room_code}")
def check_room(room_code: str):
    game = game_manager.get_game(room_code)
    if not game:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"exists": True, "players": len(game.players)}

@app.websocket("/ws/{room_code}/{player_name}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_name: str):
    game = game_manager.get_game(room_code)
    if not game:
        await websocket.close(code=4000)
        return

    player_id = player_name
    game.add_player(player_id, player_name)
    
    await manager.connect(websocket, room_code)
    
    await manager.broadcast({
        "type": "PLAYER_UPDATE",
        "players": [p.dict() for p in game.players.values()]
    }, room_code)

    # --- CATCH-UP LOGIC (SECURED) ---
    if game.state in [GameState.PLAYING, GameState.REVEAL]:
        current_q = game.questions[game.current_question_index]
        
        # If REVEAL, send everything. If PLAYING, send only public data.
        if game.state == GameState.REVEAL:
            question_payload = get_full_question(current_q)
        else:
            question_payload = get_public_question(current_q)

        await websocket.send_json({
            "type": "NEW_QUESTION",
            "question": question_payload,
            "index": game.current_question_index,
            "total": len(game.questions)
        })

        player = game.players.get(player_id)
        if player and player.has_answered:
            await websocket.send_json({
                "type": "ANSWER_ACK",
                "correct": None 
            })

        if game.state == GameState.REVEAL:
             # If reconnecting during reveal, send the answer key immediately
             full_q_data = get_full_question(current_q)
             await websocket.send_json({
                "type": "ROUND_REVEAL",
                "players": [p.dict() for p in game.players.values()],
                "correct_index": full_q_data['correct_index'],
                "explanation": full_q_data.get('explanation', '')
            })

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            payload = data.get("payload")

            if action == "START_GAME":
                game.state = GameState.GENERATING
                await manager.broadcast({"type": "STATUS_UPDATE", "state": "GENERATING"}, room_code)
                
                topic = payload.get("topic", "General Knowledge")
                mode = payload.get("mode", "topic")
                questions = await gemini_service.generate_questions(mode, topic)
                game.questions = questions
                game.state = GameState.PLAYING
                
                for p in game.players.values(): p.has_answered = False

                if questions:
                    # SECURE BROADCAST: Use public question only
                    await manager.broadcast({
                        "type": "NEW_QUESTION",
                        "question": get_public_question(questions[0]), 
                        "index": 0,
                        "total": len(questions)
                    }, room_code)

            elif action == "SUBMIT_ANSWER":
                answer_index = payload.get("index")
                is_correct = game.submit_answer(player_id, answer_index)
                
                await websocket.send_json({
                    "type": "ANSWER_ACK",
                    "correct": is_correct 
                })

                await manager.broadcast({
                    "type": "PLAYER_UPDATE",
                    "players": [p.dict() for p in game.players.values()]
                }, room_code)

                if game.check_all_answered():
                    game.state = GameState.REVEAL
                    
                    # SECURE BROADCAST: Now we send the answer key
                    current_q_obj = game.questions[game.current_question_index]
                    full_data = get_full_question(current_q_obj)
                    
                    await manager.broadcast({
                        "type": "ROUND_REVEAL",
                        "players": [p.dict() for p in game.players.values()],
                        "correct_index": full_data['correct_index'],
                        "explanation": full_data.get('explanation', '')
                    }, room_code)

            elif action == "NEXT_QUESTION":
                next_q = game.next_question()
                if next_q:
                    game.state = GameState.PLAYING
                    # SECURE BROADCAST
                    await manager.broadcast({
                        "type": "NEW_QUESTION",
                        "question": get_public_question(next_q),
                        "index": game.current_question_index,
                        "total": len(game.questions)
                    }, room_code)
                    
                    await manager.broadcast({
                        "type": "PLAYER_UPDATE",
                        "players": [p.dict() for p in game.players.values()]
                    }, room_code)
                else:
                    await manager.broadcast({
                        "type": "GAME_OVER",
                        "players": [p.dict() for p in game.players.values()]
                    }, room_code)
            
            elif action == "RESET_LOBBY":
                game.state = GameState.WAITING
                game.questions = []
                game.current_question_index = 0
                for p in game.players.values():
                    p.score = 0
                    p.has_answered = False
                
                await manager.broadcast({
                    "type": "STATUS_UPDATE",
                    "state": "WAITING"
                }, room_code)

                await manager.broadcast({
                    "type": "PLAYER_UPDATE",
                    "players": [p.dict() for p in game.players.values()]
                }, room_code)

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_code)
        game.handle_disconnect(player_id)
        
        await manager.broadcast({
            "type": "PLAYER_UPDATE",
            "players": [p.dict() for p in game.players.values()]
        }, room_code)
        
        if game.state == GameState.PLAYING and game.check_all_answered():
            game.state = GameState.REVEAL
            
            # EDGE CASE: Secure reveal on disconnect
            current_q_obj = game.questions[game.current_question_index]
            full_data = get_full_question(current_q_obj)

            await manager.broadcast({
                "type": "ROUND_REVEAL",
                "players": [p.dict() for p in game.players.values()],
                "correct_index": full_data['correct_index'],
                "explanation": full_data.get('explanation', '')
            }, room_code)