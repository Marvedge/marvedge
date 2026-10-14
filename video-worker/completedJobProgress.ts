export async function updateCompletedJobProgress(
  jobId: string,
  stage: string,
  updateProgress: () => Promise<void>
): Promise<void> {
  try {
    await updateProgress();
  } catch (error) {
    console.error(
      `[${stage} ${jobId}] Job completed, but final progress could not be updated:`,
      error
    );
  }
}
