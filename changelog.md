# Changelog

## v3.5.0

### Fixed
- **Concurrent downloads never ran.** `build_download_command` hardcoded `--jobs 1`, and
  `coursera_dl` only engages its `ParallelDownloader` when `--jobs` is greater than 1, so
  every download was sequential despite the documented feature.
- **"Select folder" crashed** with `500 No module named 'tkinter'` on any Python install
  without Tk. It now falls back to a native Windows dialog, and if no picker is available
  it returns a 400 telling you to type the path instead.
- **Expected conditions returned 500.** Pausing, resuming, cancelling or retrying with no
  job in the right state now returns 409; an oversized body returns 413; an unparsable body
  returns 400 with a plain message instead of leaking JSON parser internals.
- **No graceful shutdown.** Ctrl+C and `SIGTERM` dumped a traceback and abandoned a running
  download. The server now shuts down cleanly and cancels the job first. A port already in
  use explains how to pick another one instead of raising `OSError`.
- **Validation ran after authentication was probed.** A mistyped course URL reported
  "could not auto-detect your Coursera login", sending users to debug the wrong thing.
  Input is now validated first.
- **`CredentialsError` derived from `BaseException`**, so it slipped past every
  `except Exception` handler in the app.
- Removed the duplicate `"ca"` key in the saved-config dict literal.
- Removed the stale hardcoded `?v=20260503-...` cache-busting query strings from
  `index.html`. Static files are served with `Cache-Control: no-store`, so they only
  misled readers into thinking the frontend was versioned by date.

### Security
- **DNS rebinding.** `origin_is_allowed()` only compared `Origin` against `Host`, which a
  rebinding attack satisfies because the browser sees the attacker's domain as
  same-origin. The `Host` header is now checked against a loopback allowlist on both GET
  and POST. Extra hosts can be allowlisted with `--allowed-host` or
  `COURSERA_DOWNLOADER_ALLOWED_HOSTS`.
- **Unbounded request body.** `read_json()` read whatever `Content-Length` claimed, with no
  cap. Now limited to 1 MiB.
- **Pickle deserialization.** `data.bin` was loaded with `pickle.load`, which executes any
  code embedded in the file. The store is now JSON, written atomically with mode `0600`.
  Legacy pickle files are migrated through a restricted unpickler that decodes plain data
  but refuses to instantiate any class, so existing settings are preserved without the
  code-execution risk.

### Added
- **Parallel downloads setting** in the Settings panel (1-8, default 3), persisted to
  `data.bin` and passed through as `--jobs`.
- `--allowed-host` flag and `COURSERA_DOWNLOADER_ALLOWED_HOSTS` environment variable.
- Startup line listing the accepted `Host` headers, so a rejected request is easy to
  diagnose.

### Docs
- README no longer claims a React frontend, `npm install` or a Node.js dependency. The
  frontend is plain HTML/CSS/JS with no build step, and the setup instructions said
  otherwise.
- Documented the command line options and the folder-picker/tkinter situation.

## v3.4.0
- Transitioned from the PyQt5 desktop GUI to a local web app served on `http://localhost:7500`.
- Removed the desktop GUI, interactive password prompts and the Windows exe build.
- Download job management with start, pause, resume, cancel and real-time logging.
- Activity tree view, recent courses grid and a settings panel.

## v3.0.1
- Updated maingui so that interface does not break on high dpi display

## v3.0.0
- Stopped using Tkinter and switched to PyQt.
- Download path cannot contain spaces – bug solved.
- UI update.
- Some minor UI bugs solved.
- Can check for app updates.
- Anonymously logs user country and app open time for analyzing total app users.
- Can show notifications from remote server.
- Organized the repo, deleted the old code.
- Fixed Chinese subtitle code to `zh-CN`.
- using rookiepy instead of browsercookie3 for cookie fetching. can now fetch cookie from edge, firefox, brave.


## v2.1.0
- Solved the bug of permission error for Chrome and Edge.
- Authentication is now only possible from Firefox and Chrome.
- Added menu.
- Added error handling in `maingui.py` and `general.py`.
- Solved logical error in `urltoclassname` function.
- Also some minor changes.

**Unsolved problems:**
- Space in download path is still a problem.
- Add permission error handling for `data.bin` reading and writing.

## v2.0.0
- Uses the fork by [raffaem](https://github.com/raffaem/cs-dlp).

## v1.0.0
- Uses the `coursera-dl` script.
