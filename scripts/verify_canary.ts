/**
 * Task 111 — Verify canary job end-to-end result.
 * Run: $env:CANARY_JOB_ID="<uuid>"; npx tsx scripts/verify_canary.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';

const JOB_ID = process.env.CANARY_JOB_ID ?? '';

async function main() {
  if (!JOB_ID) {
    throw new Error('Set $env:CANARY_JOB_ID to the VideoJob UUID from seed_and_enqueue.ts');
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });
  const redisUrl = new URL(
    process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
  );
  const connection = {
    host: redisUrl.hostname,
    port: Number(
      redisUrl.port || (redisUrl.protocol === 'rediss:' ? 6380 : 6379)
    ),
    ...(redisUrl.username
      ? { username: decodeURIComponent(redisUrl.username) }
      : {}),
    ...(redisUrl.password
      ? { password: decodeURIComponent(redisUrl.password) }
      : {}),
    ...(redisUrl.pathname.length > 1
      ? { db: Number(redisUrl.pathname.slice(1)) }
      : {}),
    ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
  const queue = new Queue('reframe-processing', { connection });

  // --- DB record ---
  const job = await prisma.videoJob.findUnique({ where: { id: JOB_ID } });
  if (!job) {
    console.error('❌ VideoJob not found in DB for id:', JOB_ID);
    process.exit(1);
  }
  console.log('\n📋 VideoJob DB record:');
  console.log('  id:        ', job.id);
  console.log('  status:    ', job.status);
  console.log('  progress:  ', job.progress);
  console.log('  createdAt: ', job.createdAt.toISOString());
  console.log('  updatedAt: ', job.updatedAt.toISOString());
  console.log('  jobData:   ', JSON.stringify(job.jobData, null, 4));

  const jobData = job.jobData as Record<string, unknown>;
  const exportedUrl = (job as { exportedUrl?: string | null }).exportedUrl ?? jobData?.exportedUrl ?? jobData?.reframedUrl ?? jobData?.outputUrl;

  // --- BullMQ state ---
  const bullJob = await queue.getJob(JOB_ID);
  const bullState = bullJob ? await bullJob.getState() : 'not found in queue';
  console.log('\n📋 BullMQ job state:', bullState);

  // --- Verdict ---
  console.log('\n--- CANARY VERDICT ---');
  const statusOk = job.status === 'COMPLETED';
  const outputOk = typeof exportedUrl === 'string' && exportedUrl.startsWith('https://');
  const bullOk = bullState === 'completed';

  console.log('DB status = COMPLETED?', statusOk ? '✅' : `❌ (${job.status})`);
  console.log('Output URL present?    ', outputOk ? `✅ ${exportedUrl}` : '❌ (missing)');
  console.log('BullMQ completed?      ', bullOk ? '✅' : `❌ (${bullState})`);

  if (statusOk && outputOk && bullOk) {
    console.log('\n🎉 CANARY STATUS: PASS');
  } else {
    console.log('\n❌ CANARY STATUS: FAIL — not all criteria met');
    process.exitCode = 1;
  }

  await queue.close();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[verify_canary] FAILED:', e.message ?? e);
  process.exit(1);
});
