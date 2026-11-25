# Validate archives before preview
Date: 2026-11-25
Status: Implemented locally; review pending (#2).

## Context and problem
User-supplied Fuelio ZIP archives contain personal records and may be malformed. The prior parser did not comprehensively validate headers or checksums.

## Options considered
Use a runtime ZIP dependency, rely on the existing lightweight decoder, or validate the decoder before using its output.

## Decision and reasoning
Keep the small decoder with explicit bounds, consistent central/local headers, safe unique names, expansion limits and CRC32. Extract it into a testable module. Retain originals only when the user confirms import.

## Trade-offs
Avoids a new application runtime dependency, but custom ZIP code requires ongoing fuzzing and review. Unsupported ZIP features fail explicitly.

## Security and performance
Names cannot traverse paths; archive expansion is bounded. CRC32 detects accidental corruption and is not authentication. Limits bound memory consumption, but do not establish a mobile performance benchmark.

## Migration and consequences
No existing garage format changes. Cancellation leaves no persisted archive. Blob retention and garage mutation are separate storage transactions; crash recovery remains tracked in #3.
