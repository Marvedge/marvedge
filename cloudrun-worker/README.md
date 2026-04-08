# Marvedge Cloud Run Worker

## Required env vars

- `RAW_BUCKET` - GCS bucket with raw chunk files (`.webm`)
- `PROCESSED_BUCKET` - GCS bucket for rendered output (`.mp4`)

## Optional env vars

- `PORT` (default: `8080`)
- `RAW_PREFIX` (default: empty)
- `PROCESSED_PREFIX` (default: empty)
- `RECIPES_COLLECTION` (default: `recipes`)
- `CHUNKS_COLLECTION` (default: `chunks`)
- `CHUNK_DURATION_SECS` (default: `10`)

## HTTP API

- `GET /healthz`
- `POST /process`

Request body:

```json
{
  "chunkId": "job123_chunk_000",
  "recipeId": "recipe_abc",
  "rawObject": "raw/job123_chunk_000.webm",
  "outputObject": "processed/job123_chunk_000.mp4"
}
```

`rawObject` and `outputObject` are optional. If omitted:
- raw object: `${RAW_PREFIX}${chunkId}.webm`
- output object: `${PROCESSED_PREFIX}${chunkId}.mp4`

