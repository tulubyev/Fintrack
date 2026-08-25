---
name: Archived dependency locks
description: Security maintenance rule for preserved migration snapshots.
---

Archived migration snapshots can retain their own lockfiles and be included in dependency vulnerability scanning.

**Why:** A secure active workspace lockfile does not prevent stale, vulnerable package resolutions from being reported when an archived lockfile remains in the repository.

**How to apply:** When resolving dependency findings, inspect retained backups as well as active workspace manifests. Update an archive's direct package floors and use narrowly scoped compatible overrides when it needs to remain installable; otherwise, remove an obsolete archive lockfile rather than retaining a scan-visible dependency graph that cannot be safely resolved.