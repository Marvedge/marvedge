import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { generateAssContent, normalizeCues, type SubtitleCue } from "@/app/lib/subtitles";

const ID_REGEX = /^[A-Za-z0-9_-]+$/;
const MAX_ID_LENGTH = 200;

function secretsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/**
 * Secure caption-serving endpoint (Task 112).
 *
 * GET /api/subtitles/file/[id]
 *
 * Serves genuine ASS subtitle documents for reframed clips and demos.
 * Enforces worker auth (CALLBACK_SECRET / WORKER_SECRET) or user session authorization.
 * Validates IDs to prevent path traversal and supports both disk-cached
 * artifacts and database-backed dynamic ASS generation.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string" || id.length > MAX_ID_LENGTH || !ID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid caption id" }, { status: 400 });
    }

    // 1. Authenticate worker via Bearer token if provided
    const authHeader = req.headers.get("authorization") || "";
    const bearerMatch = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
    const token = bearerMatch?.[1] ?? "";
    const callbackSecret = (process.env.CALLBACK_SECRET || "").trim();
    const workerSecret = (process.env.WORKER_SECRET || "").trim();

    const isWorkerAuth = Boolean(
      token &&
        ((callbackSecret && secretsMatch(token, callbackSecret)) ||
          (workerSecret && secretsMatch(token, workerSecret)))
    );

    // 2. Query database for resource metadata and ownership
    const job = await prisma.videoJob.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        demoId: true,
        jobData: true,
        demo: {
          select: {
            userId: true,
            isPublic: true,
            subtitles: true,
          },
        },
      },
    });

    let demo: { id: string; userId: string; isPublic: boolean; subtitles: unknown } | null = null;
    let track: {
      id: string;
      language: string | null;
      cues: unknown;
      demo: { userId: string; isPublic: boolean } | null;
    } | null = null;

    if (!job) {
      demo = await prisma.demo.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          isPublic: true,
          subtitles: true,
        },
      });

      if (!demo) {
        track = await prisma.subtitleTrack.findFirst({
          where: {
            OR: [{ id }, { demoId: id }],
          },
          select: {
            id: true,
            language: true,
            cues: true,
            demo: {
              select: {
                userId: true,
                isPublic: true,
              },
            },
          },
        });
      }
    }

    if (!job && !demo && !track) {
      return NextResponse.json({ error: "Caption file not found" }, { status: 404 });
    }

    // 3. Authorization check for non-worker requests
    if (!isWorkerAuth) {
      const isPublic = Boolean(
        job?.demo?.isPublic || demo?.isPublic || track?.demo?.isPublic
      );

      if (!isPublic) {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const currentUserId = session.user.id;
        const isOwner =
          job?.userId === currentUserId ||
          job?.demo?.userId === currentUserId ||
          demo?.userId === currentUserId ||
          track?.demo?.userId === currentUserId;

        if (!isOwner) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    // 4. Retrieve content: check disk cache in public/captions first
    const captionsDir = path.resolve(process.cwd(), "public", "captions");
    const safeFilePath = path.resolve(captionsDir, `${id}.ass`);

    // Strict path-traversal guard
    if (safeFilePath.startsWith(captionsDir) && fs.existsSync(safeFilePath)) {
      const assContent = fs.readFileSync(safeFilePath, "utf8");
      return new NextResponse(assContent, {
        status: 200,
        headers: {
          "Content-Type": "text/x-ssa; charset=utf-8",
          "Content-Disposition": `inline; filename="${id}.ass"`,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // 5. Dynamic ASS generation from database cues
    let rawCues: unknown = null;
    let language: string | null = null;

    if (job?.jobData && typeof job.jobData === "object") {
      const rec = job.jobData as Record<string, unknown>;
      rawCues = rec.subtitles || rec.cues || null;
      if (typeof rec.language === "string") {
        language = rec.language;
      }
    }

    if (!rawCues && job?.demo?.subtitles) {
      rawCues = job.demo.subtitles;
    }

    if (!rawCues && demo?.subtitles) {
      rawCues = demo.subtitles;
    }

    if (!rawCues && track?.cues) {
      rawCues = track.cues;
      language = track.language;
    }

    if (rawCues && Array.isArray(rawCues)) {
      const cues = normalizeCues(rawCues as SubtitleCue[]);
      const assContent = generateAssContent(cues, 1920, 1080, undefined, language);

      // Cache to disk for subsequent fast serving
      try {
        if (!fs.existsSync(captionsDir)) {
          fs.mkdirSync(captionsDir, { recursive: true });
        }
        fs.writeFileSync(safeFilePath, assContent, "utf8");
      } catch {
        // Non-fatal if cache write fails
      }

      return new NextResponse(assContent, {
        status: 200,
        headers: {
          "Content-Type": "text/x-ssa; charset=utf-8",
          "Content-Disposition": `inline; filename="${id}.ass"`,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return NextResponse.json({ error: "Caption file not found" }, { status: 404 });
  } catch (err) {
    console.error("[subtitles/file] Error retrieving caption file:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
