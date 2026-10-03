export const APP_ROLES = ['admin', 'instructor', 'member'] as const;
export type AppRole = (typeof APP_ROLES)[number];
