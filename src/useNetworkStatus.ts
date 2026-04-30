// ── useNetworkStatus ──────────────────────────────────────────────────────────
// Tracks the browser's online/offline state and whether Firestore has any
// writes pending sync. Components can consume this to:
//   • Show an "Offline" banner when isOnline === false
//   • Show a "Syncing…" indicator when hasPendingWrites === true and isOnline === true
//   • Disable UI actions that require connectivity

import { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, onSnapshot, query, limit } from "firebase/firestore";

export interface NetworkStatus {
  isOnline: boolean;
  /** True when Firestore has writes queued locally that haven't reached the server yet */
  hasPendingWrites: boolean;
  /** "online" | "offline" | "syncing" — derived convenience string for UI */
  mode: "online" | "offline" | "syncing";
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [hasPendingWrites, setHasPendingWrites] = useState(false);

  // ── Browser online/offline events ────────────────────────────────────────
  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ── Firestore metadata listener — detects pending writes ─────────────────
  // We listen to a tiny slice of the songs collection (limit 1).
  // The `fromCache` / `hasPendingWrites` snapshot metadata is set by the SDK
  // regardless of which collection we listen to — it reflects global Firestore state.
  useEffect(() => {
    try {
      const q = query(collection(db, "wfSongs"), limit(1));
      const unsub = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snapshot) => {
          setHasPendingWrites(snapshot.metadata.hasPendingWrites);
        },
        () => { /* ignore errors — non-critical */ }
      );
      return unsub;
    } catch {
      return () => {};
    }
  }, []);

  const mode: NetworkStatus["mode"] =
    !isOnline ? "offline"
    : hasPendingWrites ? "syncing"
    : "online";

  return { isOnline, hasPendingWrites, mode };
}
