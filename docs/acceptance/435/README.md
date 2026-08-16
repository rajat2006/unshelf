# Issue #435 acceptance evidence

## Production bundle delta

Measured with `pnpm turbo run build --filter=@unshelf/web...` before and after
adding React DayPicker 10.0.1, date-fns 4.4.0, and the themed desktop calendar.
Vite's production output reported:

| Asset | Before | After | Delta |
| --- | ---: | ---: | ---: |
| JavaScript | 534,489 B | 617,943 B | +83,454 B (+15.6%) |
| JavaScript gzip | 160.62 kB | 185.38 kB | +24.76 kB (+15.4%) |
| CSS | 56,082 B | 61,151 B | +5,069 B (+9.0%) |
| CSS gzip | 10.42 kB | 11.08 kB | +0.66 kB (+6.3%) |

The existing single-chunk Vite build remains above its advisory 500 kB warning;
ADR-0019 explicitly accepts nontrivial bundle weight and the PRD defines no
numeric bundle budget.
