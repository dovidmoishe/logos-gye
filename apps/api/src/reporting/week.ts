export const day = 86400000;
export const week = 7 * day;
export const reportScope = "weekly-blocked-counts-v1";
export function monday(time: number) {
  return Math.floor((time - 4 * day) / week) * week + 4 * day;
}
