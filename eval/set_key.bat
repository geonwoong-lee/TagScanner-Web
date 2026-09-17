@echo off
echo.
echo  Paste your Google Vision API key and press Enter.
echo  (Paste = Ctrl+V or right-click)
echo.
set /p KEY=KEY: 
if "%KEY%"=="" (
  echo  No key entered. Close this window and run again.
  pause
  exit /b 1
)
setx GOOGLE_VISION_API_KEY "%KEY%" >nul
echo.
echo  DONE! Close this window.
pause
