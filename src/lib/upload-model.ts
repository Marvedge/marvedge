export const uploadChannels = [
  "Instagram",
  "LinkedIn",
  "YouTube",
  "Facebook",
  "X",
  "TikTok",
] as const;
export type UploadChannel = (typeof uploadChannels)[number];
export type UploadPost = {
  id: string;
  title: string;
  caption: string;
  channels: UploadChannel[];
  status: "Draft" | "Planned";
  scheduledAt: string;
  projectId?: string | undefined;
  mediaId?: string | undefined;
  sample?: boolean;
};
export type UploadMedia = {
  id: string;
  name: string;
  url: string;
  kind: "image" | "video";
  size: number;
};
export type CredentialProfile = {
  id: string;
  label: string;
  provider: string;
  method: "Social account" | "API credentials";
};
export const samplePosts: UploadPost[] = [
  {
    id: "sample-tour",
    title: "Meet your new onboarding experience",
    caption:
      "A better first impression, one click at a time. Take a look at our new product tour. ✨ #ProductDesign #Onboarding",
    channels: ["LinkedIn", "Instagram"],
    status: "Planned",
    scheduledAt: "2026-10-15T10:00",
    projectId: "product-tour",
    sample: true,
  },
  {
    id: "sample-launch",
    title: "The highlights, without the wait",
    caption:
      "Big ideas. Bite-sized moments. Here are our favorite takeaways from launch day. #LaunchDay",
    channels: ["YouTube", "X"],
    status: "Planned",
    scheduledAt: "2026-10-16T14:30",
    projectId: "launch-highlights",
    sample: true,
  },
  {
    id: "sample-feature",
    title: "Small update. Big possibilities.",
    caption: "A closer look at what’s new and what you can create next.",
    channels: ["Instagram"],
    status: "Draft",
    scheduledAt: "",
    projectId: "feature-walkthrough",
    sample: true,
  },
];
export function validatePost(post: UploadPost, now = new Date()): string | null {
  if (!post.title.trim()) return "Add a post title.";
  if (!post.caption.trim()) return "Add a caption.";
  if (!post.channels.length) return "Choose at least one channel.";
  if (
    post.status === "Planned" &&
    (!post.scheduledAt ||
      !Number.isFinite(new Date(post.scheduledAt).getTime()) ||
      new Date(post.scheduledAt) <= now)
  )
    return "Choose a future date and time.";
  return null;
}
export function validateUpload(file: Pick<File, "size" | "type">): string | null {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/"))
    return "Choose an image or video file.";
  if (file.size > 250 * 1024 * 1024) return "Files must be 250 MB or smaller.";
  return null;
}
