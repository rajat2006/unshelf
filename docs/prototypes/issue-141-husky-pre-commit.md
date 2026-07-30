# Prototype: staged-only pre-commit checks

This throwaway prototype answers whether Husky and lint-staged can run Unshelf's
ESLint and Prettier policies against only staged files while preserving partially
staged edits, remaining bypassable, skipping installation in CI, and not blocking
an uninstalled worktree.

Run the candidate without creating a commit:

```bash
pnpm run prototype:pre-commit
```

The Git-native `git diff --cached --check` runs last against the final staged
snapshot.

## Results

### Verdict

The candidate is viable with a staged-only contract:

1. hide all unstaged tracked changes;
2. run typed ESLint with fixes on staged product TypeScript and TSX;
3. run Prettier on all staged files, respecting `.prettierignore`;
4. run `git diff --cached --check` against the resulting index.

ESLint and Prettier must run serially because both can edit a TypeScript file.
The full workspace must have been installed before typed ESLint runs.

### Compatibility

- Husky `9.1.7` supports Node 18 and newer.
- The initial lint-staged `17.2.0` rejection was solely a mismatch with
  Unshelf's former Node `>=22.13` floor: lint-staged 17 requires Node
  `>=22.22.1`.
- Unshelf's candidate runtime is now Node `>=24`, using the latest LTS line in
  package metadata, GitHub Actions, and production Docker builds.
- lint-staged `17.2.0` passed the same staged-file, partial-staging, failure
  rollback, and multi-workspace probes under Node `24.18.0`. It supersedes the
  temporary `16.4.0` choice.
- An ordinary fresh `pnpm install` ran the CI-aware `prepare` script, set
  `core.hooksPath` to `.husky/_`, and installed the hook automatically.
- A fresh install with `CI=true` completed without setting `core.hooksPath` or
  creating `.husky/_`. This is also the GitHub Actions/Sandcastle path.

### Behavior

- ESLint changed a staged `let` to `const`; Prettier then normalized the final
  layout and lint-staged updated the index.
- A file with both staged and unstaged edits committed only the staged edit,
  while the unstaged edit was restored byte-for-byte.
- `--hide-unstaged` also hid deliberately invalid changes in a different
  tracked file while the staged file was checked, so typed lint evaluated the
  intended tracked snapshot instead of unrelated work.
- A deliberate ESLint error blocked the commit and lint-staged restored the
  original index and worktree.
- A conflict marker in ignored Markdown passed through Prettier but was blocked
  by `git diff --cached --check`.
- `git commit --no-verify` bypassed the hook successfully.
- In a worktree whose Husky launcher existed but whose dependencies were
  unavailable, the hook warned, skipped lint-staged, still ran the Git-native
  check, and allowed a clean commit.
- A separate worktree with neither dependencies nor the generated Husky
  launcher committed normally despite the repository-wide `core.hooksPath`.
  Such a worktree receives no hook feedback until it runs `pnpm install`, but it
  is not blocked.

### Timings

Measured on the local prototype. The first group is the final lint-staged
`17.2.0` candidate running on Node `24.18.0`; the remaining environment and
Git-native timings came from the initial compatibility probe.

| Scenario | Wall time |
| --- | ---: |
| lint-staged 17: one staged shared TypeScript file | 1.94 s |
| lint-staged 17: partially staged TypeScript file | 1.86 s |
| lint-staged 17: API, web, and shared TypeScript files | 3.37 s |
| lint-staged 17: expected ESLint failure and rollback | 1.76 s |
| Initial configuration-only staged commit | 2.22 s |
| Expected Git conflict-marker failure | 0.32 s |
| Valid commit with lint-staged unavailable | 0.09 s |
| Explicit `--no-verify` bypass | 0.05 s |
| Worktree with no generated hook or dependencies | 0.02 s |

The ordinary one-file path and the measured three-workspace path are below the
five-second budget.

### Important setup finding

Typed ESLint produced cascading unresolved-type errors when only the root hook
tools were linked and the product workspace dependencies were absent. A complete
root `pnpm install` resolved the same staged files cleanly. The implementation
must therefore:

- install the complete workspace before accepting timing or lint results;
- avoid `pnpm exec` inside the hook because pnpm may attempt an interactive
  repair of an incomplete installation;
- call the already-installed `lint-staged` binary from Husky's augmented
  `PATH`; and
- warn and fall back to the Git-native staged check when the hook tool is
  unavailable.
