# Configuration Backups

New editor, MCP and widget-update backups are written into `.keditor-backups/`
inside the active config root. They preserve the original subfolders and use
`.bak` filenames, outside Happy Hare's `mmu/base/*.cfg` and `mmu/macros/*.cfg`.

Options > General > Create backup on save > Manage backups opens the rule
editor and the explicit migration preview. Nothing is moved on opening the
window, hiding backups, saving rules or generating the preview.

## Rules

`.keditor-backup-rules.json` is stored in the config root, outside application
releases. It can also be edited as a normal JSON file:

```json
{
  "version": 1,
  "rules": [
    { "id": "hh-old", "pattern": "mmu.old-*", "kind": "directory", "enabled": true },
    { "id": "custom", "pattern": "archive-*.cfg", "kind": "file", "enabled": true }
  ]
}
```

`kind` is `file`, `directory` or `both`. Patterns without `/` match names at
any depth; patterns with `/` match paths relative to the config root. `*`
matches within one segment, `?` matches one character and a `**` segment
matches any number of folders. Matching is case-insensitive. Shell syntax,
regular expressions, absolute paths and parent traversal are not accepted.

The same saved rules control backup icons, Hide backups, normal content
search and the migration preview. A matching folder is treated as one backup,
including its contents. Existing rules are never silently replaced when a
rules file is malformed; the tree falls back to defaults with an error so the
file can still be opened and repaired. Migration remains blocked.

## Moving Existing Copies

Select individual entries in the preview and confirm the transfer. Matching
alone does not authorize a move. Copies remain in place until confirmation.
Destinations are under `.keditor-backups/organized/`, preserve relative paths
and never overwrite existing files. The response identifies moved entries and
any individual failures; failed entries are not automatically retried.

Migration is blocked during active/paused prints or when Klipper is not ready.
Direct includes and active configuration files are protected, including known
`save_variables` files. Standard backup names caught by wildcard includes can
be moved to resolve the original duplicate-section problem. A custom pattern
alone cannot authorize moving an otherwise active wildcard config. Review
the preview before confirming, particularly when using broad custom rules.

Symlinks are not migrated. Folders containing symlinks require manual handling.
Open editor files and their containing folders are disabled in that client's
preview. Source snapshots and rules are rechecked at execution; changes since
preview require a new preview. A move across filesystems fails safely rather
than falling back to a recursive copy/delete.

No Klipper commands, include edits, firmware restarts or content rewrites are
performed by migration. Review the printer configuration before restarting.
