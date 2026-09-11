#!/usr/bin/env python3
"""Bridge a Linux PTY to bounded JSON lines on stdin/stdout."""
import base64
import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios
import time


def emit(message):
    print(json.dumps(message), flush=True)


def main():
    shell, cwd, cols, rows = sys.argv[1:5]
    pid, master = pty.fork()
    if pid == 0:
        os.chdir(cwd)
        os.environ["TERM"] = "xterm-256color"
        fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", int(rows), int(cols), 0, 0))
        os.execv(shell, [shell, "-i"])
    os.set_blocking(master, False)
    incoming = b""
    pending = b""

    def stop(_signum, _frame):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    emit({"event": "ready"})
    try:
        while True:
            readable, writable, _ = select.select([0, master], [master] if pending else [], [], 1)
            if 0 in readable:
                block = os.read(0, 65536)
                if not block:
                    break
                incoming += block
                if len(incoming) > 262144:
                    raise ValueError("PTY input limit exceeded")
                while b"\n" in incoming:
                    line, incoming = incoming.split(b"\n", 1)
                    message = json.loads(line)
                    if message["action"] == "input":
                        pending += base64.b64decode(message["data"], validate=True)
                        if len(pending) > 262144:
                            raise ValueError("PTY pending input limit exceeded")
                    elif message["action"] == "resize":
                        width = max(20, min(500, int(message["cols"])))
                        height = max(5, min(200, int(message["rows"])))
                        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", height, width, 0, 0))
            if master in writable:
                try:
                    count = os.write(master, pending[:8192])
                    pending = pending[count:]
                except BlockingIOError:
                    pass
            if master in readable:
                try:
                    data = os.read(master, 8192)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not data:
                    break
                emit({"event": "data", "data": base64.b64encode(data).decode("ascii")})
    finally:
        # Stop the foreground program as well as its interactive shell.
        groups = {pid}
        try:
            groups.add(os.tcgetpgrp(master))
        except OSError:
            pass
        for group in groups:
            if group > 0:
                try:
                    os.killpg(group, signal.SIGHUP)
                except ProcessLookupError:
                    pass
        os.close(master)
        for _ in range(20):
            child, status = os.waitpid(pid, os.WNOHANG)
            if child:
                emit({"event": "exit", "code": os.waitstatus_to_exitcode(status)})
                return
            time.sleep(0.05)
        for group in groups:
            if group > 0:
                try:
                    os.killpg(group, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        os.waitpid(pid, 0)


if __name__ == "__main__":
    try:
        main()
    except (BrokenPipeError, SystemExit):
        pass
    except Exception as error:
        emit({"event": "error", "error": str(error)})
        sys.exit(1)
