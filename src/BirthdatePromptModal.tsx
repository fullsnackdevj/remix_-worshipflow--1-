import React, { useState } from "react";
import DatePicker from "./DatePicker";

interface BirthdatePromptModalProps {
  memberName: string;
  memberId: string;
  onSuccess: (birthdate: string) => void;
}

function formatBirthdateDisplay(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  return `${months[m-1]} ${d}, ${y}`;
}

export default function BirthdatePromptModal({ memberName, memberId, onSuccess }: BirthdatePromptModalProps) {
  const [birthdate, setBirthdate] = useState("");
  const [error, setError]     = useState("");
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState(false);

  const today = new Date();
  const todayYMD = today.toISOString().split("T")[0];

  const validate = (ymd: string): string | null => {
    if (!ymd) return "Please select your birthdate.";
    const [y, m, d]  = ymd.split("-").map(Number);
    const birthDate  = new Date(y, m - 1, d);
    if (isNaN(birthDate.getTime())) return "Invalid date. Please try again.";
    if (ymd > todayYMD)             return "Birthdate cannot be in the future.";
    if (y < 1920)                   return "Please enter a valid birthdate (after 1920).";
    // Must be at least 13 years old
    const minAge = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
    if (birthDate > minAge)         return "You must be at least 13 years old to be registered.";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate(birthdate);
    if (err) { setError(err); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthdate }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setDone(true);
      // Give user a moment to see the success message, then close
      setTimeout(() => onSuccess(birthdate), 2200);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const firstName = memberName.split(" ")[0];

  return (
    // Fullscreen blocking overlay — no pointer-events on backdrop so nothing behind is reachable
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-gray-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden">

        {done ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center justify-center py-14 px-8 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-3xl animate-bounce">
              🎉
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Thank you, {firstName}!</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your birthday <span className="font-semibold text-indigo-500">{formatBirthdateDisplay(birthdate)}</span> has been saved successfully.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <p className="text-xs text-emerald-500 dark:text-emerald-400 font-medium">Closing automatically…</p>
            </div>
          </div>
        ) : (
          /* ── Prompt state ── */
          <>
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 px-8 py-8 text-white text-center">
              <div className="text-4xl mb-3">🎂</div>
              <h2 className="text-xl font-bold leading-tight">One quick update, {firstName}!</h2>
              <p className="text-indigo-200 text-sm mt-1.5 leading-relaxed">
                WorshipFlow has been updated. Please enter your birthdate so we can celebrate with you!
              </p>
            </div>

            {/* Body */}
            <div className="px-8 py-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Your Birthdate <span className="text-red-500">*</span>
                </label>
                <DatePicker
                  value={birthdate}
                  onChange={v => { setBirthdate(v); setError(""); }}
                  max={todayYMD}
                  min="1920-01-01"
                  placeholder="Select your birthdate"
                  error={!!error}
                />
                {error && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-red-500 font-medium">
                    <span>⚠️</span> {error}
                  </p>
                )}
              </div>

              <p className="text-[11px] text-gray-400 dark:text-gray-600 leading-relaxed">
                This information is used only to celebrate your birthday within the team. It is kept private and only visible to administrators.
              </p>

              <button
                onClick={handleSubmit}
                disabled={saving || !birthdate}
                className={`w-full py-3 rounded-2xl font-semibold text-sm transition-all shadow-md ${
                  saving || !birthdate
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-indigo-500/30"
                }`}
              >
                {saving ? "Saving…" : "Save My Birthday"}
              </button>

              {/* Cannot skip notice */}
              <p className="text-center text-[11px] text-gray-400 dark:text-gray-600">
                This step is required to continue using WorshipFlow.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
