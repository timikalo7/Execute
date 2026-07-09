# Setup

## 1. Install Claude Code

Claude Code needs a current Node.js (LTS recommended). Install globally:

```
npm install -g @anthropic-ai/claude-code
```

Then run `claude` inside this folder. You can also use Claude Code in VS Code or JetBrains, or drive it remotely from the Claude app. For the latest install steps and Node version, see the docs: https://docs.claude.com/en/docs/claude-code/overview

On first run, Claude Code reads `CLAUDE.md` automatically — that's what turns this folder into Execute. The `/kickoff`, `/approve`, and other commands appear in the `/` autocomplete.

## 2. Run it hands-off

The build phase writes many files and runs commands. To let Execute run without approving each step, turn on **auto-accept edits** (press `Shift+Tab` to cycle to that mode). Without it, Execute still works but pauses for file/command permissions. Use a skip-permissions mode only if you understand the risk.

## 3. Accounts & keys

Execute builds only from the tool library, and most of those tools are free, open-source, or have free tiers. Account-gated services can't be provisioned for you. When a project needs one, Execute:

1. wires the integration in code,
2. lists the exact keys in `projects/<name>/SETUP-KEYS.md`,
3. keeps building everything that doesn't depend on them.

Copy `.env.example` to `.env`, drop your keys in, and the deployment finishes.

## 4. Models & cost

Long autonomous builds use a lot of tokens — keep an eye on usage. You can set a per-command model in any command's frontmatter (e.g. a cheaper model for `/status`) if you want to economize.

## 5. Where things land

- Ideas you add → `ideas/`
- Everything Execute produces before approval → `potential-projects/<name>/`
- The running project → `projects/<name>/`

Run `/status` any time to see where every project stands.
