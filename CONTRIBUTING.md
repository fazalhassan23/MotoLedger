# Contributing
Use Node.js 24 or later. Run `npm ci --ignore-scripts`, then `npm run check`. The application itself has no npm runtime dependencies.
Read [engineering standards](docs/development/engineering-standards.md) before development and [current gaps](docs/development/compliance.md) before release.
Start with an issue containing scope, acceptance criteria and testing requirements. Use short-lived `codex/<issue>-<description>` branches and meaningful Conventional Commits referencing the issue. Open a PR using the template. Obtain independent approval and passing applicable CI before merging. Close issues only after their definition of done is met.
Never commit personal backups, routes, images, signing keys or credentials. Tests use synthetic fixtures. To test a private export locally: `npm run test:fuelio -- "<path-to-backup.fuelio.zip>"`.
For Android, inspect `android/build.ps1` for SDK and signing prerequisites before running it. Signing material stays outside the repository. Verify permissions, file picker, import cancellation, cold restart and background GPS on a device before releasing an APK. Browser and Node tests cannot substitute for these checks.
No production release or branch-permission changes are included in the current work. See the changelog for unreleased changes.
