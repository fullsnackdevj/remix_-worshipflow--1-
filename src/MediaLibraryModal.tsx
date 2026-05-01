import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Upload, Trash2, Image as ImageIcon, Video, Check, Wifi, WifiOff, FolderOpen, Film, Loader } from "lucide-react";
import { db, storage } from "./firebase";
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";

// ── IDB helpers (same DB as LiveStageView uses) ──────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MediaItem {
  id: string;
  name: string;
  type: "image" | "video";
  firebaseUrl: string;
  storagePath: string;
  uploadedAt: number;
  sizeBytes: number;
  mimeType: string;
}

export type MediaTarget = "praise-bg" | "worship-bg" | "fade-screen";

interface Props {
  onClose: () => void;
  onAssign: (item: MediaItem, target: MediaTarget, blobUrl: string | null) => void;
  onToast?: (msg: string, type: string) => void;
}

function fmt(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function MediaLibraryModal({ onClose, onAssign, onToast }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = (msg: string, type = "success") => onToast?.(msg, type);

  // ── Load items from Firestore ─────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "media_library"), orderBy("uploadedAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MediaItem)));
    }, () => {});
    return unsub;
  }, []);

  // ── Check IDB cache status for each item ──────────────────────────────────
  useEffect(() => {
    if (items.length === 0) return;
    Promise.all(items.map(async item => {
      const blob = await idbGet<Blob>(`media_blob_${item.id}`);
      return blob ? item.id : null;
    })).then(results => {
      setCachedIds(new Set(results.filter(Boolean) as string[]));
    });
  }, [items]);

  // ── Create blob URLs for cached items (for offline preview) ──────────────
  useEffect(() => {
    items.forEach(async item => {
      if (blobUrls[item.id]) return;
      const blob = await idbGet<Blob>(`media_blob_${item.id}`);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setBlobUrls(prev => ({ ...prev, [item.id]: url }));
      }
    });
    return () => { Object.values(blobUrls).forEach(URL.revokeObjectURL); };
  }, [items]); // eslint-disable-line

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const allowed = arr.filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!allowed.length) { toast("Only image and video files are allowed", "error"); return; }

    for (const file of allowed) {
      setUploading(true);
      setUploadProgress(0);
      try {
        const path = `media_library/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const sRef = storageRef(storage, path);
        const task = uploadBytesResumable(sRef, file);

        await new Promise<void>((res, rej) => {
          task.on("state_changed",
            snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
            rej,
            () => res()
          );
        });

        const firebaseUrl = await getDownloadURL(sRef);
        const isVideo = file.type.startsWith("video/");

        // Save metadata to Firestore
        const docRef = await addDoc(collection(db, "media_library"), {
          name: file.name,
          type: isVideo ? "video" : "image",
          firebaseUrl,
          storagePath: path,
          uploadedAt: Date.now(),
          sizeBytes: file.size,
          mimeType: file.type,
        });

        // Cache blob in IDB for offline use
        await idbSet(`media_blob_${docRef.id}`, file);
        const blobUrl = URL.createObjectURL(file);
        setBlobUrls(prev => ({ ...prev, [docRef.id]: blobUrl }));
        setCachedIds(prev => new Set([...prev, docRef.id]));

        toast(`✅ "${file.name}" uploaded & cached offline`);
      } catch (e) {
        console.error(e);
        toast(`Upload failed: ${file.name}`, "error");
      }
    }
    setUploading(false);
    setUploadProgress(0);
  }, []); // eslint-disable-line

  // ── Delete handler ────────────────────────────────────────────────────────
  const handleDelete = async (item: MediaItem) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setDeleting(item.id);
    try {
      // Delete from Storage
      try { await deleteObject(storageRef(storage, item.storagePath)); } catch {}
      // Delete from Firestore
      await deleteDoc(doc(db, "media_library", item.id));
      // Delete from IDB
      await idbDelete(`media_blob_${item.id}`);
      if (blobUrls[item.id]) URL.revokeObjectURL(blobUrls[item.id]);
      setBlobUrls(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      setCachedIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
      if (selected?.id === item.id) setSelected(null);
      toast(`🗑️ "${item.name}" deleted`);
    } catch (e) {
      toast("Delete failed", "error");
    }
    setDeleting(null);
  };

  // ── Assign to scene ───────────────────────────────────────────────────────
  const handleAssign = (target: MediaTarget) => {
    if (!selected) return;
    const blobUrl = blobUrls[selected.id] ?? null;
    onAssign(selected, target, blobUrl);
    toast(`✅ Applied to ${target === "praise-bg" ? "Praise BG" : target === "worship-bg" ? "Worship BG" : "Fade Screen"}`);
  };

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const previewUrl = selected ? (blobUrls[selected.id] ?? selected.firebaseUrl) : null;
  const isCached = selected ? cachedIds.has(selected.id) : false;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column",
      fontFamily: "'Inter','Segoe UI',sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.4)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FolderOpen size={18} color="#a78bfa" />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Media Library</span>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{items.length} items</span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex" }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: Upload + Grid */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
          {/* Upload zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              margin: 16, borderRadius: 12, padding: "20px 16px", textAlign: "center",
              border: `2px dashed ${dragOver ? "rgba(167,139,250,0.8)" : "rgba(255,255,255,0.12)"}`,
              background: dragOver ? "rgba(167,139,250,0.08)" : "rgba(255,255,255,0.02)",
              cursor: uploading ? "default" : "pointer", transition: "all 0.2s", flexShrink: 0,
            }}>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={e => e.target.files && handleFiles(e.target.files)} />
            {uploading ? (
              <div>
                <Loader size={22} color="#a78bfa" style={{ animation: "spin 1s linear infinite" }} />
                <div style={{ marginTop: 8, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Uploading… {uploadProgress}%</div>
                <div style={{ marginTop: 6, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 4 }}>
                  <div style={{ height: "100%", width: `${uploadProgress}%`, background: "#a78bfa", borderRadius: 4, transition: "width 0.3s" }} />
                </div>
              </div>
            ) : (
              <>
                <Upload size={22} color="rgba(167,139,250,0.7)" />
                <div style={{ marginTop: 6, color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                  Click or drag &amp; drop images / videos
                </div>
              </>
            )}
          </div>

          {/* Media grid */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
            {items.length === 0 ? (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13, paddingTop: 40 }}>
                No media yet. Upload something above.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10 }}>
                {items.map(item => {
                  const thumbUrl = blobUrls[item.id] ?? item.firebaseUrl;
                  const isSelected = selected?.id === item.id;
                  const cached = cachedIds.has(item.id);
                  return (
                    <div key={item.id}
                      onClick={() => setSelected(isSelected ? null : item)}
                      style={{
                        position: "relative", borderRadius: 10, overflow: "hidden",
                        aspectRatio: "16/9", cursor: "pointer",
                        border: isSelected ? "2px solid #a78bfa" : "2px solid rgba(255,255,255,0.06)",
                        background: "#111", transition: "all 0.15s",
                        boxShadow: isSelected ? "0 0 0 2px rgba(167,139,250,0.4)" : "none",
                      }}>
                      {item.type === "image" ? (
                        <img src={thumbUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                      ) : (
                        <video src={thumbUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted preload="metadata" />
                      )}
                      {/* Type badge */}
                      <div style={{ position: "absolute", top: 5, left: 5, background: "rgba(0,0,0,0.65)", borderRadius: 5, padding: "2px 5px", display: "flex", alignItems: "center", gap: 3 }}>
                        {item.type === "video" ? <Film size={10} color="#a78bfa" /> : <ImageIcon size={10} color="#34d399" />}
                      </div>
                      {/* Offline badge */}
                      <div style={{ position: "absolute", top: 5, right: 5 }}>
                        {cached ? <Wifi size={11} color="#34d399" /> : <WifiOff size={11} color="rgba(255,255,255,0.3)" />}
                      </div>
                      {/* Selected check */}
                      {isSelected && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Check size={28} color="#a78bfa" />
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
        <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "rgba(0,0,0,0.25)" }}>
          {!selected ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "rgba(255,255,255,0.2)", padding: 20, textAlign: "center" }}>
              <FolderOpen size={32} />
              <span style={{ fontSize: 13 }}>Select an item to preview and assign</span>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {/* Preview */}
              <div style={{ background: "#000", aspectRatio: "16/9", flexShrink: 0, overflow: "hidden" }}>
                {selected.type === "image" ? (
                  <img src={previewUrl!} alt={selected.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <video src={previewUrl!} controls muted style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                )}
              </div>

              {/* Info */}
              <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, wordBreak: "break-word", marginBottom: 6 }}>{selected.name}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.05)", borderRadius: 5, padding: "2px 7px" }}>
                    {selected.type === "video" ? "Video" : "Image"}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.05)", borderRadius: 5, padding: "2px 7px" }}>
                    {fmt(selected.sizeBytes)}
                  </span>
                  <span style={{
                    fontSize: 11, borderRadius: 5, padding: "2px 7px",
                    background: isCached ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.05)",
                    color: isCached ? "#34d399" : "rgba(255,255,255,0.4)",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {isCached ? <><Wifi size={9} /> Offline ready</> : <><WifiOff size={9} /> Online only</>}
                  </span>
                </div>
              </div>

              {/* Assign buttons */}
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                  Apply to Scene
                </div>

                <button onClick={() => handleAssign("praise-bg")} style={assignBtn("#f59e0b")}>
                  <Zap size={14} /> Set as Praise Background
                </button>

                <button onClick={() => handleAssign("worship-bg")} style={assignBtn("#818cf8")}>
                  <Video size={14} /> Set as Worship Background
                </button>

                <button onClick={() => handleAssign("fade-screen")} style={assignBtn("#34d399")}>
                  <ImageIcon size={14} /> Set as Fade Screen
                </button>

                {/* Separator */}
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

                {/* Delete */}
                <button
                  onClick={() => handleDelete(selected)}
                  disabled={deleting === selected.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                  {deleting === selected.id ? <Loader size={14} /> : <Trash2 size={14} />}
                  Delete from Library
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}

function assignBtn(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 8,
    padding: "9px 14px", borderRadius: 8,
    border: `1px solid ${color}44`,
    background: `${color}11`,
    color, fontSize: 12, fontWeight: 600,
    cursor: "pointer", transition: "all 0.15s", width: "100%",
  };
}
