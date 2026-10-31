# CubeLab v3 — GitHub Pages speedcubing timer + custom targets

A privacy-first, zero-dependency speedcubing practice timer and statistics dashboard. Designed for 3×3, 4×4, and 5×5 training before Zephyr Cube Bash 2027.

## Features

- **Manual entry:** solve with your QiYi physical timer, then input a time such as `12.34`, `34.56`, or `1:23.45`. Press Enter or click **Save solve**.
- **Keyboard timing:** choose **Keyboard timer**, hold Space, release to start; press Space to stop and save. Escape cancels. A hold/tap button also works on touch devices.
- **Independent events:** 3×3, 4×4, and 5×5 each have separate solve histories.
- **Statistics:** mean of today's valid solves, best single, latest Ao5/Ao12/Ao50/Ao100, best rolling averages, and a performance trend chart.
- **Custom goals:** click **⚙ Edit goals** to customize each event’s competition Ao5 threshold, two milestone targets/dates, stretch threshold, and training consistency metric (latest Ao5/Ao12/Ao50). Customize the competition date and countdown.
- **Recommended template:** Nov 15 / Dec 15 / Jan 16 checkpoints are already populated; click **Restore 11-week template** in the editor to start from them.
- **Penalties:** choose +2 or DNF when entering a manual time; cycle a saved solve's penalty by clicking its penalty button.
- **Scrambles + cube diagram:** automatically generated random-move scrambles for 3×3 (20 moves), 4×4 (44 moves), and 5×5 (60 moves). Click **New scramble** whenever you want. A fully simulated **2D unfolded cube net** shows the exact result of each scramble, including 4×4 and 5×5 wide moves. White is U, green is F. Both the notation and diagram advance after recording a solve. **These are not official WCA random-state scrambles**; use official competition scrambles when reproducing WCA conditions.
- **Data storage:** local browser storage; no account or external service.
- **Data portability:** full JSON backup and import (includes your custom goals); CSV solve export for analysis by ChatGPT/Excel.

## Suggested starting goal template

| Event | Checkpoint 1 (Nov 15, 2026) | Checkpoint 2 (Dec 15, 2026) | Competition (Jan 16, 2027) | Stretch | Training benchmark |
|---|---:|---:|---:|---:|---|
| 3×3 | Sub-9.30 | Sub-8.50 | Sub-8.00 | Sub-7.50 | Latest Ao50 |
| 4×4 | Sub-35.50 | Sub-32.00 | Sub-30.00 | Sub-28.00 | Latest Ao12 |
| 5×5 | Sub-1:20.00 | Sub-1:10.00 | Sub-1:00.00 | Sub-55.00 | Latest Ao12 |

Targets are illustrative training checkpoints and can be changed at any time. A **competition target** is considered achieved when the most recent WCA-style Ao5 is **strictly below** the entered time (e.g. 7.99 beats sub-8.00; 8.00 does not). Milestone targets use the event’s chosen rolling Ao5/Ao12/Ao50. A checkpoint without sufficient recorded solves will say how many solves are needed.

Goals are stored in a separate browser `localStorage` key (`cubelab-goals-v2`). Existing solves remain in the unchanged `cubelab-solves-v1` key, so updating the published site **does not reset your previous solve history** on the same URL/browser profile. Uploading new site files to GitHub does not publish local data.

## Run locally

Open `index.html` in a modern web browser. For a local server, in this folder run:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish for free with GitHub Pages

1. Create a new GitHub repository, e.g. `cubelab`.
2. Upload **index.html**, **styles.css**, and **app.js** to the repository root (README.md is optional).
3. In the repository's **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. GitHub will provide a website URL like `https://YOUR_USERNAME.github.io/cubelab/` once deployment completes.

No API keys, package installs, build step, or hosting fees are needed for this static frontend.

## Import your private Day 1 times

The public website does **not** bundle any personal solve history. If you have a private
CubeLab Day 1 JSON import file, keep it **outside this repository** on your own device.
After deploying, use **Import JSON** in CubeLab to load that file locally in your browser.
**Never commit exported CSV/JSON solve history to a public GitHub repository.**

## Security and data limitations

- **Public repository contents are public.** The app contains no personal solve records in its source code.
- Stored data is **per browser and device**, not synced across devices. Export JSON backups frequently. Clearing browser data can erase solves.
- The app does **not currently connect to the QiYi timer hardware**; use manual entry or the keyboard timer.
- The app does **not directly connect to ChatGPT**. Export CSV/JSON and upload the file in chat for coaching and longitudinal analysis.
- Do **not** add an OpenAI API key to these static files or commit it to GitHub. Adding an AI backend later requires a server-side endpoint and suitable authentication/storage.
- Keyboard/browser timing and random-move scrambles are for practice, not official WCA timekeeping.

## Import and export

The **Backup JSON** output is a portable, versioned structure: `{ "app": "CubeLab", "version": 3, "goals": {...}, "solves": [...] }`. Imported solves are merged by unique IDs; if an import also contains goals, CubeLab asks before overwriting the current goal settings. Older v1 solve backups still import. CSV export includes `event`, `date`, `timestamp`, `time_seconds`, `base_time_seconds`, `penalty`, `result`, `source`, `notes`, and `scramble`.

## Updating from CubeLab v1 or v2

Replace `index.html`, `styles.css` and `app.js` in your existing GitHub Pages repository with the v2 files and publish. The local solve storage key is unchanged, and no solve history is bundled in this public-safe project. Your private Day 1 file can still be imported in the browser. Keep your JSON/CSV backups off the public repo.

## Near-term upgrades

Possible additions: inspection +15/+17 penalty timing, stage splits, session tags, keyboard rebindings, official WCA-quality scramble generation using a dedicated scrambling library, online sync, hardware integration, and an MCP/API service for direct ChatGPT access.

## Two-dimensional net verification

The scrambler and 2D diagram are in `app.js`. The net is computed from a sticker-level 3D cube simulation; it is not an unrelated image. Each supported turn and wide turn updates the sticker positions and orientations. Colors: U white, D yellow, F green, B blue, R red, L orange. The six faces are laid out as:

```text
      U
  L   F   R   B
      D
```

All scramble data remains stored locally with each recorded solve as before. No image API, account, network request, or external library is required. This version was checked with automated move/inverse and browser interaction tests for all three cube sizes.
