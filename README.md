This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Monitoring alert evaluation

Run `npm run monitoring:alerts` as a separate long-running Node process alongside
the Next.js app and the BullMQ workers. This dedicated process periodically
refreshes the reframe and dubbing queue-depth gauges, reads shared Redis-backed
latency and final-outcome windows, and invokes the existing alert evaluator.
Alerts are emitted as structured process logs; this command does not send
external notifications.

Configure the thresholds, observation window, cooldown, and
`MONITORING_ALERT_EVALUATION_INTERVAL_SECONDS` in the process environment. The
interval must be a positive whole number of seconds. Evaluation runs once at
startup and then serially after each configured interval; a slow or failed
evaluation does not overlap the next one or stop later retries. Configure
exactly one monitoring process replica because cooldown state is process-local.

Latency is aggregated into minute buckets in Redis using only pipeline, outcome
status, and time bucket in keys/fields; individual job or user identifiers are
not stored. The local Prometheus histograms remain process-local for exposition.
Redis bucket boundaries make latency and BullMQ failure-rate windows approximate
by up to one minute. Missing latency history, insufficient failure-rate history,
or failed queue collection is skipped rather than treated as a firing condition.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## AI Script, Voiceover & Audio Sync (AVS)

AVS turns a recorded demo into an AI-voiced, time-synced, subtitled video. It is
**PRO/ENTERPRISE only** and ships behind a feature flag, so it is completely
invisible and no-op when the flag is off — existing (non-AVS) demos and exports
are never affected.

### The flow

Open a saved demo in the editor, switch to the **AI Voice** sidebar tab, and use
**Generate AI Voiceover Demo** to run the full pipeline in one click:

1. **Steps** — the demo is auto-sliced into steps from the Chrome-extension
   click-capture timestamps (falling back to one full-length step if there are no
   clicks). Split / merge / adjust boundaries in the panel timeline.
2. **AI script** — per-step narration is seeded from the Deepgram transcript and
   rewritten into a tone (Sales / Onboarding / Support / Marketing) via OpenAI.
3. **Voiceover** — the script is synthesized into one continuous MP3 with
   Deepgram Aura TTS in the Cloud Run worker, recording each step's timing.
4. **Captions** — the voiceover is transcribed and stabilized into flicker-free
   captions (also exportable as `.vtt`).
5. **Time-alignment** — a pre-pass freeze-frames video where the audio is longer
   than its step and pads silence where it is shorter, muxing the voiceover into
   one aligned source MP4.
6. **Export** — the aligned source (AI voice already muxed in) plus the stabilized
   captions are fed into the **existing** export route, so the final render carries
   the AI voice, freeze-frame timing, and clean captions.

Every stage persists to `Demo.editing.avs` via the normal autosave (there is no
DB migration — all AVS state lives in the existing `editing` JSON). Each stage
also has its own editor in the panel for fine-tuning before or after a full run.

### Environment variables

AVS keys are **server-side only** — never expose them with a `NEXT_PUBLIC_`
prefix.

| Variable                  | Where                     | Purpose                                                               |
| :------------------------ | :------------------------ | :-------------------------------------------------------------------- |
| `AVS_ENABLED`             | Next app (server)         | Master switch for the AVS server routes. Set to `true` to enable.     |
| `NEXT_PUBLIC_AVS_ENABLED` | Next app (client)         | Shows the "AI Voice" sidebar panel. Set to `true` to enable.          |
| `OPENAI_API_KEY`          | Next app (server)         | OpenAI script tone rewrite (`/api/avs/script`).                       |
| `GCP_VIDEO_WORKER_URL`    | Next app (server)         | Reaches the Cloud Run worker for Aura TTS, subtitles, and alignment.  |
| `WORKER_SECRET`          | Next app + Cloud Run worker | Required shared bearer secret for every worker processing request.      |
| `DEEPGRAM_API_KEY`        | **Cloud Run worker only** | Deepgram transcription + Aura TTS. The Next app never holds this key. |

To enable AVS for a staging/QA environment, set both `AVS_ENABLED=true` and
`NEXT_PUBLIC_AVS_ENABLED=true` there (plus `OPENAI_API_KEY` and
`GCP_VIDEO_WORKER_URL`), and make sure the worker has `DEEPGRAM_API_KEY`.
Configure the same non-empty `WORKER_SECRET` in both the Next app and Cloud Run
worker in every environment that processes jobs. Keep AVS feature flags disabled
in production until the feature is signed off. See `.env.example` for the full list.

## Watermarking & Camera Bubble (WTM)

WTM brands an exported demo: a corner watermark on every export, and an optional
circular webcam bubble composited into the video. It ships behind a feature flag
and is a complete no-op when the flag is off — including the free-tier
watermark, so existing exports are unchanged until enablement.

### Plan behavior

|               | FREE / anonymous                                                                    | PRO / ENTERPRISE                                                   |
| :------------ | :---------------------------------------------------------------------------------- | :----------------------------------------------------------------- |
| Watermark     | Forced Marvedge badge (bottom-right, 55% opacity). Cannot be customized or removed. | Custom PNG, adjustable opacity + corner, or switched off entirely. |
| Camera bubble | Recorded and configurable, but not composited into the export.                      | Composited into the export.                                        |

Recording the camera is free for everyone — creation features are not gated. The
gate sits at export: `app/api/jobs/create/route.ts` re-resolves the watermark
from the user's real plan (so a FREE user gets the badge no matter what the
client sends), and `/api/wtm/composite` rejects a non-PRO bubble.

### The flow

1. **Record** — the recorder offers a camera toggle with a live preview. With it
   on, a second `MediaRecorder` captures the camera **video only** (the screen
   recording already carries mic/tab audio, so muxing the camera too would
   double it), uploads the clip, and stores its URL.
2. **Arrange** — the editor's **Branding** sidebar tab places and sizes both
   overlays, and the editor preview draws them over the video card so what you
   arrange is what gets baked in. Preview and export share their corner math and
   margins via `app/lib/wtm/geometry.ts`.
3. **Composite (pre-pass)** — on export, if a camera clip exists,
   `/api/wtm/composite` runs the Cloud Run worker's `/wtm-composite` first: it
   normalizes both inputs to 30 FPS, center-square crops the camera (so a
   non-16:9 webcam is cropped, not squished), applies a circular alpha mask, and
   overlays it in the chosen corner, producing **one** composited MP4. Original
   audio is passed through untouched.
4. **Export** — that composited MP4 becomes the source for the existing chunked
   export, which applies trim / zoom / background / text / subtitles and the
   watermark on top. The pre-pass never fails an export: no clip, a non-PRO
   user, or a worker error all fall back to the original source with a toast.

All WTM state persists to `Demo.editing.wtm` (`watermark` + `webcam`) through the
normal autosave — there is no DB migration.

### Environment variables

| Variable                  | Where                     | Purpose                                                                                             |
| :------------------------ | :------------------------ | :-------------------------------------------------------------------------------------------------- |
| `WTM_ENABLED`             | Next app (server)         | Master switch for the watermark render/plan logic and the composite route. Set to `true` to enable. |
| `NEXT_PUBLIC_WTM_ENABLED` | Next app (client)         | Shows the "Branding" sidebar panel and the preview overlays. Set to `true` to enable.               |
| `GCP_VIDEO_WORKER_URL`    | Next app (server)         | Reaches the Cloud Run worker for the compositing pre-pass.                                          |
| `WTM_COMPOSITE_FPS`       | **Cloud Run worker only** | Frame rate both inputs are normalized to. Optional, defaults to `30`.                               |
| `WTM_COMPOSITE_PREFIX`    | **Cloud Run worker only** | GCS prefix for composited sources. Optional, defaults to `wtm-composite/`.                          |

WTM needs no new vendor or API key — it is pure ffmpeg on the existing GCS /
Cloud Run worker. Both flags are enabled on staging/QA; leave them blank in
production until the feature is signed off. See `.env.example` for the full list.

## Shareable-Link QR Codes (QR)

Every share link can also be a **branded QR code**: deep-purple rounded modules on
white with the Marvedge mark at the centre, offered wherever a share URL already
exists. It is purely derived — the QR renders a link that already exists, mints
nothing, writes nothing, and never touches the export path. No DB migration, no
new vendor, no new API key. The only dependency is `qrcode-generator`, a
zero-dependency matrix library.

### Where it shows up

| Surface                                  | What appears                                                                                                                |
| :--------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| `app/components/ExportResultModal.tsx`   | The QR, shown as soon as a `shareUrl` exists — the "after the demo is generated" moment.                                    |
| `app/components/ShareModal.tsx`          | The same QR, collapsed behind a "Show QR code" toggle so the modal does not balloon.                                        |
| `app/hub/[domain]/share/[slug]/page.tsx` | A "scan to open" card on the customer hub share page, encoding **the customer's own domain**.                               |
| `GET /api/qr?url=…&size=…`               | A cacheable `image/svg+xml` render, for the places a React component cannot reach (an `<img>` in an email, a slide, a PDF). |

The demos list (`app/(signed)/demos/`) has **no share affordance at all** today,
even though `app/api/demos/[id]/share/route.ts` exists and works. That gap is
noted rather than filled here — a QR belongs next to a share button, and building
the share flow is its own change.

### `GET /api/qr`

Returns SVG with `Cache-Control: public, max-age=31536000, immutable` — the output
is a pure function of the query. Unauthenticated, because it renders a link that
is already public, and `size` is the only knob besides `url`. There is
deliberately **no `style` param**.

The `url` must resolve to a Marvedge-owned share URL or the route answers `400`.
Allowed: the `NEXT_PUBLIC_APP_URL` origin, the root domain plus `www` and any hub
subdomain, the host the request itself arrived on (which is how a custom hub
domain validates, without a DB lookup), and loopback off production. Everything
else is refused, including look-alikes such as `marvedge.com.evil.example` and
credential tricks such as `https://marvedge.com@evil.example/`. The path must also
look like a share path, so the endpoint cannot brand `/auth/signin`.

Two things about that check are easy to get wrong:

- **`sanitizeQrOptions()` / `toQrTargetUrl()` are not a host check.** They validate
  scheme, length and shape only, and deliberately not the host — the engine is
  isomorphic and cannot know the request origin. The allowlist in
  `app/lib/share/qrTarget.ts` layers on top of them. Rendering an arbitrary URL
  inside a Marvedge-branded QR is a phishing primitive; there is no "allow any
  URL" escape hatch and adding one re-opens it.
- **The route never queries the database.** A public unauthenticated endpoint that
  404s on unknown slugs is an oracle for which share ids exist, so validation is
  by URL shape only.

**Custom domains.** `app/api/demos/[id]/share/route.ts` builds share URLs as
`NEXT_PUBLIC_APP_URL || request.nextUrl.origin`, which is right for a creator
copying a link on marvedge.com. It is wrong on a customer hub: a visitor reading
`https://demos.acme.com/share/abc` is served by `/hub/acme/share/abc` through the
`middleware.ts` rewrite, and a QR encoding `marvedge.com/share/abc` would walk them
off the customer's white-labeled domain mid-scan. Hub pages therefore resolve the
origin from the **request host** and ignore `NEXT_PUBLIC_APP_URL` — see
`hubShareUrl()` in `app/lib/share/qrTarget.ts`, which carries the rule and its
tests.

### Scan attribution

The URL _encoded in the QR_ carries `?src=qr`; the copy-to-clipboard link stays
clean, so a pasted link is never miscounted as a scan. The decoration lives in one
helper (`withQrSource()`), applied at the two places a QR is produced — the client
renderer and `/api/qr` — and is read back by
`app/share/[slug]/hooks/useViewTracking.ts`, which passes `source: "qr"` to
`/api/views`.

**That source is logged, not stored.** `model View` has no column for it and there
is no events table, so persisting it would need a `prisma/schema.prisma` change and
a migration, which this feature deliberately does not carry. Scan volume is
visible in the server logs today (`[Views] QR scan: …`), and the client already
sends the field — adding the column later is a one-line change in
`app/api/views/route.ts`, with history from that day forward.

### One style, on purpose

`QrStyle` is `"badge" | "branded"` and **only `badge` is surfaced**. There is no
style toggle, no style prop and no style query param, and adding one is a product
decision rather than a UI improvement. `branded` (the mark drawn large and tinted
behind the modules) stays in the engine and stays covered by `qr.test.ts`, but
nothing offers it. The reason is _not_ scannability — both were phone-verified at
200 px. Badge won on **mark legibility**: it draws the mark solid `#2D1F61`, while
`branded`'s 22% tint reads as a smudge once the URL pushes the code past ~40
modules. The point of the feature is that every scan carries the mark.

### Scannability is the acceptance criterion

These invariants are enforced in `app/lib/qr/` and covered by its tests. They are
not style preferences — break one and codes silently stop scanning for some
fraction of cameras, which no visual review catches:

| Rule                                             | Why                                                                                  |
| :----------------------------------------------- | :----------------------------------------------------------------------------------- |
| **ECC level `H`** (30% recovery), always         | Buys the error budget the logo knockout and rounded modules spend.                   |
| **Quiet zone ≥ 4 modules**                       | Scanners fail without it far more often than for any styling reason.                 |
| **Logo occlusion ≤ 25% linear** (≈6% of area)    | Well inside the `H` budget, with room left for print and camera noise.               |
| **Finder patterns stay solid dark-on-light**     | Rounding their corners is safe; tinting, occluding, or backing them with art is not. |
| **Timing patterns (row/col 6) never occluded**   | The knockout must stay centred and small enough never to reach them.                 |
| **Contrast ≥ 4:1** between module and light cell | Checked in code (`assertQrContrast`), not by eyeballing.                             |

If a change makes an assertion in `app/lib/qr/qr.test.ts` fail, the change is
wrong — do not edit the test to match.

### The brand mark asset

`public/qr/marvedge-mark.png` is **generated, not hand-edited**. `scripts/qr/make-mark.mjs`
derives it from the source logo at build time: it chroma-keys the flat periwinkle
field out, recolours the mark to `#2D1F61`, trims and re-centres it, and writes
both the PNG and `app/lib/qr/mark.ts`, which inlines the same bytes as a `data:`
URI. The engine uses the constant, never the file path — a remote `src` would taint
the canvas the client-side PNG export draws into and `toBlob()` would throw. To
change the mark, edit the script and re-run it.

> `dither: 0` in that script is load-bearing. sharp's PNG palette encoder dithers
> by default, which scatters off-hue pixels through what should be one flat colour
> and quietly breaks the "art and modules share one colour" invariant.

### If a QR won't scan

1. **Check the size it is rendered at.** Below roughly 4 px per module a camera
   cannot resolve it. A long URL means a higher QR version, more modules, and a
   larger minimum size — shorten the URL before shrinking the code.
2. **Check the quiet zone survived.** A CSS `overflow: hidden`, a tight flex
   container, or a crop that clips the white border is the single most common
   cause. The engine emits it; a layout can still cut it off.
3. **Check contrast end to end.** The engine guarantees ≥ 4:1 for the colours it is
   given, but a parent with a coloured or textured background showing through a
   transparent container defeats it. The QR needs an opaque light ground.
4. **Check nothing was overlaid on it.** A badge, a caption, or a hover effect on
   top of the finder or timing patterns breaks decoding even when it looks fine.
5. **Check the target URL actually resolves.** A QR for an unshared or deleted demo
   scans perfectly and then lands on a 404 — `/api/qr` validates URL _shape_, never
   existence, by design.
6. **Only then suspect the engine.** Run `npm test`; the QR suite rasterizes and
   decodes real codes across versions.

### Environment variables

| Variable                       | Where                      | Purpose                                                                                                            |
| :----------------------------- | :------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SHARE_QR_ENABLED` | Next app (client + server) | Kill-switch for the whole QR surface. **Defaults to ON** when unset — only an explicit `false` or `0` disables it. |
| `NEXT_PUBLIC_APP_URL`          | Next app                   | Already required. The QR endpoint's primary allowed origin.                                                        |
| `NEXT_PUBLIC_ROOT_DOMAIN`      | Next app                   | Already used by `middleware.ts`. Also allows hub subdomains of it. Defaults to `marvedge.com`.                     |

`NEXT_PUBLIC_SHARE_QR_ENABLED` deliberately defaults **on**, unlike the AVS and WTM
flags above, which default off. Those change the artefact — with WTM on, a FREE
export gets a watermark burned into the video — so "unset" has to mean "behave
exactly as before". The QR surface is derived, read-only and additive, and leaves
no state behind, so its flag is a kill-switch for pulling the surface during an
incident rather than a rollout gate. With it off, `<ShareQrCode />` renders nothing
and `/api/qr` returns 404. Note the value is inlined into the client bundle at
build time: flipping it needs a rebuild for the client, only a restart for the
server.

## In-Player Scheduling (OVL)

Part of Interactive Video Overlays (issue #302 §2.3). A viewer can book a meeting
from a Calendly or HubSpot Meetings calendar **inside the video canvas**, without
leaving the share page. Configured per demo from the editor's **Overlays** panel;
free on every plan.

Behind `OVERLAYS_ENABLED` + `NEXT_PUBLIC_OVERLAYS_ENABLED`, both default off.

### The allow-list is the feature

This is the only place in the app that puts a third party's document inside our
page, so the host allow-list — `app/lib/overlays/schedulingHosts.ts` — is the
deliverable, not plumbing. `calendly.com` and `meetings.hubspot.com`, plus their
subdomains, **https only**, and it is enforced in three independent places:

1. **On save.** `PUT /api/demos/[id]/overlays` refuses an off-list host with a 400
   that names the allowed ones, so a bad URL never reaches the database.
2. **On render.** `buildSchedulingEmbedUrl()` re-runs the check before producing an
   `iframe` src, so a row that never passed through the save path — hand-edited,
   restored from a backup — still cannot be framed.
3. **In the CSP.** `frame-src` is derived from the same constant (see below).

The matching is by full hostname: exact equality or a **dot-anchored** suffix,
never `includes()` and never a bare `endsWith()`, both of which wave through
`calendly.com.evil.example`. The parser also infers nothing — an input must
already say `https://`, which is what rejects a bare host and a protocol-relative
`//calendly.com/x`. The hostile-input suite is in `schedulingHosts.test.ts`.

The allow-list is deliberately **not owner-editable**. An owner who could add a
host could frame a credential-harvesting page inside a video carrying their own
customer's branding.

### The CSP

`next.config.ts` sets the app's first `Content-Security-Policy`, **scoped to
`/share/:path*` and `/hub/:path*` only**. It is not global: `/video-editor` runs
ffmpeg.wasm and inline workers, and a blanket policy breaks it on first load.

Both path families are listed because of the customer-domain case — a viewer on
`demos.acme.com` requests `/share/<slug>` and `middleware.ts` rewrites it to
`/hub/<domainKey>/share/<slug>`, so matching only one spelling would leave the
branded route unprotected. `/api` matches neither source and is untouched.

Two honest caveats:

- **It is not XSS protection.** `script-src` carries `'unsafe-inline'` because
  Next's App Router inlines its bootstrap and flight-data scripts; removing it
  needs per-request nonces threaded through middleware.
- **`frame-ancestors` is absent.** Customers embed share links in their own pages
  today and there is no allow-list of their domains, so adding a restrictive one
  would silently break existing embeds.

Neither provider needs a `script-src` entry: both are embedded as a **bare iframe
URL**, never their widget script, so the share page still loads zero third-party
JavaScript.

### Prefill and consent

When the PR 3 lead gate captured a name and email **in this page session**, they
are passed to the provider's prefill params — `name`/`email` for Calendly,
`firstName`/`lastName`/`email` for HubSpot.

Only after consent, and only fields the viewer actually typed. A returning viewer
recognised by their `mv_sid` cookie but who has typed nothing today reaches the
widget with an empty form, and that is correct rather than a limitation: consent
was given for _us_ to make contact, and handing those details to a third party is
a fresh disclosure that only this session's own submit authorises. The lead never
leaves the page component's memory — not `localStorage`, not any URL but the
consented prefill.

### `meeting_booked` is best-effort, and HubSpot is the gap

**Calendly works.** The embed posts a documented `calendly.event_scheduled`
message, checked against the embed URL's exact origin, and a `meeting_booked`
`PlayerEvent` is emitted once per mount. Nothing from the message body goes into
the event's `meta` — a Calendly payload carries the invitee's name and email.

**HubSpot is not reliable.** There is no supported success message for the bare
meetings iframe. The code matches an observed shape (`meetingBookSucceeded`),
which HubSpot may change without notice, so **a HubSpot booking may produce no
`meeting_booked` event at all**. Nothing downstream — the PR 7 funnel included —
may read the absence of this event as evidence that no meeting was booked. Closing
this properly needs the HubSpot API rather than a postMessage, which is out of
scope here.

### Environment variables

| Variable                       | Where             | Purpose                                                                                                         |
| :----------------------------- | :---------------- | :-------------------------------------------------------------------------------------------------------------- |
| `OVERLAYS_ENABLED`             | Next app (server) | Master switch: resolves overlay config on the share routes and mounts the overlay API. Set to `true` to enable. |
| `NEXT_PUBLIC_OVERLAYS_ENABLED` | Next app (client) | Renders the player's overlay layer and the "Overlays" sidebar panel. Set to `true` to enable.                   |

The CSP is **not** behind either flag, deliberately. Next evaluates `headers()` at
build time and bakes the result into `routes-manifest.json`, so a flag-gated policy
would really be a build-time gate — and flipping `OVERLAYS_ENABLED` in a deployed
environment without a rebuild would turn the iframe on while leaving the header
that bounds it silently absent. Every directive was checked against what the share
page loads today, so it is a no-op for a flag-off page.

## Overlay Analytics, Lead Inbox and Retention (OVL)

Part of Interactive Video Overlays (issue #302). Three things the person paying
for the feature actually looks at: the conversion funnel, the leads themselves,
and the retention that keeps both sustainable.

### The funnel reads the rollup, never raw events

`PlayerEvent` is append-only and high-volume — a `video_start`, a `gate_shown`, a
`cta_click` and a `video_completed` for a single viewing. The analytics page
never touches it. It reads **`PlayerEventDaily`**, one row per
`(demoId, name, date)`, so the page costs the same on day 1000 as on day 1.

The funnel stages are `video_start -> gate_shown -> lead_submitted -> cta_click
-> video_completed`, shown in aggregate and per demo over a 30-day window.

**Stages are counted independently and are not a strict subset chain.** A demo
with no lead gate records starts and CTA clicks but no gate views; clicking a
branching card navigates the viewer away before the video completes. So a later
stage can exceed an earlier one, conversion is clamped to 0-100%, and a stage
whose predecessor had no events shows a dash rather than a fabricated ratio.

**Days are UTC.** A row's day is the UTC calendar day of its timestamp, never the
server's local day and never the viewer's — dating by the reader's timezone would
mean the same event rolls up to different days for different readers, and a
timezone change would silently rewrite history. The panel says "UTC" on screen.

### Running the rollup

There is **no scheduler in this repo** (locked decision 10 — no queue, no cron
service). The rollup is an endpoint; point whatever the deployment already uses
at it — Vercel Cron, Cloud Scheduler, a GitHub Action, or a shell:

```bash
curl -X POST https://<host>/api/v3/events/rollup      -H "x-marvedge-rollup-secret: $OVERLAYS_ROLLUP_SECRET"      -H "content-type: application/json"      -d '{"date":"2026-09-01"}'
```

- `date` is optional and defaults to **yesterday** (UTC), the last day that is
  certainly complete. Rolling up today is legal and gives a partial count that
  the next run overwrites.
- `{"skipRetention": true}` runs the rollup alone. Use it when backfilling a
  month of days one at a time, so the sweep does not run thirty times.
- The secret travels in a **header, never a query parameter** — query strings
  land in access logs, proxy logs and `Referer` headers, and this secret
  authorises row deletion. It is compared with `timingSafeEqual`.
- With `OVERLAYS_ROLLUP_SECRET` unset the endpoint answers **503, not 200**: a
  maintenance route that deletes rows fails shut when nobody has configured who
  may call it.
- **Idempotent.** Every write is an upsert that _sets_ the count rather than
  incrementing it, so a retried cron or two overlapping schedulers land exactly
  the same numbers. Re-running a day after a bug fix is safe.

### Retention

Both windows run from the same endpoint, **after** the rollup for that date has
committed. The ordering is load-bearing: `PlayerEventDaily` is the only durable
record of a funnel step, so deleting a raw event that has not been rolled up yet
does not lose a row, it loses a _number_, permanently and with nothing to report
it. The windows do not currently overlap — one edit to the env var is all it
would take, which is exactly why the order is enforced in code rather than
assumed.

| Variable                        | Default       | Deletes                                                |
| :------------------------------ | :------------ | :----------------------------------------------------- |
| `OVERLAYS_EVENT_RETENTION_DAYS` | `90`          | Raw `PlayerEvent` rows. The rollup they fed is kept.   |
| `OVERLAYS_LEAD_RETENTION_DAYS`  | `730` (24 mo) | `Lead` rows, and their `LeadDelivery` rows by cascade. |

A non-numeric or non-positive value falls back to the default rather than
resolving to `0`, which would delete everything older than this morning.

### Lead inbox

`/leads` (behind `NEXT_PUBLIC_OVERLAYS_ENABLED` in the sidebar,
`OVERLAYS_ENABLED` on the page) lists leads for the signed-in user's demos with
their per-connection CRM delivery status, paginated and filterable by demo.

- **CSV export** streams from `/api/leads/export` rather than buffering the
  table, so an export of a successful customer's leads does not become a
  timeout. Cells are RFC 4180 quoted _and_ formula-neutralised — a value starting
  `=`, `+`, `-`, `@`, TAB or CR gets a leading apostrophe, so a name field
  containing `=HYPERLINK(...)` is text in the spreadsheet rather than a live
  exfiltration link. A UTF-8 BOM is emitted so Excel does not mangle non-ASCII
  names.
- **Per-lead delete** for subject-access requests. It is a real delete, not a
  soft one, and takes the `LeadDelivery` rows with it. It cannot reach a CRM the
  lead was already forwarded to, and the UI says so.
- Lead fields are returned to their owner and **never logged**, including from
  inside the export stream.

### Account deletion

`app/api/user/delete/route.ts` deletes sessions and accounts by hand and relies
on cascade for the rest. That chain was **broken**: Prisma defaults a required
relation with no `onDelete` to `Restrict`, so `Demo.userId`,
`ExportedVideo.userId`, `VideoJob.userId`, `Review.userId` and `CtaClick.demoId`
were all `ON DELETE RESTRICT`. `prisma.user.delete()` raised a foreign-key
violation for any user who owned a demo, the route returned a 500, and nothing
was deleted — including the leads.

Migration `20260902000000_cascade_delete_chain` repairs it, and
`app/lib/overlays/cascade.test.ts` parses the real `prisma/schema.prisma` and
fails if any edge regresses.

## Interactive Video Overlays (OVL)

OVL turns the public share page into an interactive demo: a **lead-capture
gate**, **branching cards** at the end of the video, an **in-player scheduling
widget**, **player telemetry** feeding an overlay funnel, and — this section's
last two pieces — **adaptive-bitrate HLS** and **signed media**. It replaces the
browser's native `<video controls>` with a player we own, which is what makes all
five possible.

It ships behind feature flags and is a **complete no-op when they are off**. With
`NEXT_PUBLIC_OVERLAYS_ENABLED` unset, all three share routes render exactly what
they rendered before the feature existed: the same markup, the same native
`<video controls>`, the same `View` and `CtaClick` rows. That is the acceptance
criterion for the whole feature, not an aspiration.

### The three share routes are one component

`app/share/[slug]/ShareVideoPageClient.tsx` is **the** public player component. It
is rendered by all three viewer routes:

| Route                            | Served on                                       |
| :------------------------------- | :---------------------------------------------- |
| `/share/[slug]`                  | marvedge.com                                    |
| `/share/video/[id]`              | marvedge.com, for a bare exported video         |
| `/hub/[domain]/share/[slug]`     | a **customer-owned domain**, via `middleware.ts` |

Anything added there reaches all three at once — and has to be correct on the
customer's domain too, where the brand colours come from `HubSettings` and must
not be Marvedge purple. `middleware.ts` rewrites a non-apex host to
`/hub/<domainKey>/…` but **skips everything under `/api`**, so a player on
`demos.acme.com` posts same-origin to `/api/v3/…` and lands in this same
deployment with the same `mv_sid` cookie scope.

### The flow

1. **Configure** — the editor's **Overlays** sidebar panel writes to a
   `VideoOverlayConfig` row (its own table, *not* `Demo.editing`, which is the
   editor's autosaved draft and gets wholesale-overwritten).
2. **Gate** — the player opens the lead form at the configured trigger. `hard`
   holds the video paused and inerts the control bar; `soft` offers a skip. A
   submission writes a `Lead` row carrying **the exact consent sentence that was
   on screen**, and fans out to the owner's CRM connections in `after()`.
3. **Branch** — in the last few seconds, two cards offer a choice of another demo
   or an external URL. Branch cards **are** `Cta` rows with placement
   `branch-a` / `branch-b`, so a click writes a `CtaClick` row *and* emits a
   `cta_click` event — both, always.
4. **Schedule** — a Calendly or HubSpot booking widget opens inline, from a
   standing button, straight after a gate submission, or beside the branch cards.
   The URL must survive a host allow-list.
5. **Measure** — the player emits `PlayerEvent` rows; a nightly rollup folds them
   into `PlayerEventDaily`, which is what the analytics funnel reads. Telemetry is
   **additive** — every existing `View` and `CtaClick` write is still there.
6. **Package** — on export completion, the Cloud Run worker encodes an HLS ladder
   and the share page starts serving the playlist instead of the MP4.

### Plan behaviour

|                         | FREE / anonymous | PRO / ENTERPRISE |
| :---------------------- | :--------------- | :--------------- |
| Lead-capture gate       | Not available    | Available        |
| CRM delivery            | Not available    | Available        |
| Branching cards         | Available        | Available        |
| In-player scheduling    | Available        | Available        |
| Overlay funnel + inbox  | Not available    | Available        |

Branching and scheduling are free **on purpose**: CTAs are free today, and gating
them would remove functionality that already exists. The gate is re-resolved
server-side from `User.plan` on every render and again in `POST /api/v3/leads`,
so an owner who enabled a gate on PRO and then downgraded gets a demo that plays
normally rather than one that is stuck.

### Adaptive-bitrate HLS

Exports are progressive MP4 and **remain** progressive MP4 — HLS is an addition,
never a replacement.

1. `POST /api/exported-videos` finishes saving an export and calls
   `packageDemoHls()` in `after()`, so nobody waits on ffmpeg inside a request.
2. The Cloud Run worker's `POST /package-hls` decodes the source once, splits it
   in the filtergraph, and encodes a **1080p / 720p / 480p** ladder — never
   upscaling above the source — as fMP4 segments plus a master playlist, written
   to R2 under `hls/<demoId>/`.
3. The master playlist URI lands in `ExportedVideo.hlsPlaylistUrl`.
4. `resolveShareOverlays()` resolves it to https and the player attaches it:
   **native HLS on Safari**, **hls.js everywhere else**, and a **quality menu on
   desktop** (auto on mobile, where ABR is reacting to something the viewer
   cannot see).

**Aligned keyframes are the whole game.** A player can only switch rendition at a
segment boundary, and a segment can only start on a keyframe. If the renditions
put their keyframes in different places, every quality switch repeats or skips a
fraction of a second. Four ffmpeg settings enforce alignment and **all four are
required** — a constant `-r`, a fixed `-g`/`-keyint_min`, `-force_key_frames` on
the timeline, and `-sc_threshold 0`. The last is the one people forget, and it
silently undoes the other three.

**Idempotent by demo id + source hash.** The worker records a `manifest.json`
beside the renditions holding the sha256 of the source it encoded. Re-running on
an unchanged source skips the encode; passing the stored hash lets it skip the
*download* too. `POST /api/demos/[id]/hls` forces a repackage, and exists because
every demo exported before this landed has no renditions and re-exporting to get
them would re-encode a file identical to the one already there.

**The MP4 fallback is the common path, not the exceptional one.** At merge time
no demo has renditions, so every viewer takes it. It is also where a demo lands
when packaging failed, when `OVERLAYS_HLS_ENABLED` is off, when
`R2_PUBLIC_BASE_URL` is unset, or when the stored URI does not survive
validation. Losing adaptive bitrate is always preferable to losing playback.

### Signed media, and what the hard gate actually is

`LeadGateOverlay.tsx` says it plainly and this section repeats it: **hard mode is
client-side by default.** The media URL is in the page source and the object is
publicly readable, so a viewer with devtools can watch the whole video without
ever seeing the form. Every control the gate disables is disabled in *our UI*,
not at the origin.

`OVERLAYS_SIGNED_MEDIA_ENABLED` is what closes that. With it on, a hard-gated
demo's share page renders **no media URL at all**; the player asks
`GET /api/v3/media/[demoId]`, which answers **403** until a `Lead` row exists for
the viewer's `mv_sid` and a short-TTL presigned URL after. `mv_sid` is forgeable
— it is a non-httpOnly analytics cookie and nothing authorises on it — but
forging it does not help, because the check is for a **row** keyed on that id and
producing one means actually submitting the form.

Three limits, stated rather than implied:

- **It signs the MP4, not the playlist.** A presigned URL signs one object; an
  HLS playlist references its variants and segments by relative URI and none of
  those carry a signature. Making a signed playlist play means rewriting every
  playlist per request — a media proxy, not a presigner, and out of scope. So a
  hard-gated demo with signed media on is served its progressive MP4, signed. It
  loses adaptive bitrate and keeps its gate; the alternative loses the gate.
- **Legacy `gs://` media cannot be signed.** Those buckets predate the R2
  migration, are already public, and we hold no signing credentials for them.
  Such a demo keeps playing via its public URL, gated or not. Breaking
  pre-migration demos to enforce a gate that was never enforceable on them would
  be a regression dressed up as a security fix.
- **It is still not DRM.** Someone who submits the form once gets a real URL and
  can pass it on until it expires. What changes is that a viewer who never
  submitted anything cannot read the media.

Only a **hard** gate withholds media. A soft gate is one the viewer may skip, so
withholding the media behind it would silently convert it into a hard one.

### How the overlay slot works

Required reading before adding a fourth overlay; the full contract is in
`app/components/player/PlayerOverlayHost.tsx`.

- **There is one slot.** `MarvedgePlayer` owns a single positioned layer and the
  overlays portal into it. There is also a small **trigger strip** in the
  top-right for standing affordances (the scheduling button) that sits below the
  overlay layer and passes pointer events through, so an empty strip costs the
  viewer nothing.
- **Priority order.** The gate outranks branching, which outranks scheduling.
  One overlay is active at a time; a higher-priority registration displaces a
  lower one rather than stacking on it.
- **Only the host pauses the video.** Opening a blocking overlay is what pauses
  playback. An overlay component must **never** call `pause()` itself — a second
  caller is exactly how a video ends up resuming underneath a half-filled form.
- **Blocking vs dismissible** is declared at registration. Blocking sets
  `controlsLocked`, which inerts the control bar (real `disabled` attributes
  *and* handlers that refuse), kills the keyboard shortcuts, and hides the bar
  from the accessibility tree so a screen reader is not offered controls that do
  nothing.
- **To register a new overlay**: render it as a child of `<MarvedgePlayer>`, call
  the registry hook with a priority and a blocking flag, and put the positioning,
  backdrop, dialog role and focus handling in `<PlayerOverlay>` rather than in
  your component. Keep any shared decision in `app/lib/overlays/` so the route
  handler and the editor agree with the player about it.

`app/lib/overlays/` is **isomorphic and pure** — no `fs`, no DOM, no node-only
API, and no `process.env` outside `flags.ts`. One code path serves a React
component, a route handler and the editor, which is the only way the three stay
in agreement. Environment-specific code goes in the component or the route.

### Cloudflare configuration — NOT DONE, needs an operator

HLS playback needs cache and CORS rules on the R2 public host that **cannot be
set from this repo**. They are written down here because nobody set them:

- **CORS** on the R2 bucket: allow `GET`, `HEAD` and the `Range` request header
  from the share origins — `https://marvedge.com`, any staging origin, **and
  every customer custom domain**. This is the step most likely to be missed:
  playback works from marvedge.com and fails on a customer hub, because that is a
  different origin fetching the same segments. Verify from an actual customer
  domain, not only from marvedge.com.
- **Cache rules** on the public host:
  - `*.m3u8` — short TTL (30–60s). A playlist can be re-cut by a repackage.
  - `*.m4s` and `init.mp4` — long TTL (a year), `immutable`. Segment names are
    stable per package and a repackage overwrites them, so pair this with a purge
    of the `hls/<demoId>/` prefix on repackage, or accept that a repackaged demo
    serves stale segments until the TTL lapses.
- `R2_PUBLIC_BASE_URL` must point at that host. An HLS playlist references its
  segments **relatively**, so they are fetched from whatever host served the
  playlist — with this blank the app reports no playlist and falls back to MP4
  rather than emitting a URL nothing can fetch.

### Environment variables

| Variable                            | Where                     | Purpose                                                                             |
| :---------------------------------- | :------------------------ | :---------------------------------------------------------------------------------- |
| `OVERLAYS_ENABLED`                  | Next app (server)         | Master switch for `/api/v3/*` and the owner-facing overlay config routes.            |
| `NEXT_PUBLIC_OVERLAYS_ENABLED`      | Next app (client)         | Renders the overlay layer on the share player and the "Overlays" editor panel.       |
| `OVERLAYS_CRM_ENABLED`              | Next app (server)         | Outbound lead delivery. Off = leads are still captured, just not forwarded.          |
| `OVERLAYS_CRM_SECRET_KEY`           | Next app (server)         | AES-256-GCM key for stored CRM credentials. Absent = creating a connection 503s.     |
| `OVERLAYS_CRM_SECRET_KEY_PREVIOUS`  | Next app (server)         | Accepted on decrypt only, for key rotation.                                          |
| `OVERLAYS_ROLLUP_SECRET`            | Next app (server)         | Guards `POST /api/v3/events/rollup`. Blank = the endpoint is **closed** (503).       |
| `OVERLAYS_EVENT_RETENTION_DAYS`     | Next app (server)         | Raw `PlayerEvent` retention. Default 90.                                             |
| `OVERLAYS_LEAD_RETENTION_DAYS`      | Next app (server)         | `Lead` retention. Default 730 (24 months).                                           |
| `OVERLAYS_HLS_ENABLED`              | Next app (server)         | HLS packaging + preferring a playlist over the MP4.                                  |
| `OVERLAYS_SIGNED_MEDIA_ENABLED`     | Next app (server)         | Withhold a hard-gated demo's media URL until a lead is submitted.                    |
| `OVERLAYS_SIGNED_MEDIA_TTL_SECONDS` | Next app (server)         | Signed URL lifetime. Default 900, clamped to [60, 21600].                            |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Next app **and** worker | R2 credentials. Required for HLS and for signing.               |
| `R2_PUBLIC_BASE_URL`                | Next app (server)         | Public https host for R2. **Required for HLS** — segments are fetched relative to it. |
| `GCP_VIDEO_WORKER_URL`              | Next app (server)         | Reaches the Cloud Run worker for `/package-hls`.                                     |
| `R2_HLS_BUCKET`                     | **Cloud Run worker only** | Bucket renditions are written to. Falls back to `R2_PROCESSED_BUCKET`.               |
| `HLS_SEGMENT_SECONDS` / `HLS_FPS`   | **Cloud Run worker only** | Segment/GOP length (4) and the constant frame rate (30). Optional.                    |

All the OVL flags **default off**, unlike the QR kill-switch, which defaults on.
QR is derived and read-only; these change what an unauthenticated public page
renders and cause viewer PII to be stored and forwarded to a third party. A flag
whose default is off cannot turn either of those on by accident in an environment
nobody remembered to configure. See `.env.example` for the full list.

### Gotchas

- **`app/lib/overlays/` must stay pure.** One `fs` or `next/headers` import in
  there breaks the editor build, because the same modules are imported by a
  client component.
- **Never log lead PII.** Not a name, not an email, not a company size — not in
  `console.log`, not in an error message, not in a thrown `Error`. That includes
  not logging a Prisma `error.message`, which can quote the arguments it was
  given, and those arguments are the lead. `app/api/views/route.ts` set the
  precedent of logging only literals; hold it.
- **`mv_sid` is not an auth token.** It is a non-httpOnly analytics cookie the
  client can read, edit and forge. Nothing may ever authorise on the value
  itself — only on rows keyed by it.
- **Telemetry is additive.** If a change stops `View` rows being written, every
  number on the existing analytics dashboard silently goes to zero with nothing
  anywhere to say why. `useViewTracking()` owns the `videoRef` on **both** the
  overlay and the flag-off path for exactly this reason.
- **Don't put anything in `ExportedVideo.settings`.** `POST /api/exported-videos`
  writes that field wholesale on every save, so a value parked there is erased by
  the next export. The HLS columns are narrow columns for this reason — the same
  trap that kept overlay config out of `Demo.editing`.
- **Two workers exist.** `cloudrun-worker/server.js` is the HTTP service behind
  `GCP_VIDEO_WORKER_URL` and is where every video endpoint including
  `/package-hls` lives. `video-worker/index.ts` is a separate BullMQ consumer
  that today only serves audio clips. Editing the wrong one is a silent no-op
  that passes every test.

## AI Subtitles (SUB)

SUB generates subtitles from a demo's audio, then lets you correct, re-time,
restyle, translate and export them. It ships behind a feature flag and is a
complete no-op when the flag is off: a demo with no subtitle style, no track and
no language selection exports **byte-identically** to what it produced before the
feature existed.

Unlike AVS, it is **not** plan-gated. Generation, editing, timeline retiming,
styling and `.srt` / `.vtt` / `.txt` export are free on every plan, including FREE
and anonymous. **Translation is the only PRO/ENTERPRISE surface**, gated
server-side in `/api/subtitles/translate` from the user's real plan — it is the
one part that spends money per use at an external vendor. Do not add a plan check
to any other subtitle path.

### The flow

Open a demo in the editor and switch to the **Subtitles** sidebar tab:

1. **Generate** — `/api/subtitles/create` creates a `VideoJob` and returns a
   `jobId` in the same tick, dispatching the work through Next's `after()`. The
   Cloud Run worker's `POST /subtitles` downloads the source, extracts 16 kHz mono
   PCM with ffmpeg, and transcribes it with Deepgram (`nova-2`, or `nova-3` for
   Arabic), clustering word timings into cues. The client polls `/api/jobs/{id}`.
   A blob-URL source is uploaded to GCS first, as `kind: "subtitle-source"`.
2. **Edit** — fix a mis-transcribed word, retime a cue to the centisecond, split a
   long cue at the playhead, merge two short ones, delete or add one. Every
   mutation goes through the pure helpers in `app/lib/subtitles/cues.ts` and ends
   in `normalizeCues()`.
3. **Retime on the timeline** — cues appear as a track on the timeline ruler and
   drag and resize like trim segments. A whole drag lands as one undo step.
4. **Style** — font, size, colour, background box, border, shadow, position and
   animation. The preview overlay and the burned-in export read the same numbers
   from `app/lib/subtitles/style.ts` (see the parity rule below).
5. **Language & translate** — pick the spoken language before generating, switch
   between the demo's per-language tracks, or translate the active one with
   OpenAI. Translation is the gated step.
6. **Export** — download `.srt` / `.vtt` / `.txt`, and/or burn the cues into the
   video. Burn-in is an explicit choice in the export settings, not something that
   happens whenever cues exist.

Cues, the active language and the style all persist to `Demo.editing` through the
normal autosave — there is no save button and no DB migration for them. Generated
and translated tracks are also written to `SubtitleTrack`, one row per
`(demo, language)` holding `cues` as JSON. That is a deliberate, signed-off
deviation from PRD §10's per-segment `SubtitleSegment` table.

### Preview ↔ burn-in parity — the rule that keeps exports honest

**`app/lib/subtitles/style.ts` is the single source of truth for what a subtitle
looks like, and both sides must read it.** The editor preview
(`SubtitleOverlay.tsx`) imports it directly. The renderer cannot —
`cloudrun-worker/` is a standalone package with its own `package.json` and nothing
in it can import from `app/` — so the CSS→ASS mapping exists twice: a TypeScript
original and a JavaScript port in `cloudrun-worker/render.js`.

Two lookalike implementations is exactly the failure this feature was built to
fix. Before it, `SubtitleOverlay.tsx` hardcoded a fixed `16px` while
`writeAssSubtitles()` used a height-proportional `clamp(20, h*0.05, 58)` — they had
already silently drifted, so the preview was not showing what the export produced.

`app/lib/subtitles/workerParity.test.ts` is what stops that recurring: it loads the
**real worker file** and asserts the two produce identical output across a matrix
of styles and frame sizes. **If it fails, the port and the original have drifted —
fix whichever is wrong. Do not relax the assertion.** It is the only mechanical
reason to believe the preview matches the render. The mapping has real traps: ASS
colours are `&H00BBGGRR` (reversed byte order) with *inverted* alpha, and font size
must be resolution-independent (% of frame height), because "24 px" means one thing
on a 640 px preview and another on a 1920 px export.

### The sorted, non-overlapping cue invariant

`remapSubtitleCuesToTrimmedTimeline()` in `cloudrun-worker/render.js` — which
re-times cues across trim segments and slices them per 10 s export chunk —
**assumes its input is sorted and non-overlapping**, and two overlapping ASS
`Dialogue` lines render *stacked on top of each other*, not one after the other.

That assumption used to hold by luck, because the worker was the only producer of
cues and its clustering never overlaps. Once a user can drag a cue's edge over its
neighbour, an overlap is one gesture away (PRD §13 lists it explicitly).

`normalizeCues()` is the single place the invariant is established: it drops junk,
clamps to the video's length, enforces a minimum duration, sorts, and resolves
every overlap — truncating the earlier cue, pushing the later one when truncation
would erase it, and dropping only as a last resort. Every store mutation ends in
it, and `/api/subtitles/export` re-runs it server-side — never trust the client's
ordering. The other helpers in `cues.ts` are deliberately dumb array operations
that do **not** normalize; composing them and normalizing once at the end is what
keeps an undo stack reasonable.

`app/lib/subtitles/burnInInvariant.test.ts` drives the real worker functions end to
end (chunk slice → trim remap → ASS serialization) on overlapping-by-construction
cue sets and asserts the `Dialogue` lines come out ordered and non-overlapping at
the centisecond resolution ASS actually stores.

### Which worker is live

**`cloudrun-worker/` is the deployed worker.** It is what `GCP_VIDEO_WORKER_URL`
points at, it is the only one with a `Dockerfile`, and its `package.json` declares
`main: server.js` with a Cloud Run `start` script.

`video-worker/index.ts` is a near-identical TypeScript twin with its **own** copies
of `writeAssSubtitles` / `transcribeWithDeepgram` /
`remapSubtitleCuesToTrimmedTimeline`. It is a BullMQ/Redis-era leftover: it has no
`Dockerfile`, nothing dispatches to it, and it was last touched by an unrelated
dependency bump. **Do not edit it.** A change to the wrong copy is a silent no-op
that passes every test.

### Generation performance

PRD §7 targets **under 60 s for a 10-minute video** — a ratio of 0.1 s of wall
clock per second of video.

> ⚠️ **This has not been measured yet.** It needs a real 10-minute video pushed
> through a deployed worker, and no `GCP_VIDEO_WORKER_URL` or `DEEPGRAM_API_KEY` is
> configured in this checkout. **The target above is the PRD's requirement, not a
> measurement — do not quote it as one.**

The worker logs everything needed to close this out. Run a 10-minute video through
generation and read one line from the Cloud Run logs:

```
[subtitles] Timing download_ms=… extract_ms=… deepgram_ms=… total_ms=… cues=… duration_s=… source_bytes=… ratio=…
```

`ratio` is the number to compare against the target: seconds of wall clock per
second of video, so **`ratio` < 0.1 meets PRD §7**. `duration_s` is derived exactly
from the extracted WAV (16 kHz mono PCM s16le, so bytes ÷ 32000 is the duration).
The three phase timings say where the time goes if it misses: `download_ms` scales
with file size and GCS locality, `extract_ms` is ffmpeg and scales with duration
and codec, and `deepgram_ms` is one upload-and-wait round trip to the vendor.
**Record the actual numbers here, and if it misses, say by how much and which phase
dominates.**

### Edge cases and limits

| Case | Behaviour |
| :-- | :-- |
| No speech in the video | The job succeeds with zero cues, and the editor says **"No speech detected in this video"** rather than "Subtitles ready". |
| No audio track at all | Distinguished from a corrupted file: *"This video has no audio track, so there is nothing to transcribe."* |
| Corrupted / incomplete upload | The ffmpeg failure is reduced to its last meaningful stderr lines and surfaced as *"This video could not be read — it may be corrupted or the upload may be incomplete."* Never a raw ffmpeg banner dump, never a bare 500. |
| Cancel mid-job | See below — the work does not stop, the result is discarded. |
| Video longer than 2 hours | Refused with the actual length named, client-side and again in the route. |
| Upload not MP4/MOV/AVI/MKV | Refused at the file input **and** in `/api/gcs/upload` with a 400 naming the extension. |
| Upload over 2 GB | Same, with the actual size named. |
| Unsupported language code | The routes reject it with a 400 rather than silently falling back to auto-detect. An **absent** code still means auto-detect. |
| Overlapping cues after editing | Resolved by `normalizeCues()`; see the invariant above. |
| Speaker diarization | **Explicitly not supported** (PRD §15). Cues carry no speaker labels and there is no "who said this" axis anywhere in the data model. Deepgram can diarize; the feature deliberately does not ask it to. |

**Cancelling does not stop the work.** `POST /api/subtitles/cancel` marks the
`VideoJob` `CANCELLED` and the client stops polling immediately, so the editor is
usable again at once. But `/subtitles` is one long opaque HTTP call to Cloud Run
with no cancellation channel: **the worker runs to completion and the Deepgram
minutes are spent either way.** What cancelling buys is that the *result is
discarded* — the dispatcher re-reads the job status before writing anything, so
cues from a cancelled run never land on the demo. The UI copy says exactly this; do
not "improve" it into a promise the mechanism cannot keep.

Uploads are validated in both halves, because they have to be: the browser check is
a courtesy (`accept` is trivially bypassed by drag-and-drop), and `/api/gcs/upload`
mints a signed URL that writes straight into the bucket, so the server check is the
control. Both read the same constants from `app/lib/subtitles/limits.ts`. Note that
**`.webm` is accepted alongside the PRD's four containers** — Marvedge is
recording-first and `MediaRecorder` produces webm, so enforcing the PRD's list
literally would reject the product's primary path.

### If subtitles look wrong in the export

1. **Two lines stacked on top of each other.** The cue list reaching the worker was
   overlapping. Something bypassed `normalizeCues()` — check the mutation path, not
   the renderer. `npm test` runs `burnInInvariant.test.ts`, which covers this.
2. **The style does not match the preview.** The ASS port in
   `cloudrun-worker/render.js` has drifted from `app/lib/subtitles/style.ts`. Run
   `npm test`; `workerParity.test.ts` names the exact field.
3. **Text is the wrong size on a different aspect ratio.** Size is stored as a % of
   frame height on purpose. A px value that leaked into the persisted style will
   look right at one resolution and wrong at every other.
4. **Subtitles drift out of sync after a trim.** `remapSubtitleCuesToTrimmedTimeline`
   re-times cues across keep-segments. Check the recipe's `subtitles` are in
   **source** time, not already-trimmed time.
5. **Subtitles are missing entirely from the export.** Burn-in is an explicit toggle
   in the export settings — having cues is not sufficient. Also check the export
   recipe actually carries `subtitles`.
6. **Arabic renders as disconnected, left-to-right letterforms.** Expected, and why
   `RTL_RENDERING_VERIFIED` in `languages.ts` is `false` and Arabic appears in no
   picker. libass only reorders and shapes bidirectional text when it was built with
   FriBidi and HarfBuzz; the container's ffmpeg build has not been inspected. Verify
   a real 1080p export before flipping that flag.
7. **You edited the worker and nothing changed.** You probably edited
   `video-worker/`. See "Which worker is live" above.

### Environment variables

| Variable | Where | Purpose |
| :-- | :-- | :-- |
| `NEXT_PUBLIC_SUBTITLE_EDITOR_ENABLED` | Next app (client) | Shows the "Subtitles" sidebar panel, and through it the timeline track and style controls. Set to `true` to enable. |
| `SUBTITLE_TRANSLATE_ENABLED` | Next app (server) | Gates the AI translation route. Server-only — never expose it with a `NEXT_PUBLIC_` prefix. |
| `OPENAI_API_KEY` | Next app (server) | Already required by AVS. Reused for translation — no new vendor and no new key. |
| `GCP_VIDEO_WORKER_URL` | Next app (server) | Already required. Reaches the Cloud Run worker for transcription. |
| `DEEPGRAM_API_KEY` | **Cloud Run worker only** | Already required by AVS. Speech-to-text. The Next app never holds this key. |

**Both SUB flags default OFF**, like AVS and WTM and unlike the QR kill-switch.
That is deliberate: the editor panel rewrites cues that get burned into an export
and the translate route spends money, so "unset" has to mean "behave exactly as
today". `SUBTITLE_TRANSLATE_ENABLED` is the *feature* gate, not the paywall — the
PRO/ENTERPRISE check is a separate server-side plan lookup. `NEXT_PUBLIC_…` is
inlined at build time: flipping it needs a rebuild for the client, only a restart
for the server. SUB needs **no new package and no new vendor**. See `.env.example`
for the full list.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
