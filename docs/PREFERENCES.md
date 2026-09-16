# Shared preferences

K-Editor loads preferences from the printer before mounting the editor.
The server stores them in `<RATOS_VIEWER_ROOT>/.klipper-editor-preferences.json`.
Without that variable, the normal workspace-root resolution applies (usually
`~/printer_data/config`). The preceding version is kept in the `.bak` file.
Keep both files in printer configuration backups; they are outside releases.

Shared values include language, backup options, sidebar startup state, accent
logo, heater colors/cache, preview delay, terminal height/history, macro favorites
and Klipper-console command favorites. Terminal enable/mode remain in the existing
server-side `.klipper-editor-settings.json`. Open files and the active file are
unchanged. Running PTY sessions and their output are not stored or transferred.
The basic terminal history keeps its existing 80-command UI limit.

On first access from each browser, old browser values are imported. Existing
server settings take precedence; favorites are combined without duplicates.
A browser marker prevents repeated imports. Old browser values are retained as
a migration backup, but are no longer read as the active settings. Start the
updated editor in your previously configured browser before opening a new one.

Changes save immediately through an ordered request queue. Each server write
uses a temporary file, backup and atomic rename. Writes are serialized within
the single K-Editor process; do not run multiple instances against the same file.
Favorite changes merge additions/removals against the previous client list so
concurrent device edits do not replace the entire collection. Scalar settings
use the last successful write. Reload another already-open browser to load changes.

Failed saves display an error with Retry; do not close the browser until saved.
Pending requests trigger a browser unload warning where supported. This cannot
protect unsent changes against forced termination or power loss.
An unreadable file blocks loading rather than silently replacing it with defaults.
Stop K-Editor before manually restoring the `.bak` file.

Preferences and history are shared by everyone who can access this installation;
there are no per-user accounts. Avoid secrets in commands and protect LAN access.

Test with `node --test scripts/test-preferences.cjs`.
