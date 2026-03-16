import { prisma } from "@/app/lib/prisma";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await prisma.demo.findUnique({
    where: { id },
  });

  await prisma.view.create({
    data: {
      demoId: id,
    },
  });
  console.log(id);

  if (!video) {
    return <div>Video not found</div>;
  }

  return (
    <div>
      <h1>{video.title}</h1>
      <video src={video.exportedUrl || video.videoUrl} controls width="100%" />
    </div>
  );
}
