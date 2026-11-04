"""
A very simple key-value database stored as JSON.
It supports basic operations for create, read, update, delete.
It also supports nested key paths for updates.

Older versions of this app persisted ``data.bin`` with :mod:`pickle`. Loading a
pickle runs arbitrary code embedded in the file, so anyone able to write that
path could execute code as the user running the downloader. The store is now
plain JSON, and legacy pickle files are migrated through a restricted unpickler
that refuses to instantiate any class.
"""

import json
import logging
import os
import pickle
from copy import deepcopy
from os import path

DEFAULT_DATA = {
    'browser': 'edge',
    'argdict': {
        'ca': '',
        'classname': '',
        'path': '',
        'video_resolution': '720p',
        'sl': 'en',
        'jobs': 3,
    }
}


class _RestrictedUnpickler(pickle.Unpickler):
    """Unpickler that decodes plain data but refuses to build objects.

    Containers and scalars (dict, list, str, int, float, bool, None) are handled
    by the pickle opcodes themselves and never reach ``find_class``, so a legacy
    ``data.bin`` written by an older version of this app still migrates. Anything
    carrying a class reference or a callable is rejected instead of executed.
    """

    def find_class(self, module, name):
        raise pickle.UnpicklingError(
            f"Refusing to load '{module}.{name}' from the settings file: "
            "it must contain plain data only."
        )


def _merge_defaults(data, defaults):
    for key, value in defaults.items():
        if isinstance(value, dict):
            existing = data.get(key, {})
            if not isinstance(existing, dict):
                existing = {}
            data[key] = _merge_defaults(existing, value)
        else:
            data.setdefault(key, value)
    return data


def _load_legacy_pickle(filename):
    """Read a pre-JSON settings file, refusing anything but plain data.

    Returns the decoded dict, or None when the file cannot be trusted or read.
    """
    try:
        with open(filename, 'rb') as handle:
            data = _RestrictedUnpickler(handle).load()
    except (EOFError, OSError, pickle.PickleError, ValueError, AttributeError):
        logging.warning(
            "Could not migrate the legacy settings file at %s; starting fresh.",
            filename,
        )
        return None
    return data if isinstance(data, dict) else None


class SimpleDB:
    def __init__(self, filename='data.bin'):
        # Anchor to this module's directory so the settings file stays in one
        # place regardless of the working directory the app was launched from.
        self.filename = path.abspath(path.join(path.dirname(__file__), filename))
        self._data = self._load()

    def _load(self):
        """Load data from the file, or initialize an empty dict if file doesn't exist."""
        if not os.path.exists(self.filename):
            self._save(deepcopy(DEFAULT_DATA))

        data = None
        try:
            with open(self.filename, 'r', encoding='utf-8') as handle:
                decoded = json.load(handle)
            if isinstance(decoded, dict):
                data = decoded
        except (OSError, ValueError, UnicodeDecodeError):
            # Not JSON: fall back to migrating a legacy pickle file.
            data = _load_legacy_pickle(self.filename)

        if not isinstance(data, dict):
            data = {}

        data = _merge_defaults(data, deepcopy(DEFAULT_DATA))
        self._save(data)
        return data

    def _save(self, data):
        """Save current data to file.

        Written to a temporary file and moved into place so a crash mid-write
        cannot leave a truncated settings file behind.
        """
        tmp_filename = f"{self.filename}.tmp"
        with open(tmp_filename, 'w', encoding='utf-8') as handle:
            json.dump(data, handle, indent=2, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_filename, self.filename)
        try:
            os.chmod(self.filename, 0o600)
        except OSError:
            # Best effort: not all platforms/filesystems support chmod.
            pass

    def create(self, key, value):
        """Create a new key-value pair. Raises error if key exists."""
        if key in self._data:
            raise KeyError(f"Key '{key}' already exists.")
        self._data[key] = value
        self._save(self._data)

    def read(self, key):
        """Read the value for a given key. Returns None if not found."""
        return self._data.get(key, None)

    def update(self, key_path, value):
        """Update value at top-level key or nested key path.
        example key_path: 'argdict.ca' or ['argdict', 'ca'].
        Raises KeyError if the key path is invalid.
        """
        if isinstance(key_path, str):
            key_path = key_path.split('.')  # support dot notation

        data_ref = self._data
        for key in key_path[:-1]:
            if key not in data_ref or not isinstance(data_ref[key], dict):
                raise KeyError(f"Path '{'.'.join(key_path)}' is invalid.")
            data_ref = data_ref[key]

        final_key = key_path[-1]
        if final_key not in data_ref:
            raise KeyError(f"Key '{final_key}' not found in path '{'.'.join(key_path)}'.")
        data_ref[final_key] = value
        self._save(self._data)

    def upsert(self, key_path, value):
        """Create or update a top-level or nested key path."""
        if isinstance(key_path, str):
            key_path = key_path.split('.')

        data_ref = self._data
        for key in key_path[:-1]:
            data_ref = data_ref.setdefault(key, {})
            if not isinstance(data_ref, dict):
                raise KeyError(f"Path '{'.'.join(key_path)}' is invalid.")

        data_ref[key_path[-1]] = value
        self._save(self._data)

    def delete(self, key):
        """Delete a key-value pair."""
        if key in self._data:
            del self._data[key]
            self._save(self._data)
        else:
            raise KeyError(f"Key '{key}' not found.")

    def get_full_db(self):
        """Return the full dictionary."""
        return dict(self._data)


if __name__ == '__main__':
    db = SimpleDB()
    print(db.get_full_db())
