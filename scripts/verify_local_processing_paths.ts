/**
 * Task 111 — Verification of Existing Local Processing Paths
 *
 * Evaluates whether existing processing paths in the workspace can generate a
 * real output MP4 from the local canary file:
 *   ./WhatsApp Video 2026-11-18 at 1.41.14 PM.mp4
 * without Cloudinary/AWS credentials and without modifying production code/security.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const CANARY_LOCAL_RELATIVE = './WhatsApp Video 2026-11-18 at 1.41.14 PM.mp4';
const CANARY_LOCAL_ABSOLUTE = path.resolve(process.cwd(), CANARY_LOCAL_RELATIVE);

async function main() {
  console.log('================================================================');
  console.log('TASK 111 — LOCAL PROCESSING PATH VERIFICATION');
  console.log('================================================================');
  console.log(`Canary file exists: ${fs.existsSync(CANARY_LOCAL_ABSOLUTE)}`);
  console.log(`Canary file size:   ${fs.statSync(CANARY_LOCAL_ABSOLUTE).size} bytes`);
  console.log(`Cloudinary API Key: ${process.env.CLOUDINARY_API_KEY ? 'CONFIGURED' : 'UNCONFIGURED (empty)'}`);
  console.log(`AWS / S3 configured: ${process.env.AWS_ACCESS_KEY_ID ? 'CONFIGURED' : 'UNCONFIGURED (empty)'}`);

  // --------------------------------------------------------------------------
  // PATH 1: Reframe Worker Pipeline (reframe-worker/render.ts & orchestrator.ts)
  // --------------------------------------------------------------------------
  console.log('\n--- [PATH 1] Reframe Worker Pipeline ---');
  const { validateReframeJobPayload } = await import('../app/lib/reframe/validation');
  const { renderReframedVideo } = await import('../reframe-worker/render');

  // Test 1A: Ingestion validation
  try {
    validateReframeJobPayload({
      jobId: 'probe-canary-root',
      videoUrl: CANARY_LOCAL_RELATIVE,
      targetAspectRatio: '9:16',
    });
    console.log('  [Ingestion Gate] Passed unexpectedly');
  } catch (err: any) {
    console.log(`  [Ingestion Gate] Rejected as expected: ${err.message}`);
  }

  // Test 1B: Direct renderReframedVideo call without mocks
  try {
    await renderReframedVideo(
      CANARY_LOCAL_RELATIVE,
      {
        schema_version: 1,
        source: { width: 480, height: 864, fps: 30, duration_sec: 5 },
        output: { aspect_ratio: '9:16' },
        crop_targets: [{ timestamp_sec: 0, crop: { x: 0, y: 0, width: 480, height: 864 } }],
      },
      { jobId: 'probe-render-canary' }
    );
    console.log('  [Direct Render] Unexpectedly succeeded');
  } catch (err: any) {
    console.log(`  [Direct Render] Failed as expected: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // PATH 2: CloudRun Worker Render Engine (cloudrun-worker/render.js)
  // --------------------------------------------------------------------------
  console.log('\n--- [PATH 2] CloudRun Render Engine (renderChunkFromRecipe) ---');
  const { renderChunkFromRecipe } = require('../cloudrun-worker/render');

  const testOutputPath = path.resolve(process.cwd(), './canary_verified_output.mp4');
  if (fs.existsSync(testOutputPath)) {
    fs.unlinkSync(testOutputPath);
  }

  try {
    const startTime = Date.now();
    await renderChunkFromRecipe({
      inputPath: CANARY_LOCAL_ABSOLUTE,
      outputPath: testOutputPath,
      chunkId: 'canary_val_chunk',
      recipe: {
        settings: {
          quality: '720p',
          fps: '30 FPS',
          compression: 'Web',
          speed: 'Default',
        },
      },
      chunkDurationSecs: 5,
      startTime: 0,
      duration: 5,
    });
    const elapsed = Date.now() - startTime;

    if (fs.existsSync(testOutputPath)) {
      const stat = fs.statSync(testOutputPath);
      console.log(`  [Render Execution] SUCCESS in ${elapsed}ms`);
      console.log(`  [Output File]      ${testOutputPath}`);
      console.log(`  [Output Size]      ${stat.size} bytes`);

      // Probe with ffprobe
      const ffmpeg = require('fluent-ffmpeg');
      const ffprobeStatic = require('ffprobe-static');
      ffmpeg.setFfprobePath(ffprobeStatic.path);

      const metadata: any = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(testOutputPath, (err: any, data: any) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');

      console.log(`  [Container Format] ${metadata.format.format_name}`);
      console.log(`  [Duration]         ${metadata.format.duration}s`);
      console.log(`  [Video Stream]     ${videoStream?.codec_name} ${videoStream?.width}x${videoStream?.height} @ ${videoStream?.r_frame_rate} fps`);
      console.log(`  [Audio Stream]     ${audioStream?.codec_name} (${audioStream?.sample_rate} Hz, ${audioStream?.channels} ch)`);
    } else {
      console.log('  [Render Execution] Output file not found after render');
    }
  } catch (err: any) {
    console.log(`  [Render Execution] Failed: ${err.message}`);
  }

  console.log('\n================================================================');
  console.log('VERIFICATION COMPLETE');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
