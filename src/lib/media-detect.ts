export type MediaKind = "video" | "image" | "unsupported";
const videoExt = ["mp4", "webm", "mov", "m4v"];
const imageExt = ["png", "jpg", "jpeg", "webp", "gif"];

export function kindOf(file: Pick<File, "name" | "type">): MediaKind {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/") && file.type !== "image/svg+xml") return "image";
  if (file.type) return "unsupported";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return videoExt.includes(ext) ? "video" : imageExt.includes(ext) ? "image" : "unsupported";
}

export type Detection<F> = {
  videos: F[];
  images: F[];
  skipped: F[];
  /** Which editor the files point to; "mixed" means the user must choose. */
  suggestion: "video" | "demo" | "mixed" | "none";
};

const byName = <F extends { name: string }>(a: F, b: F) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

export function detectMedia<F extends Pick<File, "name" | "type">>(files: F[]): Detection<F> {
  const videos = files.filter((f) => kindOf(f) === "video").sort(byName);
  const images = files.filter((f) => kindOf(f) === "image").sort(byName);
  const skipped = files.filter((f) => kindOf(f) === "unsupported");
  const suggestion =
    videos.length && images.length
      ? "mixed"
      : videos.length
        ? "video"
        : images.length
          ? "demo"
          : "none";
  return { videos, images, skipped, suggestion };
}

export const nameFromFile = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Untitled project";
