# Security and privacy

Analysis does not execute the analyzed project's code, install scripts or configuration JavaScript. It requires a trusted filesystem workspace. Git operations use argument arrays and immutable validated commit/object IDs. Snapshots are bounded and deleted after use. Source symlinks are skipped; evidence paths are realpath-checked before opening.

The extension has no telemetry or runtime network calls. The webview CSP disables network connections and uses a nonce for the local bundled script. Webview messages are treated as untrusted input. The analyzer is not a hardened sandbox for malicious compiler configs or actively mutating filesystems.

Do not post private source paths, import strings or reports publicly when reporting a vulnerability. Contact the repository owner privately. There is no dedicated security email until an owner configures one. Dependencies used only during development/package creation are not shipped wholesale; runtime bundled license notices are included.
