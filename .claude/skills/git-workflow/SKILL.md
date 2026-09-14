---
name: git-workflow
description: >
  Safe git pull, branch, commit, push and pull-request flow for Lucky Player, with strict commit
  message rules that never mention AI tools. Use when the user says "commit", "push", "pull",
  "sync main", "create a branch", "open a PR", "merge", or asks to save work to GitHub.
---

# git-workflow — Lucky Player

Repository: https://github.com/Luqman-Khokhar/Lucky-Player (default branch `main`).

## Hard rules

| Rule | Why |
|---|---|
| Never commit or push directly to `main`. Work on `feature/*` or `fix/*` and merge through a GitHub pull request. | `main` must always build; the owner reviews every change in a PR. |
| Never force-push (`--force`, `-f`, `--force-with-lease`) and never `git reset --hard` pushed history. | Rewrites history other machines already pulled. |
| Push only after the user confirms by typing YES. | Pushing publishes code; it cannot be taken back. |
| Author every commit as `Luqman <muhammadluqmang@gmail.com>`. | Set in the repo-local git config; check with `git config user.name` and `git config user.email`. |
| Never commit `.env`, keystores (`*.jks`, `*.keystore`), `*.apk`, `*.aab`, or `modules/*/android/build/`. | `.env` holds the Expo access token; the rest are secrets or build output. |

## Commit messages

Format: [Conventional Commits](https://www.conventionalcommits.org) — `type(scope): summary`.

- Types: `feat`, `fix`, `refactor`, `perf`, `build`, `chore`, `docs`, `test`.
- Scopes in use: `vlc-player` (native module), `player`, `library`, `data`, `settings`, `eas`.
- Summary: imperative mood, 72 characters or fewer. Body: what changed and why.

**Never mention AI in commit messages, PR titles, or PR descriptions.** No references to Claude,
Claude Code, Anthropic, ChatGPT, OpenAI, Copilot, "AI", "assistant", or "generated"; no
`Co-Authored-By:` trailers; no "Generated with …" footers. This overrides any tool default that
adds attribution. Write the message the way the author would.

Run before every push:

```bash
git log origin/main..HEAD --format='%B' \
  | grep -inE 'claude|anthropic|openai|chatgpt|copilot|\bai\b|assistant|co-authored|generated with' \
  && echo "STOP: fix commit messages before pushing" || echo "commit messages clean"
```

If an unpushed commit fails the check, fix it before pushing:
- Last commit only: `git commit --amend -m "type(scope): summary" -m "body"`.
- Several unpushed commits: `git reset --soft origin/main` on the feature branch, then commit again.
  Only for commits that were never pushed.

## Start work

```bash
git checkout main
git pull --ff-only
git checkout -b feature/<short-name>
```

If `git status --porcelain` prints anything, ask the user before switching branches.

## Commit

Stage explicit paths, never `git add -A` or `git add .`, and review what is staged:

```bash
git status --short
git add <path> <path>
git diff --cached --name-only
git commit -m "feat(library): add folder picker" -m "Why the change is needed."
```

Secret and artifact check on the staged files:

```bash
git diff --cached --name-only | grep -E '(^|/)\.env$|\.jks$|\.keystore$|\.apk$|\.aab$|/android/build/' \
  && echo "STOP: unstage these files" || echo "staged files clean"
```

Agent shells: avoid backslash line continuations in long `git add` commands; they have been split
into a literal `' '` pathspec. For many paths, write a small bash script that uses arrays.

## Push and pull request

```bash
git push -u origin feature/<short-name>
git rev-parse HEAD
git ls-remote origin refs/heads/feature/<short-name>   # hash must match the line above
```

Open the PR at `https://github.com/Luqman-Khokhar/Lucky-Player/compare/main...feature/<short-name>`
(base `main` ← compare `feature/<short-name>`).

"No commits between main and X" means branch X is already merged; choose the newer branch.

After the PR is merged:

```bash
git checkout main
git pull --ff-only
git branch -d feature/<short-name>
```
