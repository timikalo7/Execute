# Running Execute on GitHub Codespaces

You'll keep two repos:

- **`execute` (public)** — the clean engine others use. Set up as a *template repository*. No personal memory, no built projects.
- **`execute-personal` (private)** — your working copy. Memory accumulates here; commit it so learning persists.

---

## A. Create the public template repo
1. On github.com → **New repository** → name it `execute`, set **Public**, tick **Add a README**.
2. Open it: green **Code** button → **Codespaces** tab → **Create codespace on main**.
3. Drag `execute.zip` from your computer into the file explorer (left panel). Then in the terminal:
   ```
   unzip execute.zip
   shopt -s dotglob && mv execute/* . && rm -rf execute execute.zip
   ```
   (The `dotglob` line moves the contents — including the hidden `.claude` and `.devcontainer` folders — up to the repo root.)
4. Commit & push:
   ```
   git add -A && git commit -m "Execute engine" && git push
   ```
5. Repo **Settings** → tick **Template repository**.

## B. Create your personal repo from the template
1. On the public `execute` repo → **Use this template** → **Create a new repository** → name it `execute-personal`, set **Private**.
2. You now have a clean copy to actually work in.

## C. Work in Codespaces
1. Open `execute-personal` → **Code** → **Codespaces** → **Create codespace**. The devcontainer installs Node + Claude Code automatically — wait for "Finishing up..." to complete.
2. In the terminal, run `claude` and follow the sign-in prompt (your Claude subscription or an API key).
3. Claude reads `CLAUDE.md` and becomes Execute. Type `/` to see the commands.
4. Run it: `/kickoff ideas/lifeos-engine.md` → review the plan → `/approve`. Press **Shift+Tab** first to turn on auto-accept so it builds hands-off.

## D. Make learning persist (important)
Codespaces are disposable. After Execute learns, commit memory so the next session remembers:
```
git add -A && git commit -m "memory + build" && git push
```
Your `memory/` folder is what makes Execute compound — keep it committed in the **personal** repo.

## E. Keep the public repo clean
Do your real work in `execute-personal`. When you improve the engine itself (`CLAUDE.md`, `.claude/agents/`, `.claude/commands/`, `execute.md`), copy those files over to the public repo and push. **Never** push your personal `memory/` or `projects/` to the public repo.

## Notes
- **Secrets:** `.env` is gitignored, so keys never get committed. For values you want to persist across Codespaces, use repo **Settings → Secrets and variables → Codespaces**.
- **Cost:** Codespaces has a free monthly allowance on personal accounts; Claude Code usage runs on your Claude subscription or API credits.
