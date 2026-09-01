# Klipper Editor MCP

`klipper-editor-mcp` exposes the printer configuration folder and selected Moonraker actions to any MCP-compatible agent.

The server uses stdio JSON-RPC, so it can be launched by clients such as Codex, Claude Desktop, Cursor, Continue, Windsurf, or other agents that support local MCP servers.

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

The MCP server is launched by the client. You do not need to keep `npm run mcp` running manually unless you are testing it from a terminal.

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
