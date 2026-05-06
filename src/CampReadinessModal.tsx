/**
 * CampReadinessModal — shared between LiveStageView and LyricsGridModal.
 * Checks all systems needed for an offline camp session (no internet).
 */
import React from "react";
import { X, ShieldCheck, AlertTriangle, RefreshCw, Music2 } from "lucide-react";
import { Tent } from "lucide-react";

type CheckStatus = "ok" | "warn" | "fail" | "checking";
type CheckItem = { label: string; detail: string; status: CheckStatus };

type SongBgMeta = { firebaseUrl: string; mediaId: string; mediaType: "image" | "video" };

const INITIAL_CORE: CheckItem[] = [
  { label: "Song lyrics",       detail: "Checking...", status: "checking" },
  { label: "Auth session",      detail: "Checking...", status: "checking" },
  { label: "Live state backup", detail: "Checking...", status: "checking" },
  { label: "Praise video",      detail: "Checking...", status: "checking" },
  { label: "Worship video",     detail: "Checking...", status: "checking" },
  { label: "Fade screen image", detail: "Checking...", status: "checking" },
];

interface Props {
  onClose: () => void;
  songsCount?: number;
  sceneSongs?: { id: string; title: string; artist?: string }[];
  songBgMeta?: Record<string, SongBgMeta>;
}

export default function CampReadinessModal({ onClose, songsCount, sceneSongs = [], songBgMeta = {} }: Props) {
  const [checks,     setChecks]     = React.useState<CheckItem[]>(INITIAL_CORE);
  const [songChecks, setSongChecks] = React.useState<CheckItem[]>([]);
  const [serverFetchFailed, setServerFetchFailed] = React.useState(false);

  // ── Stable refs so runChecks never needs sceneSongs/songBgMeta in its dep array ──
  // Putting live objects in useCallback deps causes new function reference every render,
  // which triggers the useEffect, which calls setState, which re-renders → infinite loop.
  const sceneSongsRef = React.useRef(sceneSongs);
  sceneSongsRef.current = sceneSongs;
  const songBgMetaRef = React.useRef(songBgMeta);
  songBgMetaRef.current = songBgMeta;

  const runChecks = React.useCallback(async () => {
    // Read fresh values from refs — always current, never a stale closure
    const currentSceneSongs = sceneSongsRef.current;
    const currentSongBgMeta = songBgMetaRef.current;
    setServerFetchFailed(false);
    setChecks([...INITIAL_CORE]);

    // Pre-populate song checks with "checking…" state for songs that have a bg assigned
    const songsWithBg = currentSceneSongs.filter(s => !!currentSongBgMeta[s.id]);
    setSongChecks(songsWithBg.map(s => ({
      label: s.title,
      detail: "Checking...",
      status: "checking" as CheckStatus,
    })));

    // 1. Songs — synchronous localStorage check
    let songsCheck: CheckItem;
    try {
      const raw = localStorage.getItem("wf_songs_cache");
      const data = raw ? JSON.parse(raw) : null;
      const count = Array.isArray(data?.songs) ? data.songs.length : 0;
      const age = data?.ts ? Math.round((Date.now() - data.ts) / 1000 / 60) : null;
      songsCheck = count > 0
        ? { label: "Song lyrics", detail: `${count} songs · cached ${age !== null ? (age < 60 ? age + "m" : Math.round(age / 60) + "h") + " ago" : ""}`, status: "ok" }
        : { label: "Song lyrics", detail: "No songs cached — open app while online first!", status: "fail" };
    } catch {
      songsCheck = { label: "Song lyrics", detail: "Cache unreadable", status: "fail" };
    }

    // 2. Auth — check localStorage cache first, then Firebase currentUser as fallback
    let authCheck: CheckItem;
    try {
      const raw = localStorage.getItem("wf_auth_session_v2");
      const role = localStorage.getItem("wf_auth_role_v2");
      if (raw) {
        const data = JSON.parse(raw);
        const age = Math.round((Date.now() - (data.ts ?? 0)) / 1000 / 60 / 60);
        authCheck = { label: "Auth session", detail: `${data.displayName ?? data.email} · ${role ?? "member"} · saved ${age}h ago`, status: "ok" };
      } else {
        const { auth: fbAuth } = await import("./firebase");
        const currentUser = fbAuth.currentUser;
        if (currentUser) {
          const sessionData = { uid: currentUser.uid, email: currentUser.email, displayName: currentUser.displayName, photoURL: currentUser.photoURL, ts: Date.now() };
          localStorage.setItem("wf_auth_session_v2", JSON.stringify(sessionData));
          localStorage.setItem("wf_auth_role_v2", "member");
          authCheck = { label: "Auth session", detail: `${currentUser.displayName ?? currentUser.email} · session now saved ✓`, status: "ok" };
        } else {
          authCheck = { label: "Auth session", detail: "Not saved — sign in while online, then re-check", status: "fail" };
        }
      }
    } catch {
      authCheck = { label: "Auth session", detail: "Cache unreadable", status: "fail" };
    }

    setChecks(prev => [songsCheck, authCheck, prev[2], prev[3], prev[4], prev[5]]);

    // 3. Server checks — async (disk + video files + song backgrounds)
    const songIdQuery = songsWithBg.map(s => s.id).join(",");
    const url = `/api/camp-status?t=${Date.now()}${songIdQuery ? `&songIds=${encodeURIComponent(songIdQuery)}` : ""}`;

    fetch(url, { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        if (data.localServerOnly) {
          setChecks([
            songsCheck, authCheck,
            { label: "Live state backup", detail: "Only verifiable on local server — not applicable on staging", status: "warn" },
            { label: "Praise video",      detail: "Only verifiable on local server — not applicable on staging", status: "warn" },
            { label: "Worship video",     detail: "Only verifiable on local server — not applicable on staging", status: "warn" },
            { label: "Fade screen image", detail: "Only verifiable on local server — not applicable on staging", status: "warn" },
          ]);
          setSongChecks(songsWithBg.map(s => ({ label: s.title, detail: "Only verifiable on local server", status: "warn" as CheckStatus })));
          setServerFetchFailed(false);
          return;
        }

        const fadeCheck: CheckItem = {
          label: "Fade screen image",
          detail: data.fadeImage ? "_fade_screen.* on disk ✓" : "Missing — assign an image from Media Library (Fade Screen)",
          status: data.fadeImage ? "ok" : "warn",
        };

        setChecks([
          songsCheck, authCheck,
          { label: "Live state backup", detail: data.diskState ? "Last scene saved to disk ✓" : "No backup yet — push a slide first", status: data.diskState ? "ok" : "warn" },
          { label: "Praise video",      detail: data.praise  ? "praise.* on disk ✓"           : "Missing — upload via Media Library first", status: data.praise  ? "ok" : "warn" },
          { label: "Worship video",     detail: data.worship ? "worship.* on disk ✓"          : "Missing — upload via Media Library first", status: data.worship ? "ok" : "warn" },
          fadeCheck,
        ]);

        // Per-song background results
        const serverSongBgs: Record<string, boolean> = data.songBgs ?? {};
        setSongChecks(songsWithBg.map(s => {
          const onDisk = serverSongBgs[s.id] === true;
          return {
            label: s.title,
            detail: onDisk ? "Background cached on disk ✓" : "Not cached — select this song while online to pre-load",
            status: (onDisk ? "ok" : "warn") as CheckStatus,
          };
        }));

        setServerFetchFailed(false);
      })
      .catch(() => {
        setChecks([
          songsCheck, authCheck,
          { label: "Live state backup", detail: "Cannot verify — server check blocked (try 'Retry')", status: "warn" },
          { label: "Praise video",      detail: "Cannot verify — server check blocked (try 'Retry')", status: "warn" },
          { label: "Worship video",     detail: "Cannot verify — server check blocked (try 'Retry')", status: "warn" },
          { label: "Fade screen image", detail: "Cannot verify — server check blocked (try 'Retry')", status: "warn" },
        ]);
        setSongChecks(songsWithBg.map(s => ({ label: s.title, detail: "Cannot verify — server unreachable", status: "warn" as CheckStatus })));
        setServerFetchFailed(true);
      });
  }, []); // stable — reads props via refs, never needs to recreate

  React.useEffect(() => { runChecks(); }, [runChecks]);

  const allChecks  = [...checks, ...songChecks];
  const hasAnyFail = allChecks.some(c => c.status === "fail");
  const allDone    = allChecks.every(c => c.status !== "checking");
  const hasWarn    = allChecks.some(c => c.status === "warn");

  const statusColor = (s: CheckStatus) =>
    s === "ok" ? "#10b981" : s === "warn" ? "#f59e0b" : s === "fail" ? "#ef4444" : "#6b7280";

  const StatusIcon = ({ s }: { s: CheckStatus }) => {
    if (s === "ok")   return <ShieldCheck size={16} color="#10b981" />;
    if (s === "warn") return <AlertTriangle size={16} color="#f59e0b" />;
    if (s === "fail") return <X size={16} color="#ef4444" />;
    return <RefreshCw size={14} color="#6b7280" style={{ animation: "spin 1s linear infinite" }} />;
  };

  const CheckRow: React.FC<{ c: CheckItem }> = ({ c }) => (
    <div style={{
      borderRadius: 12, padding: "12px 14px",
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
      display: "flex", alignItems: "flex-start", gap: 12,
    }}>
      <div style={{ marginTop: 1, flexShrink: 0 }}><StatusIcon s={c.status} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#fff" }}>{c.label}</p>
        <p style={{ margin: 0, fontSize: 11, color: statusColor(c.status), marginTop: 2, opacity: 0.85, wordBreak: "break-word" }}>{c.detail}</p>
      </div>
    </div>
  );

  const songsWithBgCount = sceneSongs.filter(s => !!songBgMeta[s.id]).length;
  const songsNoAssignment = sceneSongs.filter(s => !songBgMeta[s.id]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: "linear-gradient(135deg,#0d1117 0%,#0f1923 100%)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 20, padding: 28, width: "100%", maxWidth: 480,
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: "rgba(16,185,129,0.15)",
            border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Tent size={22} color="#10b981" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>Camp Readiness Check</p>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Offline mode — June 10–12, 2026</p>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: 4, flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {/* Status banner */}
        {allDone && (
          <div style={{
            borderRadius: 12, padding: "10px 14px", marginBottom: 16,
            background: hasAnyFail ? "rgba(239,68,68,0.1)" : hasWarn ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)",
            border: `1px solid ${hasAnyFail ? "rgba(239,68,68,0.3)" : hasWarn ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.3)"}`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            {hasAnyFail ? <X size={18} color="#ef4444" /> : hasWarn ? <AlertTriangle size={18} color="#f59e0b" /> : <ShieldCheck size={18} color="#10b981" />}
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: hasAnyFail ? "#ef4444" : hasWarn ? "#f59e0b" : "#10b981" }}>
              {hasAnyFail ? "❌ Action needed — fix red items before camp." : hasWarn ? "⚠️ Check warnings — may be fine on local server." : "✅ All systems go! Safe to go offline."}
            </p>
          </div>
        )}

        {/* Core checks */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checks.map((c, i) => <CheckRow key={i} c={c} />)}
        </div>

        {/* Per-song background checks */}
        {sceneSongs.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <Music2 size={13} color="rgba(255,255,255,0.4)" />
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Song Backgrounds ({songsWithBgCount}/{sceneSongs.length} assigned)
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {songChecks.map((c, i) => <CheckRow key={i} c={c} />)}
              {songsNoAssignment.map(s => (
                <div key={s.id} style={{
                  borderRadius: 12, padding: "10px 14px",
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{ width: 16, flexShrink: 0, opacity: 0.3, textAlign: "center", fontSize: 14 }}>—</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.35)" }}>{s.title}</p>
                    <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>No background assigned — will use scene preset</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Retry */}
        {serverFetchFailed && (
          <button onClick={runChecks} style={{
            marginTop: 12, width: "100%", padding: "10px 0",
            borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)",
            cursor: "pointer", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <RefreshCw size={14} /> Retry server checks
          </button>
        )}

        {/* Footer tip */}
        <p style={{ margin: "16px 0 0", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", lineHeight: 1.5 }}>
          ✅ = Ready &nbsp;·&nbsp; ⚠️ = Unverifiable (still ok) &nbsp;·&nbsp; ❌ = Action needed<br />
          Run this check while online before heading to camp. 🏕️
        </p>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}
