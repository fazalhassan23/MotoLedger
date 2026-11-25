# Motorledger

Motorledger is a browser-based vehicle logbook. The sample Mazda has illustrative fill-ups, expenses, and maintenance reminders. Add a vehicle in Garage to start a separate ledger with your own currency, distance units, and fuel volume units.

## Run locally

From this directory, run `python -m http.server 8736 --bind 127.0.0.1 --directory dist`, then open [Motorledger locally](http://127.0.0.1:8736/). The static files have no build step. Garage records live in each browser's local storage for that origin. Use **Data & backups → Download backup** to retain or move them.

## Product research

Research date: November 25, 2026. The comparison uses Fuelio's published documentation and public store reviews. No head-to-head usability study was conducted.

| Evidence | Design decision |
| --- | --- |
| Fuelio offers GPS trip recording, fuel and cost logs, station prices, and native mobile integrations. Its FAQ says it offers no web version. [Official overview](https://fuel.io/) · [FAQ](https://fuel.io/faq/) | Build a desktop and phone web app. Use the larger desktop view for reviewing expenses and migrating history. |
| A long-time user described repeatedly entering fuel prices and requested a remembered price. This is one person's experience with a particular release. [App Store feedback](https://apps.apple.com/si/app/fuelio-mpg-mileage-tracker/id1487753318?platform=ipad) | Prepopulate a repeat fill-up with the last station and price. Selecting another known station recalls its most recent price. |
| Fuelio explains why regional price coverage varies. [Station coverage FAQ](https://fuel.io/faq/) | Show the driver's actual last purchase price and its date. Let the driver change both quotes, purchase volume, economy, and extra distance to compare the net cost of a detour. |
| Fuelio's CSV sample includes vehicle metadata, fuel logs, cost categories, and costs. The guide calls out dates and number formats as frequent import problems. [Migration guide and sample](https://fuel.io/faq/import-from-other-apps/) | Detect supported units, preview row counts, identify rejected rows, and import into a separate vehicle. Matching files are detected on retry. |
| Fuelio requires two full fills for an economy calculation. [Consumption FAQ](https://fuel.io/faq/) | Use full-to-full intervals, include intervening partial fills, and restart the baseline after a missed fill. The overall average weights each interval by fuel volume. |

## What the app does

- Keep separate vehicle histories, budgets, currency and units, including BDT, kilometers and liters.
- Log, edit, delete, search, filter and export fuel purchases and other expenses.
- Review monthly spending, weighted economy, individual tank performance, and upcoming service.
- Track maintenance by odometer, complete a reminder, and reopen it if needed.
- Estimate trip fuel, tolls and parking, then divide the cost among travelers.
- Record business and personal trips, calculate reimbursement using a user-supplied rate, and export a mileage report.
- Compare dated station prices and calculate net detour savings.
- Export filtered ledger CSVs, transfer a full garage with JSON, and preview a single-vehicle Fuelio CSV migration.

## Migration benchmark

Using the CSV linked from Fuelio's guide, Motorledger imports 55 fill-ups and one expense in a single confirmation after file selection. The preview identifies one out-of-order fuel record and shows its source row and date. Testing also confirmed that selecting the identical file again preserves the existing import.

The supported CSV subset uses a single tank, ISO dates, and either miles with US gallons or kilometers with liters. Select the source currency and fuel type in the preview. The original CSV is left intact. Maps, receipts, notes, reminder templates, and multi-tank history are outside the migration scope.

A cross-product 10× claim would require matched tasks, starting states, and user measurements. The import count measures bulk work performed, not a speed ratio against Fuelio. Fuelio itself supports CSV import.

## Verification and scope

Browser checks cover fuel entry and edits, persistence after reload, vehicle isolation, service completion, trip calculations, station detour economics, migration of Fuelio's public sample, duplicate-file detection, CSV downloads, JSON restore, and all seven views at 390, 768, and 1366 pixels.

Motorledger runs locally in the browser, with manual trip logging and historical station prices. Fuelio's native background GPS, CarPlay, Android Auto, live price network, and automatic cloud backup remain advantages for drivers who depend on them. A garage on a second device needs a manual backup transfer.

## Assets

The sample vehicle image is from [Mazda USA's MX-5 Miata product page](https://www.mazdausa.com/vehicles/mx-5-miata). Interface icons come from [Lucide](https://lucide.dev/) with license notices under `dist/ICON-LICENSE.txt`.

