#!/usr/bin/env python3
"""Linux smoke test; never contacts the printer or Moonraker."""
import base64
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time


def main():
    if sys.platform != "linux":
        raise SystemExit("Run this test on Linux.")
    helper = Path(__file__).with_name("terminal-pty.py")
    process = subprocess.Popen(
        [sys.executable, "-u", str(helper), "/bin/bash", "/tmp", "80", "24"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env={**os.environ, "PS1": "", "PROMPT_COMMAND": ""},
    )
    events = queue.Queue()

    def read():
        for line in process.stdout:
            events.put(json.loads(line))
    threading.Thread(target=read, daemon=True).start()

    def send(message):
        process.stdin.write((json.dumps(message) + "\n").encode())
        process.stdin.flush()

    def input_text(value):
        send({"action": "input", "data": base64.b64encode(value.encode()).decode()})

    def expect(marker):
        output = ""
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            event = events.get(timeout=max(0.01, deadline - time.monotonic()))
            if event["event"] == "data":
                output += base64.b64decode(event["data"]).decode(errors="replace")
                if marker in output:
                    return
            elif event["event"] in ("error", "exit"):
                raise AssertionError(event)
        raise AssertionError(f"Missing {marker!r}: {output!r}")

    try:
        assert events.get(timeout=10)["event"] == "ready"
        input_text("stty -echo; test -t 0 && printf 'PTY_%s\\n' OK\n")
        expect("PTY_OK")
        send({"action": "resize", "cols": 100, "rows": 35})
        input_text("stty size\n")
        expect("35 100")
        input_text("printf '\\033[?1049hANSI_%s\\033[?1049l\\n' OK\n")
        expect("\x1b[?1049hANSI_OK\x1b[?1049l")
        input_text("sleep 30\n")
        time.sleep(0.3)
        input_text("\x03")
        input_text("printf 'INTERRUPT_%s\\n' OK\n")
        expect("INTERRUPT_OK")
        process.stdin.close()
        assert process.wait(timeout=5) == 0
        print("PASS: PTY, input, resize, ANSI, Ctrl+C, disconnect")
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=5)


if __name__ == "__main__":
    main()
