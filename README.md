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

A virtual environment is optional. If a `.venv` folder exists next to `web_app.py`, `start_web_app.bat` uses it; otherwise it uses the active conda environment or the `python` on your PATH, and installs `requirements.txt` into it when something is missing. There is no Node.js/npm build step - `web/` is plain HTML/CSS/JS served by the Python app.

Conda users:

```bat
conda create -n coursera_env python=3.10 -y
conda activate coursera_env
pip install -r requirements.txt
start_web_app.bat
```

# Usage

1. Start the web app: Run `start_web_app.bat` (Windows) or `python web_app.py` (cross-platform).
2. Open your browser to `http://localhost:7500`.
3. Click **Login**, sign in to Coursera in the browser window that opens, then click **Login** again.
4. Select and download courses.

## Login / authentication

The app never asks for your Coursera password. It reuses the `CAUTH` session cookie from a browser you are already signed in to.

- **Firefox is the most reliable source.** Windows protects Chrome and Edge cookies with *app-bound encryption* (Chrome 127+, current Edge). No external program - including this app, even when run as administrator - can read those cookies. When only Chrome/Edge is signed in, auto-detection fails.
- Choose the browser under **Settings -> Read Coursera login from**, then click **Use this login**.
- If auto-detection still fails (Chrome/Edge only, or a locked cookie database), paste the cookie manually:
  1. Sign in at `https://www.coursera.org` in any browser.
  2. Press `F12` -> **Application** -> **Cookies** -> `https://www.coursera.org`.
  3. Copy the `CAUTH` value, paste it into **Settings -> CAUTH cookie**, then click **Use this login**.

A CAUTH cookie copied by hand keeps working from any browser, and it is stored locally in `data.bin` (git-ignored) so downloads keep working on the next start.

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
