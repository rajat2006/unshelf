# Issue #435 acceptance evidence

## Production bundle delta

Measured with `pnpm turbo run build --filter=@unshelf/web...` before and after
adding React DayPicker 10.0.1 (and its date-fns dependency) and the themed
desktop calendar. Vite's production output reported:

| Asset | Before | After | Delta |
| --- | ---: | ---: | ---: |
| JavaScript | 534,489 B | 618,879 B | +84,390 B (+15.8%) |
| JavaScript gzip | 160.62 kB | 185.62 kB | +25.00 kB (+15.6%) |
| CSS | 56,082 B | 62,185 B | +6,103 B (+10.9%) |
| CSS gzip | 10.42 kB | 11.18 kB | +0.76 kB (+7.3%) |

The existing single-chunk Vite build remains above its advisory 500 kB warning;
ADR-0019 explicitly accepts nontrivial bundle weight and the PRD defines no
numeric bundle budget.
