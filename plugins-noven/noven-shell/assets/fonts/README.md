# Bundled fonts

Two OFL fonts ship with the shell so the front door renders the approved type
on every platform, not only where the user has installed them.

- `../source-han-sans-650.woff2` — Source Han Sans SC (思源黑体) 2.005R,
  variable font instanced at weight 650 and subset to the creation-title
  character set (17 KB instead of the 36 MB source). Used for the typed
  headline. License: `OFL-SourceHanSans.txt`.
- `../wenkai-quote.woff2` — LXGW WenKai (霞鹜文楷) v1.530 Regular, subset to the
  characters used by the input placeholder quote pool (99 KB instead of the
  25 MB source). OFL permits this web-only subset conversion. Used for the
  rotating inspiration line and novel carousel. License: `OFL-LXGWWenKai.txt`.

Served by `/api/noven-assets` with `font/woff2`; both faces load with
`font-display: swap`.
