import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import ShareVideoPageClient from "../../[slug]/ShareVideoPageClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SharedExportedVideoPage({ params }: PageProps) {
  const { id } = await params;
  const video = await prisma.exportedVideo.findUnique({
    where: { id },
    select: {
      title: true,
      description: true,
      exportedUrl: true,
    },
  });

  if (!video) {
    notFound();
  }

  return (
    <ShareVideoPageClient
      title={video.title}
      description={video.description}
      videoUrl={video.exportedUrl || ""}
      backgroundStyle={{}}
      aspectRatio="native"
      videoId={id}
    />
  );
}
