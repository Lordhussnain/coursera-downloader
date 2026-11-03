# -*- coding: utf-8 -*-
"""
Module for download-related classes and functions.

We currently support an internal downloader written in Python with just the
essential functionality and four "industrial-strength" external downloaders,
namely, aria2c, axel, curl, and wget.
"""

from __future__ import print_function

import logging
import math
import os
import random
import subprocess
import sys
import threading
import time

import requests

_cancel_event = None
_pause_event = None

# Optional throttle in bytes/second (0 = unlimited). Shared by all workers, so
# setting it caps the whole course rather than each file.
_speed_limit = 0
_speed_lock = threading.Lock()
_speed_window = {'start': 0.0, 'bytes': 0}


def set_speed_limit(bytes_per_second):
    global _speed_limit
    with _speed_lock:
        _speed_limit = max(0, int(bytes_per_second or 0))
        _speed_window['start'] = 0.0
        _speed_window['bytes'] = 0


def get_speed_limit():
    return _speed_limit


def _throttle(chunk_bytes):
    """Sleep just enough to keep the aggregate rate under the limit.

    This is a cumulative budget: after `chunk_bytes` the total transferred must
    not exceed limit * elapsed. The overshoot is the exact time to wait, which
    keeps the average rate accurate without per-chunk bookkeeping windows.
    """
    if _speed_limit <= 0:
        return
    with _speed_lock:
        now = time.time()
        if _speed_window['start'] <= 0:
            _speed_window['start'] = now
        _speed_window['bytes'] += chunk_bytes
        elapsed = max(now - _speed_window['start'], 1e-6)
        allowed = _speed_limit * elapsed
        over = _speed_window['bytes'] - allowed
        sleep_for = (over / float(_speed_limit)) if over > 0 else 0.0
    if sleep_for <= 0:
        return
    # Sleep in slices so cancel stays responsive on a slow connection.
    deadline = time.time() + sleep_for
    while time.time() < deadline:
        raise_if_cancelled()
        time.sleep(min(0.1, max(0.0, deadline - time.time())))


class DownloadCancelled(BaseException):
    pass


def set_download_control_events(cancel_event=None, pause_event=None):
    global _cancel_event, _pause_event
    _cancel_event = cancel_event
    _pause_event = pause_event


def raise_if_cancelled():
    if _cancel_event is not None and _cancel_event.is_set():
        raise DownloadCancelled("Download cancelled.")


def wait_if_paused():
    while _pause_event is not None and _pause_event.is_set():
        raise_if_cancelled()
        time.sleep(0.2)


#
# Below are file downloaders, they are wrappers for external downloaders.
#

class Downloader(object):
    """
    Base downloader class.

    Every subclass should implement the _start_download method.

    Usage::

      >>> import downloaders
      >>> d = downloaders.SubclassFromDownloader()
      >>> d.download('http://example.com', 'save/to/this/file')
    """

    def _start_download(self, url, filename, resume):
        """
        Actual method to download the given url to the given file.
        This method should be implemented by the subclass.
        """
        raise NotImplementedError("Subclasses should implement this")

    def download(self, url, filename, resume=False):
        """
        Download the given url to the given file. When the download
        is aborted by the user, the partially downloaded file is also removed.
        """

        try:
            raise_if_cancelled()
            wait_if_paused()
            result = self._start_download(url, filename, resume)
            raise_if_cancelled()
            return result
        except KeyboardInterrupt as e:
            # keep the file if resume is True
            if not resume:
                logging.info('Keyboard Interrupt -- Removing partial file: %s',
                             filename)
                try:
                    os.remove(filename)
                except OSError:
                    pass
            raise e


class ExternalDownloader(Downloader):
    """
    Downloads files with an external downloader.

    We could possibly use python to stream files to disk,
    but this is slow compared to these external downloaders.

    :param session: Requests session.
    :param bin: External downloader binary.
    """

    # External downloader binary
    bin = None

    def __init__(self, session, bin=None, downloader_arguments=None):
        self.session = session
        self.bin = bin or self.__class__.bin
        self.downloader_arguments = downloader_arguments or []

        if not self.bin:
            raise RuntimeError("No bin specified")

        self._check_bin()

    def _prepare_cookies(self, command, url):
        """
        Extract cookies from the requests session and add them to the command
        """

        req = requests.models.Request()
        req.method = 'GET'
        req.url = url

        cookie_values = requests.cookies.get_cookie_header(
            self.session.cookies, req)

        if cookie_values:
            self._add_cookies(command, cookie_values)

    def _enable_resume(self, command):
        """
        Enable resume feature
        """

        raise RuntimeError("Subclass should implement this")

    def _add_cookies(self, command, cookie_values):
        """
        Add the given cookie values to the command
        """

        raise RuntimeError("Subclasses should implement this")

    def _create_command(self, url, filename):
        """
        Create command to execute in a subprocess.
        """
        raise NotImplementedError("Subclasses should implement this")

    def _check_bin(self):
        """
        Make sure the downloader is installed
        """
        try:
            ret = subprocess.run([self.bin, "--version"])
        except FileNotFoundError:
            raise RuntimeError(f"Downloader '{self.bin}' not found")

        if(ret.returncode != 0):
            raise RuntimeError(f"Downloader '{self.bin}' returned a non-zero exit status")

    def _start_download(self, url, filename, resume):
        command = self._create_command(url, filename)
        command.extend(self.downloader_arguments)
        self._prepare_cookies(command, url)
        if resume:
            self._enable_resume(command)

        logging.debug('Executing %s: %s', self.bin, command)
        try:
            return subprocess.call(command) == 0
        except OSError as e:
            msg = "{0}. Are you sure that '{1}' is the right bin?".format(
                e, self.bin)
            raise OSError(msg)


class WgetDownloader(ExternalDownloader):
    """
    Uses wget, which is robust and gives nice visual feedback.
    """

    bin = 'wget'

    def _enable_resume(self, command):
        command.append('-c')

    def _add_cookies(self, command, cookie_values):
        command.extend(['--header', "Cookie: " + cookie_values])

    def _create_command(self, url, filename):
        return [self.bin, url, '-O', filename, '--no-cookies',
                '--no-check-certificate']


class CurlDownloader(ExternalDownloader):
    """
    Uses curl, which is robust and gives nice visual feedback.
    """

    bin = 'curl'

    def _enable_resume(self, command):
        command.extend(['-C', '-'])

    def _add_cookies(self, command, cookie_values):
        command.extend(['--cookie', cookie_values])

    def _create_command(self, url, filename):
        return [self.bin, url, '-k', '-#', '-L', '-o', filename]


class Aria2Downloader(ExternalDownloader):
    """
    Uses aria2. Unfortunately, it does not give a nice visual feedback, but
    gets the job done much faster than the alternatives.
    """

    bin = 'aria2c'

    def _enable_resume(self, command):
        command.append('-c')

    def _add_cookies(self, command, cookie_values):
        command.extend(['--header', "Cookie: " + cookie_values])

    def _create_command(self, url, filename):
        return [self.bin, url, '-o', filename,
                '--check-certificate=false', '--log-level=notice',
                '--max-connection-per-server=4', '--min-split-size=1M']


class AxelDownloader(ExternalDownloader):
    """
    Uses axel, which is robust and it both gives nice
    visual feedback and get the job done fast.
    """

    bin = 'axel'

    def _enable_resume(self, command):
        logging.warn('Resume download not implemented for this '
                     'downloader!')

    def _add_cookies(self, command, cookie_values):
        command.extend(['-H', "Cookie: " + cookie_values])

    def _create_command(self, url, filename):
        return [self.bin, '-o', filename, '-n', '4', '-a', url]


def format_bytes(bytes):
    """
    Get human readable version of given bytes.
    Ripped from https://github.com/rg3/youtube-dl
    """
    if bytes is None:
        return 'N/A'
    if type(bytes) is str:
        bytes = float(bytes)
    if bytes == 0.0:
        exponent = 0
    else:
        exponent = int(math.log(bytes, 1024.0))
    suffix = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'][exponent]
    converted = float(bytes) / float(1024 ** exponent)
    return '{0:.2f}{1}'.format(converted, suffix)


# Live progress for the web UI.
#
# The command line prints a carriage-return progress bar to stdout, which a web
# page can never see. Every file download records itself here instead, and the
# UI polls this small dict. The command line ignores it entirely.
PROGRESS = {
    'filename': '',
    'url': '',
    'bytes': 0,
    'total': 0,
    'percent': 0,
    'speed': 0,
    'started_at': 0,
    'active': False,
}


def reset_progress():
    PROGRESS.update({
        'filename': '', 'url': '', 'bytes': 0, 'total': 0,
        'percent': 0, 'speed': 0, 'started_at': 0, 'active': False,
    })


def current_progress():
    """Return a copy of the live download progress, for the web UI."""
    snapshot = dict(PROGRESS)
    if snapshot['active'] and snapshot['started_at']:
        elapsed = time.time() - snapshot['started_at']
        if elapsed > 0.25:
            snapshot['speed'] = int(snapshot['bytes'] / elapsed)
    return snapshot


def _publish_progress(filename, url, done, total, started_at):
    PROGRESS['filename'] = filename or ''
    PROGRESS['url'] = url or ''
    PROGRESS['bytes'] = int(done or 0)
    PROGRESS['total'] = int(total or 0)
    PROGRESS['started_at'] = started_at or 0
    PROGRESS['active'] = True
    if total:
        PROGRESS['percent'] = int(min(100, float(done) / float(total) * 100.0))
    else:
        PROGRESS['percent'] = 0


# Per-file download outcomes, so the UI can show which files failed and offer a
# targeted retry instead of re-running the whole course.
FILE_STATUS = {}


def _file_key(filename):
    try:
        return os.path.abspath(str(filename))
    except (TypeError, ValueError):
        return str(filename)


def note_download_failure(filename, reason, attempts, retrying=False):
    key = _file_key(filename)
    entry = FILE_STATUS.get(key) or {
        'filename': key,
        'name': os.path.basename(key),
        'attempts': 0,
        'retrying': False,
        'failed': False,
        'reason': '',
    }
    entry['attempts'] = attempts
    entry['retrying'] = bool(retrying)
    entry['failed'] = not retrying
    entry['reason'] = str(reason or '')
    FILE_STATUS[key] = entry


def clear_download_failure(filename):
    FILE_STATUS.pop(_file_key(filename), None)


def reset_file_status():
    FILE_STATUS.clear()


def failed_files():
    """Files that exhausted their retries, newest first."""
    return [dict(item) for item in FILE_STATUS.values() if item.get('failed')]


def retrying_files():
    return [dict(item) for item in FILE_STATUS.values() if item.get('retrying')]


class DownloadProgress(object):
    """
    Report download progress.
    Inspired by https://github.com/rg3/youtube-dl
    """

    def __init__(self, total):
        if total in [0, '0', None]:
            self._total = None
        else:
            self._total = int(total)

        self._current = 0
        self._start = 0
        self._now = 0

        self._finished = False

    def start(self):
        self._now = time.time()
        self._start = self._now

    def stop(self):
        self._now = time.time()
        self._finished = True
        self._total = self._current
        self.report_progress()

    def read(self, bytes):
        self._now = time.time()
        self._current += bytes
        self.report_progress()

    def report(self, bytes):
        self._now = time.time()
        self._current = bytes
        self.report_progress()

    def calc_percent(self):
        if self._total is None:
            return '--%'
        if self._total == 0:
            return '100% done'
        percentage = int(float(self._current) / float(self._total) * 100.0)
        done = int(percentage / 2)
        return '[{0: <50}] {1}%'.format(done * '#', percentage)

    def calc_speed(self):
        dif = self._now - self._start
        if self._current == 0 or dif < 0.001:  # One millisecond
            return '---b/s'
        return '{0}/s'.format(format_bytes(float(self._current) / dif))

    def report_progress(self):
        """Report download progress."""
        percent = self.calc_percent()
        total = format_bytes(self._total)

        speed = self.calc_speed()
        total_speed_report = '{0} at {1}'.format(total, speed)

        report = '\r{0: <56} {1: >30}'.format(percent, total_speed_report)

        if self._finished:
            print(report)
        else:
            print(report, end="")
        sys.stdout.flush()


class NativeDownloader(Downloader):
    """
    'Native' python downloader.

    Retries are per file: a dropped connection, a timeout or a truncated body
    resumes *that* file and leaves every other download running. The previous
    version only retried HTTP error codes, so any network exception during the
    body escalated out of download_modules and aborted the whole course.

    :param session: Requests session.
    """

    #: Attempts per file, including the first one.
    MAX_ATTEMPTS = 4
    #: (connect, read) timeout in seconds. A stalled socket must not hang for ever.
    TIMEOUT = (15, 60)
    #: First backoff delay; doubles each attempt, capped by MAX_BACKOFF.
    BASE_BACKOFF = 1.0
    MAX_BACKOFF = 30.0

    # HTTP statuses worth retrying: transient server and throttling responses.
    RETRY_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504})

    def __init__(self, session):
        self.session = session

    # -- helpers -----------------------------------------------------------
    @classmethod
    def backoff_delay(cls, attempt):
        """Exponential backoff with jitter, so a fleet of workers does not sync."""
        delay = min(cls.MAX_BACKOFF, cls.BASE_BACKOFF * (2 ** max(0, attempt - 1)))
        return delay + random.uniform(0, delay * 0.25)

    @staticmethod
    def _is_retryable_exception(exc):
        if isinstance(exc, (requests.exceptions.SSLError,)):
            return False
        return isinstance(
            exc,
            (
                requests.exceptions.ConnectionError,
                requests.exceptions.Timeout,
                requests.exceptions.ChunkedEncodingError,
                requests.exceptions.ContentDecodingError,
                requests.exceptions.RequestException,
                OSError,
            ),
        )

    def _sleep_before_retry(self, attempt, reason, filename):
        delay = self.backoff_delay(attempt)
        note_download_failure(filename, reason, attempt, retrying=True)
        logging.warning(
            'Retrying %s in %.1fs (attempt %d/%d): %s',
            os.path.basename(filename), delay, attempt + 1, self.MAX_ATTEMPTS, reason,
        )
        # Sleep in small slices so cancel and pause stay responsive.
        deadline = time.time() + delay
        while time.time() < deadline:
            raise_if_cancelled()
            wait_if_paused()
            time.sleep(0.1)

    def _start_download(self, url, filename, resume=False):
        # resume has no meaning if the file does not exist!
        resume = resume and os.path.exists(filename)

        if resume:
            logging.info('Resume downloading %s -> %s', url, filename)
        else:
            logging.info('Downloading %s -> %s', url, filename)

        error_msg = ''
        attempt = 0

        while attempt < self.MAX_ATTEMPTS:
            attempt += 1
            raise_if_cancelled()
            wait_if_paused()

            # Resume from whatever is already on disk on every attempt, so a
            # retry after a mid-body failure does not start the file over.
            filesize = os.path.getsize(filename) if os.path.exists(filename) else 0
            headers = {}
            if filesize:
                headers['Range'] = 'bytes=%d-' % filesize
                resume = True
            else:
                resume = False

            try:
                return self._attempt_download(
                    url, filename, headers, filesize, resume, attempt
                )
            except DownloadCancelled:
                raise
            except Exception as exc:  # noqa: BLE001 - every failure is per file
                if isinstance(exc, requests.exceptions.HTTPError):
                    status = getattr(getattr(exc, 'response', None), 'status_code', None)
                    if status is not None and status not in self.RETRY_STATUSES:
                        # 404 and friends will not fix themselves.
                        logging.error('Giving up on %s: HTTP %s', url, status)
                        note_download_failure(filename, 'HTTP %s' % status, attempt)
                        return False
                if not self._is_retryable_exception(exc) and not isinstance(
                    exc, requests.exceptions.HTTPError
                ):
                    logging.error('Giving up on %s: %s', url, exc)
                    note_download_failure(filename, str(exc), attempt)
                    return False

                error_msg = str(exc) or exc.__class__.__name__
                if attempt >= self.MAX_ATTEMPTS:
                    break
                self._sleep_before_retry(attempt, error_msg, filename)

        logging.error('Skipping %s after %d attempts: %s', url, self.MAX_ATTEMPTS, error_msg)
        note_download_failure(filename, error_msg, self.MAX_ATTEMPTS)
        return False

    def _attempt_download(self, url, filename, headers, filesize, resume, attempt):
        """One attempt. Raises on any transient problem so the caller retries."""
        r = self.session.get(url, stream=True, headers=headers, timeout=self.TIMEOUT)

        if r.status_code != 200:
            # In resume mode the server may answer 206 (partial content) or
            # 416 (range not satisfiable, i.e. already complete). Both are fine.
            if resume and r.status_code == 206:
                pass
            elif resume and r.status_code == 416:
                logging.info('%s already downloaded', filename)
                r.close()
                return True
            elif r.status_code in self.RETRY_STATUSES:
                r.close()
                raise requests.exceptions.HTTPError(
                    'HTTP %s' % r.status_code, response=r
                )
            else:
                if r.reason:
                    reason = '%s %s' % (r.reason, r.status_code)
                else:
                    reason = 'HTTP Error %s' % r.status_code
                logging.warning('Probably the file is missing from the repository: %s', url)
                r.close()
                raise requests.exceptions.HTTPError(reason, response=r)

        if resume and r.status_code == 200:
            # Server ignored our Range header; start the file again instead of
            # appending to a partial body and corrupting it.
            logging.debug('Server ignored Range for %s; restarting file', url)
            filesize = 0
            resume = False

        content_length = r.headers.get('content-length')
        chunk_sz = 1048576
        progress = DownloadProgress(content_length)
        progress.start()
        started_at = time.time()
        base_offset = filesize if (resume and filesize) else 0
        expected_total = (int(content_length) + base_offset) if content_length else 0
        written = 0
        f = open(filename, 'ab') if resume else open(filename, 'wb')
        try:
            while True:
                raise_if_cancelled()
                wait_if_paused()
                data = r.raw.read(chunk_sz, decode_content=True)
                if not data:
                    progress.stop()
                    break
                progress.report(r.raw.tell())
                _publish_progress(
                    filename, url,
                    base_offset + written + len(data),
                    expected_total,
                    started_at,
                )
                f.write(data)
                written += len(data)
                _throttle(len(data))
        finally:
            f.close()
            r.close()
            PROGRESS['active'] = False

        # A truncated body must not look like success: retry it.
        if expected_total and base_offset + written < expected_total:
            raise requests.exceptions.ChunkedEncodingError(
                'incomplete download (%d of %d bytes)'
                % (base_offset + written, expected_total)
            )

        PROGRESS['percent'] = 100 if expected_total else PROGRESS['percent']
        clear_download_failure(filename)
        return True


def get_downloader(session, class_name, args):
    """
    Decides which downloader to use.
    """

    external = {
        'wget': WgetDownloader,
        'curl': CurlDownloader,
        'aria2': Aria2Downloader,
        'axel': AxelDownloader,
    }

    for bin, class_ in external.items():
        if getattr(args, bin):
            return class_(session, bin=getattr(args, bin),
                          downloader_arguments=args.downloader_arguments)

    return NativeDownloader(session)
