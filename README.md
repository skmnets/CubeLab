# CubeLab v4 — Intelligent Speedcubing Analytics & Personalized Training

A privacy-first, zero-dependency, statistically rigorous speedcubing analytics, coaching, and training platform. Designed for 3×3, 4×4, and 5×5 training leading into Zephyr Cube Bash 2027.

Operates 100% in the user's browser with zero live AI calls, zero external databases, zero tracking, and $0 monthly infrastructure cost.

**Live Website:** [https://skmnets.github.io/CubeLab/](https://skmnets.github.io/CubeLab/)

---

## What's new in v4

CubeLab has evolved from a clean speedcubing timer into a full personal training and analytics studio:

1. **Deep Performance Analytics:**
   - Descriptive statistics: sample mean, median, sample standard deviation ($s$), coefficient of variation ($CV$), interquartile range ($IQR$), DNF%, +2 frequency, and percentiles ($P_{10}, P_{25}, P_{50}, P_{75}, P_{90}$).
   - WCA-style trimmed average algorithm (Ao5, Ao12, Ao50, Ao100) with robust single and multi-DNF handling.
   - Interactive, responsive, dependency-free SVG progression curves and solve-time distribution histograms.
   - **Comparative Analytics & Welch's Two-Sample t-test:** Statistically tests whether differences between sessions (e.g. Last 25 vs Prior 25, First 50 vs Last 50, This Week vs Last Week) are statistically significant ($\alpha = 0.05$) or within normal random variance.

2. **Intelligent Goal Tracking & Forecast Modeling:**
   - Linear regression trendlines over chronological rolling averages.
   - Computes current weekly improvement rate vs required rate to reach competition targets by January 16, 2027.
   - Projects goal attainment dates with 95% standard-error confidence intervals ($R^2$ and residual standard error).
   - Safeguards against overconfidence on small samples ($N < 15$) or flat/regressing trajectories.

3. **Stage-Specific Performance Splits:**
   - **3×3 CFOP:** Cross, F2L, Last Layer (LL).
   - **4×4 Yau:** First 2 Centers (F2C), First 3 Edges (F3E), Last 4 Centers (L4C), Edge Pairing (3-2-3), 3×3 Stage.
   - **5×5 Yau:** Centers, Cross Edges, Edge Pairing, 3×3 Stage.
   - Validates that stage splits sum to total solve time ($\pm 2$ cs margin).
   - Identifies dominant bottlenecks where a stage exceeds expected WCA speedcubing percentage benchmarks.

4. **Explainable CubeLab Coach:**
   - Fully deterministic, transparent rule engine—not a generic LLM wrapper or black-box chatbot.
   - Every recommendation provides:
     - **Observed Pattern:** (e.g., High solve variability, elevated penalties, F2L bottleneck).
     - **Supporting Evidence:** Exact measured metric ($CV$, $s$, IQR, DNF rate, or stage excess %).
     - **Interpretation:** Why this pattern occurs (e.g., lookahead breakdown vs turning speed).
     - **Recommended Action:** Concrete practice drills to address the root cause.
     - **Intended Outcome:** Measurable target goal.
     - **Confidence Rating:** Explicit indication of statistical sample strength.

5. **Automated Local Weekly Review:**
   - Generates a local weekly performance narrative comparing the past 7 days against the prior 7 days.
   - Reports practice volume, mean delta, Welch t-test significance, new personal bests (singles and Ao5s), and upcoming priorities.

6. **Personalized 2-Hour Daily Training Planner:**
   - Baseline allocation: 3×3 CFOP (35m), 4×4 Yau (35m), 5×5 Yau (45m), Session Review (5m).
   - **Dynamic Rebalance Engine:** Reallocates daily training minutes based on relative distance to competition targets, solve consistency, and stage-split bottlenecks.
   - Curated Speedcubing Drill Library with timed instructions (inspection cross planning, slow-turn lookahead, rotationless F2L, 3-2-3 edge pairing flow, center bar building).

7. **Zero-Dependency Architecture & Complete Privacy:**
   - All data stays inside your browser (`localStorage`).
   - Versioned JSON export/import (v4 includes solves, goals, daily training plans, and stage configurations).
   - Backward-compatible with older CubeLab v1, v2, and v3 backups.

---

## Statistical Methodology

### WCA Trimmed Averages
- **Ao5:** Drops fastest and slowest solve, arithmetic mean of middle 3. Single DNF is trimmed as the slowest solve; $\ge 2$ DNFs results in a DNF average.
- **Ao12:** Drops fastest and slowest solve (8.3% trim on each end), arithmetic mean of middle 10.
- **Ao50 / Ao100:** Drops top $k$ and bottom $k$ solves where $k = \lceil N \times 0.05 \rceil$. For Ao50, $k = 3$ (averages middle 44). For Ao100, $k = 5$ (averages middle 90).

### Sample Dispersion & Variability
- **Sample Standard Deviation ($s$):** Computed using Bessel's correction with $N - 1$ degrees of freedom:
  $$s = \sqrt{\frac{1}{N - 1} \sum_{i=1}^N (x_i - \bar{x})^2}$$
- **Coefficient of Variation ($CV$):** Standard deviation relative to sample mean expressed as a percentage:
  $$CV = \frac{s}{\bar{x}} \times 100\%$$
  A $CV > 18\%$ indicates high variability and inconsistent lookahead.

### Inferential Comparative Analytics (Welch's t-test)
When comparing two practice samples $A$ and $B$, CubeLab employs Welch's unequal variances $t$-test:
$$t = \frac{|\bar{x}_B - \bar{x}_A|}{\sqrt{\frac{s_A^2}{n_A} + \frac{s_B^2}{n_B}}}$$
Degrees of freedom ($df$) are calculated via the Welch–Satterthwaite equation, and two-tailed $p$-values are evaluated via the regularized incomplete beta function. Differences are only characterized as statistically significant when $p < 0.05$.

---

## Automated Testing

CubeLab v4 includes an automated unit test suite verifying all statistical algorithms, trimming rules, stage validation, and coaching heuristics:

- **Browser Test Suite:** Open `test.html` in any browser to execute the complete unit test suite.
- **Terminal Verification:** Run `python run_tests.py` to verify the mathematical calculations.

```sh
python run_tests.py
```

---

## Running Locally

To run CubeLab locally:

```sh
python -m http.server 8000
```
Then navigate to `http://localhost:8000` in your web browser.

---

## Deployment via GitHub Pages

CubeLab runs as a zero-dependency static application directly on GitHub Pages:
1. Push updates to the `main` branch.
2. In GitHub repository **Settings → Pages**, ensure Source is set to **Deploy from a branch (`main` / root)**.
3. The live site automatically builds at `https://YOUR_USERNAME.github.io/CubeLab/`.
