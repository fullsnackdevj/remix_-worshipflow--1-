// ── Shared application constants ─────────────────────────────────────────────

export const MEMBER_ROLES = [
  "Worship Leader",
  "Backup Singer",
  "Acoustic Guitar",
  "Electric Guitar",
  "Bass Guitar",
  "Keyboard",
  "Drums",
  "Audio/Tech",
  "Choir",
];

export const ROLE_CATEGORIES = [
  {
    label: "Instrumentalists",
    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
    dot: "bg-indigo-400",
    roles: ["Drummer", "Bassist", "Rhythm Guitar", "Lead Guitar", "Keys / Pianist"],
  },
  {
    label: "Vocals",
    color: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
    dot: "bg-rose-400",
    roles: ["Worship Leader", "Backup Singer"],
  },
  {
    label: "Tech & Production",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
    dot: "bg-amber-400",
    roles: ["OBS / Live Stream", "Presentation", "Lighting", "Camera Operator"],
  },
  {
    label: "Creative Support",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    dot: "bg-emerald-400",
    roles: ["Designer", "Photographer", "Videographer"],
  },
];

export const ALL_ROLES = ROLE_CATEGORIES.flatMap(c => c.roles);

export function getRoleStyle(role: string): string {
  const cat = ROLE_CATEGORIES.find(c => c.roles.includes(role));
  return cat ? cat.color : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
}

export const STATUS_CONFIG = {
  active: { label: "Active", dot: "bg-emerald-400", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
  "on-leave": { label: "On Leave", dot: "bg-amber-400", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
  inactive: { label: "Inactive", dot: "bg-gray-400", badge: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400" },
} as const;

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  Member: "Can view songs and schedules.",
  Musician: "Can view and interact with songs and schedules.",
  "Audio/Tech": "Can view songs and manage audio assignments.",
  Leader: "Can manage songs and schedule events.",
  Admin: "Full access to all features and admin panel.",
};

export const ROLE_COLORS: Record<string, string> = {
  Member: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  Musician: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Audio/Tech": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Leader: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  Admin: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "Planning Lead": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
};
