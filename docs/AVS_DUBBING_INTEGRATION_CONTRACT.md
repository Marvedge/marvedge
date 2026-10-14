# AVS Dubbing Service Integration Contract



## 1. Overview



This document defines the backend integration contract for the AVS dubbing service.



It documents:



* Dubbing API request format

* Job creation and lifecycle

* Dubbing processing input

* Dubbing service output format

* Job polling response

* Graceful fallback behavior

* Backend integration requirements



The contract is based on the current implementation of the AVS dubbing flow.



---



## 2. Dubbing API



### Endpoint



`POST /api/avs/dub`



The endpoint creates an AVS dubbing job and returns a job ID that can be used to monitor the processing status.



### Authentication



The request requires an authenticated user session.



The endpoint also checks that the AVS functionality is enabled and validates the associated user/demo where applicable.



---



## 3. API Request Contract



### Request Body



```json

{

  "videoUrl": "https://example.com/source.mp4",

  "dubUrl": "https://example.com/dubbed-audio.mp3",

  "steps": [

    {

      "id": "step-1",

      "index": 0,

      "startTime": 0,

      "endTime": 5

    }

  ],

  "dubTimings": [

    {

      "stepId": "step-1",

      "start": 0,

      "end": 5

    }

  ],

  "duration": 120,

  "demoId": "demo-123"

}

```



### Fields



| Field        | Type   | Required | Description                             |

| ------------ | ------ | -------- | --------------------------------------- |

| `videoUrl`   | string | Yes      | URL of the source video                 |

| `dubUrl`     | string | No       | URL of the dubbed audio                 |

| `steps`      | array  | No       | Source video step/timing information    |

| `dubTimings` | array  | No       | Timing information for the dubbed audio |

| `duration`   | number | No       | Source video duration                   |

| `demoId`     | string | No       | Associated demo ID                      |



### `steps` Structure



Each valid step contains:



```json

{

  "id": "step-1",

  "index": 0,

  "startTime": 0,

  "endTime": 5

}

```



The API keeps steps with:



* a non-empty `id`

* finite `startTime`

* finite `endTime`

* `endTime` greater than `startTime`



`index` is optional.



### `dubTimings` Structure



Each timing entry identifies the corresponding source step and its dubbed-audio timing:



```json

{

  "stepId": "step-1",

  "start": 0,

  "end": 5

}

```



---



## 4. API Response Contract



When the dubbing job is created successfully, the API returns:



```json

{

  "success": true,

  "jobId": "job-id"

}

```



The `jobId` identifies the `VideoJob` created for the dubbing operation.



### Common HTTP Responses



| Status | Meaning                                            |

| ------ | -------------------------------------------------- |

| `200`  | Dubbing job created successfully                   |

| `400`  | Invalid request or missing `videoUrl`              |

| `401`  | User is not authenticated                          |


| `404`  | Required user/demo/feature resource was not found  |



---



## 5. Job Lifecycle



The dubbing request creates a `VideoJob`.



The job starts with:



```text

status: PENDING

```



The processing flow then moves through:



```text

PENDING
  |
  v
PROCESSING
  |
  v
COMPLETED

```



If processing fails:



```text

PENDING / PROCESSING
        |
        v
      FAILED

```



The job stores the result fields including:



* `alignedVideoUrl`

* `duration`



For AVS dubbing jobs, the job data identifies the operation as:



```text

kind: AVS_DUB

```



---



## 6. Dubbing Processing Flow



The current implementation follows this flow:



```text

POST /api/avs/dub
        |
        v
Create VideoJob
        |
        v
runDubAlignment()
        |
        v
invokeGcpDubSync()
        |
        v
Cloud Run /avs-dub
        |
        v
processDubSyncJob()
        |
        v
alignedVideoUrl + duration
        |
        v
Update VideoJob
        |
        v
Client polls /api/jobs/[id]

```



The AVS dubbing API does not require a separate callback contract for this flow. The client retrieves the job result through the job polling endpoint.



---



## 7. Alignment Conditions and Fallback



Dubbing alignment is attempted when all of the following are available:



* `dubUrl`

* at least one valid `step`

* at least one valid `dubTiming`



If the required alignment information is unavailable, the service gracefully falls back to the original source video instead of performing dubbing alignment.



In the API layer, the source video URL is retained as the output when alignment cannot be performed.



This allows the dubbing flow to degrade gracefully when dubbed-audio timing information is unavailable.



---



## 8. Cloud Run Dubbing Worker Contract



### Endpoint



`POST /avs-dub`



This endpoint is an internal worker endpoint protected by worker authentication.



### Request



```json

{

  "videoUrl": "https://example.com/source.mp4",

  "dubUrl": "https://example.com/dubbed-audio.mp3",

  "steps": [

    {

      "id": "step-1",

      "startTime": 0,

      "endTime": 5

    }

  ],

  "dubTimings": [

    {

      "stepId": "step-1",

      "start": 0,

      "end": 5

    }

  ]

}

```



`videoUrl` is required by the worker.



### Successful Response



```json

{

  "ok": true,

  "result": {

    "recipeId": "avs-dub",

    "alignedVideoUrl": "https://storage.googleapis.com/...",

    "duration": 120

  }

}

```



### Error Response



For a missing `videoUrl`:



```json

{

  "ok": false,

  "error": "videoUrl is required"

}

```



Processing failures return an error response from the worker.



---



## 9. Output Contract



The main output of successful dubbing alignment is:



```json

{

  "alignedVideoUrl": "https://storage.googleapis.com/...",

  "duration": 120

}

```



### `alignedVideoUrl`



The URL of the processed/aligned video.



When actual dubbing alignment is performed, the processed output is uploaded to the configured processed storage bucket.



### `duration`



The duration of the resulting aligned video in seconds.



---



## 10. Job Polling Contract



The client can poll:



`GET /api/jobs/[id]`



For `AVS_DUB` jobs, the job response exposes an `aligned` object containing:



```json

{

  "aligned": {

    "alignedVideoUrl": "https://storage.googleapis.com/...",

    "duration": 120

  }

}

```



The client should use the job status together with the `aligned` result to determine when the dubbing output is available.



---



## 11. Backend Integration Requirements



Backend consumers integrating with the dubbing service should:



1\. Send a valid `videoUrl`.

2\. Provide `dubUrl` when dubbed audio is available.

3\. Provide valid `steps` and `dubTimings` when timing-based alignment is required.

4\. Store the returned `jobId`.

5\. Treat the operation as asynchronous.

6\. Poll the job endpoint for the processing status and result.

7\. Read `aligned.alignedVideoUrl` when the job completes successfully.

8\. Read `aligned.duration` for the resulting video duration.

9\. Handle failed jobs and missing/failed processing results appropriately.

10\. Do not assume that a separate callback request is required for the AVS dubbing flow.



---



## 12. Graceful Degradation



The dubbing service is designed to continue safely when alignment inputs are incomplete.



If there is no `dubUrl`, no valid source steps, or no valid dubbing timing map, the worker returns the original `videoUrl` rather than attempting alignment.



This behavior allows consumers to integrate with the service without requiring alignment data for every request.



---



## 13. Implementation References



The current contract is implemented across the following components:



* `app/api/avs/dub/route.ts` â€” AVS dubbing API and job creation

* `app/lib/gcpWorker.ts` â€” internal Cloud Run worker invocation

* `app/lib/dubbing/poll.ts` â€” dubbing job polling/result handling

* `app/api/jobs/[id]/route.ts` â€” job result response

* `cloudrun-worker/server.js` â€” `/avs-dub` worker implementation



This document describes the current implementation contract and should be updated if the API or worker contract changes.
