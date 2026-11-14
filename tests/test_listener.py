"""The Listener: WebSocket framing, the off state, and its honest failures. Chrome itself is not needed."""
import socket
import threading
import unittest
from unittest import mock

from skillbridge import listener
from skillbridge.listener import Listener, WebSocket


class FramingTest(unittest.TestCase):
    def test_xor_round_trips(self):
        mask = b"\x01\x02\x03\x04"
        for data in (b"", b"a", b"hello world", bytes(range(256)) * 300):
            self.assertEqual(WebSocket._xor(WebSocket._xor(data, mask), mask), data)

    def test_reads_server_frames(self):
        ws = WebSocket.__new__(WebSocket)
        a, b = socket.socketpair()
        ws.sock, ws.buf, ws.send_lock = a, b"", threading.Lock()
        big = b"x" * 70000
        b.sendall(b"\x01\x03abc" + b"\x80\x02de")                       # text in two fragments
        b.sendall(b"\x81\x7f" + len(big).to_bytes(8, "big") + big)      # 64-bit length
        self.assertEqual(ws.recv(), "abcde")
        self.assertEqual(ws.recv(), big.decode())
        a.close()
        b.close()


class ListenerStateTest(unittest.TestCase):
    def test_off_by_default_and_false(self):
        status = Listener().status()
        self.assertFalse(status["enabled"])
        self.assertFalse(status["sees_all"])
        self.assertEqual(status["reasons"], ["The Listener is off."])

    def test_no_chrome_is_reported_not_raised(self):
        with mock.patch.object(listener, "debug_port_info", return_value=None), \
                mock.patch.object(listener, "find_chrome", return_value=None):
            status = Listener().set_enabled(True)
        self.assertFalse(status["sees_all"])
        self.assertIn("Chrome isn't installed", status["reasons"][0])

    def test_counts_only_sane_action_kinds(self):
        l = Listener()
        l.cdp = object()
        l._on_event({"method": "Runtime.bindingCalled", "params": {
            "name": listener.BINDING, "payload": '{"click": 2, "keydown": 3, "x": "bad", "y": -1}'}})
        self.assertEqual(l.actions, {"total": 5, "by_kind": {"click": 2, "keydown": 3}})


if __name__ == "__main__":
    unittest.main()
