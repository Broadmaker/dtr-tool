const ROLE_LABELS: Record<string, string> = {
  system_admin: 'System administrator',
  owner: 'School owner',
  admin: 'School administrator',
  ao: 'Administrative Officer II',
  encoder: 'Encoder',
  viewer: 'Viewer',
};

const ROLE_SHORT_LABELS: Record<string, string> = {
  system_admin: 'System admin',
  owner: 'Owner',
  admin: 'Administrator',
  ao: 'AO II',
  encoder: 'Encoder',
  viewer: 'Viewer',
};

function fallbackLabel(role: string): string {
  return role
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function roleLabel(role: string): string {
  if (!role) return '';
  return ROLE_LABELS[role] ?? fallbackLabel(role);
}

export function roleShortLabel(role: string): string {
  if (!role) return '';
  return ROLE_SHORT_LABELS[role] ?? fallbackLabel(role);
}
