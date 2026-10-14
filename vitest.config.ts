import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Claude Code worktrees hold full copies of the repo, tests included.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
