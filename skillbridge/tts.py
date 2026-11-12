"""Spoken audio for the classroom's listening desk, from ElevenLabs text-to-speech.

The API key is read from the environment (ELEVENLABS_API_KEY), or from a .env file at the project
root, which git ignores; it never reaches the browser. Each line is generated once and cached under
data/tts/, so a lesson that has been heard once plays again offline and costs nothing. Without a
key, or offline with nothing cached, the browser falls back to its own speech.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "tts"
API = "https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128"
VOICE = "JBFqnCBsd6RMkjVDRZzb"          # a calm narrator from ElevenLabs' default voices
MODEL = "eleven_multilingual_v2"
MAX_CHARS = 600
_lock = threading.Lock()


class TTSUnavailable(Exception):
    """No key, no network, or the service refused: the browser should speak the line itself."""


def _load_env() -> None:
    path = ROOT / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


_load_env()


def _key() -> str:
    return os.environ.get("ELEVENLABS_API_KEY", "").strip()


def _voice() -> str:
    return os.environ.get("ELEVENLABS_VOICE_ID", "").strip() or VOICE


def available() -> bool:
    return bool(_key())


def speech(text: str) -> bytes:
    """MP3 bytes for one line, from the cache when it has been heard before."""
    text = " ".join(str(text).split())
    if not text:
        raise ValueError("nothing to say")
    if len(text) > MAX_CHARS:
        raise ValueError("line too long to read aloud")
    voice = _voice()
    name = hashlib.sha256((voice + "|" + MODEL + "|" + text).encode("utf-8")).hexdigest()[:32] + ".mp3"
    path = CACHE / name
    if path.is_file():
        return path.read_bytes()
    key = _key()
    if not key:
        raise TTSUnavailable("no ElevenLabs key set")
    body = json.dumps({"text": text, "model_id": MODEL,
                       "voice_settings": {"stability": 0.55, "similarity_boost": 0.75}}).encode("utf-8")
    req = urllib.request.Request(API.format(voice=voice), data=body, method="POST",
                                 headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            audio = resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read()[:300].decode("utf-8", "replace")
        raise TTSUnavailable(f"ElevenLabs refused the request ({exc.code}): {detail}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise TTSUnavailable("ElevenLabs could not be reached") from exc
    if not audio:
        raise TTSUnavailable("ElevenLabs returned no audio")
    with _lock:
        CACHE.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        tmp.write_bytes(audio)
        tmp.replace(path)
    return audio
