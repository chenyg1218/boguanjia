@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Keep this file ASCII-only. UTF-8 Chinese breaks cmd (GBK).

set "PYEXE="
set "CONDA_PY=D:\Software\miniconda3\envs\live_autocomm\python.exe"

REM 1) Prefer known conda env live_autocomm (Python 3.8)
if exist "%CONDA_PY%" set "PYEXE=%CONDA_PY%"

REM 2) Else use project .venv only when it is Python 3.8
if not defined PYEXE if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" -c "import sys; raise SystemExit(0 if sys.version_info[:2]==(3,8) else 1)" 1>nul 2>nul
  if not errorlevel 1 set "PYEXE=%~dp0.venv\Scripts\python.exe"
)

REM 3) Else first python on PATH that is 3.8
if not defined PYEXE (
  where python >nul 2>&1
  if not errorlevel 1 (
    for /f "delims=" %%p in ('where python') do (
      if not defined PYEXE (
        "%%p" -c "import sys; raise SystemExit(0 if sys.version_info[:2]==(3,8) else 1)" 1>nul 2>nul
        if not errorlevel 1 set "PYEXE=%%p"
      )
    )
  )
)

if not defined PYEXE (
  echo [ERROR] Python 3.8 not found. Win7 packaging requires Python 3.8 x64.
  echo Install/activate conda env live_autocomm, then retry.
  echo Manual:
  echo   "%CONDA_PY%" scripts\build_exe.py
  echo.
  pause
  exit /b 1
)

echo Using: %PYEXE%
"%PYEXE%" -c "import sys; print('Python', sys.version)"

REM Ensure build deps
"%PYEXE%" -c "import PyInstaller, PySide2, certifi" 1>nul 2>nul
if errorlevel 1 (
  echo Installing requirements into Python 3.8 env...
  "%PYEXE%" -m pip install -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com -r "%~dp0requirements.txt"
  if errorlevel 1 (
    echo [ERROR] pip install requirements failed.
    pause
    exit /b 1
  )
)

echo Building...
"%PYEXE%" "%~dp0scripts\build_exe.py"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo [ERROR] Build failed, exit code %RC%.
  pause
  exit /b %RC%
)

echo.
echo Done. Output: "%~dp0dist\"
pause
endlocal
exit /b 0
