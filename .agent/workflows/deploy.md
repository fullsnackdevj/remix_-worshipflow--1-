---
description: Deploy the app and push changes to GitHub
---

// turbo-all

## Deploy Workflow

Follow these steps every time the user asks to deploy or wants changes pushed to GitHub.

### Step 1 — Checkpoint commit (ALWAYS do this before making any changes)
Run this at the very START of every session before touching any files:
```bash
git add -A && git commit -m "checkpoint: pre-session backup $(date '+%Y-%m-%d %H:%M')" && git push
```
If there's nothing to commit, that's fine — it will say "nothing to commit" and that's OK.

### Step 2 — Make the requested changes
Apply all the code changes the user asked for.

### Step 3 — Build to verify no errors
```bash
npm run build
```
Do NOT proceed to commit if the build fails. Fix errors first.

### Step 4 — Commit and push the finished work
```bash
git add -A && git commit -m "feat: [describe what was done]" && git push
```

### Step 5 — Confirm to the user
Tell the user:
- ✅ Changes are live on GitHub
- ✅ Netlify will auto-deploy shortly (usually 1-2 minutes)
- 🔁 If anything goes wrong, we can restore with: `git reset --hard HEAD~1`
