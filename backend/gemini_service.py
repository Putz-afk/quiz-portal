import os
import json
import asyncio
import time
import random  # Added for randomness
import google.generativeai as genai
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

class GeminiService:
    def __init__(self):
        # 'gemini-2.5-flash' is good, dont change this.
        self.model = genai.GenerativeModel('gemini-2.5-flash') 
        self.last_request_time = 0
        self.min_interval = 2.0 

    async def generate_questions(self, mode: str, input_text: str, count: int = 10) -> List[Dict[str, Any]]:
        # --- RATE LIMITER ---
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        if time_since_last < self.min_interval:
            wait_time = self.min_interval - time_since_last
            print(f"DEBUG: Rate limit safety. Waiting {wait_time:.2f}s...")
            await asyncio.sleep(wait_time)
        
        self.last_request_time = time.time()

        # --- RANDOMNESS INJECTION (Updated) ---
        # Now we assign a specific flavor to EACH question individually
        sub_themes = [
            "obscure and lesser-known facts",
            "historical origins and etymology",
            "scientific properties and biology",
            "cultural significance and myths",
            "record-breaking statistics",
            "surprising misconceptions",
            "weird and wacky details",
            "modern uses and economics",
            "famous events or pop culture references"
        ]
        
        # Generate a list of instructions: "Question 1: History", "Question 2: Science", etc.
        flavor_instructions = "\n".join(
            [f"- Question {i+1}: Focus on {random.choice(sub_themes)}" for i in range(count)]
        )
        
        print(f"DEBUG: Sending prompt for topic: {input_text} with mixed flavors")
        
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

        if mode == "topic":
            prompt = f"""
            {schema_instruction}
            Create {count} trivia questions about: "{input_text}".
            
            Prioritize interesting and unusual facts over common knowledge.
            Create in Bahasa Indonesia.
            """
        # elif mode == "context":
        #     prompt = f"""
        #     {schema_instruction}
        #     Create {count} questions based STRICTLY on this text:
        #     {input_text}
        #     """
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