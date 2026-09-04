@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Keep this file ASCII-only. UTF-8 Chinese breaks cmd (GBK) and can corrupt paths.

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
  echo [ERROR] Python 3.8 not found.
  echo Install/activate conda env live_autocomm, or install Python 3.8 x64.
  echo Manual:
  echo   "%CONDA_PY%" -m boguanjia
  echo.
  pause
  exit /b 1
)

echo Using: %PYEXE%
"%PYEXE%" -c "import sys; print('Python', sys.version)"
if errorlevel 1 (
  echo [ERROR] Failed to run interpreter.
  pause
  exit /b 1
)

REM Ensure package is importable; install editable if missing
"%PYEXE%" -c "import boguanjia" 1>nul 2>nul
if errorlevel 1 (
  echo Installing package into interpreter...
  "%PYEXE%" -m pip install -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com -r "%~dp0requirements.txt"
  if errorlevel 1 (
    echo [ERROR] pip install requirements failed.
    pause
    exit /b 1
  )
  "%PYEXE%" -m pip install -e "%~dp0."
  if errorlevel 1 (
    echo [ERROR] pip install -e . failed.
    pause
    exit /b 1
  )
)

REM Mitigate QtWebEngine Access Violation (0xC0000005 / -1073741819) on some GPUs
if not defined QTWEBENGINE_CHROMIUM_FLAGS (
  set "QTWEBENGINE_CHROMIUM_FLAGS=--disable-gpu --disable-gpu-compositing --disable-features=VizDisplayCompositor"
)

echo Starting boguanjia...
"%PYEXE%" -m boguanjia
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo [ERROR] Exit code %RC%.
  if "%RC%"=="-1073741819" (
    echo This is often a Qt WebEngine GPU crash. Retry after:
    echo   1^) Close all Boguanjia windows
    echo   2^) Delete folder: "%~dp0data\web_profile\GPUCache"
    echo   3^) Run run.bat again
  )
  echo Or reinstall deps:
  echo   "%PYEXE%" -m pip install -r "%~dp0requirements.txt"
  echo   "%PYEXE%" -m pip install -e "%~dp0."
  echo.
  pause
  exit /b %RC%
)

endlocal
exit /b 0
