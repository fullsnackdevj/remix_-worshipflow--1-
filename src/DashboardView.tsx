import React from "react";
import Dashboard from "./Dashboard";
import { Song, Member, Schedule } from "./types";

export interface DashboardViewProps {
  allSongs: Song[];
  allMembers: Member[];
  allSchedules: Schedule[];
  dashboardNotes: any[];
  isAdmin: boolean;
  authStatus: "loading" | "authenticated" | "unauthenticated";
  effectiveRole: string;
  canAddSong: boolean;
  canWriteSchedule: boolean;
  canAddMember: boolean;
  user: any;
  showToast: (type: string, msg: string) => void;
  setCurrentView: (view: string) => void;
  onOpenLineup?: () => void;
  lineupTrackCount?: number;
  isLineupOpen?: boolean;
}

export default function DashboardView({
  allSongs,
  allMembers,
  allSchedules,
  dashboardNotes,
  isAdmin,
  authStatus,
  effectiveRole,
  canAddSong,
  canWriteSchedule,
  canAddMember,
  user,
  showToast,
  setCurrentView,
  onOpenLineup,
  lineupTrackCount = 0,
  isLineupOpen = false,
}: DashboardViewProps) {
  return authStatus === "loading" ? (
    /* Auth resolving — show a gentle skeleton so screen isn't blank */
    <div className="max-w-6xl mx-auto space-y-6 pb-10 animate-pulse">
      <div className="h-10 w-56 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-48 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      </div>
      <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
    </div>
  ) : (
    <Dashboard
      isAdmin={isAdmin}
      userRole={effectiveRole}
      userId={user?.uid ?? ""}
      userName={user?.displayName ?? user?.email ?? "Team Member"}
      userPhoto={user?.photoURL ?? ""}
      userEmail={user?.email ?? ""}
      songs={allSongs}
      members={allMembers}
      schedules={allSchedules}
      notes={dashboardNotes}
      onNavigate={(view) => {
        if (view === "admin" && !isAdmin) {
          showToast("warning", "Only the Admin can access the Admin Panel.");
          return;
        }
        setCurrentView(view);
      }}
      canAddSong={canAddSong}
      canWriteSchedule={canWriteSchedule}
      canAddMember={canAddMember}
      onOpenLineup={onOpenLineup}
      lineupTrackCount={lineupTrackCount}
      isLineupOpen={isLineupOpen}
    />
  );
}
