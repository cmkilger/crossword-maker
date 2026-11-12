# Crossword Maker

A classroom crossword worksheet creator. Enter your answers and clues, watch the preview take shape, and print or download a worksheet and answer key.

**[Open Crossword Maker](https://cmkilger.github.io/crossword-maker/)**

- Automatic across/down layout with a live preview and background search
- Black blocks for compact grids, open gaps for looser layouts, and adaptive clue columns when needed
- Optional title, name, class period, date, and clue answer lines
- Letter, Legal, A4, and A5; readable single-page output
- Separate answer key; vector PDF downloads and printing
- Multiple puzzles, duplication, autosave, and confirmed deletion
- Bulk paste: answer and clue separated by a comma, tab, or spaces, one pair per line without a header; answers can be lowercase or uppercase
- JSON backup and import; importing keeps existing puzzles
- Light, dark, and system appearance
- Browser-local IndexedDB storage; no account, server, analytics, or uploaded puzzle data

Answers must contain A–Z only. Lowercase is converted; spaces, punctuation, accented letters, and digits are flagged. Entries that cannot be placed are listed. Incomplete or unreadable worksheets cannot be exported until corrected. Empty input rows are drafts and do not count as entries.

## Development

Node.js 22.12+ (or Node.js 24 LTS) and npm:

```sh
npm ci
npm run dev
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run preview
```

`dist/` is a static site, with relative asset paths suitable for GitHub Pages. All runtime dependencies and the worksheet font are hosted with the app.

## Releases and deployment

Publish a GitHub release from a version tag (for example `v1.0.1`). The **Deploy release to GitHub Pages** workflow checks out that release tag, installs dependencies, runs generator and browser tests, builds, and deploys the artifact to Pages. Ordinary pushes run CI without publishing. A workflow-dispatch fallback can redeploy an existing release tag. Enable **Settings → Pages → Source → GitHub Actions** when forking. In the `github-pages` environment, allow release tags matching `v*` as deployment sources (GitHub initially allows only `main`).

The release workflow accepts stable published releases only. Do not use a prerelease as a production deployment.

## How layout search works

The generator first tries a constraint search for a dense, fully checked grid, where every letter belongs to both an across and a down answer. If the supplied word list cannot form such a grid or the bounded search finds no solution, it falls back to an open-grid search using valid letter intersections, scored candidate placements, bounded backtracking, and randomized restarts. A worker searches for up to 1.6 seconds after a 450 ms typing debounce. The preview receives improvements during search. Clue and formatting changes preserve geometry. Regenerate tries new choices; search is heuristic and does not prove an optimal layout or that every unplaced answer is impossible. Layouts prioritize answer coverage, then intersections and compactness. A shared point-based renderer lays out the preview and PDF, shrinking clue type from 12 to 9 pt and refusing grids below a 13 pt cell size. No filler answers are invented.

See [requirements](docs/requirements/product.md) for expected behavior and verification references.

## Privacy and backups

Puzzles, defaults, and appearance are stored in this browser for this site's origin. They do not sync between devices, and clearing browser data can remove them. Use **Back up all** to save a portable JSON copy. Import never replaces existing puzzles. A storage failure is shown visibly; export a backup before leaving if it occurs.

## License and credits

Application code: [BSD 3-Clause](LICENSE), copyright Cory Kilger.

Noto Sans: SIL Open Font License, included at [public/fonts/LICENSE.txt](public/fonts/LICENSE.txt). jsPDF and other bundled dependencies retain their respective licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Algorithm background: [Automation Strategies for Unconstrained Crossword Puzzle Generation](https://arxiv.org/abs/2007.04663), Charu Agarwal and Rushikesh K. Joshi. The implementation is original.
