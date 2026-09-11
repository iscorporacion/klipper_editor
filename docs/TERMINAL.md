# Terminal modes

Options > Terminal controls both modes. Basic is the default for existing and
new installations. Select Interactive (PTY) for full-screen programs such as
`make menuconfig`, `nano`, and `htop`. Enable terminal separately with the toggle
or `KLIPPER_EDITOR_ENABLE_TERMINAL=true`.

Both modes run a local shell on the K-Editor host as its service user, not an SSH
connection and not root. In Windows local mode only Basic is available.

## Interactive PTY

- Requires Linux and Python 3 (3.9 or newer). Set `KLIPPER_EDITOR_PYTHON` if
  Python is not named `python3`. No native Node addon or sudo is required.
- Uses xterm.js and Python's standard PTY support. Input is sent in ordered
  HTTP requests and output streams over a single same-origin HTTP connection.
  The existing reverse proxy is reused with buffering disabled for the stream.
- Starts only when opening the terminal in PTY mode. One PTY session is allowed
  per K-Editor server process. Opening a second tab does not take over a session.
- Closing/disconnecting the panel, leaving the page, or losing the stream
  terminates the PTY and its foreground program. It does not reconnect or rerun
  commands automatically. Use the Connect button to start a new session.
- Changing mode prompts before closing an active session. Disabling terminal
  closes active sessions, unless the environment variable still enables it.
- Output uses backpressure, xterm history is limited to 2,000 lines, input has
  bounded queues, and sessions idle for 30 minutes are terminated.
- Resizing the panel sends the new rows and columns to the PTY. Enlarge the
  panel if menuconfig reports that the terminal is too small.

Example, from the printer's home directory:

```bash
cd ~/klipper
make menuconfig
```

The usual Klipper build dependencies must already be installed. Merely having
a PTY does not install compiler or menuconfig dependencies. Avoid compiling
firmware during a print; PTY overhead and compiler resource use are separate.

## Local HTTP and access

HTTP is intentionally supported for trusted LAN use and shows an unencrypted
connection warning. Terminal input, passwords, and output are not encrypted.
There is no new user-login system: anyone who can access this K-Editor instance
can request a shell when enabled. Keep it off the public Internet and disable
it when unnecessary. HTTPS encrypts transport but is not authentication.

PTY endpoints check Origin, require JSON requests, and use an unpredictable
session capability in POST bodies for stream/input/resize/close. Session data
is not saved to disk or exposed through the MCP tunnel. These checks do not
replace network access restrictions or user authentication.

## Release verification

The release includes `scripts/terminal-pty.py` at the top-level scripts path.
No ARM-specific Node binaries are packaged. Test the helper on Linux using
`python3 scripts/test-terminal-pty.py`; this runs an isolated Bash session and
does not contact Moonraker or the printer MCU.
