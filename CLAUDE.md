# CLAUDE.md — KaiOS Messaging Client + Self-Hosted Bridge

## What this project is

A two-part personal messaging system:

- **`/bridge`** — self-hosted server (single-user). Wraps **signal-cli**
  (linked as a secondary device to my existing Signal account) and a
  Telegram MTProto client. Exposes ONE private API (WebSocket + minimal
  REST) that the client consumes. May later reuse parts of DumbTalk
  (https://github.com/samtate/dumbtalk) — treat its API shape as prior
  art, not gospel.
- **`/client`** — a KaiOS 2.5 web app ("packaged app") for a Nokia 6300 4G
  (codename: nokia-leo, MSM8909, 512 MB RAM, KaiOS 2.5.x) and an
  Energizer E241S (same OS family, tighter memory). Installed by
  sideloading (gdeploy / WebIDE), never via the KaiStore.

The client is a thin terminal: all protocol work (Signal, Telegram)
happens on the bridge. The client only ever talks to OUR bridge API.

Primary goals: it must run on the real phone, and I must learn from the
code. Prefer boring, readable solutions over clever ones.

## Hard platform constraints — client (NON-NEGOTIABLE)

The client runs on **Gecko 48** (Firefox 48 era, 2016). Assume nothing
newer exists. Modern syntax that parses fine in Node will throw a
**silent SyntaxError on the phone** and the app just won't start.

- **Source vs. build:** `/client/src` is modern JS (ES2020 is fine —
  it gets transpiled). `/client/dist` is what ships: **Babel output
  targeting Firefox 48**, single bundle, no dynamic import, no source
  maps in the shipped package.
- Never edit `/client/dist` by hand; never deploy `/client/src`.
- **Even after transpiling, these are unavailable at runtime — do not
  rely on them and do not polyfill heavyweight replacements:**
  - CSS Grid (use flexbox — Gecko 48 flexbox is solid), `gap` in
    flexbox, CSS custom properties are OK but verify in device testing,
    no `position: sticky`.
  - `fetch` exists but is bare-bones; no AbortController, no streams.
    For anything beyond simple GET/POST, prefer XMLHttpRequest or our
    tiny wrapper in `src/lib/http.js`.
  - WebSocket: available and reliable — this is our main transport.
  - No Service Workers, no Web Push, no IndexedDB reliability promises —
    use localStorage (small!) and in-memory state.
  - No Intl niceties beyond basics; date formatting is manual.
- **Screen: 240×320 (QVGA), 2.4 inches.** Design for ~10 rows of text.
  One column. No horizontal scrolling, ever. Font sizes in px, minimum
  14px for body text.
- **Memory: 512 MB total device RAM, our budget is tens of MB.** Cap
  in-memory message cache (constant in `src/config.js`). No unbounded
  arrays, no keeping full conversation history in DOM. Virtualize or
  paginate lists above ~50 items.
- **Input: D-pad + T9 keypad only. There is NO touch and NO mouse.**
  - Everything reachable via Up/Down/Left/Right/Enter.
  - Softkeys: left/right/center soft keys are `keydown` events with
    `key` values `SoftLeft`, `SoftRight`, `Enter`. Every screen defines
    its softkey bar (left = secondary action, center = select/confirm,
    right = back/options). Follow this convention everywhere.
  - Maintain an explicit focus model (our `src/lib/nav.js`): one
    focused element per screen, visible focus style, focus never lost.
  - Text input uses the platform's native T9 in `<input>`/`<textarea>`;
    do not intercept or re-implement typing.
- **Packaging:** `manifest.webapp` (NOT manifest.json / PWA manifest).
  Required fields: name, description, launch_path, icons (56 and 112),
  type "privileged", permissions (only what we use — e.g. "systemXHR"
  for cross-origin XHR to the bridge, "desktop-notification", "alarms").
  If you add a permission, say so explicitly in the PR/commit message.
- **App lifecycle:** apps are killed aggressively in the background.
  Never assume a long-lived background process on the phone. Reconnect
  the WebSocket on every foreground/visibilitychange. Notification
  strategy is poll-on-open + `navigator.mozAlarms` periodic wake
  (guarded feature-detect) — do NOT propose Web Push.
- KaiOS-specific APIs are `moz`-prefixed and feature-detected, never
  assumed: `navigator.mozAlarms`, `navigator.mozSetMessageHandler`.
  When unsure whether a platform API exists on 2.5, SAY SO and add a
  feature-detect + graceful fallback instead of guessing.

## Hard constraints — bridge

- Runs on my Linux server (Docker Compose). Single user: me. No
  multi-tenancy, no user accounts system — one bearer token.
- **Signal:** via signal-cli as a LINKED SECONDARY device. Never
  propose registering as primary, never propose third-party Signal
  protocol implementations. If signal-cli's interface changes, adapt
  our wrapper; do not fork protocol logic into our code.
- **Telegram:** official MTProto via a maintained library with my own
  API credentials. Client-side MTProto on the phone is a possible LATER
  experiment; the bridge path is the default. Do not mix the two.
- **WhatsApp: out of scope unless I explicitly say otherwise.**
- API is private: HTTPS only, behind my reverse proxy; bearer token in
  the WebSocket URL fragment / Authorization header pattern copied from
  DumbTalk's reasoning (token must never appear in paths or query
  strings that get logged). No CORS wildcard — exact origin allowlist.
- Plaintext messages exist on this server (E2E terminates here by
  design). Never add: analytics, telemetry, external error reporting,
  third-party CDNs, or any outbound call that isn't Signal/Telegram
  infrastructure or my own hosts. This applies to the client too — no
  Google Fonts, no CDN scripts; everything ships in the app package.
- Message cache on disk stays inside the Docker volume, size-capped,
  with a config switch to disable persistence entirely.

## Toolchain & workflow

- `just client-build` = Babel → single IIFE bundle in `client/dist/`
  (with `manifest.webapp` and static assets copied in). `just
  package-client` additionally zips `dist/` into `client/tell-app.zip`
  — only needed for WebIDE Fenix / OmniSD sideload paths.
- **Deploy to phone via gdeploy** (BananaHackers,
  https://gitlab.com/suborg/gdeploy — not on npm). Install once:
  `git clone`, then `npm i && npm link`. Prereqs on PATH: `adb`
  (Google SDK Platform Tools). Phone in dev mode; verify with
  `adb devices`.
  - **Run gdeploy on Node 22 (not 24).** gdeploy is Node-12-era code
    that uploads the zip as a JS string via `String.fromCharCode`
    per byte; on Node 24 the phone rejects the transferred file with
    `NS_ERROR_FILE_CORRUPTED`. Node 22 works. Portable install:
    unzip Node 22 to e.g. `C:\node22`, then per-shell:
    `$env:PATH = "C:\node22;$env:PATH"`. npm link is per-Node-install
    so re-run `npm i && npm link` in the gdeploy repo under Node 22.
  - PowerShell may block `npm.ps1` (script signing) — either call
    `npm.cmd` or `Set-ExecutionPolicy -Scope Process -ExecutionPolicy
    Bypass` for the session.
  - `gdeploy install client/dist` — takes a **directory**, not a zip.
    So the raw deploy loop is `just client-build && gdeploy install
    client/dist`. Or run `just deploy-phone` (wraps
    `scripts/deploy-phone.ps1`) which pins Node 22, bypasses the
    PowerShell script-signing policy for that process, uninstalls old
    tell copies (each install gets a new UUID), builds, installs,
    launches, and pushes `bridge.url` + `bridge.token` (read from
    `bridge/.env`) into localStorage via `gdeploy evaluate` — one
    command, no T9 typing.
  - `gdeploy evaluate <app-id> "<js>"` runs JS in the installed app
    context. This is how to prefill `localStorage` (`bridge.url`,
    `bridge.token`) without typing on T9. `gdeploy list` finds the id.
- **Deploy (Docker):** `docker-compose.yml` at the repo root runs the bridge
  and signal-cli in ONE container (`bridge/Dockerfile`: Node 22 + Temurin
  JRE 25 + pinned signal-cli release; the bridge spawns the daemon as a
  child process, same as bare). Port is bound to `127.0.0.1:8787` only —
  the host reverse proxy terminates TLS. `/data` is a named volume holding
  signal-cli's account store (`SIGNAL_CLI_DATA_DIR`, pinned by compose).
  On the server: clone, create `bridge/.env` (set `SIGNAL_CLI_ENABLED=true`),
  `just bridge-up`, then once `just signal-link` (prints a QR code; scan
  from the primary phone under Settings → Linked devices) and `docker
  compose restart bridge` so the daemon loads the new account. `just
  bridge-logs` tails it. The daemon runs fine with zero accounts, so
  bringing the bridge up before linking is safe. For phone testing against
  the Windows dev box, a root-level `.env` (gitignored) with
  `BRIDGE_BIND=0.0.0.0` publishes the port on the LAN instead of loopback.
  Upgrading signal-cli = bump `SIGNAL_CLI_VERSION` in the Dockerfile. Note: signal-cli's bundled native libsignal is
  x86_64-only; arm64 hosts need a different route.
- `just logs` (not yet wired) = adb logcat filtered to our app tag.
  Instrument with `console.log` generously behind a DEBUG flag; the
  log stream is the only visibility into the device (nobody can see
  the screen but me).
- `just bridge-dev` = run bridge locally; the client also runs in a
  desktop browser (feature-detects guard the moz APIs) for fast
  iteration — but **desktop rendering proves nothing about the phone**.
  Anything touching navigation, focus, layout, or lifecycle is only
  "done" after I confirm it on the device.
- Tests: bridge logic gets real tests (API contract, signal-cli wrapper
  parsing). Client gets logic-level tests only (nav model, formatting);
  no headless-browser UI tests — the phone is the test.

## State (2026-09-08, paused mid-project)

Slices landed on `main` and pushed to `origin/main`:
- **a** — bridge `/hello` + bearer auth.
- **b** — client scaffold + CORS on bridge for desktop dev.
- **c** — WebSocket transport at `/ws` with first-message auth.
- **d** — settings screen (URL + token), navigation dispatcher, package-client.
- **e.1** — `SignalManager` on bridge (spawn signal-cli daemon, TCP-poll,
  restart-with-backoff, `not-installed` is a terminal state). Broadcasts
  `signal.status` frames on WS. Disabled by default; opt in via
  `SIGNAL_CLI_ENABLED=true` in `bridge/.env`.

Next planned slice: **e.2** — bridge subscribes to signal-cli's JSON-RPC
event stream, forwards incoming Signal messages as `signal.message` WS
frames. Prerequisite: signal-cli installed on the Linux target and
linked as a *secondary* device (out-of-band, one-time).

## How to work with me

- I'm a Medizininformatik engineer; I self-host and read code. Explain
  non-obvious decisions in one or two sentences in commit messages —
  teach, don't just produce.
- Small steps: one screen / one endpoint per session. Working > complete.
- When my request conflicts with a constraint above, STOP and say which
  constraint — don't silently comply, don't silently refuse.
- KaiOS 2.5 is niche; your training data on it is thin. When uncertain
  about a platform detail, say "verify on device" instead of asserting.
  Authoritative references: BananaHackers wiki, the bmndc/nokia-leo
  repo, and existing KaiOS 2.5 app source — prefer checking those over
  inventing.
- Never commit: tokens, phone numbers, my server hostnames, Telegram
  API credentials, signal-cli data paths. `.env` + `.gitignore` from
  day one; config examples use placeholder values.
