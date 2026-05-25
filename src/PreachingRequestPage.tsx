import React, { useState, useEffect, useRef } from "react";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";
import {
  Mic2, FileText, Link2, Upload, X, Check, Loader2,
  AlertTriangle, BookOpen, ChevronDown, CalendarDays, Paperclip,
} from "lucide-react";

interface ShareInfo {
  id: string;
  createdByName: string;
  serviceType: string;
  scheduledDate: string;
  instructions: string;
}

const SERVICE_TYPES = ["Sunday Service", "Midweek Service", "Prayer Meeting", "Special Service", "Camp / Retreat", "Other"];

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

  // File upload
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedFileType, setUploadedFileType] = useState("");
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

  const handleFileChange = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setUploadedFileUrl("");
    setUploadedFileName("");
    setUploadedFileType("");
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const path = `preaching_shares/${shareId}/${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);
      await new Promise<void>((resolve, reject) =>
        task.on("state_changed",
          snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          () => resolve()
        )
      );
      const url = await getDownloadURL(sRef);
      setUploadedFileUrl(url);
      setUploadedFileName(file.name);
      setUploadedFileType(file.type);
    } catch {
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setUploadedFileUrl("");
    setUploadedFileName("");
    setUploadedFileType("");
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preacherName.trim()) { setSubmitError("Please enter your name."); return; }
    if (!title.trim()) { setSubmitError("Please enter a sermon title."); return; }
    if (!notes.trim() && !link.trim() && !uploadedFileUrl) {
      setSubmitError("Please add notes, a reference link, or upload a file."); return;
    }
    if (file && !uploadedFileUrl) {
      setSubmitError("Please upload the file first by clicking 'Upload File'."); return;
    }
    setSubmitError(null);
    setSubmitting(true);
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
          fileUrl: uploadedFileUrl,
          fileName: uploadedFileName,
          fileType: uploadedFileType,
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

          {/* Submission summary card */}
          <div style={{
            padding: "20px 24px", borderRadius: 18,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            backdropFilter: "blur(12px)",
          }}>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Submitted By</p>
            <p style={{ color: "rgba(255,255,255,0.92)", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 6px" }}>{preacherName}</p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.22)" }}>
              <Mic2 size={11} style={{ color: "#a5b4fc" }} />
              <span style={{ color: "#a5b4fc", fontSize: 12, fontWeight: 600 }}>{title}</span>
            </div>
          </div>

          <p style={{ color: "rgba(255,255,255,0.15)", fontSize: 11, marginTop: 20, letterSpacing: "0.02em" }}>
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
      `}</style>

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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
              <div style={{ position: "relative" }}>
                <label style={labelStyle}>Service Type</label>
                <select
                  className="prq-input prq-select"
                  value={serviceType}
                  onChange={e => setServiceType(e.target.value)}
                >
                  <option value="">Select…</option>
                  {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={13} style={{ position: "absolute", right: 12, top: "65%", color: "rgba(255,255,255,0.25)", pointerEvents: "none" }} />
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

            {/* File upload */}
            <div>
              <label style={labelStyle}><Paperclip size={12} style={{ display: "inline", marginRight: 4 }} />Attachment (optional)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.zip,.jpg,.jpeg,.png,.gif,.webp,image/*,application/zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={{ display: "none" }}
                onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
              />

              {!file ? (
                <button
                  type="button"
                  className="prq-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ width: "100%", justifyContent: "center", padding: "12px 16px", borderRadius: 12 }}
                >
                  <Upload size={15} />
                  Choose File (PDF, Word, ZIP, Image)
                </button>
              ) : (
                <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: uploadedFileUrl ? 0 : 10 }}>
                    <Paperclip size={14} style={{ color: "#818cf8", flexShrink: 0 }} />
                    <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                    <button type="button" onClick={removeFile} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 2, flexShrink: 0 }}>
                      <X size={15} />
                    </button>
                  </div>

                  {!uploadedFileUrl && (
                    <>
                      {uploading ? (
                        <>
                          <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${uploadProgress}%`, background: "linear-gradient(90deg,#6366f1,#a78bfa)", borderRadius: 3, transition: "width 0.3s" }} />
                          </div>
                          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 6 }}>Uploading… {uploadProgress}%</p>
                        </>
                      ) : (
                        <button type="button" className="prq-upload-btn" onClick={handleUpload} disabled={uploading}>
                          <Upload size={13} />
                          Upload File
                        </button>
                      )}
                    </>
                  )}
                  {uploadedFileUrl && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <Check size={13} style={{ color: "#34d399" }} />
                      <span style={{ color: "#34d399", fontSize: 12, fontWeight: 600 }}>File uploaded successfully</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error */}
            {submitError && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <AlertTriangle size={14} style={{ color: "#f87171", flexShrink: 0 }} />
                <p style={{ color: "#fca5a5", fontSize: 13, margin: 0 }}>{submitError}</p>
              </div>
            )}

            {/* Submit */}
            <button type="submit" className="prq-btn-primary" disabled={submitting || uploading} style={{ marginTop: 4 }}>
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
