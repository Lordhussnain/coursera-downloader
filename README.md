# Coursera Full Course Downloader

A web-based application for easy downloading of Coursera courses.

# Description

Download videos, assignments, notes, and all other resources of a course, organized week by week just as in the course. The application now features a modern React-based web interface for a better user experience.

## Screenshots

Below are example screenshots of the current web interface. Usernames and any sensitive details are blurred for privacy.

![Coursera Downloader dashboard](screenshots/dashboard-blurred.png)

![Course download progress view](screenshots/activity-tree-blurred.png)

![Recent courses list](screenshots/recent-courses-blurred.png)

# What's New (v3.4.0 - React Web App Transition)

This version transitions from a desktop GUI application to a web-based app. Key changes and new features:

### New Features
- **Web-Based Interface**: Modern React-inspired frontend accessible via browser at `http://localhost:7500`.
- **Local Server**: Runs a secure local HTTP server with admin privilege handling for process management.
- **Enhanced Cookie Extraction**: Improved CAUTH cookie detection from multiple browsers (Chrome, Firefox, Edge, Brave) using `rookiepy` and `browser_cookie3`.
- **Non-Interactive Authentication**: Credentials must be provided upfront (no runtime prompts), improving automation.
- **Security Audit**: Code reviewed for no malicious activity; credentials used only for Coursera API.
- **Cross-Platform Compatibility**: Easier deployment on Windows, Linux, and Mac via web interface.
- **Download Job Management**: Full control over downloads with start, pause, resume, cancel, and real-time logging.
- **Activity Tree View**: Hierarchical display of course content with expand/collapse (partially implemented for full interactivity).
- **Recent Courses**: Grid view of previously downloaded courses for quick access.
- **Settings Panel**: Toggleable panel for basic configuration (partially implemented with limited options).
- **Concurrent Downloads**: Parallel processing via multiprocessing for faster downloads.
- **Retry Mechanism**: Automatic retry and resume for failed downloads.
- **Responsive Design**: Basic web styling (partially implemented, desktop-focused).

### Removed Features (GUI Cleanup)
- **Desktop GUI**: Removed PyQt5-based GUI (`maingui.py`, `gui_components/`, icons).
- **Interactive Password Prompts**: No more terminal prompts; passwords must be passed as arguments.
- **Windows Exe Dependency**: No longer requires building an exe; runs as a web app.
- **Old Dependencies**: Removed `PyQt5` and related GUI libraries from `requirements.txt`.

### Comparison: Old vs. New
| Feature | Old Version (GUI) | New Version (Web) |
|---------|-------------------|-------------------|
| Interface | Desktop GUI (PyQt5) | Web app (React-inspired) |
| Authentication | Interactive prompts + CAUTH | Upfront input + CAUTH |
| Platform | Windows exe | Cross-platform web |
| Dependencies | PyQt5, GUI libs | React, Node.js, Python |
| Security | Basic | Audited (no exfiltration) |
| Download Org. | Week-by-week | Week-by-week (same) |
| Resources | Videos, assignments, notes | Videos, assignments, notes (same) |
| Concurrency | N/A | Multiprocessing support |
| Retry/Resume | Basic | Advanced with persistence |
| UI Responsiveness | Desktop-only | Partial (desktop-focused) |

# Installation and Setup

1. Ensure you have Python 3.8+ installed.
2. Clone the repository and navigate to the directory.
3. Install dependencies: `pip install -r requirements.txt`

A virtual environment is optional. `start_web_app.bat` picks an interpreter automatically, in this order:

1. the **activated conda environment** (`%CONDA_PREFIX%\python.exe`)
2. a `.venv` folder next to `web_app.py`
3. `python` on your `PATH` (including the `py` launcher)
4. a previously created conda environment

If the chosen interpreter is missing packages it runs `pip install -r requirements.txt` for you. There is no Node.js/npm build step - `web/` is plain HTML/CSS/JS served by the Python app.

## Running with Anaconda (Windows)

Open the **Anaconda Prompt** from the Start menu (not the plain `cmd` window, which does not know the `conda` command unless you ran `conda init cmd.exe`):

```bat
conda create -n coursera_env python=3.10 -y
conda activate coursera_env
cd /d C:\Users\<you>\Desktop\coursera\coursera-downloader
python -m pip install -r requirements.txt
start_web_app.bat
```

Only the first two commands are one-time setup. On every later run you just need
`conda activate coursera_env`, the `cd`, and `start_web_app.bat`.

The launcher prints `Using conda environment coursera_env:` followed by the interpreter path, so you can confirm your environment is the one running. Then open <http://localhost:7500>.

Alternatively, without activating anything - run the env's Python directly:

```bat
conda run -n coursera_env python -m pip install -r requirements.txt
conda run -n coursera_env python web_app.py
```

Notes:

- You do **not** need to create a `.venv`. If an old `.venv` folder is left in the project, an activated conda environment still takes priority.
- Keep the console window open while downloading; it is the app's server.
- To leave the environment later: `conda deactivate`.

#### If something goes wrong

| Symptom | Fix |
|---|---|
| `'conda' is not recognized` | You are in `cmd`. Open **Anaconda Prompt** instead. |
| `activate` does nothing / wrong Python | Run `conda activate coursera_env` again and check the prompt shows `(coursera_env)`. |
| `ModuleNotFoundError` on start | Dependencies went into a different Python. Re-run `python -m pip install -r requirements.txt` **after** activating. |
| Port 7500 already in use | An earlier instance is still running. Close its console window, or run `python web_app.py --port 7501`. |
| Browser shows an old UI after updating | Press `Ctrl+Shift+R` to bypass the cached CSS/JS. |
| `pip` is slow or fails | `python -m pip install --upgrade pip` then retry, or add `-i https://pypi.org/simple`. |

# Usage

1. Start the web app: Run `start_web_app.bat` (Windows) or `python web_app.py` (cross-platform).
2. Open your browser to `http://localhost:7500`.
3. Click **Login**, sign in to Coursera in the browser window that opens, then click **Login** again.
4. Select and download courses.

## Login / authentication

The app never asks for your Coursera password. It reuses the `CAUTH` session cookie from a browser you are already signed in to.

- **Pick the right browser profile.** Chrome, Edge and Brave keep each profile (`Default`, `Profile 1`, ...) in its own folder with its own cookie database. The old build only ever read `Default`, so a login made in a profile named e.g. "Shah" was invisible. Now the app scans every profile, and **Settings -> Browser profile with your Coursera login** lets you point it at the exact one (use **Refresh profiles** after creating a profile or signing in), then click **Use this login**.
- **Firefox is the most reliable source.** Windows protects Chrome and Edge cookies with *app-bound encryption* (Chrome 127+, current Edge). No external program - including this app, even when run as administrator - can read those cookies. Selecting the profile helps when the profile is readable; if it reports that the cookies are encrypted, use Firefox or paste the cookie.
- If auto-detection still fails (Chrome/Edge only, or a locked cookie database), paste the cookie manually:
  1. Sign in at `https://www.coursera.org` in any browser.
  2. Press `F12` -> **Application** -> **Cookies** -> `https://www.coursera.org`.
  3. Copy the `CAUTH` value, paste it into **Settings -> CAUTH cookie**, then click **Use this login**.

A CAUTH cookie copied by hand keeps working from any browser, and it is stored locally in `data.bin` (git-ignored) so downloads keep working on the next start.

### Retries and failed files

Every file is retried on its own, so a dropped connection no longer aborts the
whole course (that used to happen: one network error killed every remaining
file).

- **4 attempts per file** with exponential backoff and jitter, so retries do not
  stampede the server.
- **Resumes, not restarts**: a retry continues from the bytes already on disk.
- **Timeouts** (15s connect, 60s read) so a stalled socket never hangs forever.
- **Permanent errors fail fast**: a 404 is not retried four times.
- **Truncated bodies are detected** and retried instead of being reported as
  success.

When a file does exhaust its retries, the web UI lists it under **Failed files**
with the reason and a **Retry failed** button. The **Retry missing** button
re-runs the course with `--resume`, which re-downloads only files still carrying
a `.partial` marker.

### Speed limit

**Settings -> Speed limit** caps total bandwidth across all files (Unlimited by
default). Useful on metered or shared connections; the cap is global, so 2 MB/s
is 2 MB/s in total even with 4 files in flight.

### Diagnosing a login that is not detected

If one profile works and another does not, run the diagnostic script in the same
environment as the app:

```bat
conda activate coursera_env
cd /d C:\Users\shah\Desktop\coursera\coursera-downloader
python diagnose_cookies.py
```

It checks every browser profile separately and reports, per profile:

- whether a `Local State` key file was found
- whether rookie could open the cookie database
- **how the `CAUTH` row is actually stored** - `plaintext`, `v10` (legacy, readable) or `v20` (app-bound, readable only by Chrome itself)
- whether a usable `CAUTH` cookie came back

That distinction is the quick way to tell "this profile really is protected by
Chrome" apart from "something else is wrong, such as the browser holding the
database open". Cookie values are masked in the output, so it is safe to share.

# Security

- Credentials are not stored; they are used only for authentication with Coursera's API.
- No data is sent to external servers except Coursera's official APIs.
- Use at your own risk and comply with Coursera's terms of service.

Shield: [![CC BY-NC 4.0][cc-by-nc-shield]][cc-by-nc]

This work is licensed under a
[Creative Commons Attribution-NonCommercial 4.0 International License][cc-by-nc].

[![CC BY-NC 4.0][cc-by-nc-image]][cc-by-nc]

[cc-by-nc]: https://creativecommons.org/licenses/by-nc/4.0/
[cc-by-nc-image]: https://licensebuttons.net/l/by-nc/4.0/88x31.png
[cc-by-nc-shield]: https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg
