type AvsDubJobs = {
  updateMany(args: {
    where: {
      id: string;
      status: { in: string[] };
      jobData: { path: string[]; equals: string };
    };
    data: { status: string };
  }): PromiseLike<{ count: number }>;
};

export async function runClaimedAvsDubJob(
  jobs: AvsDubJobs,
  jobId: string,
  align: () => Promise<void>
): Promise<void> {
  // PROCESSING remains eligible so BullMQ can retry active work.
  const claimed = await jobs.updateMany({
    where: {
      id: jobId,
      status: { in: ["PENDING", "PROCESSING"] },
      jobData: { path: ["kind"], equals: "AVS_DUB" },
    },
    data: { status: "PROCESSING" },
  });

  if (claimed.count > 0) {
    await align();
  }
}
