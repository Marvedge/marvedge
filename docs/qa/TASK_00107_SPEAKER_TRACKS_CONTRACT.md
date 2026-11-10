# Task-00107: Speaker-Tracks Contract Design

## Status

Proposed — ownership and schema agreement required.

## Context

TalkNet currently returns `ok`, `video_info` and `speakers`. Each speaker contains `track_id`, `start_time_sec`, `end_time_sec`, `average_confidence` and per-frame `frame`, `timestamp_sec`, `bbox`, `speaking_score` and `is_speaking`.

The CloudRun split-screen consumer accepts legacy representations, including `speaker_id`/`bbox`, simplified `x` coordinates and TalkNet-style per-frame records. The current TalkNet response does not include an explicit schema version.

## Proposed canonical schema: version 1

The persisted speaker-tracks JSON should use this envelope:

- `schema_version`: required integer, currently `1`.
- `source`: required object containing `width`, `height`, `fps` and `duration_sec`.
- `speakers`: required array of speaker tracks.

Each speaker track contains:

- `track_id`: stable string identifier within the result.
- `start_time_sec`, `end_time_sec`: track time boundaries in seconds.
- `average_confidence`: numeric aggregate confidence.
- `frames`: per-frame observations containing `frame` (integer), `timestamp_sec` (seconds), `bbox` (four numeric coordinates `[x1, y1, x2, y2]`), `speaking_score` (number) and `is_speaking` (boolean).

## Ownership

- **Job/API orchestration:** owns the job-level `speakerTracksUri` contract and propagation to workers.
- **TalkNet:** owns production of the versioned speaker-tracks payload.
- **CloudRun:** owns consumer-side validation and compatibility behavior.
- A named individual/team owner and approval of schema version 1 remain to be confirmed by project maintainers.

## Compatibility and failure behavior

- Preserve existing legacy formats during an explicitly agreed migration.
- Do not silently interpret an unsupported schema version as version 1.
- Missing, malformed or unsupported data must use the documented safe fallback and emit an actionable warning.
- Do not change current producer or consumer behavior until the contract and migration plan are approved.

## Acceptance criteria

1. Maintainers agree on the canonical schema and versioning policy.
2. The job-contract owner is explicitly identified.
3. Producer and consumer compatibility requirements are documented.
4. Follow-up implementation adds tests for valid version 1 data, malformed data and unsupported versions.

---

## Task-108: `speakerTracksUri` job/worker contract (implemented)

### Field definition

| Field              | Type     | Location                                            | Optionality                                                     |
| ------------------ | -------- | --------------------------------------------------- | --------------------------------------------------------------- |
| `speakerTracksUri` | `string` | `GcpWorkerPayload` (`app/lib/gcpWorker.ts` line 13) | Optional. Omitted when not provided; no default is substituted. |

### Propagation path

```
POST /api/jobs/create
  → route.ts: destructures `speakerTracksUri` from request body, trims whitespace
  → stored in `normalizedPayload` (spread-conditional: only present when non-empty)
  → stored in `videoJob.jobData` JSON column via Prisma transaction
  → dispatchVideoJobWithColdStartRetry reads `normalizedPayload.speakerTracksUri`
  → invokeGcpWorker({ ..., speakerTracksUri }) → POST /process body
  → cloudrun-worker/server.js: destructures `speakerTracksUri` from req.body
  → processChunkJob → renderChunkFromRecipe(speakerTracksUri)
  → cloudrun-worker/render.js: const tracksUri = speakerTracksUri || recipe?.speakerTracksUri
  → loadSpeakerTracks(tracksUri) → evaluateSplitScreen(...)
```

### Fallback behavior

- When `speakerTracksUri` is absent or an empty/whitespace string: the field is **not set** in the worker payload. The worker falls back to the existing single-speaker crop path (`recipe?.speakerTracksUri`, then no split-screen).
- No breaking change to legacy job payloads without this field.

### Naming

`speakerTracksUri` is the established convention across the full propagation path. `tracksUri` and `tracksFile` are **not** used at the job/API boundary.

### Test coverage (Task-108)

- `app/api/jobs/create/dispatch-retry.test.ts` — three new tests in `describe("speakerTracksUri propagation through job dispatch")`:
  1. URI supplied → present in `/process` payload.
  2. URI absent → field is `undefined` in `/process` payload.
  3. URI with surrounding whitespace → trimmed before propagation.
- `app/lib/gcpWorker.test.ts` — two new tests in `describe("invokeGcpWorker authentication")`:
  1. `speakerTracksUri` present in `GcpWorkerPayload` → serialised into the HTTP request body.
  2. `speakerTracksUri` absent from `GcpWorkerPayload` → key not present in the HTTP request body.
