# PR Draft

## Summary

- stabilize the Phase 1 self-contained QR encoder and keep it aligned with the original concept
- add working context notes so future threads can recover intent quickly
- start Phase 2a with a minimal decoder HTML that can restore pasted payloads and attempt camera-based QR reading

## What Changed

- replaced the fragile inline QR rendering path with a self-contained inline `qrcodejs` renderer while preserving zero external runtime dependencies
- improved recording reliability without changing the Phase 1 payload contract
- fixed Playwright tests to resolve local file paths dynamically
- documented what Phase 1 did and did not validate
- added `parapara-qr-decoder.html` as the first decoder entry point
- added a decoder Playwright test for manual payload restoration

## Validation

- `npm test`
- Playwright passes for both the encoder flow and the decoder manual-restore flow

## Notes

- Phase 1 remains an encoder-first proof of concept for self-contained `data:text/html;base64,...` QR payloads
- stock camera apps still may not directly open `data:` payloads; the decoder HTML is the intended path forward
- the next useful step is reading actual QR payloads from the decoder HTML in a broader set of browsers, then extending to chunked multi-QR reconstruction
