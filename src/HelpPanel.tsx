import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  X, HelpCircle, ChevronRight, ChevronLeft, Bell, BookOpen,
  Calendar, Users, Shield, Smartphone, Search, LayoutGrid,
  Mic2, Palette, Dumbbell, Gift, UserCircle, BarChart2,
  Lightbulb, CheckCircle2, Circle, Send, Loader2, ChevronDown,
  Pencil, Trash2,
} from "lucide-react";
import type { Member } from "./types";

// ── Article interface ─────────────────────────────────────────────────────────
interface Article {
  id: string;
  icon: React.ReactNode;
  title: string;
  summary: string;
  adminOnly?: boolean;
  content: React.ReactNode;
}

// ── Tiny UI helpers ───────────────────────────────────────────────────────────
const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <div className="flex gap-2.5 items-start">
    <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[10px] font-black flex items-center justify-center mt-0.5">
      {n}
    </span>
    <span className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed">{children}</span>
  </div>
);
const B = ({ children }: { children: React.ReactNode }) => (
  <strong className="text-gray-900 dark:text-white font-semibold">{children}</strong>
);
const Tip = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-lg px-3 py-2">
    💡 {children}
  </p>
);
const Warn = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 rounded-lg px-3 py-2">
    ⚠️ {children}
  </p>
);
const Sh = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-gray-900 dark:text-white font-semibold text-sm mb-2 mt-1">{children}</h3>
);

// ── Articles ──────────────────────────────────────────────────────────────────
const ARTICLES: Article[] = [
  // 1. Profile Setup
  {
    id: "profile-setup",
    icon: <UserCircle size={16} />,
    title: "Setting Up Your Profile",
    summary: "Add your photo, name, and birthdate so your team knows you.",
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <Sh>Why your profile matters</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Your profile photo shows up in birthday greetings, schedule assignments,
          Ministry Hub cards, and Team Notes. A complete profile helps your teammates
          recognize you all across the app.
        </p>
        <Sh>How to update your profile</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Go to <B>Team Members</B> in the sidebar</Step>
          <Step n={2}>Find your name in the list and tap it</Step>
          <Step n={3}>Tap the <B>Edit (pencil) icon</B> on your card</Step>
          <Step n={4}>Upload a <B>profile photo</B>, update your name, phone, and roles</Step>
          <Step n={5}>Add your <B>Birthday</B> (YYYY-MM-DD) so the team can greet you</Step>
          <Step n={6}>Tap <B>Save</B></Step>
        </div>
        <Tip>Everyone can edit their own profile. Only Admins can edit other members' profiles.</Tip>
        <Warn>Your profile is matched to you by email — make sure the email on your member card matches the one you sign in with.</Warn>
      </div>
    ),
  },

  // 2. Push Notifications
  {
    id: "push-notifications",
    icon: <Bell size={16} />,
    title: "How to Enable Push Notifications",
    summary: "Stay updated on songs, schedules & team changes.",
    content: (
      <div className="space-y-4 text-sm leading-relaxed">
        <section>
          <Sh>
            <span className="inline-flex items-center gap-1.5"><Smartphone size={13} className="text-indigo-500" />iPhone / iPad (iOS)</span>
          </Sh>
          <Warn>iOS requires the app to be installed first before notifications work.</Warn>
          <p className="text-xs text-gray-700 dark:text-gray-300 font-medium mt-3 mb-1.5">Step 1 — Install the app</p>
          <div className="space-y-1.5">
            <Step n={1}>Open <B>Safari</B> on your iPhone (must be Safari, not Chrome)</Step>
            <Step n={2}>Go to your WorshipFlow URL</Step>
            <Step n={3}>Tap the <B>Share button</B> at the bottom of Safari</Step>
            <Step n={4}>Scroll down and tap <B>"Add to Home Screen"</B></Step>
            <Step n={5}>Tap <B>"Add"</B> — an icon now appears on your home screen</Step>
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300 font-medium mt-3 mb-1.5">Step 2 — Enable notifications</p>
          <div className="space-y-1.5">
            <Step n={1}>Open the app <B>from your Home Screen</B> (not from Safari)</Step>
            <Step n={2}>A banner appears at the top — tap <B>"Enable"</B></Step>
            <Step n={3}>Tap <B>"Allow"</B> on the system dialog</Step>
          </div>
        </section>
        <section>
          <Sh>Android (Chrome)</Sh>
          <div className="space-y-1.5">
            <Step n={1}>Open <B>Chrome</B> and go to your WorshipFlow URL</Step>
            <Step n={2}>Tap <B>"Enable"</B> on the notification banner</Step>
            <Step n={3}>Tap <B>"Allow"</B> on the browser prompt</Step>
          </div>
          <p className="text-xs text-gray-400 mt-2">Tip: Tap the 3-dot menu → "Add to Home Screen" for the best experience.</p>
        </section>
        <section>
          <Sh>Desktop (Chrome / Edge)</Sh>
          <div className="space-y-1.5">
            <Step n={1}>Click <B>"Enable"</B> on the notification banner</Step>
            <Step n={2}>Click <B>"Allow"</B> on the browser prompt</Step>
          </div>
        </section>
        <section className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <Sh>Didn't see the banner?</Sh>
          <p className="text-xs text-gray-500 dark:text-gray-400"><B>iPhone:</B> Settings → Safari → Advanced → Website Data → clear WorshipFlow, then re-install via Add to Home Screen.</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1"><B>Android / Desktop:</B> Click the lock icon in the address bar → Notifications → set to "Allow" → refresh.</p>
        </section>
      </div>
    ),
  },

  // 3. Songs
  {
    id: "songs",
    icon: <BookOpen size={16} />,
    title: "How to Add & Manage Songs",
    summary: "Add songs, attach lyrics, chord sheets, and video links.",
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <Sh>Adding a new song</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Go to <B>Songs</B> in the sidebar</Step>
          <Step n={2}>Tap the <B>+ Add Song</B> button</Step>
          <Step n={3}>Enter the <B>Title</B> and <B>Artist</B></Step>
          <Step n={4}>Paste <B>Lyrics</B> — uppercase is the standard format on the platform</Step>
          <Step n={5}>Paste <B>Chords</B> if you have them (optional)</Step>
          <Step n={6}>Add a <B>YouTube URL</B> as a reference video (optional but recommended)</Step>
          <Step n={7}>Pick at least one <B>Tag</B> (e.g. Joyful, Solemn, Tagalog)</Step>
          <Step n={8}>Tap <B>Save</B></Step>
        </div>
        <Tip>The app checks for duplicates — if the same song title/artist already exists, you'll be warned before saving.</Tip>
        <Sh>Searching songs</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Type in the search bar to find by <B>title, artist, lyrics, or tag</B>. Tap tag chips below the search bar to filter by category.
        </p>
        <Sh>Transposing chords</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Open a song with chords → use the <B>± transpose buttons</B> to shift keys up or down. The chords update live — lyrics are unaffected.
        </p>
        <Sh>Editing or deleting</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Open a song and tap the <B>pencil icon</B> to edit. Only <B>Admins</B> can permanently delete songs.
        </p>
        <Warn>Musician role and above can add/edit songs. Members are view-only.</Warn>
      </div>
    ),
  },

  // 4. Schedule
  {
    id: "schedule",
    icon: <Calendar size={16} />,
    title: "How to Build a Service Schedule",
    summary: "Plan services, assign team members, and set song lineups.",
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <Sh>Creating a service event</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Go to <B>Schedule</B> in the sidebar</Step>
          <Step n={2}>Tap <B>+ New Event</B> or click a date on the calendar</Step>
          <Step n={3}>Enter the <B>Event Name</B> (e.g. "Sunday Service", "Midweek Service")</Step>
          <Step n={4}>Set the <B>Date</B></Step>
          <Step n={5}>Assign a <B>Worship Leader</B> and other roles (Singers, Musicians, etc.)</Step>
          <Step n={6}>Pick the <B>Joyful</B> and <B>Solemn</B> songs from the library (optional)</Step>
          <Step n={7}>Add any team <B>Notes</B> and tap <B>Save</B></Step>
        </div>
        <Tip>Use the <B>Copy</B> button on any event to duplicate it as a template and save time.</Tip>
        <Sh>Lineup Acknowledgment</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          When you're assigned to a service, tap <B>Acknowledge</B> on the event card to confirm you've seen the lineup. Your avatar appears with a ✓ on the event.
        </p>
        <Sh>Birthday cards on the calendar</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Birthday cards appear on the calendar date of each member's birthday. Tap any card to view all greetings — even on past dates.
        </p>
        <Warn>Only Worship Leaders, Planning Leads, and Admins can create or edit schedules.</Warn>
      </div>
    ),
  },

  // 5. Birthday Greetings
  {
    id: "birthdays",
    icon: <Gift size={16} />,
    title: "Sending Birthday Greetings",
    summary: "Celebrate teammates — send and view birthday wishes.",
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <Sh>When does the birthday card appear?</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          When a team member has a birthday today, a <B>birthday card popup</B> automatically appears when you open the app. It shows only once per day so it won't interrupt you repeatedly.
        </p>
        <Sh>Sending a greeting</Sh>
        <div className="space-y-1.5">
          <Step n={1}>When the birthday card appears, type your personal message</Step>
          <Step n={2}>Tap <B>Send Greeting</B></Step>
          <Step n={3}>Your message is saved instantly and the birthday person can read it</Step>
        </div>
        <Tip>You can only send one greeting per celebrant per day — make it special! 🎉</Tip>
        <Sh>Viewing greetings on the calendar</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Go to <B>Schedule</B></Step>
          <Step n={2}>Find the member's birthday date on the calendar</Step>
          <Step n={3}>Tap their birthday card — a <B>Wishes Wall</B> opens with all greetings</Step>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          This works for <B>past dates</B> too — you can look back at any birthday and read all the messages ever sent.
        </p>
        <Sh>Deleting your own greeting</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Open the Wishes Wall, find your message, and tap the <B>🗑️ trash icon</B> next to it. You can only retract your own wishes.
        </p>
        <Warn>Make sure your Birthday is saved in your member profile so the team can celebrate you!</Warn>
      </div>
    ),
  },

  // 6. Roles & Permissions
  {
    id: "roles",
    icon: <Users size={16} />,
    title: "Understanding Roles & Permissions",
    summary: "What each role can see and do in the app.",
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Every team member is assigned a role that controls what they can access. Your role is set by an Admin.
        </p>
        <div className="space-y-2">
          {[
            { role: "Admin", color: "text-amber-600 dark:text-amber-400", dot: "bg-amber-400", desc: "Full access — manage members, schedules, songs, broadcasts, and approve access requests." },
            { role: "Planning Lead", color: "text-rose-600 dark:text-rose-400", dot: "bg-rose-400", desc: "Create/manage schedules, assign members, add/edit songs. Cannot manage team access." },
            { role: "Worship Leader", color: "text-indigo-600 dark:text-indigo-400", dot: "bg-indigo-400", desc: "Full schedule authoring — create events, assign roles, set song lineups, add/edit songs." },
            { role: "Musician", color: "text-purple-600 dark:text-purple-400", dot: "bg-purple-400", desc: "Can add and edit songs. View-only for schedules. Cannot create events or manage members." },
            { role: "Audio / Tech", color: "text-teal-600 dark:text-teal-400", dot: "bg-teal-400", desc: "Add/edit songs and manage Design Requests (sermon slide designs from preachers)." },
            { role: "Member", color: "text-gray-500 dark:text-gray-400", dot: "bg-gray-400", desc: "View songs and schedules only. Can edit their own profile." },
          ].map(r => (
            <div key={r.role} className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 border border-gray-200 dark:border-gray-700/50 flex gap-3">
              <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${r.dot}`} />
              <div>
                <p className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${r.color}`}>{r.role}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <Tip>Everyone can edit their own profile in Team Members regardless of their role.</Tip>
      </div>
    ),
  },

  // 7. Ministry Hub
  {
    id: "ministry-hub",
    icon: <LayoutGrid size={16} />,
    title: "Using the Ministry Hub",
    summary: "Organize ministry tasks with Kanban boards, cards & assignments.",
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <Sh>What is the Ministry Hub?</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The Ministry Hub is a <B>task board</B> for organizing ministry projects — planning events, media tasks, team follow-ups, and more. Think of it as a digital sticky-note board with columns.
        </p>
        <Sh>Board structure</Sh>
        <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
          <p>• <B>Boards</B> — separate project workspaces (e.g. "April Media Tasks")</p>
          <p>• <B>Lists</B> — columns inside a board: <B>TO DO → IN PROGRESS → DONE</B></p>
          <p>• <B>Cards</B> — individual tasks inside a list</p>
        </div>
        <Sh>Creating a task card</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Open a board and click <B>+ Add Card</B> under the right list</Step>
          <Step n={2}>Give the card a title and description</Step>
          <Step n={3}>Assign <B>team members</B> who are responsible for it</Step>
          <Step n={4}>Set a <B>due date</B> if needed</Step>
          <Step n={5}><B>Move</B> the card to a different list as work progresses (tap the card → Move)</Step>
        </div>
        <Sh>Seeing your tasks on the Dashboard</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Cards assigned to you appear in the <B>My Tasks</B> widget on your Dashboard. Tap any task to jump directly to it inside the board.
        </p>
        <Sh>Comments & @mentions</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Open a card and add a comment. Type <B>@name</B> to mention a teammate — they instantly get a push notification.
        </p>
        <Warn>You must be added to a board to see it. Ask your Admin if you need access to a specific board.</Warn>
      </div>
    ),
  },

  // 8. Freedom Wall
  {
    id: "freedom-wall",
    icon: <span style={{ fontSize: 16 }}>🕊️</span>,
    title: "Freedom Wall — Anonymous Posts",
    summary: "Share thoughts and encouragement anonymously with the team.",
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <Sh>What is the Freedom Wall?</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The Freedom Wall is a <B>safe, anonymous space</B> for your team to share encouragements, prayers, reflections, or anything on their hearts — without anyone knowing who posted it.
        </p>
        <Sh>Posting a note</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Go to <B>Freedom Wall</B> in the sidebar</Step>
          <Step n={2}>Type your message in the text area at the top</Step>
          <Step n={3}>Tap <B>Post</B> — your note appears as a sticky card on the board</Step>
        </div>
        <Tip>Your name is never shown on the wall. All posts are fully anonymous to your teammates.</Tip>
        <Sh>Reacting to posts</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Tap an emoji reaction on any note to respond. Reactions show only the count — not who reacted.
        </p>
        <Warn>Admins can remove inappropriate posts to keep the wall respectful and safe for everyone.</Warn>
      </div>
    ),
  },

  // 9. Preaching
  {
    id: "preaching",
    icon: <Mic2 size={16} />,
    title: "Writing & Submitting Sermons",
    summary: "Draft sermons, search Bible verses, and request slide designs.",
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <Sh>Creating a sermon draft</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Go to <B>Preaching</B> in the sidebar</Step>
          <Step n={2}>Click <B>+ New Sermon</B> in the left sidebar panel</Step>
          <Step n={3}>Give it a title and start writing — your draft auto-saves as you type</Step>
        </div>
        <Tip>Your drafts are completely private — no one else on the team can see them until you submit.</Tip>
        <Sh>Searching Bible verses</Sh>
        <div className="space-y-1.5">
          <Step n={1}>While writing, tap the <B>Bible Search</B> button</Step>
          <Step n={2}>Type a verse reference (e.g. "John 3:16") or a keyword</Step>
          <Step n={3}>Choose a translation (NIV, ESV, Tagalog, and more)</Step>
          <Step n={4}>Tap the verse to insert it directly into your sermon</Step>
        </div>
        <Sh>Submitting for slide design</Sh>
        <div className="space-y-1.5">
          <Step n={1}>When your sermon is ready, tap <B>Submit for Design</B></Step>
          <Step n={2}>The Audio/Tech team receives it as a Design Request</Step>
          <Step n={3}>You'll get a notification when they <B>claim</B> it and when it's <B>done</B></Step>
        </div>
        <Sh>Viewing submitted sermons</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Click the <B>Submitted</B> tab to see all your submitted sermons and their current design status (Open, In Progress, Done).
        </p>
      </div>
    ),
  },

  // 10. Design Requests
  {
    id: "design-requests",
    icon: <Palette size={16} />,
    title: "Managing Design Requests (Audio/Tech)",
    summary: "Claim and complete slide design requests from preachers.",
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <Sh>Who sees Design Requests?</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Only <B>Audio/Tech</B> members and <B>Admins</B> can access this module. It appears in the sidebar for those roles.
        </p>
        <Sh>How the workflow works</Sh>
        <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
          <p>1. A preacher submits their sermon → a card appears in Design Requests</p>
          <p>2. An Audio/Tech member <B>claims</B> it (locks the card to themselves)</p>
          <p>3. They create the slides outside the app</p>
          <p>4. They mark the card <B>Done</B> when finished</p>
          <p>5. The preacher gets notified at each step</p>
        </div>
        <Sh>Claiming a request</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Open <B>Design Requests</B> in the sidebar</Step>
          <Step n={2}>Find an <B>Open</B> card and tap <B>Claim</B></Step>
          <Step n={3}>The card moves to <B>In Progress</B> and is assigned to you</Step>
          <Step n={4}>When the slides are ready, tap <B>Mark as Done</B></Step>
        </div>
        <Tip>Only one person can claim a request at a time — this prevents duplicate work between team members.</Tip>
      </div>
    ),
  },

  // 11. Rehearsal Mode
  {
    id: "rehearsal",
    icon: <Dumbbell size={16} />,
    title: "Rehearsal Mode",
    summary: "Full-screen lyrics and chords for on-stage practice.",
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <Sh>What is Rehearsal Mode?</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Rehearsal Mode gives you a <B>distraction-free, full-screen view</B> of song lyrics and chords — designed for stage use during practice or even a live service.
        </p>
        <Sh>How to use it</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Go to <B>Rehearsal Mode</B> in the sidebar</Step>
          <Step n={2}>The sidebar collapses automatically to give you maximum screen space</Step>
          <Step n={3}>Use the navigation arrows to move between songs</Step>
          <Step n={4}>Tap the <B>± transpose buttons</B> to adjust the key on the fly</Step>
        </div>
        <Tip>Works great on a tablet or large phone mounted on a music stand during rehearsal.</Tip>
      </div>
    ),
  },

  // 12. Requesting Access
  {
    id: "access",
    icon: <Shield size={16} />,
    title: "Requesting & Managing Access",
    summary: "How to join WorshipFlow and approve team invitations.",
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <Sh>How to join WorshipFlow</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Visit the WorshipFlow URL and tap <B>Sign in with Google</B></Step>
          <Step n={2}>If your email isn't approved, you'll see an <B>Access Denied</B> screen</Step>
          <Step n={3}>Fill in your name and reason, then tap <B>Request Access</B></Step>
          <Step n={4}>An Admin receives a notification and reviews your request</Step>
          <Step n={5}>Once approved, sign in again — you're in! 🎉</Step>
        </div>
        <Tip>Let your Team Leader or Admin know you've submitted a request so they can approve it faster.</Tip>
        <Sh>For Admins — approving access</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Go to <B>Admin Panel</B> — a badge shows pending requests</Step>
          <Step n={2}>Click <B>Pending Users</B></Step>
          <Step n={3}>Review the request and select the right <B>Role</B> for the person</Step>
          <Step n={4}>Click <B>Approve</B> — they can sign in immediately</Step>
        </div>
        <Sh>Changing someone's role</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          In <B>Admin Panel → Users</B>, find the member and use the <B>Role dropdown</B> to promote or demote. Changes take effect on their next page load.
        </p>
      </div>
    ),
  },

  // 13. Broadcasts (Admin only)
  {
    id: "broadcasts",
    icon: <Shield size={16} />,
    title: "How to Send a Broadcast (Admin)",
    summary: "Notify the team with What's New or Maintenance alerts.",
    adminOnly: true,
    content: (
      <div className="space-y-3 text-sm leading-relaxed">
        <Sh>Broadcast types</Sh>
        <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
          <p>• <B>What's New</B> — dismissible popup for sharing app updates with the team</p>
          <p>• <B>Maintenance</B> — full-screen block that prevents app use (for emergencies)</p>
        </div>
        <Sh>Creating a broadcast</Sh>
        <div className="space-y-1.5">
          <Step n={1}>Go to <B>Admin Panel</B> in the sidebar</Step>
          <Step n={2}>Click the <B>Broadcasts</B> tab</Step>
          <Step n={3}>Click <B>"+ Create Broadcast"</B></Step>
          <Step n={4}>Choose the type and fill in title, message, and bullet points</Step>
          <Step n={5}>Choose audience — all members or specific emails</Step>
          <Step n={6}>Click <B>Send Broadcast</B></Step>
        </div>
        <Tip>The "What's New" broadcast also updates the What's New tile on everyone's Dashboard.</Tip>
        <Sh>Turning a broadcast off</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          In the Broadcasts list, toggle the switch next to any active broadcast to deactivate it instantly.
        </p>
        <Sh>Poking a team member</Sh>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          From <B>Admin Panel → Users</B>, tap <B>Poke</B> next to any member to send them an immediate on-screen alert. Great for getting attention during a service. 😄
        </p>
      </div>
    ),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgoShort(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type HelpTab = "guides" | "progress";

// ── Props ─────────────────────────────────────────────────────────────────────
interface HelpPanelProps {
  isAdmin: boolean;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userPhoto?: string;
  allMembers?: Member[];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HelpPanel({
  isAdmin,
  userId = "",
  userName = "",
  userEmail = "",
  userPhoto = "",
  allMembers = [],
}: HelpPanelProps) {
  // ── First-visit glow ────────────────────────────────────────────────────────
  const [glowing, setGlowing] = useState(() => !localStorage.getItem("wf_seen_help"));

  // ── Panel state ─────────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HelpTab>("guides");
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const deletedIds = useRef<Set<string>>(new Set()); // survive re-fetches

  // ── Progress state (admin) ──────────────────────────────────────────────────
  const [reads, setReads] = useState<any[]>([]);
  const [loadingReads, setLoadingReads] = useState(false);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  // ── Suggestions state ───────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [newSuggestion, setNewSuggestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Toast state ─────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: "success" | "info" | "error" }[]>([]);

  // ── Notification dots ───────────────────────────────────────────────────────
  const [hasNewSuggestions, setHasNewSuggestions] = useState(false);
  const [hasNewProgress, setHasNewProgress] = useState(false);

  // ── Visible articles ────────────────────────────────────────────────────────
  const visibleArticles = ARTICLES.filter(a => !a.adminOnly || isAdmin);
  const publicArticles = ARTICLES.filter(a => !a.adminOnly);
  const filteredArticles = query.trim()
    ? visibleArticles.filter(a =>
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.summary.toLowerCase().includes(query.toLowerCase())
      )
    : visibleArticles;

  // ── Track article read ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeArticle || !userId) return;
    fetch("/api/help/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId, userName, userEmail, userPhoto: userPhoto || "",
        articleId: activeArticle.id,
        articleTitle: activeArticle.title,
      }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeArticle?.id]);

  // ── Fetch reads (admin, on tab open) ───────────────────────────────────────
  useEffect(() => {
    if (tab !== "progress" || !isAdmin || !open) return;
    setLoadingReads(true);
    fetch("/api/help/reads")
      .then(r => r.json())
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        setReads(rows);
        // Detect new completions for the progress dot
        // (runs only when tab is NOT currently open / before clear)
      })
      .catch(() => {})
      .finally(() => setLoadingReads(false));
  }, [tab, open, isAdmin]);

  // ── Fetch suggestions (on tab open) ────────────────────────────────────────
  useEffect(() => {
    if (tab !== "suggestions" || !open) return;
    setHasNewSuggestions(false);
    localStorage.setItem("wf_suggestions_seen_at", new Date().toISOString());
    setLoadingSuggestions(true);
    fetch("/api/help/suggestions")
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        // Filter out any IDs that were deleted in this session
        setSuggestions(list.filter((s: any) => !deletedIds.current.has(s.id)));
      })
      .catch(() => {})
      .finally(() => setLoadingSuggestions(false));
  }, [tab, open]);

  // ── Background suggestion check (on mount — only if returning user) ─────────
  useEffect(() => {
    const seenAt = localStorage.getItem("wf_suggestions_seen_at");
    if (!seenAt) return;  // first-timer, no baseline yet
    fetch("/api/help/suggestions")
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        const hasNew = data.some(s => s.createdAt && s.createdAt > seenAt);
        if (hasNew) setHasNewSuggestions(true);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Clear progress dot when Progress tab is opened ──────────────────────────
  useEffect(() => {
    if (tab === "progress" && open && isAdmin) {
      setHasNewProgress(false);
    }
  }, [tab, open, isAdmin]);

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveArticle(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Open handler ────────────────────────────────────────────────────────────
  const handleOpen = () => {
    setOpen(o => !o);
    setActiveArticle(null);
    setQuery("");
    if (glowing) {
      setGlowing(false);
      localStorage.setItem("wf_seen_help", "1");
    }
  };

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type: "success" | "info" | "error" = "success") => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // ── Submit suggestion ───────────────────────────────────────────────────────
  const submitSuggestion = async () => {
    const text = newSuggestion.trim();
    if (!text || !userId) return;
    const tempId = `temp_${Date.now()}`;
    const optimistic = { id: tempId, userId, userName, userPhoto: userPhoto || "", text, createdAt: new Date().toISOString(), status: "pending" };
    setSuggestions(prev => [optimistic, ...prev]);
    setNewSuggestion("");
    showToast("Suggestion posted!", "success");
    setSubmitting(true);
    try {
      const res = await fetch("/api/help/suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, userName, userPhoto: userPhoto || "", text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id) setSuggestions(prev => prev.map(s => s.id === tempId ? { ...s, id: data.id } : s));
      }
    } catch { /* keep optimistic */ }
    setSubmitting(false);
  };

  // ── Update suggestion status (admin) ───────────────────────────────────────
  const updateSuggestionStatus = async (id: string, status: string) => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    showToast(status === "done" ? "Marked as resolved ✓" : "Unmarked", "info");
    await fetch(`/api/help/suggestion/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  };

  // ── Edit suggestion text (own post or admin) ────────────────────────────────
  const saveEdit = async (id: string) => {
    const text = editText.trim();
    if (!text) return;
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, text } : s));
    setEditingId(null);
    showToast("Suggestion updated", "success");
    await fetch(`/api/help/suggestion/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => {});
  };

  // ── Delete suggestion (own post or admin) ──────────────────────────────────
  const deleteSuggestion = async (id: string) => {
    setDeletingId(null);
    deletedIds.current.add(id);                          // remember locally
    setSuggestions(prev => prev.filter(s => s.id !== id)); // optimistic remove
    showToast("Suggestion deleted", "error");
    try {
      const res = await fetch(`/api/help/suggestion/${id}`, { method: "DELETE" });
      if (!res.ok) {
        // Server couldn't delete — log but keep local removal
        showToast("Couldn't delete on server — try restarting the app", "error");
      }
    } catch {
      showToast("Network error on delete — changes are local only", "error");
    }
  };

  // ── Build per-member progress (admin) ──────────────────────────────────────
  const memberProgress = React.useMemo(() => {
    // reads grouped by email
    const byEmail: Record<string, Set<string>> = {};
    reads.forEach(r => {
      const key = (r.userEmail || "").toLowerCase();
      if (!key) return;
      if (!byEmail[key]) byEmail[key] = new Set();
      byEmail[key].add(r.articleId);
    });
    // Map against allMembers; fall back to reads-only users
    const memberMap: Record<string, { name: string; photo: string; email: string; readIds: Set<string> }> = {};
    allMembers.forEach(m => {
      const key = (m.email || "").toLowerCase();
      if (!key) return;
      memberMap[key] = {
        name: m.name || m.firstName || "Unknown",
        photo: m.photo || "",
        email: key,
        readIds: byEmail[key] ?? new Set(),
      };
    });
    // Include readers not in allMembers
    reads.forEach(r => {
      const key = (r.userEmail || "").toLowerCase();
      if (key && !memberMap[key]) {
        if (!memberMap[key + "_uid"]) {
          memberMap[r.userId] = {
            name: r.userName || "Unknown",
            photo: r.userPhoto || "",
            email: key,
            readIds: byEmail[key] ?? new Set(),
          };
        }
      }
    });
    return Object.values(memberMap).sort((a, b) => b.readIds.size - a.readIds.size);
  }, [reads, allMembers]);

  const totalPublic = publicArticles.length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={panelRef} className="relative">
      {/* Trigger button with first-visit glow + notification dot */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        title="Help & Knowledge Base"
      >
        {/* Glow ring (first visit) */}
        {glowing && (
          <>
            <span className="absolute inset-0 rounded-xl animate-ping bg-indigo-500/30 pointer-events-none" />
            <span className="absolute inset-0 rounded-xl ring-2 ring-indigo-500/60 pointer-events-none" />
          </>
        )}
        {/* Red notification dot */}
        {!glowing && (isAdmin && hasNewProgress) && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900 pointer-events-none" />
        )}
        <HelpCircle size={20} className={glowing ? "text-indigo-500" : ""} />
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed inset-x-0 top-[64px] bottom-0 sm:bottom-auto sm:inset-x-auto sm:absolute sm:top-full sm:mt-2 sm:left-auto sm:right-0 z-[200] sm:w-[480px] sm:max-h-[640px] bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700/60 sm:border sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">

          {/* ── Toast stack ─────────────────────────────────────────────────── */}
          {toasts.length > 0 && (
            <div className="absolute bottom-4 left-3 right-3 z-50 space-y-1.5 pointer-events-none">
              {toasts.map(t => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold shadow-lg ${
                    t.type === "success" ? "bg-emerald-600 text-white" :
                    t.type === "error"   ? "bg-red-600 text-white" :
                    "bg-gray-800 dark:bg-gray-700 text-white"
                  }`}
                >
                  {t.type === "success" ? <CheckCircle2 size={12} /> : t.type === "error" ? <Trash2 size={12} /> : <HelpCircle size={12} />}
                  {t.msg}
                </div>
              ))}
            </div>
          )}

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700/60 shrink-0">
            {activeArticle ? (
              <button
                onClick={() => setActiveArticle(null)}
                className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-medium transition-colors"
              >
                <ChevronLeft size={14} /> Back to Guides
              </button>
            ) : (
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <HelpCircle size={14} className="text-indigo-500 dark:text-indigo-400" />
                Help & Knowledge Base
              </h3>
            )}
            <button
              onClick={() => { setOpen(false); setActiveArticle(null); }}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* ── Tab bar (only on list view, not inside an article) ─────────── */}
          {!activeArticle && (
            <div className="flex border-b border-gray-200 dark:border-gray-700/60 shrink-0">
              {([
                { key: "guides", icon: <BookOpen size={12} />, label: "Guides", dot: false },
                ...(isAdmin ? [{ key: "progress", icon: <BarChart2 size={12} />, label: "Progress", dot: hasNewProgress }] : []),
              ] as { key: HelpTab; icon: React.ReactNode; label: string; dot: boolean }[]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 relative flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                    tab === t.key
                      ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                      : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {t.icon}{t.label}
                  {t.dot && <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5 shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {/* ── Search bar (guides tab, list view only) ───────────────────── */}
          {!activeArticle && tab === "guides" && (
            <div className="px-3 py-2.5 border-b border-gray-200 dark:border-gray-700/60 shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search guides..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-colors"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Scrollable body ───────────────────────────────────────────── */}
          <div className="overflow-y-auto flex-1">

            {/* ── GUIDES TAB ─────────────────────────────────────────────── */}
            {tab === "guides" && (
              activeArticle ? (
                <div className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-indigo-500 dark:text-indigo-400">{activeArticle.icon}</span>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">{activeArticle.title}</h2>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">{activeArticle.summary}</p>
                  {activeArticle.content}
                </div>
              ) : (
                <div className="py-2">
                  {filteredArticles.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <Search size={24} className="text-gray-400 dark:text-gray-700 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-500">No guides found for</p>
                      <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">"{query}"</p>
                    </div>
                  ) : (
                    filteredArticles.map(article => (
                      <button
                        key={article.id}
                        onClick={() => { setActiveArticle(article); setQuery(""); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors text-left group"
                      >
                        <span className="shrink-0 w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-500 dark:text-indigo-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 transition-colors">
                          {article.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">{article.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{article.summary}</p>
                        </div>
                        <ChevronRight size={14} className="shrink-0 text-gray-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
                      </button>
                    ))
                  )}
                  {!query && (
                    <div className="px-4 pt-3 pb-2 border-t border-gray-200 dark:border-gray-800 mt-1">
                      <p className="text-[11px] text-gray-400 dark:text-gray-600 text-center">
                        {visibleArticles.length} guides · WorshipFlow Help
                      </p>
                    </div>
                  )}
                </div>
              )
            )}

            {/* ── PROGRESS TAB (Admin only) ──────────────────────────────── */}
            {tab === "progress" && isAdmin && (
              <div className="overflow-y-auto flex-1 p-4 space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Track which team members have read each guide. Reads are tracked automatically when a member opens an article.
                </p>
                {loadingReads ? (
                  <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-xs">Loading progress...</span>
                  </div>
                ) : memberProgress.length === 0 ? (
                  <div className="py-10 text-center">
                    <BarChart2 size={28} className="text-gray-300 dark:text-gray-700 mx-auto mb-2" />
                    <p className="text-xs text-gray-500 dark:text-gray-500">No reads recorded yet.</p>
                    <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">Members appear here once they open a guide.</p>
                  </div>
                ) : (
                  memberProgress.map(m => {
                    const count = Math.min(m.readIds.size, totalPublic);
                    const pct = totalPublic > 0 ? Math.round((count / totalPublic) * 100) : 0;
                    const isExpanded = expandedMember === m.email;
                    return (
                      <div key={m.email} className="bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden">
                        <button
                          onClick={() => setExpandedMember(isExpanded ? null : m.email)}
                          className="w-full flex items-center gap-3 p-3 text-left"
                        >
                          {m.photo
                            ? <img src={m.photo} alt={m.name} className="w-8 h-8 rounded-full object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            : <div className="w-8 h-8 rounded-full bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-xs font-bold shrink-0">{m.name[0]?.toUpperCase()}</div>
                          }
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{m.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-indigo-500" : "bg-amber-400"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-500 shrink-0">{count}/{totalPublic}</span>
                            </div>
                          </div>
                          <ChevronDown size={13} className={`shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 grid grid-cols-1 gap-1 border-t border-gray-200 dark:border-gray-700/50 pt-2">
                            {publicArticles.map(a => (
                              <div key={a.id} className="flex items-center gap-2">
                                {m.readIds.has(a.id)
                                  ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                                  : <Circle size={13} className="text-gray-300 dark:text-gray-600 shrink-0" />
                                }
                                <span className={`text-xs truncate ${m.readIds.has(a.id) ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600"}`}>
                                  {a.title}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── SUGGESTIONS TAB ───────────────────────────────────────── */}
            {tab === "suggestions" && (
              <div className="flex flex-col h-full">

                {/* ── Post form with avatar ─────────────────────────────── */}
                <div className="p-3 border-b border-gray-200 dark:border-gray-700/60 shrink-0">
                  <div className="flex gap-2.5 items-start">
                    {/* Poster avatar */}
                    {userPhoto
                      ? (
                        <img
                          src={userPhoto}
                          alt={userName}
                          className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 ring-2 ring-indigo-300/40 dark:ring-indigo-500/30"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )
                      : (
                        <div className="w-8 h-8 rounded-full bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-xs font-bold shrink-0 mt-0.5">
                          {userName?.[0]?.toUpperCase() ?? "?"}
                        </div>
                      )
                    }
                    <div className="flex-1 min-w-0">
                      <textarea
                        value={newSuggestion}
                        onChange={e => setNewSuggestion(e.target.value)}
                        placeholder="Suggest a guide topic — what do you wish you knew how to do in WorshipFlow?"
                        rows={3}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 text-gray-700 dark:text-gray-200 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-colors"
                      />
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-gray-400">{newSuggestion.length > 0 ? `${newSuggestion.length} chars` : "Visible to all team members"}</span>
                        <button
                          onClick={submitSuggestion}
                          disabled={!newSuggestion.trim() || submitting || !userId}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                          {submitting ? "Posting..." : "Post"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Suggestions list ──────────────────────────────────── */}
                <div className="overflow-y-auto flex-1 p-3 space-y-2.5">
                  {loadingSuggestions ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                      <Loader2 size={16} className="animate-spin" />
                      <span className="text-xs">Loading suggestions...</span>
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="py-10 text-center">
                      <Lightbulb size={28} className="text-gray-300 dark:text-gray-700 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-500">No suggestions yet</p>
                      <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">Be the first to request a new guide!</p>
                    </div>
                  ) : (
                    suggestions.map(s => {
                      const isDone = s.status === "done";
                      return (
                        <div
                          key={s.id}
                          className={`rounded-xl border p-3 transition-colors ${
                            isDone
                              ? "bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/40"
                              : "bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700/50"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            {/* Poster avatar */}
                            {s.userPhoto
                              ? (
                                <img
                                  src={s.userPhoto}
                                  alt={s.userName}
                                  className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                                  onError={e => {
                                    const el = e.target as HTMLImageElement;
                                    el.style.display = "none";
                                    const sib = el.nextElementSibling as HTMLElement | null;
                                    if (sib) sib.style.display = "flex";
                                  }}
                                />
                              )
                              : null
                            }
                            {/* Fallback initial circle — always rendered, hidden when photo works */}
                            <div
                              className="w-7 h-7 rounded-full bg-indigo-200 dark:bg-indigo-800 items-center justify-center text-indigo-700 dark:text-indigo-300 text-[10px] font-bold shrink-0 mt-0.5"
                              style={{ display: s.userPhoto ? "none" : "flex" }}
                            >
                              {s.userName?.[0]?.toUpperCase() ?? "?"}
                            </div>

                            <div className="flex-1 min-w-0">
                              {/* Name + time + done badge */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{s.userName || "Team Member"}</span>
                                <span className="text-[10px] text-gray-400">{s.createdAt ? timeAgoShort(s.createdAt) : ""}</span>
                                {isDone && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 flex items-center gap-0.5">
                                    <CheckCircle2 size={9} /> Guide Added
                                  </span>
                                )}
                              </div>

                              {/* Suggestion text — or inline edit field */}
                              {editingId === s.id ? (
                                <div className="mt-1.5 space-y-1.5">
                                  <textarea
                                    value={editText}
                                    onChange={e => setEditText(e.target.value)}
                                    rows={3}
                                    autoFocus
                                    className="w-full text-xs px-2.5 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-indigo-400 dark:border-indigo-500 text-gray-700 dark:text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-colors"
                                  />
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => saveEdit(s.id)}
                                      disabled={!editText.trim()}
                                      className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                                    >
                                      <CheckCircle2 size={11} /> Save
                                    </button>
                                    <button
                                      onClick={() => setEditingId(null)}
                                      className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    >
                                      <X size={11} /> Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{s.text}</p>
                              )}

                              {/* Action row: Edit + Delete (own post or admin) | Admin green check */}
                              {(isAdmin || s.userId === userId) && editingId !== s.id && (
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  {/* Admin mark-done check */}
                                  {isAdmin && (
                                    <button
                                      onClick={() => updateSuggestionStatus(s.id, isDone ? "pending" : "done")}
                                      className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-all ${
                                        isDone
                                          ? "bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-900/20 hover:text-red-500 dark:hover:text-red-400"
                                          : "bg-gray-100 dark:bg-gray-700/80 text-gray-500 dark:text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-400"
                                      }`}
                                      title={isDone ? "Unmark as resolved" : "Mark as resolved"}
                                    >
                                      <CheckCircle2 size={11} className={isDone ? "text-emerald-500" : ""} />
                                      {isDone ? "Unmark" : "Resolve"}
                                    </button>
                                  )}

                                  {/* Separator for admin */}
                                  {isAdmin && <span className="text-gray-300 dark:text-gray-600 text-[10px]">·</span>}

                                  {/* Edit button */}
                                  <button
                                    onClick={() => { setEditingId(s.id); setEditText(s.text); }}
                                    className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700/80 text-gray-500 dark:text-gray-400 font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                  >
                                    <Pencil size={10} /> Edit
                                  </button>

                                   {/* Delete button → triggers confirmation */}
                                  {deletingId === s.id ? (
                                    <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg px-2 py-1">
                                      <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">Sure?</span>
                                      <button
                                        onClick={() => deleteSuggestion(s.id)}
                                        className="text-[10px] px-2 py-0.5 rounded-md bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors"
                                      >
                                        Yes, delete
                                      </button>
                                      <button
                                        onClick={() => setDeletingId(null)}
                                        className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-semibold hover:bg-gray-200 transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeletingId(s.id)}
                                      className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700/80 text-gray-500 dark:text-gray-400 font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                    >
                                      <Trash2 size={10} /> Delete
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
