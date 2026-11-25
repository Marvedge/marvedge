import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { isSafeUrl } from "../app/lib/safeUrl";

async function main() {
  console.log("=== Task 111 Preflight Probe ===");

  // 1. DB
  const dbUrl = "postgresql://postgres:postgres@127.0.0.1:5432/marvedge_test";
  process.env.DATABASE_URL = dbUrl;
  process.env.DIRECT_URL = dbUrl;
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const userCount = await prisma.user.count();
    const jobCount = await prisma.videoJob.count();
    console.log(`[DB] Connected to marvedge_test: ${userCount} users, ${jobCount} videoJobs`);
  } catch (err: any) {
    console.error("[DB] Connection failed:", err.message);
  } finally {
    await prisma.$disconnect();
  }

  // 2. Redis
  const redis = new Redis("redis://127.0.0.1:6379");
  try {
    const pong = await redis.ping();
    console.log(`[Redis] Connected on 127.0.0.1:6379: ${pong}`);
  } catch (err: any) {
    console.error("[Redis] Connection failed:", err.message);
  } finally {
    redis.disconnect();
  }

  // 3. URL Safety on target video
  const localFilePath = "C:\\Users\\kajal\\Downloads\\WhatsApp Video 2026-11-18 at 1.41.14 PM.mp4";
  const fileUrl = "file:///C:/Users/kajal/Downloads/WhatsApp%20Video%202026-11-18%20at%201.41.14%20PM.mp4";
  const localhostUrl = "http://127.0.0.1:8080/test.mp4";
  console.log(`[SafeUrl] localFilePath safe?`, isSafeUrl(localFilePath));
  console.log(`[SafeUrl] fileUrl safe?`, isSafeUrl(fileUrl));
  console.log(`[SafeUrl] localhostUrl safe?`, isSafeUrl(localhostUrl));

  // 4. ML Gateway probe
  try {
    const res = await fetch("http://127.0.0.1:8000/health", { signal: AbortSignal.timeout(2000) });
    console.log(`[ML Gateway] http://127.0.0.1:8000/health status: ${res.status}`);
  } catch (err: any) {
    console.log(`[ML Gateway] http://127.0.0.1:8000/health unreachable: ${err.message}`);
  }
}

main().catch(console.error);
