---
description: Deploy the app — supports staging (test) and production (live) deploys
---

// turbo-all

## Deploy Workflow

Follow these steps every time the user asks to deploy or push changes.

---

### 🧪 STAGING deploy (test before going live)

Use this when the user says "deploy to staging", "test this on staging", or "push to staging".

#### Step 1 — Build to verify no errors
```bash
npm run build
```
Do NOT proceed if build fails. Fix errors first.

#### Step 2 — Switch to staging branch and merge from main
```bash
git checkout staging && git merge main && git push origin staging
```

#### Step 3 — Switch back to main
```bash
git checkout main
```

#### Step 4 — Confirm to the user
Tell the user:
- ✅ Changes are on the `staging` branch
- 🌐 Staging URL: **https://staging.worshipflow.dev**
- ⏱ Netlify will deploy the staging site in ~1-2 minutes
- 🔁 To roll back staging: `git checkout staging && git reset --hard HEAD~1 && git push --force`

---

### 🚀 PRODUCTION deploy (go live)

Use this when the user says "deploy", "go live", "push to production", or "release".

#### Step 1 — Checkpoint commit (always run this first)
```bash
git add -A && git commit -m "checkpoint: pre-session backup $(date '+%Y-%m-%d %H:%M')" && git push
```
If nothing to commit, that's fine.

#### Step 2 — Make the requested changes
Apply all the code changes the user asked for.

#### Step 3 — Build to verify no errors
```bash
npm run build
```
Do NOT proceed if build fails. Fix errors first.

#### Step 4 — Commit and push to main (production)
```bash
git add -A && git commit -m "feat: [describe what was done]" && git push origin main
```

#### Step 5 — Confirm to the user
Tell the user:
- ✅ Changes are live on GitHub → `main` branch
- 🌐 Production URL: **https://worshipflow.dev** (auto-deploys via Netlify)
- ⏱ Netlify will deploy in ~1-2 minutes
- 🔁 To roll back: `git reset --hard HEAD~1 && git push --force`
