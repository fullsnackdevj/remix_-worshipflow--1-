import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Upload, Trash2, Image as ImageIcon, Video, Check, Wifi, WifiOff, FolderOpen, Film, Loader, Zap, CheckSquare, Square, LayoutGrid, List, Tag } from "lucide-react";
import { db, storage } from "./firebase";
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";

const _IDB_NAME = "lsv_idb";
const _IDB_STORE = "kv";
function _idbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(_IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(_IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(key: string, value: unknown): Promise<void> {
  const db2 = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db2.transaction(_IDB_STORE, "readwrite");
    tx.objectStore(_IDB_STORE).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbGet<T>(key: string): Promise<T | null> {
  const db2 = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db2.transaction(_IDB_STORE, "readonly");
    const req = tx.objectStore(_IDB_STORE).get(key);
    req.onsuccess = () => res((req.result ?? null) as T | null);
    req.onerror = () => rej(req.error);
  });
}
async function idbDelete(key: string): Promise<void> {
  const db2 = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db2.transaction(_IDB_STORE, "readwrite");
    tx.objectStore(_IDB_STORE).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export type MediaCategory = "praise" | "worship" | "fade" | "none";

export interface MediaItem {
  id: string; name: string; type: "image" | "video";
  firebaseUrl: string; storagePath: string;
  uploadedAt: number; sizeBytes: number; mimeType: string;
  category?: MediaCategory;
}

/** Infers a category from the filename as a fallback for untagged items */
export function getCategoryFromFileName(name: string): MediaCategory {
  const lower = name.toLowerCase();
  if (lower.includes("praise")) return "praise";
  if (lower.includes("worship")) return "worship";
  if (lower.includes("fade") || lower.includes("splash") || lower.includes("screen")) return "fade";
  return "none";
}

const CATEGORY_META: Record<MediaCategory, { label: string; color: string; bg: string; border: string }> = {
  praise:  { label: "Praise",      color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)" },
  worship: { label: "Worship",     color: "#818cf8", bg: "rgba(129,140,248,0.12)", border: "rgba(129,140,248,0.3)" },
  fade:    { label: "Fade Screen", color: "#34d399", bg: "rgba(52,211,153,0.12)",  border: "rgba(52,211,153,0.3)" },
  none:    { label: "Untagged",    color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.12)" },
};
export type MediaTarget = "praise-bg" | "worship-bg" | "fade-screen";

interface Props {
  onClose: () => void;
  onAssign: (item: MediaItem, target: MediaTarget, blobUrl: string | null) => void;
  onToast?: (msg: string, type: string) => void;
  pickMode?: boolean;
  pickTarget?: MediaTarget;
  /** Firebase URLs currently assigned to each target — used to show permanent active state */
  activeAssignments?: Partial<Record<MediaTarget, string>>;
}

function fmt(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

const TARGET_LABELS: Record<MediaTarget, { label: string; color: string; glow: string }> = {
  "praise-bg":   { label: "Praise BG",   color: "#f59e0b", glow: "rgba(245,158,11,0.25)" },
  "worship-bg":  { label: "Worship BG",  color: "#818cf8", glow: "rgba(129,140,248,0.25)" },
  "fade-screen": { label: "Fade Screen", color: "#34d399", glow: "rgba(52,211,153,0.25)" },
};

function useIsMobile() {
  const [mobile, setMobile] = React.useState(() => window.innerWidth < 640);
  React.useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

export default function MediaLibraryModal({ onClose, onAssign, onToast, pickMode, pickTarget, activeAssignments }: Props) {
  const isMobile = useIsMobile();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  // ── Filter & View Mode ───────────────────────────────────────────────────
  const [filter, setFilter] = useState<"all" | MediaCategory>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  // localCategories stores overrides set this session (not persisted to Firestore today)
  const [localCategories, setLocalCategories] = useState<Record<string, MediaCategory>>(() => {
    try { return JSON.parse(localStorage.getItem("ml_local_categories") ?? "{}") ?? {}; } catch { return {}; }
  });

  const getItemCategory = (item: MediaItem): MediaCategory =>
    localCategories[item.id] ?? item.category ?? getCategoryFromFileName(item.name);

  const filteredItems = filter === "all"
    ? items
    : items.filter(item => getItemCategory(item) === filter);

  const setItemCategory = (item: MediaItem, cat: MediaCategory) => {
    const updated = { ...localCategories, [item.id]: cat };
    setLocalCategories(updated);
    try { localStorage.setItem("ml_local_categories", JSON.stringify(updated)); } catch {}
  };

  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [videoThumbs, setVideoThumbs] = useState<Record<string, string>>({}); // id → dataURL thumbnail
  const [dragOver, setDragOver] = useState(false);
  const [assignedTarget, setAssignedTarget] = useState<MediaTarget | null>(null);
  const [confirming, setConfirming]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = (msg: string, type = "success") => onToast?.(msg, type);

  const exitSelectMode = () => { setSelectMode(false); setMultiSelected(new Set()); setBulkConfirm(false); };
  const toggleItemSelect = (id: string) => setMultiSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setMultiSelected(new Set(filteredItems.map(i => i.id)));

  const handleBulkDelete = async () => {
    if (!bulkConfirm) { setBulkConfirm(true); return; }
    setBulkConfirm(false);
    setBulkDeleting(true);
    const ids = [...multiSelected];
    const toDelete = items.filter(i => ids.includes(i.id));
    let failed = 0;
    for (const item of toDelete) {
      try {
        try { await deleteObject(storageRef(storage, item.storagePath)); }
        catch (e: any) { if (e?.code !== "storage/object-not-found") console.warn("[MediaLib] Storage:", e); }
        await deleteDoc(doc(db, "media_library", item.id));
        await idbDelete(`media_blob_${item.id}`);
        if (blobUrls[item.id]) URL.revokeObjectURL(blobUrls[item.id]);
        idbDelete(`media_thumb_${item.id}`).catch(() => {});
        setBlobUrls(p => { const n={...p}; delete n[item.id]; return n; });
        setVideoThumbs(p => { const n={...p}; delete n[item.id]; return n; });
        setCachedIds(p => { const n=new Set(p); n.delete(item.id); return n; });
        if (selected?.id === item.id) setSelected(null);
      } catch { failed++; }
    }
    setBulkDeleting(false);
    exitSelectMode();
    if (failed) toast(`${failed} item(s) failed to delete`, "error");
    else toast(`🗑️ ${toDelete.length} item${toDelete.length !== 1 ? "s" : ""} deleted`);
  };

  const generateVideoThumb = useCallback(async (id: string, videoSrc: string): Promise<void> => {
    // Check IDB cache first — avoid re-generating on every open
    // Only use cached value if it's a real thumbnail (> 2000 chars means non-blank)
    const cached = await idbGet<string>(`media_thumb_${id}`);
    if (cached && cached.length > 2000) { setVideoThumbs(p => ({ ...p, [id]: cached })); return; }
    return new Promise(resolve => {
      const vid = document.createElement("video");
      vid.muted = true;
      vid.playsInline = true;
      // preload="auto" buffers enough data for reliable seeking
      // ("metadata" only downloads the header, often insufficient for frame capture)
      vid.preload = "auto";
      // CRITICAL: must be set BEFORE src to avoid canvas tainting SecurityError
      // on cross-origin Firebase Storage URLs
      vid.crossOrigin = "anonymous";

      // Abort after 20s — prevents hanging forever on bad/slow URLs
      const giveUpTimer = setTimeout(() => { vid.src = ""; resolve(); }, 20000);
      const cleanup = () => { clearTimeout(giveUpTimer); vid.src = ""; resolve(); };

      // Expanded seek positions — more attempts = better chance of a non-black frame
      const seekAttempts = [1.0, 2.0, 3.0, 0.5, 0.25, 0.1];
      let attemptIdx = 0;
      let seekTriggered = false;

      const doSeek = () => {
        if (seekTriggered) return;
        seekTriggered = true;
        const target = Math.min(seekAttempts[0], Math.max(0.1, (vid.duration || 10) * 0.1));
        vid.currentTime = target;
      };

      const tryCapture = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 320; canvas.height = 180;
          const ctx = canvas.getContext("2d");
          if (!ctx) { cleanup(); return; }
          ctx.drawImage(vid, 0, 0, 320, 180);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
          // Only store if canvas has real content (not a plain black frame)
          // Threshold lowered to 2000 — some compressed webm frames are small but valid
          if (dataUrl.length > 2000) {
            setVideoThumbs(p => ({ ...p, [id]: dataUrl }));
            idbSet(`media_thumb_${id}`, dataUrl).catch(() => {});
            cleanup();
          } else {
            // Frame looks blank — try next seek position
            attemptIdx++;
            if (attemptIdx < seekAttempts.length) {
              vid.currentTime = Math.min(seekAttempts[attemptIdx], Math.max(0.1, vid.duration * 0.5));
            } else {
              cleanup(); // gave up — leave placeholder (video element fallback will show real frame)
            }
          }
        } catch (err) {
          // SecurityError from canvas tainting (CORS) — expected for Firebase URLs without CORS headers
          console.warn(`[MediaLib] Thumbnail canvas error for ${id}:`, err);
          cleanup();
        }
      };

      // Two triggers for seek — whichever fires first:
      // onloadedmetadata: duration is known, safe to seek
      // oncanplay: enough data is buffered for seeking (more reliable for some codecs)
      vid.onloadedmetadata = doSeek;
      vid.oncanplay = doSeek;
      vid.onseeked = tryCapture;
      vid.onerror = (e) => { console.warn(`[MediaLib] Video load error for thumb ${id}:`, e); cleanup(); };
      // Set src AFTER crossOrigin is configured
      vid.src = videoSrc;
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "media_library"), orderBy("uploadedAt", "desc"));
    return onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MediaItem))), () => {});
  }, []);

  useEffect(() => {
    if (!items.length) return;
    Promise.all(items.map(async item => {
      const blob = await idbGet<Blob>(`media_blob_${item.id}`);
      return blob ? item.id : null;
    })).then(results => setCachedIds(new Set(results.filter(Boolean) as string[])));
  }, [items]);

  useEffect(() => {
    items.forEach(async item => {
      if (blobUrls[item.id]) return;
      const blob = await idbGet<Blob>(`media_blob_${item.id}`);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setBlobUrls(prev => ({ ...prev, [item.id]: url }));
        if (item.type === "video") {
          // Check IDB for a previously-cached thumbnail before re-seeking
          // (generateVideoThumb also checks, but this avoids the async overhead of creating a video element)
          const cachedThumb = await idbGet<string>(`media_thumb_${item.id}`);
          if (cachedThumb && cachedThumb.length > 2000) {
            setVideoThumbs(p => ({ ...p, [item.id]: cachedThumb }));
          } else {
            // Generate from the local blob URL — no CORS restrictions, preload="auto" for reliable seek
            generateVideoThumb(item.id, url);
          }
        }
      } else if (item.type === "video") {
        // No IDB blob — try loading a previously-cached canvas thumbnail from IDB
        const cached = await idbGet<string>(`media_thumb_${item.id}`);
        if (cached && cached.length > 2000) {
          setVideoThumbs(p => ({ ...p, [item.id]: cached }));
        }
        // NOTE: We do NOT call generateVideoThumb(item.id, item.firebaseUrl) here.
        // Firebase Storage URLs are cross-origin and canvas reads fail with SecurityError.
        // The <video> element fallback in the grid/list views shows a real frame without CORS.
      }
    });
    return () => { Object.values(blobUrls).forEach(URL.revokeObjectURL); };
  }, [items]); // eslint-disable-line

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!arr.length) { toast("Only image and video files are allowed", "error"); return; }
    for (const file of arr) {
      setUploading(true); setUploadProgress(0);
      try {
        const path = `media_library/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const sRef = storageRef(storage, path);
        const task = uploadBytesResumable(sRef, file);
        await new Promise<void>((res, rej) => task.on("state_changed", snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)), rej, () => res()));
        const firebaseUrl = await getDownloadURL(sRef);
        // Auto-detect category from filename and include it in Firestore doc
        const autoCategory = getCategoryFromFileName(file.name);
        const docRef = await addDoc(collection(db, "media_library"), {
          name: file.name, type: file.type.startsWith("video/") ? "video" : "image",
          firebaseUrl, storagePath: path, uploadedAt: Date.now(), sizeBytes: file.size, mimeType: file.type,
          category: autoCategory,
        });
        await idbSet(`media_blob_${docRef.id}`, file);
        const blobUrl = URL.createObjectURL(file);
        setBlobUrls(prev => ({ ...prev, [docRef.id]: blobUrl }));
        // Generate thumbnail immediately after upload for videos
        if (file.type.startsWith("video/")) generateVideoThumb(docRef.id, blobUrl);
        setCachedIds(prev => new Set([...prev, docRef.id]));
        toast(`✅ "${file.name}" uploaded & cached`);
      } catch { toast(`Upload failed: ${file.name}`, "error"); }
    }
    setUploading(false); setUploadProgress(0);
  }, []); // eslint-disable-line

  const handleDelete = async (item: MediaItem) => {
    // First click: enter confirmation mode
    if (deleteConfirm !== item.id) { setDeleteConfirm(item.id); return; }
    // Second click (confirmed): proceed with deletion
    setDeleteConfirm(null);
    setDeleting(item.id);
    try {
      // Delete from Firebase Storage — ignore "not found" (object may already be gone)
      try { await deleteObject(storageRef(storage, item.storagePath)); }
      catch (storageErr: any) {
        if (storageErr?.code !== "storage/object-not-found") {
          console.warn("[MediaLib] Storage delete error:", storageErr);
        }
      }
      // Delete Firestore document
      await deleteDoc(doc(db, "media_library", item.id));
      // Clean up local caches
      await idbDelete(`media_blob_${item.id}`);
      if (blobUrls[item.id]) URL.revokeObjectURL(blobUrls[item.id]);
      setBlobUrls(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      setVideoThumbs(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      idbDelete(`media_thumb_${item.id}`).catch(() => {});
      setCachedIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
      if (selected?.id === item.id) setSelected(null);
      toast(`🗑️ "${item.name}" deleted`);
    } catch (err) {
      console.error("[MediaLib] Delete failed:", err);
      toast(`Delete failed — check console for details`, "error");
    }
    setDeleting(null);
  };

  const handleAssign = (target: MediaTarget) => {
    if (!selected || confirming) return;
    onAssign(selected, target, blobUrls[selected.id] ?? null);
    setAssignedTarget(target);
    setConfirming(true);
    setTimeout(() => {
      setConfirming(false);
      setAssignedTarget(null);
      onClose();
    }, 1200);
  };

  const previewUrl = selected ? (blobUrls[selected.id] ?? selected.firebaseUrl) : null;
  const isCached = selected ? cachedIds.has(selected.id) : false;
  // Find which scene (if any) owns this media
  const ALL_TARGETS: MediaTarget[] = ["praise-bg", "worship-bg", "fade-screen"];
  const ownerTarget: MediaTarget | null = selected
    ? ALL_TARGETS.find(t => !!activeAssignments?.[t] && activeAssignments[t] === selected.firebaseUrl) ?? null
    : null;
  const isActiveFor = (target: MediaTarget) => ownerTarget === target;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(16px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: isMobile ? 0 : 20, fontFamily: "'Inter','Segoe UI',sans-serif",
      }}
    >
      <div style={{
        width: "100%", maxWidth: isMobile ? "100%" : 880,
        height: isMobile ? "100dvh" : "min(640px, 90vh)",
        background: "linear-gradient(145deg, rgba(15,12,28,0.98) 0%, rgba(10,10,20,0.98) 100%)",
        border: isMobile ? "none" : "1px solid rgba(167,139,250,0.18)",
        borderRadius: isMobile ? 0 : 20, display: "flex", flexDirection: "column",
        overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset",
      }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: isMobile ? "12px 14px" : "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.02)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FolderOpen size={15} color="#c4b5fd" />
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
                {pickMode
                  ? `Pick for ${TARGET_LABELS[pickTarget!]?.label ?? "Scene"}`
                  : "Media Library"}
              </div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 1 }}>
                {selectMode ? `${multiSelected.size} of ${items.length} selected` : `${items.length} item${items.length !== 1 ? "s" : ""}`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!pickMode && items.length > 0 && (
              <button
                onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                  border: selectMode ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.12)",
                  background: selectMode ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.05)",
                  color: selectMode ? "#f87171" : "rgba(255,255,255,0.55)" }}
              >
                {selectMode ? <><X size={11}/> Cancel</> : <><CheckSquare size={11}/> Select</>}
              </button>
            )}
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
          >
            <X size={15} />
          </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>

          {/* Left: upload + grid */}
          <div style={{ flex: isMobile && selected ? "0 0 45%" : 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,0.06)", borderBottom: isMobile && selected ? "1px solid rgba(255,255,255,0.07)" : "none" }}>

            {/* Upload zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
              onClick={() => !uploading && fileInputRef.current?.click()}
              style={{
                margin: "14px 14px 10px", borderRadius: 12, padding: "14px 16px",
                border: `1.5px dashed ${dragOver ? "rgba(167,139,250,0.7)" : uploading ? "rgba(167,139,250,0.35)" : "rgba(255,255,255,0.10)"}`,
                background: dragOver ? "rgba(167,139,250,0.07)" : "rgba(255,255,255,0.02)",
                cursor: uploading ? "default" : "pointer", transition: "all 0.2s", flexShrink: 0,
                display: "flex", alignItems: "center", gap: 12,
              }}
            >
              <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={e => e.target.files && handleFiles(e.target.files)} />
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {uploading
                  ? <Loader size={16} color="#a78bfa" style={{ animation: "spin 1s linear infinite" }} />
                  : <Upload size={16} color="#a78bfa" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {uploading ? (
                  <>
                    <div style={{ color: "#c4b5fd", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Uploading… {uploadProgress}%</div>
                    <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${uploadProgress}%`, background: "linear-gradient(90deg,#7c3aed,#a78bfa)", borderRadius: 4, transition: "width 0.3s" }} />
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>Click or drag & drop</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 2 }}>Images & videos — stored in Firebase + cached offline</div>
                  </>
                )}
              </div>
            </div>

            {/* Filter bar + view mode toggle */}
            {!selectMode && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", marginBottom: 10 }}>
                {/* Filter pills */}
                <div style={{ display: "flex", gap: 4, flex: 1, flexWrap: "wrap" }}>
                  {(["all", "praise", "worship", "fade"] as const).map(f => {
                    const active = filter === f;
                    const meta = f === "all" ? null : CATEGORY_META[f];
                    return (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                          padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                          cursor: "pointer", transition: "all 0.15s",
                          border: active
                            ? `1px solid ${meta?.border ?? "rgba(255,255,255,0.35)"}`
                            : "1px solid rgba(255,255,255,0.08)",
                          background: active
                            ? meta?.bg ?? "rgba(255,255,255,0.1)"
                            : "rgba(255,255,255,0.03)",
                          color: active
                            ? meta?.color ?? "rgba(255,255,255,0.9)"
                            : "rgba(255,255,255,0.4)",
                        }}
                      >
                        {f === "all" ? "All" : CATEGORY_META[f].label}
                        {f !== "all" && (
                          <span style={{
                            marginLeft: 5, fontSize: 9,
                            background: active ? (meta?.border ?? "rgba(255,255,255,0.15)") : "rgba(255,255,255,0.07)",
                            borderRadius: 10, padding: "1px 5px",
                          }}>
                            {items.filter(i => getItemCategory(i) === f).length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* View mode toggle */}
                <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 2 }}>
                  {(["grid", "list"] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      title={mode === "grid" ? "Grid view" : "List view"}
                      style={{
                        width: 26, height: 26, borderRadius: 6, border: "none",
                        background: viewMode === mode ? "rgba(167,139,250,0.2)" : "transparent",
                        color: viewMode === mode ? "#c4b5fd" : "rgba(255,255,255,0.3)",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s",
                      }}
                    >
                      {mode === "grid" ? <LayoutGrid size={13} /> : <List size={13} />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Grid / List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px" }}>
              {items.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "rgba(255,255,255,0.2)" }}>
                  <Film size={32} strokeWidth={1.5} />
                  <span style={{ fontSize: 13 }}>No media yet — upload something above</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "rgba(255,255,255,0.2)" }}>
                  <Film size={28} strokeWidth={1.5} />
                  <span style={{ fontSize: 12, textAlign: "center" }}>No media tagged as<br /><strong style={{ color: filter !== "all" ? CATEGORY_META[filter].color : "#fff" }}>{filter !== "all" ? CATEGORY_META[filter].label : ""}</strong></span>
                </div>
              ) : (
                <>
                {/* Select-mode toolbar */}
                {selectMode && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <button onClick={multiSelected.size === filteredItems.length ? () => setMultiSelected(new Set()) : selectAll}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                        border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}>
                      {multiSelected.size === filteredItems.length ? <><Square size={10}/> Deselect All</> : <><CheckSquare size={10}/> Select All</>}
                    </button>
                    {bulkConfirm ? (
                      <>
                        <span style={{ fontSize: 10, color: "#f87171", fontWeight: 700 }}>Sure? This can't be undone!</span>
                        <button onClick={() => setBulkConfirm(false)} style={{ padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>Cancel</button>
                        <button onClick={handleBulkDelete} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.2)", color: "#f87171" }}>Yes, Delete {multiSelected.size}</button>
                      </>
                    ) : multiSelected.size > 0 && (
                      <button onClick={handleBulkDelete} disabled={bulkDeleting}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", marginLeft: "auto",
                          border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.14)", color: "#f87171" }}>
                        {bulkDeleting ? <><Loader size={10} style={{ animation: "spin 1s linear infinite"}}/> Deleting…</> : <><Trash2 size={10}/> Delete {multiSelected.size} item{multiSelected.size !== 1 ? "s" : ""}</>}
                      </button>
                  )}
                </div>
                )}
                {viewMode === "grid" ? (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(auto-fill,minmax(90px,1fr))" : "repeat(auto-fill,minmax(130px,1fr))", gap: isMobile ? 6 : 8 }}>
                    {filteredItems.map(item => {
                      const thumbUrl = blobUrls[item.id] ?? item.firebaseUrl;
                      const isSelected = selected?.id === item.id;
                      const isMultiChecked = multiSelected.has(item.id);
                      const cached = cachedIds.has(item.id);
                      const cat = getItemCategory(item);
                      const catMeta = cat !== "none" ? CATEGORY_META[cat] : null;
                      const borderCol = selectMode
                        ? isMultiChecked ? "2px solid #ef4444" : "2px solid rgba(255,255,255,0.06)"
                        : isSelected ? "2px solid #a78bfa" : "2px solid rgba(255,255,255,0.06)";
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (selectMode) { toggleItemSelect(item.id); return; }
                            setSelected(isSelected ? null : item); setDeleteConfirm(null);
                          }}
                          style={{
                            position: "relative", borderRadius: 10, overflow: "hidden",
                            aspectRatio: "16/9", cursor: "pointer",
                            border: borderCol, background: "#0a0a0f", transition: "all 0.15s",
                            boxShadow: (selectMode ? isMultiChecked : isSelected) ? "0 0 0 3px rgba(239,68,68,0.2), 0 8px 24px rgba(0,0,0,0.5)" : "0 4px 12px rgba(0,0,0,0.4)",
                            transform: (selectMode ? isMultiChecked : isSelected) ? "scale(1.02)" : "scale(1)",
                          }}
                        >
                          {item.type === "image"
                            ? <img src={thumbUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                            : videoThumbs[item.id]
                              ? <img src={videoThumbs[item.id]} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : (
                                // Live video element fallback — shows a real frame cross-origin without CORS.
                                // Browsers can DISPLAY cross-origin video freely; only canvas reads require CORS.
                                <video
                                  src={blobUrls[item.id] ?? item.firebaseUrl}
                                  muted playsInline preload="metadata"
                                  style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none", display: "block" }}
                                  onLoadedData={e => { (e.target as HTMLVideoElement).currentTime = 1; }}
                                />
                              )
                          }
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)" }} />
                          <div style={{ position: "absolute", top: 5, left: 5, background: "rgba(0,0,0,0.7)", borderRadius: 5, padding: "2px 6px", display: "flex", alignItems: "center", gap: 3, backdropFilter: "blur(4px)" }}>
                            {item.type === "video" ? <Film size={9} color="#a78bfa" /> : <ImageIcon size={9} color="#34d399" />}
                            <span style={{ fontSize: 9, fontWeight: 700, color: item.type === "video" ? "#a78bfa" : "#34d399" }}>{item.type === "video" ? "VID" : "IMG"}</span>
                          </div>
                          {/* Category dot in grid */}
                          {catMeta && (
                            <div style={{ position: "absolute", top: 5, left: 5, marginLeft: 38 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMeta.color, boxShadow: `0 0 5px ${catMeta.color}` }} />
                            </div>
                          )}
                          <div style={{ position: "absolute", top: 5, right: 5 }}>
                            {selectMode
                              ? <div style={{ width: 18, height: 18, borderRadius: 5, border: isMultiChecked ? "2px solid #ef4444" : "2px solid rgba(255,255,255,0.35)", background: isMultiChecked ? "rgba(239,68,68,0.85)" : "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  {isMultiChecked && <Check size={11} color="#fff" strokeWidth={3} />}
                                </div>
                              : cached
                                ? <div style={{ background: "rgba(52,211,153,0.2)", borderRadius: 4, padding: "2px 4px", display: "flex" }}><Wifi size={9} color="#34d399" /></div>
                                : <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: 4, padding: "2px 4px", display: "flex" }}><WifiOff size={9} color="rgba(255,255,255,0.3)" /></div>}
                          </div>
                          <div style={{ position: "absolute", bottom: 5, left: 6, right: 6, fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.name}
                          </div>
                          {!selectMode && isSelected && (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <div style={{ background: "#a78bfa", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(167,139,250,0.6)" }}>
                                <Check size={15} color="#fff" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── List View ── */
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {filteredItems.map(item => {
                      const thumbUrl = blobUrls[item.id] ?? item.firebaseUrl;
                      const isSelected = selected?.id === item.id;
                      const isMultiChecked = multiSelected.has(item.id);
                      const cached = cachedIds.has(item.id);
                      const cat = getItemCategory(item);
                      const catMeta = CATEGORY_META[cat];
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (selectMode) { toggleItemSelect(item.id); return; }
                            setSelected(isSelected ? null : item); setDeleteConfirm(null);
                          }}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "7px 8px", borderRadius: 9, cursor: "pointer",
                            background: isSelected ? "rgba(167,139,250,0.1)" : (selectMode && isMultiChecked) ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.02)",
                            border: isSelected
                              ? "1px solid rgba(167,139,250,0.35)"
                              : (selectMode && isMultiChecked)
                                ? "1px solid rgba(239,68,68,0.35)"
                                : "1px solid rgba(255,255,255,0.05)",
                            transition: "all 0.13s",
                          }}
                        >
                          {/* Multi-select checkbox */}
                          {selectMode && (
                            <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: isMultiChecked ? "2px solid #ef4444" : "2px solid rgba(255,255,255,0.25)", background: isMultiChecked ? "rgba(239,68,68,0.85)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {isMultiChecked && <Check size={11} color="#fff" strokeWidth={3} />}
                            </div>
                          )}
                          {/* Thumbnail */}
                          <div style={{ width: 60, height: 34, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "#0a0a0f" }}>
                            {item.type === "image"
                              ? <img src={thumbUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                              : videoThumbs[item.id]
                                ? <img src={videoThumbs[item.id]} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : (
                                  // Live video element fallback — shows a real frame cross-origin without CORS
                                  <video
                                    src={blobUrls[item.id] ?? item.firebaseUrl}
                                    muted playsInline preload="metadata"
                                    style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none", display: "block" }}
                                    onLoadedData={e => { (e.target as HTMLVideoElement).currentTime = 1; }}
                                  />
                                )
                            }
                          </div>
                          {/* Details */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: isSelected ? "#e9d5ff" : "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                              {/* Type badge */}
                              <span style={{ fontSize: 9, fontWeight: 700, color: item.type === "video" ? "#a78bfa" : "#34d399", background: item.type === "video" ? "rgba(167,139,250,0.12)" : "rgba(52,211,153,0.12)", border: `1px solid ${item.type === "video" ? "rgba(167,139,250,0.25)" : "rgba(52,211,153,0.25)"}`, borderRadius: 4, padding: "1px 5px", display: "flex", alignItems: "center", gap: 2 }}>
                                {item.type === "video" ? <Film size={8} /> : <ImageIcon size={8} />} {item.type === "video" ? "VID" : "IMG"}
                              </span>
                              {/* Category badge */}
                              <span style={{ fontSize: 9, fontWeight: 700, color: catMeta.color, background: catMeta.bg, border: `1px solid ${catMeta.border}`, borderRadius: 4, padding: "1px 5px" }}>
                                {catMeta.label}
                              </span>
                              {/* Size */}
                              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{fmt(item.sizeBytes)}</span>
                            </div>
                          </div>
                          {/* Network status */}
                          <div style={{ flexShrink: 0 }}>
                            {cached
                              ? <div style={{ background: "rgba(52,211,153,0.1)", borderRadius: 4, padding: "3px 5px", display: "flex" }}><Wifi size={10} color="#34d399" /></div>
                              : <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 4, padding: "3px 5px", display: "flex" }}><WifiOff size={10} color="rgba(255,255,255,0.25)" /></div>
                            }
                          </div>
                          {/* Selected indicator */}
                          {!selectMode && isSelected && (
                            <div style={{ flexShrink: 0, width: 22, height: 22, background: "#a78bfa", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 10px rgba(167,139,250,0.5)" }}>
                              <Check size={12} color="#fff" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                </>
              )}
            </div>
          </div>

          {/* Right: Detail panel — hidden in select mode */}
          <div style={{
            width: isMobile ? "100%" : (selectMode ? 0 : 260),
            flex: isMobile ? (selected ? "1 1 55%" : "0 0 0px") : undefined,
            flexShrink: 0,
            display: (selectMode || (isMobile && !selected)) ? "none" : "flex",
            flexDirection: "column", overflow: "hidden",
            background: "rgba(0,0,0,0.2)",
            transition: "flex 0.2s",
          }}>
            {!selected ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "rgba(255,255,255,0.18)", padding: 24, textAlign: "center" }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FolderOpen size={22} strokeWidth={1.5} />
                </div>
                <span style={{ fontSize: 12, lineHeight: 1.5 }}>Select a file to<br />preview and assign</span>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                {/* Mobile back strip */}
                {isMobile && (
                  <button onClick={() => setSelected(null)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "rgba(255,255,255,0.04)", border: "none", borderBottom: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                    ← Back to library
                  </button>
                )}
                {/* Preview */}
                <div style={{ background: "#000", aspectRatio: "16/9", flexShrink: 0, overflow: "hidden", position: "relative" }}>
                  {selected.type === "image"
                    ? <img src={previewUrl!} alt={selected.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    : <video src={previewUrl!} controls muted style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  }
                </div>

                {/* Info */}
                <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 12, wordBreak: "break-word", marginBottom: 8, lineHeight: 1.4 }}>
                    {selected.name}
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: selected.type === "video" ? "#a78bfa" : "#34d399", background: selected.type === "video" ? "rgba(167,139,250,0.12)" : "rgba(52,211,153,0.12)", border: `1px solid ${selected.type === "video" ? "rgba(167,139,250,0.25)" : "rgba(52,211,153,0.25)"}`, borderRadius: 5, padding: "2px 7px", display: "flex", alignItems: "center", gap: 3 }}>
                      {selected.type === "video" ? <Film size={9} /> : <ImageIcon size={9} />} {selected.type}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "2px 7px" }}>
                      {fmt(selected.sizeBytes)}
                    </span>
                    <span style={{ fontSize: 10, borderRadius: 5, padding: "2px 7px", display: "flex", alignItems: "center", gap: 3, background: isCached ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${isCached ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.08)"}`, color: isCached ? "#34d399" : "rgba(255,255,255,0.35)", fontWeight: 700 }}>
                      {isCached ? <><Wifi size={9} /> Offline ready</> : <><WifiOff size={9} /> Online only</>}
                    </span>
                  </div>
                </div>

                {/* Category classifier */}
                <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7, display: "flex", alignItems: "center", gap: 5 }}>
                    <Tag size={9} /> Category
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(["praise", "worship", "fade", "none"] as MediaCategory[]).map(cat => {
                      const meta = CATEGORY_META[cat];
                      const current = getItemCategory(selected);
                      const isActive = current === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setItemCategory(selected, cat)}
                          style={{
                            padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                            cursor: "pointer", transition: "all 0.15s",
                            border: isActive ? `1px solid ${meta.border}` : "1px solid rgba(255,255,255,0.08)",
                            background: isActive ? meta.bg : "rgba(255,255,255,0.03)",
                            color: isActive ? meta.color : "rgba(255,255,255,0.35)",
                            boxShadow: isActive ? `0 0 8px ${meta.bg}` : "none",
                          }}
                        >
                          {isActive && <Check size={9} style={{ marginRight: 3, display: "inline" }} />}
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Assign buttons */}
                <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>
                    {pickMode ? "Apply to" : "Assign to scene"}
                  </div>

                  {pickMode && pickTarget ? (
                    <AssignButton color={TARGET_LABELS[pickTarget].color} confirmed={assignedTarget === pickTarget} active={isActiveFor(pickTarget)} onClick={() => handleAssign(pickTarget)}>
                      <Check size={14} /> Use This
                    </AssignButton>
                  ) : (
                    <>
                      <AssignButton color="#f59e0b" confirmed={assignedTarget === "praise-bg"} active={isActiveFor("praise-bg")} onClick={() => handleAssign("praise-bg")}>
                        <Zap size={13} /> Praise Background
                      </AssignButton>
                      <AssignButton color="#818cf8" confirmed={assignedTarget === "worship-bg"} active={isActiveFor("worship-bg")} onClick={() => handleAssign("worship-bg")}>
                        <Video size={13} /> Worship Background
                      </AssignButton>
                      <AssignButton color="#34d399" confirmed={assignedTarget === "fade-screen"} active={isActiveFor("fade-screen")} onClick={() => handleAssign("fade-screen")}>
                        <ImageIcon size={13} /> Fade Screen
                      </AssignButton>
                    </>
                  )}

                  <div style={{ flex: 1 }} />
                  {deleting === selected?.id
                    ? (
                      <button disabled style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)", color: "#f87171", fontSize: 11, fontWeight: 600, cursor: "not-allowed", width: "100%", opacity: 0.7 }}>
                        <Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> Deleting…
                      </button>
                    ) : deleteConfirm === selected?.id
                    ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ fontSize: 10, color: "rgba(239,68,68,0.85)", textAlign: "center", fontWeight: 600 }}>This cannot be undone!</div>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            style={{ flex: 1, padding: "7px 8px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                          >Cancel</button>
                          <button
                            onClick={() => handleDelete(selected!)}
                            style={{ flex: 1, padding: "7px 8px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.18)", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >Yes, Delete</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDelete(selected!)}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)", color: "#f87171", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", width: "100%" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.14)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.06)"}
                      >
                        <Trash2 size={13} /> Delete from Library
                      </button>
                    )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function AssignButton({ color, onClick, confirmed, active, children }: {
  color: string; onClick: () => void;
  confirmed?: boolean; active?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = React.useState(false);
  // confirmed = just-clicked flash (1.2s); active = permanently assigned to this scene
  const isOn = confirmed || active;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={active || confirmed}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 12px", borderRadius: 9, width: "100%",
        border: isOn
          ? `1px solid ${confirmed ? "#22c55e99" : color + "99"}`
          : `1px solid ${hovered ? color + "66" : "rgba(255,255,255,0.08)"}`,
        background: isOn
          ? confirmed
            ? "linear-gradient(135deg, rgba(34,197,94,0.22) 0%, rgba(16,185,129,0.15) 100%)"
            : `linear-gradient(135deg, ${color}28 0%, ${color}14 100%)`
          : hovered ? `${color}18` : "rgba(255,255,255,0.03)",
        color: isOn ? (confirmed ? "#4ade80" : color) : hovered ? color : "rgba(255,255,255,0.6)",
        fontSize: 12, fontWeight: isOn ? 700 : 600,
        cursor: (active || confirmed) ? (active ? "not-allowed" : "default") : "pointer",
        transition: "all 0.2s",
        boxShadow: isOn
          ? confirmed
            ? "0 0 16px rgba(34,197,94,0.3), 0 0 0 1px rgba(34,197,94,0.15) inset"
            : `0 0 12px ${color}33`
          : hovered ? `0 0 12px ${color}22` : "none",
      }}
    >
      {confirmed
        ? <><Check size={13} strokeWidth={3} /><span style={{ marginLeft: 2 }}>Assigned!</span></>
        : active
          ? <><Check size={11} strokeWidth={2.5} /><span style={{ marginLeft: 2 }}>{children}</span><span style={{ marginLeft: "auto", fontSize: 9, opacity: 0.7, fontWeight: 600 }}>ACTIVE</span></>
          : children}
    </button>
  );
}
