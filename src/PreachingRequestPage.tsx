import React, { useState, useEffect, useRef, useCallback } from "react";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";
import {
  Mic2, FileText, Link2, Upload, X, Check, Loader2,
  AlertTriangle, BookOpen, ChevronDown, CalendarDays, Paperclip, Plus,
} from "lucide-react";

interface ShareInfo {
  id: string;
  createdByName: string;
  serviceType: string;
  scheduledDate: string;
  instructions: string;
}

const SERVICE_TYPES = ["Sunday Service", "Midweek Service", "Prayer Meeting", "Special Service", "Camp / Retreat", "Other"];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

interface UploadedFile {
  id: string;
  file: File;
  progress: number;   // 0-100
  status: "uploading" | "done" | "error";
  url: string;
  errorMsg?: string;
}

export default function PreachingRequestPage({ shareId }: { shareId: string }) {
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);

  // Form fields
  const [preacherName, setPreacherName] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");

  // Multi-file upload
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load share info
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/preaching-shares/public/${shareId}`);
        if (res.status === 404) { setLoadError("This link doesn't exist."); return; }
        if (res.status === 410) { setLoadError("This link has been deactivated."); return; }
        if (!res.ok) throw new Error("Failed to load");
        const data: ShareInfo = await res.json();
        setShareInfo(data);
        if (data.scheduledDate) setScheduledDate(data.scheduledDate);
        if (data.serviceType) setServiceType(data.serviceType);
      } catch {
        setLoadError("Unable to load this link. Please try again.");
      } finally {
        setLoadingInfo(false);
      }
    })();
  }, [shareId]);

  // Auto-upload a single File object and track it
  const uploadOneFile = useCallback((f: File): string => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const entry: UploadedFile = { id, file: f, progress: 0, status: "uploading", url: "" };
    setUploadedFiles(prev => [...prev, entry]);

    const path = `preaching_shares/${shareId}/${id}_${f.name}`;
    const sRef = storageRef(storage, path);
    const task = uploadBytesResumable(sRef, f);

    task.on(
      "state_changed",
      snap => {
        const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100);
        setUploadedFiles(prev => prev.map(u => u.id === id ? { ...u, progress: pct } : u));
      },
      _err => {
        const msg = (_err as any)?.code === "storage/unauthorized"
          ? "Permission denied. Contact the team."
          : (_err as any)?.message ?? "Upload failed";
        setUploadedFiles(prev => prev.map(u => u.id === id ? { ...u, status: "error", errorMsg: msg } : u));
      },
      async () => {
        const url = await getDownloadURL(sRef);
        setUploadedFiles(prev => prev.map(u => u.id === id ? { ...u, status: "done", url, progress: 100 } : u));
      }
    );
    return id;
  }, [shareId]);

  // Handle file picker change — validate size then auto-upload each
  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []) as File[];
    e.target.value = ""; // allow re-picking same file
    for (const f of chosen) {
      if (f.size > MAX_FILE_SIZE) {
        setSubmitError(`"${f.name}" exceeds the 100 MB limit and was skipped.`);
        continue;
      }
      uploadOneFile(f);
    }
  };

  const removeUploadedFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(u => u.id !== id));
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preacherName.trim()) { setSubmitError("Please enter your name."); return; }
    if (!title.trim()) { setSubmitError("Please enter a sermon title."); return; }
    if (!notes.trim() && !link.trim() && uploadedFiles.filter(u => u.status === "done").length === 0) {
      setSubmitError("Please add notes, a reference link, or upload at least one file."); return;
    }
    const stillUploading = uploadedFiles.some(u => u.status === "uploading");
    if (stillUploading) { setSubmitError("Please wait for all files to finish uploading."); return; }
    setSubmitError(null);
    setSubmitting(true);
    const doneFiles = uploadedFiles.filter(u => u.status === "done");
    // Send first file in legacy fields + all files as array
    const firstFile = doneFiles[0];
    try {
      const res = await fetch(`/api/preaching-shares/public/${shareId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preacherName: preacherName.trim(),
          title: title.trim(),
          scheduledDate,
          serviceType,
          notes: notes.trim(),
          link: link.trim(),
          fileUrl: firstFile?.url ?? "",
          fileName: firstFile?.file.name ?? "",
          fileType: firstFile?.file.type ?? "",
          files: doneFiles.map(u => ({ url: u.url, name: u.file.name, type: u.file.type })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Submission failed");
      }
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading state
  if (loadingInfo) {
    return (
      <div style={fullBg}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <Loader2 size={36} style={{ color: "#818cf8", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Loading…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Error / Inactive state
  if (loadError) {
    return (
      <div style={fullBg}>
        <div style={cardStyle}>
          <div style={{ ...iconBox, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: 20 }}>
            <AlertTriangle size={28} style={{ color: "#f87171" }} />
          </div>
          <h1 style={h1Style}>Link Unavailable</h1>
          <p style={subStyle}>{loadError}</p>
          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, marginTop: 16 }}>
            Contact the team who shared this link for a new one.
          </p>
        </div>
      </div>
    );
  }

  // ── Success state
  if (submitted) {
    return (
      <div style={fullBg}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes scaleIn { from { opacity:0; transform:scale(0.6); } to { opacity:1; transform:scale(1); } }
          @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
          @keyframes ringPulse { 0%,100% { opacity:0.35; transform:scale(1); } 50% { opacity:0.65; transform:scale(1.07); } }
        `}</style>
        <div style={{ width: "100%", maxWidth: 420, padding: "24px 16px", boxSizing: "border-box", textAlign: "center", animation: "fadeUp 0.5s ease forwards" }}>
          {/* Animated check circle */}
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
            {/* Outer glow ring */}
            <div style={{ position: "absolute", width: 96, height: 96, borderRadius: "50%", border: "2px solid rgba(52,211,153,0.3)", animation: "ringPulse 2.2s ease-in-out infinite" }} />
            {/* Inner ring */}
            <div style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", border: "1.5px solid rgba(52,211,153,0.18)" }} />
            {/* Icon circle */}
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(52,211,153,0.12))",
              border: "1.5px solid rgba(52,211,153,0.5)",
              boxShadow: "0 0 32px rgba(52,211,153,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards",
            }}>
              <Check size={28} style={{ color: "#34d399", strokeWidth: 2.5 }} />
            </div>
          </div>

          {/* Title */}
          <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 10px", lineHeight: 1.15 }}>
            Request Submitted! 🎉
          </h1>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 15, lineHeight: 1.6, margin: "0 0 28px" }}>
            Your sermon request has been sent to the design team. They'll be in touch!
          </p>

          <p style={{ color: "rgba(255,255,255,0.15)", fontSize: 11, marginTop: 8, letterSpacing: "0.02em" }}>
            You may close this tab.
          </p>

        </div>
      </div>
    );
  }


  // ── Form
  return (
    <div style={fullBg}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .prq-input { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10); color: rgba(255,255,255,0.88); border-radius: 12px; padding: 12px 14px; font-size: 14px; font-family: inherit; width: 100%; box-sizing: border-box; outline: none; transition: border-color 0.2s; }
        .prq-input:focus { border-color: rgba(99,102,241,0.55); }
        .prq-input::placeholder { color: rgba(255,255,255,0.22); }
        .prq-select { appearance: none; -webkit-appearance: none; }
        .prq-textarea { resize: vertical; min-height: 120px; line-height: 1.6; }
        .prq-btn-primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border: none; border-radius: 14px; padding: 14px 28px; font-size: 15px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s, transform 0.15s; width: 100%; }
        .prq-btn-primary:hover { opacity: 0.9; }
        .prq-btn-primary:active { transform: scale(0.98); }
        .prq-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .prq-upload-btn { background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.3); color: #a5b4fc; border-radius: 10px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.2s; }
        .prq-upload-btn:hover { background: rgba(99,102,241,0.2); }
        .prq-upload-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .prq-grid-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 480px) {
          .prq-grid-row { grid-template-columns: 1fr; }
        }
      `}</style>,StartLine:257,TargetContent:

      <div style={{ width: "100%", maxWidth: 560, animation: "fadeUp 0.4s ease forwards", boxSizing: "border-box", padding: "24px 16px" }}>
        {/* Header brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ ...iconBox, width: 46, height: 46, background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))", border: "1px solid rgba(99,102,241,0.4)" }}>
            <Mic2 size={22} style={{ color: "#a5b4fc" }} />
          </div>
          <div>
            <p style={{ color: "rgba(255,255,255,0.85)", fontWeight: 800, fontSize: 16, margin: 0 }}>WorshipFlow</p>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, margin: 0 }}>Sermon Design Request</p>
          </div>
        </div>

        {/* Card */}
        <div style={{ ...cardStyle, padding: "28px 24px" }}>
          {/* From */}
          {shareInfo?.createdByName && (
            <div style={{ marginBottom: 22, padding: "12px 16px", borderRadius: 12, background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.18)", display: "flex", alignItems: "center", gap: 10 }}>
              <BookOpen size={14} style={{ color: "#818cf8", flexShrink: 0 }} />
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: 0 }}>
                Shared by <span style={{ color: "#a5b4fc", fontWeight: 700 }}>{shareInfo.createdByName}</span>
              </p>
            </div>
          )}

          {/* Instructions */}
          {shareInfo?.instructions && (
            <div style={{ marginBottom: 22, padding: "12px 16px", borderRadius: 12, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)" }}>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>Instructions</p>
              <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 1.55, margin: 0 }}>{shareInfo.instructions}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Name */}
            <div>
              <label style={labelStyle}>Your Name <span style={{ color: "#f87171" }}>*</span></label>
              <input
                className="prq-input"
                placeholder="e.g. Pastor John"
                value={preacherName}
                onChange={e => setPreacherName(e.target.value)}
                required
              />
            </div>

            {/* Title */}
            <div>
              <label style={labelStyle}>Sermon Title / Topic <span style={{ color: "#f87171" }}>*</span></label>
              <input
                className="prq-input"
                placeholder="e.g. Walking in Faith"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
              />
            </div>

            {/* Date + Service Type row */}
            <div className="prq-grid-row">
              <div>
                <label style={labelStyle}><CalendarDays size={12} style={{ display: "inline", marginRight: 4 }} />Service Date</label>
                <input
                  type="date"
                  className="prq-input"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  style={{ colorScheme: "dark" }}
                />
              </div>
              <div>
                <label style={labelStyle}>Service Type</label>
                <div style={{ position: "relative" }}>
                  <select
                    className="prq-input prq-select"
                    value={serviceType}
                    onChange={e => setServiceType(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={13} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", pointerEvents: "none" }} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={labelStyle}><FileText size={12} style={{ display: "inline", marginRight: 4 }} />Sermon Notes / Outline</label>
              <textarea
                className="prq-input prq-textarea"
                placeholder="Paste your sermon outline, key points, scriptures, or any notes here…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Reference link */}
            <div>
              <label style={labelStyle}><Link2 size={12} style={{ display: "inline", marginRight: 4 }} />Reference Link (optional)</label>
              <input
                className="prq-input"
                type="url"
                placeholder="https://docs.google.com/…"
                value={link}
                onChange={e => setLink(e.target.value)}
              />
            </div>

            {/* File upload — multi-file, auto-upload */}
            <div>
              <label style={labelStyle}><Paperclip size={12} style={{ display: "inline", marginRight: 4 }} />Attachments (optional · max 100 MB each)</label>

              {/* Hidden multi-file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.zip,.jpg,.jpeg,.png,.gif,.webp,image/*,application/zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={{ display: "none" }}
                onChange={handleFilesChange}
              />

              {/* File list */}
              {uploadedFiles.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  {uploadedFiles.map(u => (
                    <div key={u.id} style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: `1px solid ${ u.status === "error" ? "rgba(239,68,68,0.3)" : u.status === "done" ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.08)" }` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {/* Status icon */}
                        {u.status === "uploading" && <Loader2 size={13} style={{ color: "#818cf8", animation: "spin 1s linear infinite", flexShrink: 0 }} />}
                        {u.status === "done"      && <Check size={13} style={{ color: "#34d399", flexShrink: 0 }} />}
                        {u.status === "error"     && <AlertTriangle size={13} style={{ color: "#f87171", flexShrink: 0 }} />}
                        {/* File name */}
                        <span style={{ color: u.status === "error" ? "#fca5a5" : "rgba(255,255,255,0.75)", fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {u.file.name}
                        </span>
                        {/* Size */}
                        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, flexShrink: 0 }}>
                          {(u.file.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        {/* Remove */}
                        {u.status !== "uploading" && (
                          <button type="button" onClick={() => removeUploadedFile(u.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.25)", padding: 2, flexShrink: 0 }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      {/* Progress bar */}
                      {u.status === "uploading" && (
                        <div style={{ marginTop: 7 }}>
                          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${u.progress}%`, background: "linear-gradient(90deg,#6366f1,#a78bfa)", borderRadius: 2, transition: "width 0.25s" }} />
                          </div>
                          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 4 }}>Uploading… {u.progress}%</p>
                        </div>
                      )}
                      {u.status === "error" && (
                        <p style={{ color: "#f87171", fontSize: 11, marginTop: 4 }}>{u.errorMsg}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add files button */}
              <button
                type="button"
                className="prq-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                style={{ width: "100%", justifyContent: "center", padding: "11px 16px", borderRadius: 12 }}
              >
                {uploadedFiles.length > 0 ? <Plus size={15} /> : <Upload size={15} />}
                {uploadedFiles.length > 0 ? "Add More Files" : "Choose Files (PDF, Word, ZIP, Image)"}
              </button>
            </div>

            {/* Error */}
            {submitError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <AlertTriangle size={14} style={{ color: "#f87171", flexShrink: 0 }} />
                <p style={{ color: "#fca5a5", fontSize: 13, margin: 0 }}>{submitError}</p>
              </div>
            )}

            {/* Submit */}
            <button type="submit" className="prq-btn-primary" disabled={submitting || uploadedFiles.some(u => u.status === "uploading")} style={{ marginTop: 4 }}>
              {submitting
                ? <><Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} /> Submitting…</>
                : <><Mic2 size={17} /> Submit Sermon Request</>
              }
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.12)", fontSize: 11, marginTop: 20 }}>
          Powered by WorshipFlow · Your submission is private and sent only to your design team.
        </p>
      </div>
    </div>
  );
}

// ── Shared styles ───────────────────────────────────────────────────────────────
const fullBg: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  background: "radial-gradient(ellipse 90% 70% at 50% 0%, rgba(99,102,241,0.15) 0%, transparent 70%), #050510",
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
  padding: "20px 0",
  boxSizing: "border-box",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 20,
  padding: "32px 28px",
  backdropFilter: "blur(20px)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
  boxSizing: "border-box",
};

const iconBox: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const h1Style: React.CSSProperties = {
  color: "rgba(255,255,255,0.9)",
  fontSize: 22,
  fontWeight: 800,
  margin: "0 0 8px",
  letterSpacing: "-0.02em",
};

const subStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.4)",
  fontSize: 14,
  lineHeight: 1.55,
  margin: 0,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "rgba(255,255,255,0.45)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: 7,
};
