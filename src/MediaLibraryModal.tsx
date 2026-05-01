import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Upload, Trash2, Image as ImageIcon, Video, Check, Wifi, WifiOff, FolderOpen, Film, Loader, Zap } from "lucide-react";
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

export interface MediaItem {
  id: string; name: string; type: "image" | "video";
  firebaseUrl: string; storagePath: string;
  uploadedAt: number; sizeBytes: number; mimeType: string;
}
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

export default function MediaLibraryModal({ onClose, onAssign, onToast, pickMode, pickTarget, activeAssignments }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [assignedTarget, setAssignedTarget] = useState<MediaTarget | null>(null);
  const [confirming, setConfirming]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = (msg: string, type = "success") => onToast?.(msg, type);

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
      if (blob) setBlobUrls(prev => ({ ...prev, [item.id]: URL.createObjectURL(blob) }));
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
        const docRef = await addDoc(collection(db, "media_library"), {
          name: file.name, type: file.type.startsWith("video/") ? "video" : "image",
          firebaseUrl, storagePath: path, uploadedAt: Date.now(), sizeBytes: file.size, mimeType: file.type,
        });
        await idbSet(`media_blob_${docRef.id}`, file);
        const blobUrl = URL.createObjectURL(file);
        setBlobUrls(prev => ({ ...prev, [docRef.id]: blobUrl }));
        setCachedIds(prev => new Set([...prev, docRef.id]));
        toast(`✅ "${file.name}" uploaded & cached`);
      } catch { toast(`Upload failed: ${file.name}`, "error"); }
    }
    setUploading(false); setUploadProgress(0);
  }, []); // eslint-disable-line

  const handleDelete = async (item: MediaItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    setDeleting(item.id);
    try {
      try { await deleteObject(storageRef(storage, item.storagePath)); } catch {}
      await deleteDoc(doc(db, "media_library", item.id));
      await idbDelete(`media_blob_${item.id}`);
      if (blobUrls[item.id]) URL.revokeObjectURL(blobUrls[item.id]);
      setBlobUrls(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      setCachedIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
      if (selected?.id === item.id) setSelected(null);
      toast(`🗑️ "${item.name}" deleted`);
    } catch { toast("Delete failed", "error"); }
    setDeleting(null);
  };

  const handleAssign = (target: MediaTarget) => {
    if (!selected || confirming) return;
    onAssign(selected, target, blobUrls[selected.id] ?? null);
    // Show confirmed state on button for 1.2s, then close
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
  // Find the ONE scene this item belongs to — mutually exclusive.
  // If the same URL somehow ends up in multiple scenes, first match wins.
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
        padding: 20, fontFamily: "'Inter','Segoe UI',sans-serif",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 880, height: "min(640px, 90vh)",
        background: "linear-gradient(145deg, rgba(15,12,28,0.98) 0%, rgba(10,10,20,0.98) 100%)",
        border: "1px solid rgba(167,139,250,0.18)",
        borderRadius: 20, display: "flex", flexDirection: "column",
        overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset",
      }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)",
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
                {items.length} item{items.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
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

        {/* ── Body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Left: upload + grid */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid rgba(255,255,255,0.06)" }}>

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

            {/* Grid */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px" }}>
              {items.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "rgba(255,255,255,0.2)" }}>
                  <Film size={32} strokeWidth={1.5} />
                  <span style={{ fontSize: 13 }}>No media yet — upload something above</span>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 8 }}>
                  {items.map(item => {
                    const thumbUrl = blobUrls[item.id] ?? item.firebaseUrl;
                    const isSelected = selected?.id === item.id;
                    const cached = cachedIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelected(isSelected ? null : item)}
                        style={{
                          position: "relative", borderRadius: 10, overflow: "hidden",
                          aspectRatio: "16/9", cursor: "pointer",
                          border: isSelected ? "2px solid #a78bfa" : "2px solid rgba(255,255,255,0.06)",
                          background: "#0a0a0f", transition: "all 0.15s",
                          boxShadow: isSelected ? "0 0 0 3px rgba(167,139,250,0.25), 0 8px 24px rgba(0,0,0,0.5)" : "0 4px 12px rgba(0,0,0,0.4)",
                          transform: isSelected ? "scale(1.02)" : "scale(1)",
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.2)"; }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)"; }}
                      >
                        {item.type === "image"
                          ? <img src={thumbUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                          : <video src={thumbUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted preload="metadata" />
                        }
                        {/* Gradient overlay */}
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)" }} />
                        {/* Type badge */}
                        <div style={{ position: "absolute", top: 5, left: 5, background: "rgba(0,0,0,0.7)", borderRadius: 5, padding: "2px 6px", display: "flex", alignItems: "center", gap: 3, backdropFilter: "blur(4px)" }}>
                          {item.type === "video" ? <Film size={9} color="#a78bfa" /> : <ImageIcon size={9} color="#34d399" />}
                          <span style={{ fontSize: 9, fontWeight: 700, color: item.type === "video" ? "#a78bfa" : "#34d399" }}>{item.type === "video" ? "VID" : "IMG"}</span>
                        </div>
                        {/* Cache badge */}
                        <div style={{ position: "absolute", top: 5, right: 5 }}>
                          {cached
                            ? <div style={{ background: "rgba(52,211,153,0.2)", borderRadius: 4, padding: "2px 4px", display: "flex" }}><Wifi size={9} color="#34d399" /></div>
                            : <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: 4, padding: "2px 4px", display: "flex" }}><WifiOff size={9} color="rgba(255,255,255,0.3)" /></div>}
                        </div>
                        {/* File name */}
                        <div style={{ position: "absolute", bottom: 5, left: 6, right: 6, fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.name}
                        </div>
                        {/* Selected overlay */}
                        {isSelected && (
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
              )}
            </div>
          </div>

          {/* Right: Detail panel */}
          <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "rgba(0,0,0,0.2)" }}>
            {!selected ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "rgba(255,255,255,0.18)", padding: 24, textAlign: "center" }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FolderOpen size={22} strokeWidth={1.5} />
                </div>
                <span style={{ fontSize: 12, lineHeight: 1.5 }}>Select a file to<br />preview and assign</span>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
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
                  <button
                    onClick={() => handleDelete(selected!)}
                    disabled={deleting === selected?.id}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)", color: "#f87171", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", width: "100%" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.14)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.06)"}
                  >
                    {deleting === selected?.id ? <Loader size={13} /> : <Trash2 size={13} />} Delete from Library
                  </button>
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
