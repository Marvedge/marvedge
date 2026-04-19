import { getPageMetadata } from "@/app/lib/metadata";
import DemosClient from "./DemosClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";

export const metadata = getPageMetadata("demos");

export default async function Page() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    redirect("/auth/signin");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    redirect("/auth/signin");
  }

  const demosRaw = await prisma.demo.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const serializedDemos = demosRaw.map((demo) => ({
    id: demo.id,
    title: demo.title,
    description: demo.description || "",
    videoUrl: demo.videoUrl,
    exportedUrl: demo.exportedUrl || undefined,
    startTime: demo.startTime || undefined,
    endTime: demo.endTime || undefined,
    createdAt: demo.createdAt.toISOString(),
    updatedAt: demo.updatedAt.toISOString(),
    editing: demo.editing
      ? (demo.editing as {
          segments?: unknown;
          zoom?: unknown;
          subtitles?: unknown;
          textOverlays?: unknown;
          background?: string | null;
          backgroundType?: string;
          aspectRatio?: string;
          browserFrame?: unknown;
        })
      : undefined,
  }));

  return <DemosClient initialDemos={serializedDemos} />;
}
