const ROLE_LABELS: Record<string, string> = {
  system_admin: 'Super admin',
  ao: 'Administrative Officer II',
};

const ROLE_SHORT_LABELS: Record<string, string> = {
  system_admin: 'Super admin',
  ao: 'AO II',
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
