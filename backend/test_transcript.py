import os
import sys
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.DEBUG)

from transcript_service import fetch_transcript, extract_video_id_safe

video_id = extract_video_id_safe("https://www.youtube.com/watch?v=nO3v518v9zQ") # some video
print(f"Testing video_id: {video_id}")
try:
    res = fetch_transcript(video_id)
    print("SUCCESS!")
    print(res.strategy)
except Exception as e:
    print("FAILED!")
    print(e)
