# PR Draft

## Summary

- keep the Phase 1 / Phase 2 PoC stable while upgrading the payload formats for shorter QR output
- add compact single and compact/binary chunk formats without breaking already-printed payloads
- document the mainstream/default integration policy so the repo reads as one coherent line of development

## What Changed

- single QR now prefers compact `PQS1` instead of always emitting legacy self-contained HTML
- multi QR now compares `PQR2` (compact Base64), `PQR3` (compact Base91), and `PQ4` (raw binary byte mode)
- decoder now restores `PQR1`, `PQR2`, `PQR3`, `PQ4`, legacy single payloads, and `PQS1`
- chunked QR rendering now supports raw binary with integer-cell redraw and quiet zone for scan stability
- Playwright coverage now includes binary chunk round-trips and print-preview expectations
- README / working context / research notes now describe the mainstream default policy and the trade-offs clearly

## Validation

- `npm test`
- Playwright passes for encoder, decoder, chunked flow, readable layout, and binary chunk restoration

## Notes

- single QR keeps legacy `data:text/html;base64,...` compatibility, but mainstream default is now `PQS1`
- multi QR keeps `PQR1` compatibility, but mainstream default is count-first across `PQR2` / `PQR3` / `PQ4`
- in practice, `PQ4` is the default winner when minimizing QR count
- `PQR3` remains the strongest ASCII-first option for long-term readability/spec simplicity
- stock camera apps still may not directly open `data:` payloads; the decoder HTML is the intended path forward
- the intended user path is now: entry QR -> hosted decoder page -> in-page camera scan -> local media reconstruction/download
- the next useful step is deciding whether the release/default policy should stay count-first (`PQ4`) or expose an explicit ascii-first mode (`PQR3`)
