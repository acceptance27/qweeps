"""IPC Protocol between QWEEPS voice daemon and the ManimGL visual harness.

Uses Unix Domain Sockets for minimal latency (<1ms) and robust local messaging.
Supports bi-directional event passing and remote playback commands.
"""
from __future__ import annotations

import json
import os
import socket
import threading
import time
from typing import Any, Callable

DEFAULT_SOCKET_PATH = "/tmp/qweeps-visual.sock"


class VisualIPCServer:
    """Server hosted in the visual process (or vice versa) to receive commands and emit events."""

    def __init__(self, socket_path: str = DEFAULT_SOCKET_PATH) -> None:
        self.socket_path = socket_path
        self._server_sock: socket.socket | None = None
        self._client_sock: socket.socket | None = None
        self._running = False
        self._thread: threading.Thread | None = None
        self._callbacks: dict[str, list[Callable[[dict[str, Any]], None]]] = {}

    def on(self, event_type: str, callback: Callable[[dict[str, Any]], None]) -> None:
        self._callbacks.setdefault(event_type, []).append(callback)

    def start(self) -> None:
        if os.path.exists(self.socket_path):
            try:
                os.unlink(self.socket_path)
            except OSError:
                pass

        self._server_sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self._server_sock.bind(self.socket_path)
        self._server_sock.listen(1)
        self._running = True

        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()

    def _listen_loop(self) -> None:
        while self._running and self._server_sock:
            try:
                conn, _ = self._server_sock.accept()
                self._client_sock = conn
                self._handle_client(conn)
            except OSError:
                break

    def _handle_client(self, conn: socket.socket) -> None:
        buffer = ""
        while self._running:
            try:
                data = conn.recv(4096)
                if not data:
                    break
                buffer += data.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                        msg_type = msg.get("type", "unknown")
                        for cb in self._callbacks.get(msg_type, []):
                            try:
                                cb(msg)
                            except Exception:
                                pass
                        for cb in self._callbacks.get("*", []):
                            try:
                                cb(msg)
                            except Exception:
                                pass
                    except json.JSONDecodeError:
                        pass
            except OSError:
                break
        conn.close()
        if self._client_sock == conn:
            self._client_sock = None

    def emit(self, event_type: str, **payload: Any) -> bool:
        if not self._client_sock:
            return False
        data = {"type": event_type, "timestamp": time.time(), **payload}
        raw = (json.dumps(data) + "\n").encode("utf-8")
        try:
            self._client_sock.sendall(raw)
            return True
        except OSError:
            self._client_sock = None
            return False

    def close(self) -> None:
        self._running = False
        if self._client_sock:
            try:
                self._client_sock.close()
            except OSError:
                pass
            self._client_sock = None
        if self._server_sock:
            try:
                self._server_sock.close()
            except OSError:
                pass
            self._server_sock = None
        if os.path.exists(self.socket_path):
            try:
                os.unlink(self.socket_path)
            except OSError:
                pass


class VisualIPCClient:
    """Client used by QWEEPS to connect to an active visual harness."""

    def __init__(self, socket_path: str = DEFAULT_SOCKET_PATH) -> None:
        self.socket_path = socket_path
        self._sock: socket.socket | None = None
        self._running = False
        self._thread: threading.Thread | None = None
        self._callbacks: dict[str, list[Callable[[dict[str, Any]], None]]] = {}

    def on(self, event_type: str, callback: Callable[[dict[str, Any]], None]) -> None:
        self._callbacks.setdefault(event_type, []).append(callback)

    def connect(self, timeout: float = 3.0) -> bool:
        start = time.time()
        while time.time() - start < timeout:
            if os.path.exists(self.socket_path):
                try:
                    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                    s.connect(self.socket_path)
                    self._sock = s
                    self._running = True
                    self._thread = threading.Thread(target=self._recv_loop, daemon=True)
                    self._thread.start()
                    return True
                except OSError:
                    time.sleep(0.05)
            else:
                time.sleep(0.05)
        return False

    def _recv_loop(self) -> None:
        buffer = ""
        while self._running and self._sock:
            try:
                data = self._sock.recv(4096)
                if not data:
                    break
                buffer += data.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                        msg_type = msg.get("type", "unknown")
                        for cb in self._callbacks.get(msg_type, []):
                            try:
                                cb(msg)
                            except Exception:
                                pass
                        for cb in self._callbacks.get("*", []):
                            try:
                                cb(msg)
                            except Exception:
                                pass
                    except json.JSONDecodeError:
                        pass
            except OSError:
                break
        self.close()

    def send(self, msg_type: str, **payload: Any) -> bool:
        if not self._sock:
            return False
        data = {"type": msg_type, "timestamp": time.time(), **payload}
        raw = (json.dumps(data) + "\n").encode("utf-8")
        try:
            self._sock.sendall(raw)
            return True
        except OSError:
            self.close()
            return False

    def close(self) -> None:
        self._running = False
        if self._sock:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None
