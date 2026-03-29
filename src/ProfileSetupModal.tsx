import React, { useState, useRef } from "react";
import DatePicker from "./DatePicker";
import { ROLE_CATEGORIES, getRoleStyle } from "./constants";
import { CheckCircle, ChevronDown } from "lucide-react";

interface ProfileSetupModalProps {
  user: { displayName?: string | null; email?: string | null; photoURL?: string | null };
  onSuccess: (newMember: any) => void;
}

export default function ProfileSetupModal({ user, onSuccess }: ProfileSetupModalProps) {
  // Pre-fill from Google account
  const googleNameParts = (user.displayName || "").trim().split(/\s+/);
  const [firstName,  setFirstName]  = useState(googleNameParts[0] || "");
  const [lastName,   setLastName]   = useState(googleNameParts.slice(1).join(" ") || "");
  const [phone,      setPhone]      = useState("");
  const [birthdate,  setBirthdate]  = useState("");
  const [gender,     setGender]     = useState("");
  const [roles,      setRoles]      = useState<string[]>([]);
  const [showRoles,  setShowRoles]  = useState(false);
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [saving,     setSaving]     = useState(false);
  const [done,       setDone]       = useState(false);

  /** Ref-based guard prevents double-submission on rapid taps before re-render */
  const submittedRef = useRef(false);

  const email    = (user.email    || "").trim().toLowerCase();
  const photoURL = user.photoURL || "";
  const firstName_ = firstName.trim();
  const today = new Date().toISOString().split("T")[0];

  const toggleRole = (role: string) =>
    setRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!firstName_.trim())  e.firstName  = "First name is required.";
    if (!phone.trim())        e.phone      = "Phone number is required.";
    else if (!/^\+?[\d\s\-()]{7,}$/.test(phone.trim())) e.phone = "Enter a valid phone number.";
    if (!birthdate)           e.birthdate  = "Birthdate is required.";
    if (!gender)              e.gender     = "Please select your gender.";
    if (roles.length === 0)   e.roles      = "Select at least one role.";
    return e;
  };

  const handleSubmit = async () => {
    // Guard: bail immediately if already submitted (prevents double-tap duplicates)
    if (submittedRef.current || saving) return;
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    submittedRef.current = true;
    setSaving(true);
    setErrors({});
    const submittedPayload = {
      firstName: firstName.trim(),
      middleInitial: "",
      lastName: lastName.trim(),
      name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
      phone: phone.trim(),
      email,
      photo: photoURL,
      roles,
      status: "active",
      birthdate,
      gender,
      notes: "",
    };
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submittedPayload),
      });
      if (!res.ok) throw new Error("Failed");
      const { id } = await res.json();
      setDone(true);
      // Pass the FULL record (with email) back so App.tsx can resolve myMemberProfile immediately
      setTimeout(() => onSuccess({ id, ...submittedPayload }), 1500);
    } catch {
      submittedRef.current = false; // allow retry on failure
      setErrors({ submit: "Something went wrong. Please try again." });
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="fixed inset-0 z-[500] flex items-start sm:items-center justify-center bg-gray-950/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl my-auto overflow-hidden">

        {done ? (
          /* ── Success ── */
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-3xl animate-bounce">
              🎉
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Profile created!</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Welcome to the team, <span className="font-semibold text-indigo-500">{firstName_}</span>!
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <p className="text-xs text-emerald-500 font-medium">Taking you in…</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 px-8 py-8 text-white text-center relative">
              {/* Photo */}
              {photoURL ? (
                <img src={photoURL} alt={firstName_} className="w-16 h-16 rounded-full object-cover mx-auto mb-3 ring-4 ring-white/30" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold mx-auto mb-3">
                  {(firstName_[0] || "?").toUpperCase()}
                </div>
              )}
              <h2 className="text-xl font-bold leading-tight">
                Hey {firstName_ || "there"}! 👋
              </h2>
              <p className="text-indigo-200 text-sm mt-1.5 leading-relaxed">
                Before you dive in, let's set up your profile so the team knows who you are!
              </p>
            </div>

            {/* ── Form Body ── */}
            <div className="px-7 py-6 space-y-4 max-h-[65vh] overflow-y-auto">

              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => { setFirstName(e.target.value); setErrors(p => ({ ...p, firstName: "" })); }}
                    placeholder="First name"
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm bg-white dark:bg-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${errors.firstName ? "border-red-400" : "border-gray-200 dark:border-gray-700"}`}
                  />
                  {errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* Email — locked */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Email (from your Google account)</label>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/50">
                  <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                  <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{email}</span>
                  <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full shrink-0">locked</span>
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: "" })); }}
                  placeholder="+63 9XX XXX XXXX"
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm bg-white dark:bg-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${errors.phone ? "border-red-400" : "border-gray-200 dark:border-gray-700"}`}
                />
                {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Gender <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  {["Male", "Female", "Prefer not to say"].map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => { setGender(g); setErrors(p => ({ ...p, gender: "" })); }}
                      className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                        gender === g
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-indigo-500/30 shadow-md"
                          : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-400"
                      }`}
                    >
                      {g === "Prefer not to say" ? "Private" : g}
                    </button>
                  ))}
                </div>
                {errors.gender && <p className="mt-1 text-xs text-red-500">{errors.gender}</p>}
              </div>

              {/* Birthdate */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Birthdate <span className="text-red-500">*</span>
                </label>
                <DatePicker
                  value={birthdate}
                  onChange={v => { setBirthdate(v); setErrors(p => ({ ...p, birthdate: "" })); }}
                  max={today}
                  min="1920-01-01"
                  placeholder="Select your birthdate"
                  error={!!errors.birthdate}
                />
                {errors.birthdate && <p className="mt-1 text-xs text-red-500">{errors.birthdate}</p>}
              </div>

              {/* Roles */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Your Role(s) <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowRoles(p => !p)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all ${errors.roles ? "border-red-400" : "border-gray-200 dark:border-gray-700"} bg-white dark:bg-gray-800 dark:text-white`}
                >
                  <span className={roles.length === 0 ? "text-gray-400" : "text-gray-900 dark:text-white"}>
                    {roles.length === 0 ? "Select your role(s)…" : roles.join(", ")}
                  </span>
                  <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${showRoles ? "rotate-180" : ""}`} />
                </button>
                {errors.roles && <p className="mt-1 text-xs text-red-500">{errors.roles}</p>}

                {showRoles && (
                  <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
                    {ROLE_CATEGORIES.map(cat => (
                      <div key={cat.label} className="px-3 py-2.5 bg-white dark:bg-gray-800">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{cat.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cat.roles.map(role => (
                            <button
                              key={role}
                              type="button"
                              onClick={() => { toggleRole(role); setErrors(p => ({ ...p, roles: "" })); }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                                roles.includes(role)
                                  ? `${getRoleStyle(role)} border-transparent shadow-sm`
                                  : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-300"
                              }`}
                            >
                              {role}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit error */}
              {errors.submit && (
                <p className="text-center text-xs text-red-500">⚠️ {errors.submit}</p>
              )}

              {/* CTA */}
              <button
                onClick={handleSubmit}
                disabled={saving}
                className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all shadow-lg ${
                  saving
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-indigo-500/30 active:scale-[0.98]"
                }`}
              >
                {saving ? "Saving your profile…" : "Set Up My Profile →"}
              </button>

              <p className="text-center text-[11px] text-gray-400 dark:text-gray-600 pb-1">
                This step is required to continue using WorshipFlow.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
