/**
 * Default time formatter that converts seconds to HH:MM:SS format
 * @param seconds - Time in seconds
 * @returns Formatted time string
 */
export const defaultFormatTime = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Format time in MM:SS format
 * @param s - Time in seconds
 * @returns Formatted time string in MM:SS format
 */
export const formatTime = (s: number): string => {
  if (!isFinite(s) || isNaN(s)) {
    return "0:00";
  }
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export const formatTime_2 = (timeString: string) => {
  // Check if timeString is in "HH:MM:SS" format
  if (timeString.includes(":")) {
    const parts = timeString.split(":").map(Number);
    if (parts.length === 3) {
      const hours = parts[0] || 0;
      const minutes = parts[1] || 0;
      const seconds = parts[2] || 0;
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
  }

  // Fallback: treat as seconds
  const seconds = parseInt(timeString) || 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Format time in HH:MM:SS format
 * @param seconds - Time in seconds
 * @returns Formatted time string in HH:MM:SS format
 */
export const formatTimeFull = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return [hrs, mins, secs].map((v) => String(v).padStart(2, "0")).join(":");
};
