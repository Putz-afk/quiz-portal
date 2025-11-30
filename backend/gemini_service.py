import os
import json
import asyncio
import time
import random  # Added for randomness
import google.generativeai as genai
from typing import List, Dict, Any
from dotenv import load_dotenv
import uuid

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

class GeminiService:
    def __init__(self):
        # 'gemini-2.5-flash' is good, dont change this.
        self.model = genai.GenerativeModel('gemini-2.5-flash-lite') 
        self.last_request_time = 0
        self.min_interval = 14/60 # 14 requests per minute

    async def generate_questions(self, mode: str, input_text: str, count: int = 10) -> List[Dict[str, Any]]:
        # --- RATE LIMITER ---
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        if time_since_last < self.min_interval:
            wait_time = self.min_interval - time_since_last
            print(f"DEBUG: Rate limit safety. Waiting {wait_time:.2f}s...")
            await asyncio.sleep(wait_time)
        
        self.last_request_time = time.time()

        schema_instruction = """
        You are a quiz engine. Output valid JSON only. 
        Format:
        [
            {
                "question": "The question text",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correct_index": 0, 
                "explanation": "Brief explanation"
            }
        ]
        """

        # --- RANDOMNESS INJECTION ---
        difficulty_variations = ["elementary student", "high schooler", "college level", "expert level", "mixed difficulty"]
        perspectives = ["historical", "scientific", "cultural", "technical", "fun facts"]

        dynamic_guidelines = [
            f"Mix difficulty levels: {', '.join(random.sample(difficulty_variations, 2))}",
            f"Focus on {random.choice(perspectives)} perspective",
            f"Include questions about both well-known and obscure aspects",
            f"Vary the option lengths and structures significantly",
            f"Unique request ID: {uuid.uuid4()}"
        ]

        selected_guidelines = random.sample(dynamic_guidelines, 3)

        if mode == "topic":
            prompt = f"""
                {schema_instruction}
                Create {count} diverse trivia questions about: "{input_text}".
                
                Guidelines:
                1. Language: Strictly in **Bahasa Indonesia**
                2. Content: Prioritize interesting, unusual, and fun facts
                3. {selected_guidelines[0]}
                4. {selected_guidelines[1]}
                5. {selected_guidelines[2]}
                6. Ensure questions don't overlap in content or approach
                """
        else:
            return []

        try:
            # We remove response_mime_type="application/json" temporarily 
            # because sometimes it conflicts with experimental models or older libraries.
            response = await self.model.generate_content_async(prompt)
            
            text_response = response.text
            print(f"DEBUG: Raw AI Response: {text_response[:100]}...") 

            # Clean Markdown formatting
            if "```" in text_response:
                text_response = text_response.replace("```json", "").replace("```", "").strip()

            questions = json.loads(text_response)
            
            print(f"DEBUG: Successfully parsed {len(questions)} questions.")
            return questions
            
        except Exception as e:
            print(f"CRITICAL ERROR in Gemini Service: {e}")
            return [
                {
                    "question": f"The AI failed to generate questions for '{input_text}'. Try a different topic.",
                    "options": ["Ok", "Retry", "Sad", "Bug"],
                    "correct_index": 0,
                    "explanation": f"Error detail: {str(e)}"
                }
            ]