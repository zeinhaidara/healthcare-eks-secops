# CLAUDE.md

## Writing style

PR descriptions
- Keep the whole description under 15 lines.
- Use three parts only: Summary (2 to 3 short bullets), Checks (one line per check that actually ran, with the result), and Apply notes (only if someone must act after merge).
- Do not restate the diff, list every file, or explain the full history. Link to the runbook or the PR for detail.
- Plain sentences. No headings beyond those three.

Code comments
- Write a comment only when the reason is not obvious from the code.
- One line per comment. No multi-paragraph blocks.
- Do not mention PR numbers, dates, incidents, or who asked for the change. That history belongs in the PR or in docs/runbooks.
- Do not describe what the code does if the code already says it.

Commit messages
- Subject line under 72 characters, then at most 3 short lines of body.

Docs
- Match the tone of the existing files in docs/runbooks: short sentences, no filler.
