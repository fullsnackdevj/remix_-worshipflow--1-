export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  lyrics: string;
  chords: string;
  tags: Tag[];
  video_url?: string;
  created_at: string;
  updated_at: string;
  created_by_name?: string;
  created_by_photo?: string;
  updated_by_name?: string;
  updated_by_photo?: string;
}

// ── Shared domain types used across App, Dashboard, and AdminDashboard ────────

export interface Member {
  id: string;
  name: string;
  // Structured name fields — preferred over parsing `name` when present
  firstName?: string;
  middleInitial?: string;
  lastName?: string;
  phone: string;
  email: string;
  photo: string;
  roles: string[];
  status: "active" | "on-leave" | "inactive";
  notes: string;
  birthdate?: string; // "YYYY-MM-DD"
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleMember {
  memberId: string;
  name: string;
  photo: string;
  role: string;
}

export interface Schedule {
  id: string;
  date: string;
  serviceType?: string;
  eventName?: string;
  worshipLeader?: ScheduleMember | null;
  backupSingers?: ScheduleMember[];
  musicians?: ScheduleMember[];
  songLineup?: { joyful?: string; solemn?: string };
  assignments?: { role: string; members: ScheduleMember[] }[];
  notes?: string;
  created_by_name?: string;
  created_by_photo?: string;
}

