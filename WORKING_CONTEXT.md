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

## Phase 1 Validation Result

What has been validated:

- A short audio clip can be embedded into a single self-contained QR.
- The QR payload can contain both the playback HTML and the audio bytes.
- When that payload is opened on a device, the original audio can be reconstructed and played locally on that device.
- Browser-side "test playback" and Playwright round-trip tests both confirm this.

What has not been validated yet:

- Self-contained video payloads.
- General-purpose stock camera apps directly opening the payload.
- Multi-QR chunking and reassembly.

## Phase 2a Validation Result

What has now been validated on iPhone:

- The hosted decoder page can be opened from an entry URL.
- The decoder can start camera-based QR reading on iPhone Safari using the current fallback path.
- A payload QR shown on a Mac screen can be scanned by the iPhone decoder.
- The original audio file can be reconstructed and downloaded locally as `restored-audio.webm`.

Current caveat:

- Local save is working, but immediate playback on iPhone is still format-compatibility-limited because the restored file is `webm/opus`.

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

## Phase 2 Decoder Direction

The preferred decoder architecture is now:

1. Open a dedicated decoder HTML first.
2. Tap a single button such as "QRを読んで元の音声・動画を復元する".
3. The decoder HTML opens the camera with browser APIs.
4. It scans one or more payload QR codes.
5. It reconstructs the media locally and then plays or downloads it.

Ideal entry UX:

- A general camera app reads a small entry QR that opens the decoder HTML.
- The decoder HTML then handles reading the actual payload QR code(s).

This keeps the stock camera's job minimal and moves actual decoding into a controlled local web app.

Current Phase 2a starting point:

- `/Users/miwakenomac/Projects/parapara-qr/parapara-qr-decoder.html`
- single-button decoder entry
- camera start attempt through browser APIs
- manual payload paste fallback
- local iframe/media restoration and download link generation
- root entry page at `/Users/miwakenomac/Projects/parapara-qr/index.html`
- live entry URL: `https://jtcpride.github.io/parapara-qr/`

Desired end-user path:

1. Read an entry QR that points to the hosted decoder page.
2. Open the decoder on iPhone.
3. Tap the decode button to open the camera inside the decoder page.
4. Read the payload QR code(s).
5. Save the reconstructed media locally on the device.
