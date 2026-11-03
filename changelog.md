# Changelog

## v3.8.2
- **A downloaded course no longer claims its manifest is missing.** When
  `-site-tree.json` was not next to the course folder, the tree was reported as
  `manifest-missing` with a file count of **0**, even though every file was on
  disk. The folder scan result was computed and then thrown away.
- Both the full and the quick (first-poll) code paths now fall back to the folder
  listing, so the course shows as downloaded with its real file count and its
  tree is rebuilt from disk. The note simply says the list came from the folder.
- A course with no folder and no manifest now reports "not downloaded yet"
  instead of blaming a missing manifest.
- An existing but empty folder is reported as not started rather than downloaded.
- The old `manifest-missing` label, kept only for compatibility, now reads
  "Downloaded (no manifest)".

## v3.8.1
- **Back to the course list.** Opening a recent course showed its tree and log
  with no way to return to the list and choose another one. A **← All courses**
  button now sits at the left of the tree toolbar.
- Going back also survives the background status poll, which previously
  re-rendered the tree and yanked the list away as soon as the course folder
  had any content.
- `showRecentCoursesLanding()` no longer returns early when a course is loaded,
  which was why the list could be hidden but never shown again.

## v3.8.0
- **Course queue.** Pasting a second URL while a course downloads now adds it to
  the queue instead of failing. Queued courses start on their own, in order, as
  each one finishes.
- The Download button no longer turns into a Pause button while a job runs. That
  made a pasted link pause the running download instead of queueing it - the bug
  behind "I cannot add another link". Pause/Resume now lives on its own button.
- New Queue panel: lists waiting courses, names the active one, and allows
  reordering (up/down), removing, and clearing.
- Cancel clears the queue; a failed course stops the queue rather than running
  through the rest.
- Each queued run gets a clean log. Previously the second job's log lines were
  hidden because the server restarts log numbering at 1 and the UI cursor had
  already advanced past it.
- README: "Queueing several courses" section.

## v3.7.1
- `start_web_app.bat` now only accepts Python **3.8 - 3.12**. A newer Python on
  `PATH` (3.13/3.14/3.15) is skipped instead of being chosen, so an Anaconda
  environment is no longer shadowed by a stray system interpreter.
- The launcher also looks at base Anaconda/Miniconda/Miniforge installs, not just
  named environments, and explains the version ceiling when nothing usable exists.
- `web_app.py` refuses to start on an unsupported Python with a short message
  naming the real cause, instead of a long PyO3/Rust traceback.
- New `setup_env.bat`: one double-click creates `coursera_env` on Python 3.10,
  installs `requirements.txt` and verifies the imports.
- README: documented the supported Python range, added troubleshooting rows for
  the Rust build error, `Defaulting to user installation`, and the version guard.

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
