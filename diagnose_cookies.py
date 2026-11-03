"""Check whether rookie can read your Coursera login, profile by profile.

Run this in the same place you run the web app:

    conda activate coursera_env
    cd /d C:\\Users\\shah\\Desktop\\coursera\\coursera-downloader
    python diagnose_cookies.py

It prints, for every browser profile it can find:

  * the profile's display name and cookie database path
  * whether a "Local State" key file was found above it
  * whether rookie could open the database at all
  * whether a CAUTH cookie came back, and its length

CAUTH values are never printed in full (only length + first 8 characters),
so the output is safe to paste into a bug report.

The last block compares every profile, which is the fastest way to see why one
Chrome profile works and another does not.
"""

import json
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)


def mask(value):
    value = value or ""
    if len(value) <= 10:
        return "%d chars" % len(value)
    return "%d chars, starts %s..." % (len(value), value[:8])


def cipher_tier(blob, plaintext):
    """Classify how one cookie row is stored, so failures can be pinpointed.

    Chromium prefixes every encrypted value with a short ASCII tag. Which tag a
    row carries decides whether another program can ever read it:

      v10 / v11   legacy DPAPI (Windows) or keyring (macOS/Linux) -> readable
      v20+        app-bound encryption (Chrome 127+)             -> not readable
                  by any external tool; only Chrome itself can decrypt it.
    """
    if plaintext:
        return "plaintext"
    if not blob:
        return "empty"
    head = bytes(blob[:3])
    try:
        tag = head.decode("ascii")
    except UnicodeDecodeError:
        return "unknown binary"
    if tag in {"v10", "v11"}:
        return tag + " (legacy, readable)"
    if tag.startswith("v2") or tag.startswith("v3"):
        return tag + " (app-bound, NOT readable by other programs)"
    if tag.startswith("v"):
        return tag + " (encrypted, unknown tier)"
    return "unknown binary"


def inspect_cookie_database(path):
    """Read a Chromium cookie DB directly (no decryption) and report the CAUTH row.

    This answers "why did the reader fail?" without guessing: if the CAUTH row
    is v20 it genuinely cannot be decrypted outside Chrome, and if it is v10 the
    failure is something else (a locked file, a wrong key, a bug).
    """
    import sqlite3

    result = {"cauth": None, "tiers": {}, "total": 0, "coursera": 0, "error": ""}
    try:
        con = sqlite3.connect("file:%s?mode=ro" % path, uri=True)
    except Exception as exc:
        result["error"] = str(exc)
        return result

    try:
        rows = con.execute(
            "SELECT host_key, name, value, encrypted_value FROM cookies"
        ).fetchall()
    except Exception as exc:
        result["error"] = str(exc)
        con.close()
        return result
    con.close()

    for host, name, value, blob in rows:
        result["total"] += 1
        if "coursera.org" not in (host or ""):
            continue
        result["coursera"] += 1
        tier = cipher_tier(blob, value)
        result["tiers"][tier] = result["tiers"].get(tier, 0) + 1
        if name == "CAUTH":
            result["cauth"] = {
                "tier": tier,
                "host": host,
                "length": len(value) if value else len(blob or b""),
            }
    return result


def main():
    print("=" * 72)
    print("Coursera Downloader - cookie diagnostics")
    print("=" * 72)
    print("Python     :", sys.version.split()[0])
    print("Executable :", sys.executable)
    print("Platform   :", sys.platform, "(os.name=%r)" % os.name)
    print()

    try:
        import rookiepy
    except ModuleNotFoundError:
        print("rookiepy is NOT installed in this interpreter.")
        print("Install it with:  python -m pip install rookiepy")
        return 1

    version = getattr(rookiepy, "__version__", "")
    if not version:
        try:
            import importlib.metadata as metadata

            version = metadata.version("rookiepy")
        except Exception:
            version = "unknown"
    print("rookiepy   :", version)
    print()

    try:
        import web_app
    except Exception:
        print("Could not import web_app.py:")
        traceback.print_exc()
        return 1

    all_rows = []
    for browser in web_app.AUTH_BROWSER_ORDER:
        user_data_dirs = web_app.browser_user_data_dirs(browser)
        print("-" * 72)
        print("BROWSER:", browser)
        if not user_data_dirs:
            print("  not installed / no user data folder found")
            print("  looked in:", web_app.BROWSER_PATHS.get(web_app.browser_platform_key(), {}).get(browser))
            continue
        for directory in user_data_dirs:
            print("  user data:", directory)

        for profile in web_app.list_browser_profiles(browser):
            label = profile["label"]
            if profile.get("email"):
                label = "%s <%s>" % (label, profile["email"])
            print()
            print("  PROFILE: %s   (folder %s)" % (label, profile["folder"]))
            print("    cookies :", profile["path"])

            row = {
                "browser": browser,
                "label": profile["label"],
                "folder": profile["folder"],
                "path": profile["path"],
                "read": False,
                "cauth": "",
                "error": "",
            }

            if browser in web_app.FIREFOX_BROWSERS:
                print("    key file: (not used for Firefox)")
            else:
                local_state = web_app.find_local_state(profile["path"])
                print("    key file:", local_state or "NOT FOUND")
                if local_state:
                    try:
                        state = json.loads(open(local_state, "r", encoding="utf-8", errors="replace").read())
                        os_crypt = state.get("os_crypt", {}) if isinstance(state, dict) else {}
                        bound = bool(os_crypt.get("app_bound_encrypted_key"))
                        print("    app-bound key in Local State:", "YES" if bound else "no")
                        if bound:
                            print("      -> Chrome protects this profile with app-bound encryption.")
                            print("         No external program can decrypt those cookies.")
                            row["error"] = "app-bound encryption (unreadable by design)"
                    except Exception as exc:
                        print("    (could not parse Local State: %s)" % exc)

            try:
                cookies = web_app.read_profile_cookies(rookiepy, browser, profile["path"])
            except Exception as exc:
                print("    READ FAILED:", exc)
                row["error"] = row["error"] or str(exc)
                if browser not in web_app.FIREFOX_BROWSERS:
                    db = inspect_cookie_database(profile["path"])
                    if db["error"]:
                        print("    database inspect failed:", db["error"])
                    else:
                        print("    database: %d cookie rows, %d for coursera.org"
                              % (db["total"], db["coursera"]))
                        if db["cauth"]:
                            print("    CAUTH row storage:", db["cauth"]["tier"])
                            if "NOT readable" in db["cauth"]["tier"]:
                                row["error"] = "CAUTH is app-bound (v20), unreadable by any tool"
                            else:
                                row["error"] = (
                                    "CAUTH stored as %s but the read failed - "
                                    "close the browser and retry" % db["cauth"]["tier"]
                                )
                        else:
                            print("    no CAUTH row for coursera.org in this profile")
                all_rows.append(row)
                continue

            row["read"] = True
            print("    cookies returned:", len(cookies or []))
            cauth, _ = web_app.pick_cookie_value(cookies, "CAUTH")
            coursera_names = sorted({
                (c.get("name") if isinstance(c, dict) else getattr(c, "name", ""))
                for c in (cookies or [])
            })
            print("    names:", ", ".join(n for n in coursera_names if n) or "(none)")
            if cauth:
                row["cauth"] = cauth
                print("    CAUTH: FOUND -", mask(cauth))
            else:
                print("    CAUTH: not present in this profile")

    print()
    print("=" * 72)
    print("SUMMARY - which profile holds a usable Coursera login")
    print("=" * 72)
    if not all_rows:
        print("No browser profiles with a cookie database were found.")
        return 1

    profile_width = max(len("%s (%s, %s)" % (r["label"], r["browser"], r["folder"])) for r in all_rows)
    profile_width = min(profile_width, 46)
    for row in all_rows:
        name = "%s (%s, %s)" % (row["label"], row["browser"], row["folder"])
        if len(name) > profile_width:
            name = name[: profile_width - 3] + "..."
        if row["cauth"]:
            status = "CAUTH OK"
        elif not row["read"]:
            status = "unreadable (%s)" % row["error"][:50]
        elif row["error"]:
            status = row["error"][:50]
        else:
            status = "no Coursera login in this profile"
        print("  %s  %s" % (name.ljust(profile_width), status))

    usable = [r for r in all_rows if r["cauth"]]
    print()
    if usable:
        print("Profiles with a CAUTH cookie:")
        for row in usable:
            print('  - %s / %s  (folder "%s")' % (row["browser"], row["label"], row["folder"]))
            print("    %s" % row["path"])

    print()
    print("-" * 72)
    print("NEXT STEP")
    print("-" * 72)
    unreadable = [r for r in all_rows if not r["read"]]
    if unreadable:
        print("Some profiles could not be opened at all (see the errors above).")
        print("Close Chrome completely (also from the system tray) and run this again,")
        print("because a running browser can lock its own cookie database.")
    elif len(usable) > 1:
        print("More than one profile has a login. In the web app, pick the one you want")
        print("under Settings -> Browser profile with your Coursera login.")
    elif not usable:
        print("No profile had a CAUTH cookie. Sign in at https://www.coursera.org in the")
        print("browser you want to use, then run this script again. If it still finds")
        print("nothing, paste the CAUTH cookie manually in Settings.")
    else:
        print("Exactly one profile has a login; pick it in the web app and the downloader")
        print("will use it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
