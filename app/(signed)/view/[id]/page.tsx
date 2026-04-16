import { prisma } from "@/app/lib/prisma";
import { Storage } from "@google-cloud/storage";

const storage = new Storage();

function parseGsUri(uri: string) {
  if (!uri.startsWith("gs://")) {
    return null;
  }
  const raw = uri.slice("gs://".length);
  const slashIdx = raw.indexOf("/");
  if (slashIdx <= 0) {
    return null;
  }
  const bucket = raw.slice(0, slashIdx);
  const object = raw.slice(slashIdx + 1);
  if (!bucket || !object) {
    return null;
  }
  return { bucket, object };
}

async function toPlayableUrl(url: string) {
  if (!url.startsWith("gs://")) {
    return url;
  }
  const parsed = parseGsUri(url);
  if (!parsed) {
    return url;
  }
  try {
    const [signedUrl] = await storage
      .bucket(parsed.bucket)
      .file(parsed.object)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 2 * 60 * 60 * 1000,
      });
    return signedUrl;
  } catch {
    return `https://storage.googleapis.com/${parsed.bucket}/${parsed.object}`;
  }
}

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

  const source = video.exportedUrl || video.videoUrl;
  const playableSource = source ? await toPlayableUrl(source) : "";

  return (
    <div>
      <h1>{video.title}</h1>
      <video src={playableSource} controls width="100%" />
    </div>
  );
}
