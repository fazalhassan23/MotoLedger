# Security
Do not post personal backups, coordinates, receipts or signing material in public issues. Contact the repository owner through an available private channel; private vulnerability reporting may be used if enabled.
Import input is untrusted. ZIP validation checks bounded offsets, expansion size, names, headers and CRC32 before use. CRC detects corruption, not authenticity. CSV section dictionaries use null prototypes.
The original archive is retained locally only after import confirmation. Browser IndexedDB, localStorage and native SQLite are not a single transaction. Recovery across those stores remains tracked in issue #3.
This application does not provide encrypted cloud storage, authentication or multi-user authorization. Browser-origin isolation and Android application storage are the current boundaries. No new server or cloud credentials are required.
