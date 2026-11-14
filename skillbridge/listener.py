"""The Listener: can it see every action taken in Chrome? True or false.

No extension. The server opens Chrome with its DevTools Protocol port on, attaches to every tab and
frame, and puts a small counter in each page that reports action types back over the protocol.
It counts kinds of action only (click, keydown, scroll, ...): never which key, any text or page content,
and nothing leaves this machine.

Chrome 136+ refuses remote debugging on the default profile, so the Listener's Chrome uses its own
profile in data/listener-chrome. Any other Chrome window running at the same time is out of reach,
and the answer is then false.

Standard library only, including a minimal WebSocket client.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import shutil
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.request
from urllib.parse import urlparse

from .content import ROOT

log = logging.getLogger("skillbridge.listener")

PORT = int(os.environ.get("SKILLBRIDGE_LISTENER_PORT", "9333"))
PROFILE_DIR = ROOT / "data" / "listener-chrome"
BINDING = "__sbListenerAct"
CHECK_EVERY = 2.0

PAGE_SCRIPT = r"""
(() => {
  if (window.__sbListen) { window.__sbListen.start(); return true; }
  const KINDS = ["click", "dblclick", "auxclick", "contextmenu", "keydown", "input", "change", "submit",
    "scroll", "wheel", "copy", "cut", "paste", "dragstart", "drop", "touchstart", "focusin",
    "play", "pause", "fullscreenchange", "visibilitychange"];
  const THROTTLED = { scroll: 250, wheel: 250 };
  const last = {};
  let pending = {}, timer = 0, listening = false;
  function flush() {
    timer = 0;
    const counts = pending;
    pending = {};
    try { window.__BINDING__(JSON.stringify(counts)); } catch (e) {}
  }
  function onAction(e) {
    if (!e.isTrusted) return;
    const gap = THROTTLED[e.type];
    if (gap) {
      if (last[e.type] && e.timeStamp - last[e.type] < gap) return;
      last[e.type] = e.timeStamp;
    }
    pending[e.type] = (pending[e.type] || 0) + 1;
    if (!timer) timer = setTimeout(flush, 1000);
  }
  function start() {
    if (listening) return;
    listening = true;
    for (const k of KINDS) window.addEventListener(k, onAction, { capture: true, passive: true });
  }
  function stop() {
    if (!listening) return;
    listening = false;
    for (const k of KINDS) window.removeEventListener(k, onAction, { capture: true });
  }
  Object.defineProperty(window, "__sbListen", {
    value: { start, stop, get listening() { return listening; } }, enumerable: false
  });
  start();
  return true;
})()
""".replace("__BINDING__", BINDING)

ALIVE = "!!(window.__sbListen && window.__sbListen.listening)"


# ---- a minimal WebSocket client (RFC 6455, client side) --------------------------------------
class WebSocket:
    def __init__(self, url: str, timeout: float = 5.0):
        u = urlparse(url)
        self.sock = socket.create_connection((u.hostname, u.port or 80), timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        path = u.path + ("?" + u.query if u.query else "")
        # No Origin header: Chrome only checks --remote-allow-origins when one is sent.
        self.sock.sendall((
            f"GET {path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        ).encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("WebSocket handshake failed")
            head += chunk
        head, self.buf = head.split(b"\r\n\r\n", 1)
        if b" 101 " not in head.split(b"\r\n", 1)[0]:
            raise ConnectionError("WebSocket handshake refused: " + head.split(b"\r\n", 1)[0].decode(errors="replace"))
        self.sock.settimeout(None)
        self.send_lock = threading.Lock()

    def _exact(self, n: int) -> bytes:
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("WebSocket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    @staticmethod
    def _xor(data: bytes, mask: bytes) -> bytes:
        n = len(data)
        if n == 0:
            return b""
        key = (mask * (n // 4 + 1))[:n]
        return (int.from_bytes(data, "big") ^ int.from_bytes(key, "big")).to_bytes(n, "big")

    def send(self, data: str | bytes, opcode: int = 0x1) -> None:
        payload = data.encode() if isinstance(data, str) else data
        n = len(payload)
        header = bytes([0x80 | opcode])
        if n < 126:
            header += bytes([0x80 | n])
        elif n < 65536:
            header += bytes([0x80 | 126]) + struct.pack("!H", n)
        else:
            header += bytes([0x80 | 127]) + struct.pack("!Q", n)
        mask = os.urandom(4)
        with self.send_lock:
            self.sock.sendall(header + mask + self._xor(payload, mask))

    def recv(self) -> str:
        parts = []
        while True:
            b0, b1 = self._exact(2)
            opcode, n = b0 & 0x0F, b1 & 0x7F
            if n == 126:
                n = struct.unpack("!H", self._exact(2))[0]
            elif n == 127:
                n = struct.unpack("!Q", self._exact(8))[0]
            mask = self._exact(4) if b1 & 0x80 else None
            payload = self._exact(n)
            if mask:
                payload = self._xor(payload, mask)
            if opcode == 0x8:
                raise ConnectionError("WebSocket closed by Chrome")
            if opcode == 0x9:
                self.send(payload, 0xA)
                continue
            if opcode == 0xA:
                continue
            parts.append(payload)
            if b0 & 0x80:
                return b"".join(parts).decode("utf-8", errors="replace")

    def close(self) -> None:
        try:
            self.send(b"", 0x8)
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass


# ---- Chrome DevTools Protocol over that socket ------------------------------------------------
class CDP:
    def __init__(self, ws_url: str, on_event, on_close):
        self.ws = WebSocket(ws_url)
        self.on_event, self.on_close = on_event, on_close
        self.lock = threading.Lock()
        self.next_id = 0
        self.pending: dict[int, tuple[threading.Event, dict]] = {}
        self.alive = True
        threading.Thread(target=self._read, name="listener-cdp", daemon=True).start()

    def request(self, method: str, params: dict | None = None, session: str | None = None):
        """Send a command; returns a waiter. Never blocks on Chrome's answer."""
        event, slot = threading.Event(), {}
        with self.lock:
            self.next_id += 1
            msg_id = self.next_id
            self.pending[msg_id] = (event, slot)
        msg = {"id": msg_id, "method": method, "params": params or {}}
        if session:
            msg["sessionId"] = session
        try:
            self.ws.send(json.dumps(msg))
        except OSError:
            self._closed()
        return event, slot

    def send(self, method: str, params: dict | None = None, session: str | None = None) -> None:
        self.request(method, params, session)

    def call(self, method: str, params: dict | None = None, session: str | None = None, timeout: float = 3.0) -> dict:
        return self.wait(self.request(method, params, session), timeout)

    @staticmethod
    def wait(waiter, timeout: float) -> dict:
        event, slot = waiter
        if not event.wait(timeout) or "error" in slot or "result" not in slot:
            raise TimeoutError(slot.get("error", {}).get("message", "no answer from Chrome"))
        return slot["result"]

    def _read(self) -> None:
        while True:
            try:
                msg = json.loads(self.ws.recv())
            except (OSError, ConnectionError, ValueError):
                self._closed()
                return
            if "id" in msg:
                with self.lock:
                    waiter = self.pending.pop(msg["id"], None)
                if waiter:
                    waiter[1].update(msg)
                    waiter[0].set()
            else:
                try:
                    self.on_event(msg)
                except Exception:  # an odd event must not kill the reader
                    log.exception("listener event")

    def _closed(self) -> None:
        if not self.alive:
            return
        self.alive = False
        with self.lock:
            waiters, self.pending = list(self.pending.values()), {}
        for event, _ in waiters:
            event.set()
        self.on_close()

    def close(self) -> None:
        self.ws.close()


# ---- finding Chrome -----------------------------------------------------------------------------
def find_chrome() -> str | None:
    override = os.environ.get("SKILLBRIDGE_CHROME")
    if override and os.path.exists(override):
        return override
    candidates = []
    if sys.platform == "win32":
        for base in (os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA")):
            if base:
                candidates.append(os.path.join(base, "Google", "Chrome", "Application", "chrome.exe"))
    elif sys.platform == "darwin":
        candidates.append("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    else:
        for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
            found = shutil.which(name)
            if found:
                candidates.append(found)
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def debug_port_info() -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=0.7) as resp:
            return json.loads(resp.read())
    except (OSError, ValueError):
        return None


def chrome_command_lines() -> list[str] | None:
    """Command lines of running Chrome main processes (renderers etc. skipped). None if unknown."""
    try:
        if sys.platform == "win32":
            out = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | ForEach-Object { $_.CommandLine }"],
                capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            lines = out.stdout.splitlines()
        else:
            out = subprocess.run(["ps", "-axo", "command="], capture_output=True, text=True, timeout=10)
            lines = [line for line in out.stdout.splitlines()
                     if re.search(r"(Google Chrome|/chrome|/chromium|google-chrome)( |$)", line)]
    except (OSError, subprocess.SubprocessError):
        return None
    return [line.strip() for line in lines if line.strip() and "--type=" not in line]


def _norm(path: str) -> str:
    return path.replace("\\", "/").rstrip("/").lower()


# ---- the Listener -------------------------------------------------------------------------------
class Listener:
    def __init__(self):
        self.lock = threading.Lock()
        self.enabled = False
        self.cdp: CDP | None = None
        self.sessions: dict[str, str] = {}      # targetId -> sessionId
        self.attaching: set[str] = set()
        self.urls: dict[str, str] = {}          # page targetId -> url
        self.counting = False
        self.actions = {"total": 0, "by_kind": {}}
        self.browser = {"tabs_opened": 0, "tabs_closed": 0, "navigations": 0}
        self.others: tuple[float, list[str] | None] = (0.0, [])
        self.wake = threading.Event()
        self.checker: threading.Thread | None = None
        self.state = self._off_status()

    # -- public --
    def status(self) -> dict:
        with self.lock:
            return json.loads(json.dumps(self.state))

    def set_enabled(self, on: bool, open_url: str | None = None) -> dict:
        if on:
            self._enable(open_url)
        else:
            self._disable()
        return self.status()

    # -- on / off --
    def _enable(self, open_url: str | None) -> None:
        if self.enabled and self.cdp and self.cdp.alive:
            self.wake.set()
            return
        info = debug_port_info()
        if info is None:
            chrome = find_chrome()
            if not chrome:
                with self.lock:
                    self.state = self._off_status(["Chrome isn't installed where the Listener looks. "
                                                   "Set SKILLBRIDGE_CHROME to chrome.exe's full path and try again."])
                return
            PROFILE_DIR.mkdir(parents=True, exist_ok=True)
            args = [chrome, f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE_DIR}",
                    "--no-first-run", "--no-default-browser-check"]
            if open_url and re.match(r"^http://(127\.0\.0\.1|localhost)(:\d+)?/", open_url):
                args.append(open_url)
            kwargs = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL, "stdin": subprocess.DEVNULL}
            if sys.platform == "win32":
                kwargs["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
            else:
                kwargs["start_new_session"] = True
            subprocess.Popen(args, **kwargs)
            deadline = time.time() + 15
            while info is None and time.time() < deadline:
                time.sleep(0.25)
                info = debug_port_info()
            if info is None:
                with self.lock:
                    self.state = self._off_status(["Chrome opened but its debugging port never answered."])
                return

        with self.lock:
            self.sessions.clear()
            self.attaching.clear()
            self.urls.clear()
            self.counting = False
            self.actions = {"total": 0, "by_kind": {}}
            self.browser = {"tabs_opened": 0, "tabs_closed": 0, "navigations": 0}
            self.others = (0.0, [])
        self.cdp = CDP(info["webSocketDebuggerUrl"], self._on_event, self._on_close)
        self.enabled = True
        # New tabs and frames are held paused until the counter is in them, so no first action is missed.
        # Tabs that were already open are attached by the first check.
        auto = {"autoAttach": True, "waitForDebuggerOnStart": True, "flatten": True}
        try:
            self.cdp.call("Target.setAutoAttach", auto)
            self.cdp.call("Target.setDiscoverTargets", {"discover": True})
        except TimeoutError:
            pass
        self.counting = True  # existing tabs were reported before the answer; count only what follows
        if not self.checker or not self.checker.is_alive():
            self.checker = threading.Thread(target=self._check_loop, name="listener-check", daemon=True)
            self.checker.start()
        time.sleep(0.6)
        self._check()

    def _disable(self) -> None:
        self.enabled = False
        cdp, self.cdp = self.cdp, None
        if cdp and cdp.alive:
            for session in list(self.sessions.values()):
                cdp.send("Runtime.evaluate", {"expression": "window.__sbListen && window.__sbListen.stop()"}, session)
            time.sleep(0.2)
            cdp.close()
        with self.lock:
            self.sessions.clear()
            self.state = self._off_status()
        self.wake.set()

    # -- protocol events (reader thread: send only, never wait) --
    def _on_event(self, msg: dict) -> None:
        method, params, cdp = msg.get("method"), msg.get("params", {}), self.cdp
        if cdp is None:
            return
        if method in ("Target.targetCreated", "Target.targetInfoChanged"):
            info = params["targetInfo"]
            tid, kind = info["targetId"], info["type"]
            if kind not in ("page", "iframe"):
                return
            if kind == "page":
                with self.lock:
                    before = self.urls.get(tid)
                    self.urls[tid] = info.get("url", "")
                    if self.counting and method == "Target.targetCreated":
                        self.browser["tabs_opened"] += 1
                    elif self.counting and before is not None and before != info.get("url", ""):
                        self.browser["navigations"] += 1
        elif method == "Target.targetDestroyed":
            tid = params["targetId"]
            with self.lock:
                if self.urls.pop(tid, None) is not None and self.counting:
                    self.browser["tabs_closed"] += 1
                self.sessions.pop(tid, None)
                self.attaching.discard(tid)
        elif method == "Target.attachedToTarget":
            session, info = params["sessionId"], params["targetInfo"]
            tid = info["targetId"]
            if info["type"] not in ("page", "iframe"):
                # Workers and Chrome's own UI (toolbar, omnibox): leave them alone, just let them run.
                cdp.send("Runtime.runIfWaitingForDebugger", {}, session)
                cdp.send("Target.detachFromTarget", {"sessionId": session})
                return
            with self.lock:
                self.sessions[tid] = session
                self.attaching.discard(tid)
            cdp.send("Runtime.enable", {}, session)  # bindingCalled is only delivered with Runtime on
            cdp.send("Runtime.addBinding", {"name": BINDING}, session)
            cdp.send("Page.enable", {}, session)
            cdp.send("Page.addScriptToEvaluateOnNewDocument", {"source": PAGE_SCRIPT}, session)
            cdp.send("Runtime.evaluate", {"expression": PAGE_SCRIPT}, session)
            # Cross-site iframes run in their own process: attach to them the same way, held until armed.
            cdp.send("Target.setAutoAttach", {"autoAttach": True, "waitForDebuggerOnStart": True, "flatten": True}, session)
            cdp.send("Runtime.runIfWaitingForDebugger", {}, session)
        elif method == "Target.detachedFromTarget":
            session = params.get("sessionId")
            with self.lock:
                for tid, sid in list(self.sessions.items()):
                    if sid == session:
                        del self.sessions[tid]
        elif method == "Runtime.bindingCalled" and params.get("name") == BINDING:
            try:
                counts = json.loads(params.get("payload", "{}"))
            except ValueError:
                return
            with self.lock:
                for kind, n in counts.items():
                    if isinstance(kind, str) and len(kind) <= 32 and isinstance(n, int) and 0 < n < 100000:
                        self.actions["by_kind"][kind] = self.actions["by_kind"].get(kind, 0) + n
                        self.actions["total"] += n
                        self.state["actions"] = json.loads(json.dumps(self.actions))

    def _on_close(self) -> None:
        self.wake.set()

    # -- the check --
    def _check_loop(self) -> None:
        while self.enabled:
            self.wake.wait(CHECK_EVERY)
            self.wake.clear()
            if self.enabled:
                try:
                    self._check()
                except Exception:
                    log.exception("listener check")

    def _check(self) -> None:
        cdp = self.cdp
        status = {"enabled": True, "connected": bool(cdp and cdp.alive), "sees_all": False, "reasons": [],
                  "tabs": {"total": 0, "covered": 0}, "checked_at": time.time()}
        if not status["connected"]:
            status["reasons"].append("The Listener's Chrome is closed. Turn the Listener off and on to reopen it.")
        else:
            try:
                infos = cdp.call("Target.getTargets")["targetInfos"]
            except TimeoutError:
                infos = []
                status["reasons"].append("Chrome stopped answering.")
            pages = [t for t in infos if t["type"] == "page"]
            status["tabs"]["total"] = len(pages)
            with self.lock:
                sessions = dict(self.sessions)
            asks = {}
            for page in pages:
                session = sessions.get(page["targetId"])
                if session:
                    asks[page["targetId"]] = cdp.request("Runtime.evaluate", {"expression": ALIVE, "returnByValue": True}, session)
            silent = []
            for page in pages:
                tid = page["targetId"]
                ok = False
                if tid in asks:
                    try:
                        ok = CDP.wait(asks[tid], 1.5).get("result", {}).get("value") is True
                    except TimeoutError:
                        ok = False
                    if not ok:  # heal: put the counter back, it is checked again next round
                        cdp.send("Runtime.evaluate", {"expression": PAGE_SCRIPT}, sessions[tid])
                else:
                    with self.lock:
                        need = tid not in self.attaching
                        self.attaching.add(tid)
                    if need:
                        cdp.send("Target.attachToTarget", {"targetId": tid, "flatten": True})
                if ok:
                    status["tabs"]["covered"] += 1
                else:
                    silent.append(_label(page.get("url", "")))
            if silent:
                status["reasons"].append(f"{_plural(len(silent), 'tab is', 'tabs are')} not reporting yet: {', '.join(silent)}.")

            others = self._other_chromes()
            if others is None:
                status["reasons"].append("Couldn't check whether another Chrome is open.")
            elif others:
                status["reasons"].append("Your regular Chrome is also open, and the Listener can't see into it. "
                                         "Close it and use the Listener's Chrome window.")
            status["sees_all"] = not status["reasons"]

        with self.lock:
            if not self.enabled:
                return
            status["actions"] = json.loads(json.dumps(self.actions))
            status["browser"] = dict(self.browser)
            self.state = status

    def _other_chromes(self) -> list[str] | None:
        stamp, cached = self.others
        if time.time() - stamp < 5:
            return cached
        lines = chrome_command_lines()
        mine = _norm(str(PROFILE_DIR))
        result = None if lines is None else [line for line in lines if mine not in _norm(line)]
        self.others = (time.time(), result)
        return result

    @staticmethod
    def _off_status(reasons: list[str] | None = None) -> dict:
        return {"enabled": False, "connected": False, "sees_all": False,
                "reasons": reasons or ["The Listener is off."], "tabs": {"total": 0, "covered": 0},
                "actions": {"total": 0, "by_kind": {}}, "browser": {"tabs_opened": 0, "tabs_closed": 0, "navigations": 0},
                "checked_at": time.time()}


def _label(url: str) -> str:
    u = urlparse(url)
    if u.scheme in ("http", "https"):
        return u.hostname or url
    if u.netloc:
        return f"{u.scheme}://{u.netloc}"
    return url[:30] + ("…" if len(url) > 30 else "") or "a blank tab"


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"
