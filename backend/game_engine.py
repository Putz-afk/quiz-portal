import random
import string
import asyncio
from typing import Dict, List, Optional, Union
from pydantic import BaseModel

# --- Data Models ---
class Player(BaseModel):
    id: str
    name: str
    score: int = 0
    is_host: bool = False
    is_connected: bool = True
    has_answered: bool = False

class Question(BaseModel):
    question: str
    options: List[str]
    correct_index: int
    explanation: str

class GameState:
    WAITING = "WAITING"
    GENERATING = "GENERATING"
    PLAYING = "PLAYING"
    REVEAL = "REVEAL" # New state: Everyone answered, showing results
    FINISHED = "FINISHED"

# --- Core Logic ---
class GameLobby:
    def __init__(self, room_code: str):
        self.room_code = room_code
        self.players: Dict[str, Player] = {}
        self.state = GameState.WAITING
        # questions can be Pydantic models OR dictionaries depending on source
        self.questions: List[Union[Question, dict]] = []
        self.current_question_index = 0
        self.topic = ""
    
    def add_player(self, player_id: str, name: str) -> Player:
        # If player rejoins, recover their stats but mark connected
        if player_id in self.players:
            self.players[player_id].is_connected = True
            return self.players[player_id]

        is_first = len(self.players) == 0
        player = Player(id=player_id, name=name, is_host=is_first)
        self.players[player_id] = player
        return player
    
    def handle_disconnect(self, player_id: str):
        """Marks player as disconnected and migrates host if needed"""
        if player_id in self.players:
            player = self.players[player_id]
            player.is_connected = False
            
            # Host Migration: If host leaves, pick the next connected player
            if player.is_host:
                player.is_host = False
                for p_id, p in self.players.items():
                    if p.is_connected:
                        p.is_host = True
                        break # Found a new host

    def remove_player(self, player_id: str):
        if player_id in self.players:
            del self.players[player_id]
            # Logic to reassign host could go here

    def submit_answer(self, player_id: str, answer_index: int) -> bool:
        """Records answer but checks if round is complete"""
        if self.state != GameState.PLAYING:
            return False
        
        player = self.players[player_id]
        if player.has_answered:
            return False # Prevent double answers

        player.has_answered = True
        
        current_q = self.questions[self.current_question_index]
        
        # Determine correct index safely
        if isinstance(current_q, dict):
            correct_idx = current_q.get('correct_index')
        else:
            correct_idx = current_q.correct_index
            
        if answer_index == correct_idx:
            player.score += 10
            return True
        return False
    
    def check_all_answered(self) -> bool:
        """Returns True if all CONNECTED players have answered"""
        connected_players = [p for p in self.players.values() if p.is_connected]
        if not connected_players:
            return False
        return all(p.has_answered for p in connected_players)

    def next_question(self) -> Optional[Union[Question, dict]]:
        self.current_question_index += 1
        
        # Reset answer status for next round
        for p in self.players.values():
            p.has_answered = False

        if self.current_question_index < len(self.questions):
            return self.questions[self.current_question_index]
        else:
            self.state = GameState.FINISHED
            return None

class GameManager:
    def __init__(self):
        self.active_games: Dict[str, GameLobby] = {}

    def create_game(self) -> str:
        """Generates a 4-letter code and creates a lobby"""
        code = "".join(random.choices(string.ascii_uppercase, k=4))
        # Ensure uniqueness
        while code in self.active_games:
            code = "".join(random.choices(string.ascii_uppercase, k=4))
        
        self.active_games[code] = GameLobby(code)
        return code

    def get_game(self, room_code: str) -> Optional[GameLobby]:
        return self.active_games.get(room_code)