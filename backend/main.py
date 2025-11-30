import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
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
    
    # 1. Broadcast Join (Standard procedure)
    await manager.broadcast({
        "type": "PLAYER_UPDATE",
        "players": [p.dict() for p in game.players.values()]
    }, room_code)

    # --- THE FIX: CATCH-UP LOGIC ---
    # If the game is already in progress, manually sync THIS player immediately.
    if game.state in [GameState.PLAYING, GameState.REVEAL]:
        # A. Send them the current question so they leave the lobby
        current_q = game.questions[game.current_question_index]
        await websocket.send_json({
            "type": "NEW_QUESTION",
            "question": current_q,
            "index": game.current_question_index,
            "total": len(game.questions)
        })

        # B. Restore their personal state (Did they already answer?)
        player = game.players.get(player_id)
        if player and player.has_answered:
            # Send an ACK so their frontend knows to lock the buttons
            await websocket.send_json({
                "type": "ANSWER_ACK",
                "correct": None # Don't reveal yet, just lock UI
            })

        # C. If the round is already over (Reveal phase), show them the answer
        if game.state == GameState.REVEAL:
             await websocket.send_json({
                "type": "ROUND_REVEAL",
                "players": [p.dict() for p in game.players.values()]
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
                
                # Reset answers for safety
                for p in game.players.values(): p.has_answered = False

                if questions:
                    await manager.broadcast({
                        "type": "NEW_QUESTION",
                        "question": questions[0],
                        "index": 0,
                        "total": len(questions)
                    }, room_code)

            elif action == "SUBMIT_ANSWER":
                answer_index = payload.get("index")
                is_correct = game.submit_answer(player_id, answer_index)
                
                # 1. Send immediate ack to THIS player only
                await websocket.send_json({
                    "type": "ANSWER_ACK",
                    "correct": is_correct 
                })

                # 2. Broadcast updated player list 
                await manager.broadcast({
                    "type": "PLAYER_UPDATE",
                    "players": [p.dict() for p in game.players.values()]
                }, room_code)

                # 3. Check if EVERYONE is done
                if game.check_all_answered():
                    game.state = GameState.REVEAL
                    await manager.broadcast({
                        "type": "ROUND_REVEAL",
                        "players": [p.dict() for p in game.players.values()]
                    }, room_code)

            elif action == "NEXT_QUESTION":
                next_q = game.next_question()
                if next_q:
                    game.state = GameState.PLAYING
                    await manager.broadcast({
                        "type": "NEW_QUESTION",
                        "question": next_q,
                        "index": game.current_question_index,
                        "total": len(game.questions)
                    }, room_code)
                    
                    # Refresh player list to remove checkmarks
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
                # Reset game state for a new round
                game.state = GameState.WAITING
                game.questions = []
                game.current_question_index = 0
                
                # Reset player scores and flags
                for p in game.players.values():
                    p.score = 0
                    p.has_answered = False
                
                # Notify everyone to go to Lobby
                await manager.broadcast({
                    "type": "STATUS_UPDATE",
                    "state": "WAITING"
                }, room_code)

                # Update player list (scores reset to 0)
                await manager.broadcast({
                    "type": "PLAYER_UPDATE",
                    "players": [p.dict() for p in game.players.values()]
                }, room_code)

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_code)
        game.handle_disconnect(player_id)
        
        # Broadcast the disconnect AND the potential new host
        await manager.broadcast({
            "type": "PLAYER_UPDATE",
            "players": [p.dict() for p in game.players.values()]
        }, room_code)
        
        # EDGE CASE CHECK:
        # If the person who left was the ONLY one holding up the game,
        # we must check if we should proceed to REVEAL immediately.
        if game.state == GameState.PLAYING and game.check_all_answered():
            game.state = GameState.REVEAL
            await manager.broadcast({
                "type": "ROUND_REVEAL",
                "players": [p.dict() for p in game.players.values()]
            }, room_code)