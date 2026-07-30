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

Missing-dependency probe marker.
