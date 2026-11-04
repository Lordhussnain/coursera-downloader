# -*- coding: utf-8 -*-

"""
Manages the credential information (passwords, etc).
"""

import os


class CredentialsError(Exception):
    """
    Class to be thrown if the credentials are not found.

    This deliberately derives from ``Exception`` rather than
    ``BaseException``: as a ``BaseException`` it slipped past every
    ``except Exception`` handler in the app and surfaced as an
    unhandled crash instead of a friendly message.
    """

    pass


def _getenv_or_empty(s):
    """
    Helper function that converts None gotten from the environment to the
    empty string.
    """
    return os.getenv(s) or ""

def get_credentials(username=None, password=None):
    """
    Return valid username, password tuple.

    Raises CredentialsError if username or password is missing.
    """

    if not username:
        raise CredentialsError(
            'Please provide a username with the -u option, '
            'or a CAUTH cookie with the --cauth option')

    if not password:
        raise CredentialsError('Please provide a password with the -p option')

    return username, password
