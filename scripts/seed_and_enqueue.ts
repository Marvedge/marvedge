/**
 * Task 111 — Seed a test user and enqueue the canary BullMQ job.
 * Run AFTER upload_canary.ts — pass VIDEO_URL as env var or edit below.
 *
 * Usage:
 *   $env:CANARY_VIDEO_URL="https://res.cloudinary.com/..."; npx tsx scripts/seed_and_enqueue.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const CANARY_VIDEO_URL = process.env.CANARY_VIDEO_URL ?? '';
const TARGET_ASPECT = '9:16';
const SOURCE = { width: 480, height: 864, fps: 30, durationSec: 39.07 };
const TEST_EMAIL = 'task111-canary@marvedge.local';

async function main() {
  if (!CANARY_VIDEO_URL.startsWith('https://')) {
    throw new Error(
      'CANARY_VIDEO_URL env var must be set to the Cloudinary secure_url.\n' +
      'Example: $env:CANARY_VIDEO_URL="https://res.cloudinary.com/..." then re-run.'
    );
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  // --- Seed test user (upsert so re-runs are idempotent) ---
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {},
    create: { email: TEST_EMAIL, name: 'Task111 Canary' },
  });
  console.log('✅ User upserted — id:', user.id, 'email:', user.email);

  // --- Create VideoJob record ---
  const videoJob = await prisma.videoJob.create({
    data: {
      userId: user.id,
      videoUrl: CANARY_VIDEO_URL,
      status: 'PENDING',
      progress: 0,
      jobData: {
        kind: 'REFRAME',
        targetAspectRatio: TARGET_ASPECT,
        source: SOURCE,
      },
    },
  });
  console.log('✅ VideoJob created — id:', videoJob.id, 'status:', videoJob.status);

  // --- Enqueue in BullMQ ---
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue('reframe-processing', { connection: redis });

  await queue.add(
    'reframe',
    {
      jobId: videoJob.id,
      userId: user.id,
      videoUrl: CANARY_VIDEO_URL,
      targetAspectRatio: TARGET_ASPECT,
      source: SOURCE,
      testFaultMode: 'autoflip_empty', // triggers center-crop fallback (no AutoFlip needed)
    },
    {
      jobId: videoJob.id,
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    }
  );

  console.log('✅ BullMQ job enqueued — jobId:', videoJob.id);
  console.log('\n📋 RECORD THIS JOB ID FOR VERIFICATION:');
  console.log('   VideoJob.id =', videoJob.id);
  console.log('   User.id     =', user.id);
  console.log('   Video URL   =', CANARY_VIDEO_URL.substring(0, 60) + '...');

  await queue.close();
  await redis.quit();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[seed_and_enqueue] FAILED:', e.message ?? e);
  process.exit(1);
});
