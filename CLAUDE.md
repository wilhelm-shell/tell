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

- `just deploy-client` = build (Babel → bundle → zip with
  manifest.webapp) → `gdeploy install` to the connected phone.
- `just logs` = adb logcat filtered to our app tag. Instrument with
  `console.log` generously behind a DEBUG flag; the log stream is the
  only visibility into the device (nobody can see the screen but me).
- `just bridge-dev` = run bridge locally; the client also runs in a
  desktop browser (feature-detects guard the moz APIs) for fast
  iteration — but **desktop rendering proves nothing about the phone**.
  Anything touching navigation, focus, layout, or lifecycle is only
  "done" after I confirm it on the device.
- Tests: bridge logic gets real tests (API contract, signal-cli wrapper
  parsing). Client gets logic-level tests only (nav model, formatting);
  no headless-browser UI tests — the phone is the test.

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
