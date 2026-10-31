# CubeLab v1 — GitHub Pages speedcubing timer

A privacy-first, zero-dependency speedcubing practice timer and statistics dashboard. Designed for 3×3, 4×4, and 5×5 training before Zephyr Cube Bash 2027.

## Features

- **Manual entry:** solve with your QiYi physical timer, then input a time such as `9.66`, `39.99`, `1:27.30`, or `87.30`. Press Enter or click **Save solve**.
- **Keyboard timing:** choose **Keyboard timer**, hold Space, release to start; press Space to stop and save. Escape cancels. A hold/tap button also works on touch devices.
- **Independent events:** 3×3, 4×4, and 5×5 each have separate solve histories.
- **Statistics:** mean of today's valid solves, best single, latest Ao5/Ao12/Ao50/Ao100, best rolling averages, and a performance trend chart.
- **Penalties:** choose +2 or DNF when entering a manual time; cycle a saved solve's penalty by clicking its penalty button.
- **Scrambles:** random-move practice scrambles. **These are not official WCA random-state scrambles.** You may use an external competition scrambler instead.
- **Data storage:** local browser storage; no account or external service.
- **Data portability:** full JSON backup and import; CSV export for analysis by ChatGPT/Excel.
- **Day 1 baseline:** click **Load Day 1 times** to add the 50×3×3, 5×4×4, and 1×5×5 times previously provided.

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

## Security and data limitations

- Stored data is **per browser and device**, not synced across devices. Export JSON backups frequently. Clearing browser data can erase solves.
- The app does **not currently connect to the QiYi timer hardware**; use manual entry or the keyboard timer.
- The app does **not directly connect to ChatGPT**. Export CSV/JSON and upload the file in chat for coaching and longitudinal analysis.
- Do **not** add an OpenAI API key to these static files or commit it to GitHub. Adding an AI backend later requires a server-side endpoint and suitable authentication/storage.
- Keyboard/browser timing and random-move scrambles are for practice, not official WCA timekeeping.

## Import and export

The **Backup JSON** output is a portable, versioned structure: `{ "app": "CubeLab", "version": 1, "solves": [...] }`. Imported solves are merged by unique IDs. CSV export includes `event`, `date`, `timestamp`, `time_seconds`, `base_time_seconds`, `penalty`, `result`, `source`, `notes`, and `scramble`.

## Near-term upgrades

Possible additions: inspection +15/+17 penalty timing, stage splits, session tags, keyboard rebindings, official scramble generation using a scrambler library, online sync, hardware integration, and an MCP/API service for direct ChatGPT access.
