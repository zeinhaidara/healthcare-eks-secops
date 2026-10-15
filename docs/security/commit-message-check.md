# Commit message check

The workflow `.github/workflows/commit-message-check.yml` runs on every pull request into `dev`. It reads each commit message in the pull request and fails if any of them credits someone other than the repository owner.

## What it blocks

A commit fails if its message has any of these lines:

- a line that starts with `Co-authored-by:` (any letter case), unless its value exactly matches the repository variable `ALLOWED_COAUTHOR`;
- a line that contains `Generated with`;
- a line that starts with a session trailer (a `-Session:` line from an AI tool).

Merge commits are skipped. A failing run prints only the failing commit hashes and the offending lines. A passing run prints nothing.

## Why

Only the owner is credited, in commits and in pull requests. Trailers that name a tool or another author change who the repository says wrote the work, and they cannot be removed later without rewriting history.

## Set `ALLOWED_COAUTHOR`

The owner sets this in the repository settings: Settings, Secrets and variables, Actions, Variables, new repository variable `ALLOWED_COAUTHOR`. The value is the exact text after `Co-authored-by:` (leading and trailing spaces are ignored), for example `Name <email>`.

- If the variable is not set, every `Co-authored-by:` line fails.
- Only one value is allowed. No name or email is stored in the workflow file.
- GitHub adds `Co-authored-by:` lines itself when a pull request is squash merged, but that happens after the check ran on the pull request commits.

The check is not a required status check until the owner adds `commit-message-check` to the `dev` ruleset. Until then it reports a result but does not block the merge button.

## Fix a failing commit

Fix it on the feature branch only, never on `dev` or `main`.

- Last commit: `git commit --amend`, delete the offending line, save.
- An earlier commit: `git rebase -i origin/dev`, mark the commit `reword`, delete the offending line, save.
- Then push the branch with `git push --force-with-lease origin <branch>`. The check runs again on the new commits.

Commits already on `dev` or `main` that carry such lines are not changed by this check.
