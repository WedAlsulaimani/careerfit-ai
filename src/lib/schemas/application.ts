export const APPLICATION_STATUSES = ["saved", "preparing", "ready", "applied", "interview", "offer", "rejected", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
