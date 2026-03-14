# PR Draft

## Summary

- stabilize the Phase 1 self-contained QR encoder and keep it aligned with the original concept
- add working context notes so future threads can recover intent quickly
- start Phase 2a with a minimal hosted decoder flow for opening a decoder page, scanning payload QR codes, and saving restored media locally

## What Changed

- replaced the fragile inline QR rendering path with a self-contained inline `qrcodejs` renderer while preserving zero external runtime dependencies
- improved recording reliability without changing the Phase 1 payload contract
- fixed Playwright tests to resolve local file paths dynamically
- documented what Phase 1 did and did not validate
- added `parapara-qr-decoder.html` as the first decoder entry point
- added `index.html` as the GitHub Pages entry URL for a future entry QR
- added a GitHub Pages workflow for static deployment
- added decoder Playwright coverage for entry-page redirect and manual payload restoration

## Validation

- `npm test`
- Playwright passes for the encoder flow and the decoder entry/manual-restore flow

## Notes

- Phase 1 remains an encoder-first proof of concept for self-contained `data:text/html;base64,...` QR payloads
- stock camera apps still may not directly open `data:` payloads; the decoder HTML is the intended path forward
- the intended user path is now: entry QR -> hosted decoder page -> in-page camera scan -> local media reconstruction/download
- the next useful step is broadening in-page camera decoding support, then extending to chunked multi-QR reconstruction
