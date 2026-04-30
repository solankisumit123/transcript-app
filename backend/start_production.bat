@echo off
echo ===================================================
echo Starting Transcript API in HIGH PERFORMANCE mode...
echo ===================================================

REM Use multiple workers to utilize all CPU cores (great for high traffic)
REM Set workers to 4 by default (can be adjusted based on your CPU cores)
python -m uvicorn server:app --host 0.0.0.0 --port 8080 --workers 4 --timeout-keep-alive 60

pause
