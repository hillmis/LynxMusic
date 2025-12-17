/**
 * Format listened duration in a human-readable Chinese string.
 * Default output drops seconds for long durations to keep it short.
 */
export const formatDuration = (
  seconds: number,
  options: { keepSeconds?: boolean } = {}
): string => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const withSeconds = options.keepSeconds === true;

  if (hours > 0) {
    if (withSeconds && secs > 0) return `${hours}小时${minutes}分${secs}秒`;
    return `${hours}小时${minutes}分`;
  }
  if (minutes > 0) {
    if (withSeconds && secs > 0) return `${minutes}分${secs}秒`;
    return `${minutes}分`;
  }
  return `${secs}秒`;
};

