# Repository instructions

Read docs/development/engineering-standards.md before substantive changes. It contains the user's authoritative engineering requirements.

Read docs/development/work-items.md for the active work and docs/development/compliance.md for the current gaps. Local work item identifiers are repository records, not GitHub issue numbers. Migrate these records into the configured issue tracker when a remote is established.

Keep personal backups, GPS traces, images, signing materials and test exports out of Git. Use synthetic fixtures in automated tests. Private file paths must be supplied as command arguments, never embedded in tests.

Use an issue-specific codex/ branch, Conventional Commits, reviewed pull requests and the documented release checks. Run npm run check before requesting review. Report unexecuted checks explicitly.

Preserve existing data and supported callers. Do not claim Fuelio parity, Android device testing, accessibility conformance, review approval, or deployment without evidence. Keep unfinished functionality under Unreleased in CHANGELOG.md.

The main deliverable is the Android APK. Browser tests alone cannot verify permissions, document providers, lifecycle behavior or background GPS. Changes to those paths require Android runtime checks before release.

External repository permissions, independent review and production publication require the user's established authority. Do not bypass protections or invent issue/PR references.

