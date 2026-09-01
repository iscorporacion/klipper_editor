# Klipper Editor MCP

`klipper-editor-mcp` exposes the printer configuration folder and selected Moonraker actions to any MCP-compatible agent.

The server supports two transports:

- stdio JSON-RPC for clients that launch local MCP processes.
- HTTP JSON-RPC at `/mcp` for clients that require a server URL, including ChatGPT custom MCP connectors.

## Required Release

The printer must be updated to a Klipper Editor release that includes the MCP server.

If the printer was installed with `install-release.sh`, update it first from Mainsail/Moonraker Update Manager or reinstall the current release:

```bash
curl -fsSL https://raw.githubusercontent.com/iscorporacion/klipper_editor/main/install-release.sh | bash
```

After updating, this file must exist on the printer:

```bash
ls ~/klipper_editor_app/current/scripts/klipper-editor-mcp.mjs
```

If that file is missing, the installed release does not include MCP yet.

## Quick Activation

1. Update Klipper Editor on the printer to a release that includes `scripts/klipper-editor-mcp.mjs`.
2. Add the MCP server to your agent/client config.
3. Restart the agent/client so it reloads MCP servers.
4. Start with read-only access.
5. Enable write, G-code, restart, or delete only when needed.

Minimal read-only config:

```json
{
  "mcpServers": {
    "klipper-editor": {
      "command": "node",
      "args": ["/home/pi/klipper_editor_app/current/scripts/klipper-editor-mcp.mjs"],
      "env": {
        "KLIPPER_EDITOR_MCP_ROOT": "/home/pi/printer_data/config",
        "MOONRAKER_URL": "http://127.0.0.1:7125"
      }
    }
  }
}
```

Editor config with file write enabled:

```json
{
  "mcpServers": {
    "klipper-editor": {
      "command": "node",
      "args": ["/home/pi/klipper_editor_app/current/scripts/klipper-editor-mcp.mjs"],
      "env": {
        "KLIPPER_EDITOR_MCP_ROOT": "/home/pi/printer_data/config",
        "MOONRAKER_URL": "http://127.0.0.1:7125",
        "KLIPPER_EDITOR_MCP_ENABLE_WRITE": "true"
      }
    }
  }
}
```

The stdio MCP server is launched by the client. You do not need to keep `npm run mcp` running manually unless you are testing it from a terminal.

For ChatGPT custom MCP connectors, use the HTTP server instead.

## HTTP Server for ChatGPT

Start the HTTP MCP server on the printer or on a machine that can reach the printer:

```bash
cd ~/klipper_editor_app/current
KLIPPER_EDITOR_MCP_ROOT=/home/pi/printer_data/config \
MOONRAKER_URL=http://127.0.0.1:7125 \
npm run mcp:http
```

By default it listens only on localhost:

```text
http://127.0.0.1:3001/mcp
```

For a LAN test:

```bash
KLIPPER_EDITOR_MCP_HTTP_HOST=0.0.0.0 npm run mcp:http
```

Then verify from another machine:

```bash
curl http://<printer-ip>:3001/mcp
```

ChatGPT custom MCP connectors need a reachable remote URL. If the server is local/private, expose it through a secure tunnel and use the public HTTPS `/mcp` URL in ChatGPT.

Klipper Editor can start this for you from:

```text
Options > MCP para ChatGPT > Subir MCP
```

Copy the generated URL and paste it as the ChatGPT custom MCP server URL. Use `Bajar MCP` when you finish the session.

The generated URL is temporary and includes a temporary token:

```text
https://example.trycloudflare.com/mcp?token=temporary-token
```

In ChatGPT, choose `No authentication` and paste the full URL, including the `token` query parameter.

The tunnel helper uses `cloudflared`. The printer host must have the `cloudflared` command available in `PATH`. You can verify it with:

```bash
cloudflared --version
```

You can also run the bundled cloudflared helper manually:

```bash
cd ~/klipper_editor_app/current
KLIPPER_EDITOR_MCP_ROOT=/home/pi/printer_data/config \
MOONRAKER_URL=http://127.0.0.1:7125 \
npm run mcp:tunnel
```

The helper starts the HTTP MCP server locally, starts `cloudflared tunnel --url http://127.0.0.1:3001`, and prints a public HTTPS `/mcp?token=...` URL.

Example with a tunnel URL:

```text
https://example.trycloudflare.com/mcp?token=temporary-token
```

In ChatGPT:

```text
Name: Klipper Editor
Description: Controlled access to Klipper/RatOS configuration files and Moonraker actions.
Connection: Server URL
Server URL: https://example.trycloudflare.com/mcp?token=temporary-token
Authentication: No authentication
```

If you enable token protection:

```bash
KLIPPER_EDITOR_MCP_TOKEN=use-a-long-random-token npm run mcp:http
```

Use either a bearer token if your MCP client supports it, or append the token to the URL:

```text
https://your-secure-tunnel.example.com/mcp?token=use-a-long-random-token
```

Token-in-URL is less ideal than bearer auth because URLs can appear in logs. Prefer a secure tunnel or client-supported authorization when available.

## Safety Model

The MCP server is intentionally conservative:

- Read and search are enabled by default.
- Write and rename require `KLIPPER_EDITOR_MCP_ENABLE_WRITE=true`.
- Delete requires `KLIPPER_EDITOR_MCP_ENABLE_DELETE=true`.
- Sending G-code requires `KLIPPER_EDITOR_MCP_ENABLE_GCODE=true`.
- Firmware restart requires `KLIPPER_EDITOR_MCP_ENABLE_RESTART=true`.
- Existing files are backed up before `write_file` and `delete_file`.
- Paths are locked to the configured root and cannot escape it with `..`.
- `.git`, `.next`, `node_modules`, and `ratos-file-viewer` are blocked.

Do not expose this server to the public internet. Run it locally on the printer host, over SSH, or inside a trusted LAN/VPN.

## Environment

Required only if the default root is not correct:

```bash
export KLIPPER_EDITOR_MCP_ROOT=/home/pi/printer_data/config
```

Optional:

```bash
export MOONRAKER_URL=http://127.0.0.1:7125
export KLIPPER_EDITOR_MCP_ENABLE_WRITE=false
export KLIPPER_EDITOR_MCP_ENABLE_DELETE=false
export KLIPPER_EDITOR_MCP_ENABLE_GCODE=false
export KLIPPER_EDITOR_MCP_ENABLE_RESTART=false
export KLIPPER_EDITOR_MCP_MAX_READ_BYTES=1048576
```

The root also accepts `RATOS_VIEWER_ROOT` as a fallback. If neither variable exists, the server tries `~/printer_data/config`.

## Run Manually

From the app directory:

```bash
npm run mcp
```

Or directly:

```bash
node scripts/klipper-editor-mcp.mjs
```

## Example Client Config

Most MCP clients use a JSON config shaped like this:

```json
{
  "mcpServers": {
    "klipper-editor": {
      "command": "node",
      "args": ["/home/pi/klipper_editor_app/current/scripts/klipper-editor-mcp.mjs"],
      "env": {
        "KLIPPER_EDITOR_MCP_ROOT": "/home/pi/printer_data/config",
        "MOONRAKER_URL": "http://127.0.0.1:7125"
      }
    }
  }
}
```

For write access:

```json
{
  "mcpServers": {
    "klipper-editor": {
      "command": "node",
      "args": ["/home/pi/klipper_editor_app/current/scripts/klipper-editor-mcp.mjs"],
      "env": {
        "KLIPPER_EDITOR_MCP_ROOT": "/home/pi/printer_data/config",
        "MOONRAKER_URL": "http://127.0.0.1:7125",
        "KLIPPER_EDITOR_MCP_ENABLE_WRITE": "true"
      }
    }
  }
}
```

For maker workflows where the agent may send macros or restart firmware, enable those permissions explicitly:

```json
{
  "KLIPPER_EDITOR_MCP_ENABLE_GCODE": "true",
  "KLIPPER_EDITOR_MCP_ENABLE_RESTART": "true"
}
```

## Tools

### `list_files`

Lists files and folders under the configured root.

Input:

```json
{ "path": "RatOS" }
```

### `read_file`

Reads a text file.

Input:

```json
{ "path": "printer.cfg" }
```

### `write_file`

Writes a text file. Requires `KLIPPER_EDITOR_MCP_ENABLE_WRITE=true`.

If the file already exists, a backup is created next to it:

```text
printer.cfg.mcp-backup-20260901-143022
```

Input:

```json
{
  "path": "macros/custom.cfg",
  "content": "[gcode_macro TEST]\ngcode:\n  M118 hello\n"
}
```

### `rename_file`

Renames or moves a file. Requires `KLIPPER_EDITOR_MCP_ENABLE_WRITE=true`.

Input:

```json
{
  "from": "macros/old.cfg",
  "to": "macros/new.cfg"
}
```

### `delete_file`

Deletes a file. Requires `KLIPPER_EDITOR_MCP_ENABLE_DELETE=true`.

The file is backed up before deletion.

Input:

```json
{ "path": "macros/unused.cfg" }
```

### `search_config`

Searches text across configuration files.

Input:

```json
{
  "query": "extruder",
  "limit": 50
}
```

### `printer_status`

Reads a compact printer status from Moonraker.

Input:

```json
{}
```

### `run_gcode`

Sends G-code or a macro to Moonraker. Requires `KLIPPER_EDITOR_MCP_ENABLE_GCODE=true`.

Input:

```json
{ "script": "G28" }
```

### `restart_firmware`

Requests Klipper firmware restart through Moonraker. Requires `KLIPPER_EDITOR_MCP_ENABLE_RESTART=true`.

Input:

```json
{}
```

## Recommended Permission Profiles

Read-only agent:

```bash
KLIPPER_EDITOR_MCP_ROOT=/home/pi/printer_data/config
MOONRAKER_URL=http://127.0.0.1:7125
```

Editor agent:

```bash
KLIPPER_EDITOR_MCP_ROOT=/home/pi/printer_data/config
MOONRAKER_URL=http://127.0.0.1:7125
KLIPPER_EDITOR_MCP_ENABLE_WRITE=true
```

Maintenance agent:

```bash
KLIPPER_EDITOR_MCP_ROOT=/home/pi/printer_data/config
MOONRAKER_URL=http://127.0.0.1:7125
KLIPPER_EDITOR_MCP_ENABLE_WRITE=true
KLIPPER_EDITOR_MCP_ENABLE_GCODE=true
KLIPPER_EDITOR_MCP_ENABLE_RESTART=true
```

Delete should stay separate:

```bash
KLIPPER_EDITOR_MCP_ENABLE_DELETE=true
```

Enable it only for short maintenance sessions.
