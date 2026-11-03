@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem Creates the Conda environment this app needs and installs its requirements.
rem
rem The app pins Python 3.10 because that is what the dependency set targets.
rem Python 3.13 and newer cannot work: rookiepy (used to read browser cookies)
rem ships no wheels for them, so pip falls back to compiling a Rust extension
rem and fails. 3.8 - 3.12 all work, 3.10 is the tested default.
rem
rem Run this once. Afterwards start_web_app.bat picks the environment up on its
rem own - from an Anaconda Prompt, or from a plain cmd window.
rem ---------------------------------------------------------------------------

set "ENV_NAME=coursera_env"
set "PY_VERSION=3.10"

echo ============================================================
echo  Setting up "%ENV_NAME%" (Python %PY_VERSION%)
echo ============================================================
echo.

rem --- Step 1: find conda ----------------------------------------------------
set "CONDA_EXE_PATH="
for /f "delims=" %%C in ('where conda 2^>nul') do if not defined CONDA_EXE_PATH set "CONDA_EXE_PATH=%%C"
if defined CONDA_EXE_PATH goto have_conda

for %%B in (
  "%USERPROFILE%\anaconda3\Scripts\conda.exe"
  "%USERPROFILE%\miniconda3\Scripts\conda.exe"
  "%USERPROFILE%\miniforge3\Scripts\conda.exe"
  "%ProgramData%\anaconda3\Scripts\conda.exe"
  "%ProgramData%\miniconda3\Scripts\conda.exe"
  "%LOCALAPPDATA%\anaconda3\Scripts\conda.exe"
) do if not defined CONDA_EXE_PATH if exist "%%~B" set "CONDA_EXE_PATH=%%~B"

if not defined CONDA_EXE_PATH goto no_conda
:have_conda
echo Found conda:
echo   %CONDA_EXE_PATH%
echo.

rem --- Step 2: create the environment if it is missing -----------------------
set "ENV_EXISTS="
rem usebackq keeps the quoted conda path intact when it contains spaces
for /f "usebackq delims=" %%E in (`call "%CONDA_EXE_PATH%" env list 2^>nul`) do (
  for /f "tokens=1 delims= " %%N in ("%%E") do (
    if /I "%%N"=="%ENV_NAME%" set "ENV_EXISTS=1"
  )
)

if defined ENV_EXISTS (
  echo The environment "%ENV_NAME%" already exists, reusing it.
) else (
  echo Creating the environment. This downloads Python %PY_VERSION%, so it can
  echo take a few minutes...
  echo.
  call "%CONDA_EXE_PATH%" create -n "%ENV_NAME%" python=%PY_VERSION% -y
  if errorlevel 1 goto create_failed
)
echo.

rem --- Step 3: install the requirements --------------------------------------
echo Installing requirements into "%ENV_NAME%"...
echo.
call "%CONDA_EXE_PATH%" run -n "%ENV_NAME%" python -m pip install --upgrade pip
call "%CONDA_EXE_PATH%" run -n "%ENV_NAME%" python -m pip install -r requirements.txt
if errorlevel 1 goto install_failed

rem --- Step 4: prove it imports ----------------------------------------------
echo.
echo Verifying the installation...
call "%CONDA_EXE_PATH%" run -n "%ENV_NAME%" python -c "import sys, requests, bs4, rookiepy; sys.stdout.write('Python ' + sys.version.split()[0] + ' - all requirements import correctly\n')"
if errorlevel 1 goto install_failed

echo.
echo ============================================================
echo  Done. "%ENV_NAME%" is ready.
echo ============================================================
echo.
echo Start the app in either of these ways:
echo.
echo   1. Double-click start_web_app.bat
echo      It finds "%ENV_NAME%" by itself.
echo.
echo   2. From an Anaconda Prompt:
echo        conda activate %ENV_NAME%
echo        start_web_app.bat
echo.
pause
exit /b 0

:create_failed
echo.
echo Could not create the environment "%ENV_NAME%".
echo Check the error above. If this is a network or proxy problem, try again,
echo or create it by hand in an Anaconda Prompt:
echo   conda create -n %ENV_NAME% python=%PY_VERSION% -y
pause
exit /b 1

:install_failed
echo.
echo Could not install the requirements into "%ENV_NAME%".
echo Check the error above, then retry with:
echo   conda run -n %ENV_NAME% python -m pip install -r requirements.txt
pause
exit /b 1

:no_conda
echo Anaconda (or Miniconda) was not found on this computer.
echo.
echo Install it from https://www.anaconda.com/download and then run this file
echo again, or set up a plain Python 3.10 - 3.12 environment by hand:
echo   python -m venv .venv
echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
echo.
echo Note: Python 3.13 and newer do NOT work with this app.
pause
exit /b 1
