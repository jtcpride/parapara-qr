# Parapara QR Working Context

## Project Intent

This project is not just a QR utility. The long-term goal is a durable, paper-based digital memory format:

- Data layer: QR chunks hold digital media data.
- Analog fallback: flipbook pages preserve a visible playable form.
- Decoder layer: source code can be printed as readable text.
- Spec layer: README explains the format so it can be reimplemented later.

The core idea is "a digital-era record pressed onto paper" with as little infrastructure dependency as possible.

## Phase 1 Scope

Phase 1 is intentionally narrow:

- Single self-contained QR only.
- Single HTML file.
- No CDN or other external runtime dependency.
- No server communication.
- Encoder only.
- QR payload format is `data:text/html;base64,...`.
- Audio is embedded inside the HTML as `data:audio/...;base64,...`.
- Expected validation path is browser "test playback" plus Playwright round-trip tests.

Important known limitation:

- iPhone/Android stock camera apps may recognize the QR but refuse to open `data:` URLs. That is expected for Phase 1 and is planned to be solved by a decoder app in Phase 2.

## Current Local Setup

- Canonical repo used for implementation: `/Users/miwakenomac/Projects/parapara-qr`
- Archived scratch folder with the older experimental HTML and sample audio: `/Users/miwakenomac/Projects/parapara-qr-scratch`

Edit the canonical repo unless there is a deliberate reason to compare against the archived scratch copy.

## Current Engineering Direction

We are prioritizing:

1. Keeping the payload self-contained.
2. Preserving zero external runtime dependencies.
3. Making recording work reliably on desktop browsers.
4. Ensuring QR rendering picks a valid version instead of silently producing broken output.
5. Keeping the code and tests aligned with the original Phase 1 instruction document.

## Next Likely Steps After Phase 1

- Phase 2 decoder UI for continuous QR scanning in-browser.
- Multi-QR chunking for longer audio/video.
- Printable flipbook + QR layout.
- Optional printed source/README bundle for long-term recoverability.
