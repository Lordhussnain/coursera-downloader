# Coursera Full Course Downloader

A web-based application for easy downloading of Coursera courses.

# Description

Download videos, assignments, notes, and all other resources of a course, organized week by week just as in the course. The app runs a small local web server and is controlled from your browser.

The frontend is plain HTML, CSS and JavaScript served straight from the `web/` folder — there is no build step, no bundler and no Node.js requirement.

## Screenshots

Below are example screenshots of the current web interface. Usernames and any sensitive details are blurred for privacy.

![Coursera Downloader dashboard](screenshots/dashboard-blurred.png)

![Course download progress view](screenshots/activity-tree-blurred.png)

![Recent courses list](screenshots/recent-courses-blurred.png)

# What's New (v3.5.0)

This release fixes several correctness and security problems, and makes concurrent
downloading actually configurable. See `changelog.md` for the full list.

### Highlights
- **Concurrent downloads work now.** `--jobs` was hardcoded to `1`, so downloads were
  always sequential. Parallel downloads is now a setting in the Settings panel
  (1-8, default 3) and is persisted between runs.
- **Host header allowlist.** The API now rejects requests whose `Host` header is not a
  loopback name, closing a DNS-rebinding hole that the previous Origin-versus-Host
  comparison did not cover.
- **Settings are stored as JSON, not pickle.** Loading a pickle executes any code
  embedded in the file. Legacy `data.bin` files are migrated automatically through a
  restricted unpickler that refuses to build objects.
- **Correct HTTP status codes.** Expected conditions (no download to pause, oversized
  or unparsable request body, no browser login found) now return 409/413/400 with an
  actionable message instead of 500.
- **Graceful shutdown.** Ctrl+C and `SIGTERM` stop the server cleanly, cancel a running
  download, and no longer print a traceback. A port already in use reports how to fix it.
- **Folder picker fallback.** The "Select" button no longer fails with
  `No module named 'tkinter'`; it falls back to a native Windows dialog and, if no
  picker is available at all, tells you to type the path instead.
- **Input is validated before authentication is probed**, so a mistyped URL reports the
  URL problem rather than sending you to debug your browser login.

### Earlier in v3.4.0 (desktop GUI to web app)
- **Web-Based Interface**: browser frontend served by a local Python HTTP server on `http://localhost:7500`.
- **Local Server**: runs a local HTTP server with admin privilege handling for process management.
- **Enhanced Cookie Extraction**: CAUTH cookie detection from multiple browsers (Chrome, Firefox, Edge, Brave) using `rookiepy`.
- **Non-Interactive Authentication**: credentials must be provided upfront (no runtime prompts), improving automation.
- **Download Job Management**: start, pause, resume, cancel, and real-time logging.
- **Activity Tree View**: hierarchical display of course content with expand/collapse.
- **Recent Courses**: grid view of previously downloaded courses for quick access.
- **Retry Mechanism**: automatic retry and resume for failed downloads.

### Removed Features (GUI Cleanup)
- **Desktop GUI**: Removed PyQt5-based GUI (`maingui.py`, `gui_components/`, icons).
- **Interactive Password Prompts**: No more terminal prompts; passwords must be passed as arguments.
- **Windows Exe Dependency**: No longer requires building an exe; runs as a web app.
- **Old Dependencies**: Removed `PyQt5` and related GUI libraries from `requirements.txt`.

### Comparison: Old vs. New
| Feature | Old Version (GUI) | New Version (Web) |
|---------|-------------------|-------------------|
| Interface | Desktop GUI (PyQt5) | Local web app (vanilla JS, no build step) |
| Authentication | Interactive prompts + CAUTH | Upfront input + CAUTH |
| Platform | Windows exe | Cross-platform (Windows-first) |
| Dependencies | PyQt5, GUI libs | Python standard library + `requirements.txt` |
| Security | Basic | Host allowlist, JSON settings storage, no credential persistence |
| Download Org. | Week-by-week | Week-by-week (same) |
| Resources | Videos, assignments, notes | Videos, assignments, notes (same) |
| Concurrency | N/A | Configurable, 1-8 parallel downloads |
| Retry/Resume | Basic | Advanced with persistence |
| UI Responsiveness | Desktop-only | Partial (desktop-focused) |

# Installation and Setup

1. Ensure you have Python 3.8+ installed.
2. Clone the repository and navigate to the directory.
3. Create a virtual environment: `python -m venv .venv`
4. Activate the virtual environment: `.venv\Scripts\activate` (Windows) or `source .venv/bin/activate` (Linux/Mac)
5. Install dependencies: `pip install -r requirements.txt`

That is the whole setup. There is no frontend build step — the browser loads the files
in `web/` directly.

Optional: the folder picker uses Python's `tkinter`. It ships with the python.org
installer on Windows and macOS, and is a separate system package on Linux
(`sudo apt install python3-tk` on Debian/Ubuntu). If it is missing the app still runs;
the "Select" button falls back to a native Windows dialog, or asks you to type the path.

# Usage

1. Start the web app: Run `start_web_app.bat` (Windows) or `python web_app.py` (cross-platform).
2. Open your browser to `http://localhost:7500`.
3. Log in using your Coursera credentials or CAUTH cookie.
4. Select and download courses.

**Note**: The app extracts CAUTH cookies from your browser for authentication. Ensure you are logged into Coursera in your browser (Chrome, Firefox, etc.) before use.

## Command line options

| Option | Default | Purpose |
|--------|---------|---------|
| `--host` | `127.0.0.1` | Address to bind. Use `0.0.0.0` to accept LAN connections. |
| `--port` | `7500` | Port to listen on. |
| `--no-browser` | off | Do not open a browser window on startup. |
| `--allowed-host` | loopback only | Extra `Host` header to accept. Repeatable. |
| `--debug` | off | Verbose logging, including server-side tracebacks. |

By default only `localhost`, `127.0.0.1` and `[::1]` are accepted in the `Host` header.
If you serve the app through a reverse proxy or expose it on your LAN, name that host
explicitly:

```bash
python web_app.py --host 0.0.0.0 --allowed-host 192.168.1.50
```

The same can be set without a flag via the `COURSERA_DOWNLOADER_ALLOWED_HOSTS`
environment variable (comma separated). Do not add hostnames you do not control.

# Security

- Credentials are not stored; they are used only for authentication with Coursera's API. The CAUTH cookie is re-read from your browser on every run and is never written to `data.bin`.
- The server binds to `127.0.0.1` by default and rejects any request whose `Host` header is not allowlisted, which prevents DNS-rebinding attacks from a malicious web page.
- Request bodies are capped at 1 MiB.
- Settings are stored as JSON in `data.bin` (mode `0600`). Pickle is no longer used, so a tampered settings file cannot execute code.
- No data is sent to external servers except Coursera's official APIs.
- Use at your own risk and comply with Coursera's terms of service.


Shield: [![CC BY-NC 4.0][cc-by-nc-shield]][cc-by-nc]

This work is licensed under a
[Creative Commons Attribution-NonCommercial 4.0 International License][cc-by-nc].

[![CC BY-NC 4.0][cc-by-nc-image]][cc-by-nc]

[cc-by-nc]: https://creativecommons.org/licenses/by-nc/4.0/
[cc-by-nc-image]: https://licensebuttons.net/l/by-nc/4.0/88x31.png
[cc-by-nc-shield]: https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg
