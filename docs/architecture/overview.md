# Architecture
The primary deliverable is an Android APK. A static browser UI in `dist/` is shared with the Android WebView. `android/assets/phone.js` adapts the shell; Java owns device integration and GPS recording.
The browser stores garage data in localStorage (`motorledger.v1`) and original backup blobs in IndexedDB (`motorledger-original-backups`). The native recorder uses SQLite. There is no web synchronization backend.
`migrate.js` parses Fuelio CSV sections; `zip.js` validates/extracts archives; `backup.js` prepares previews and retains originals after confirmation. Existing global functions remain an architectural limitation.
No database schema migration is introduced by the archive validation change. Before releases, export and retain a separate backup; replacing app binaries does not roll back local data mutations. Recovery across stores needs further implementation (#3).
