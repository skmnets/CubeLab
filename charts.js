"use strict";
/*
 * CubeLab Charts - Lightweight, responsive, dependency-free SVG data visualizations.
 * Includes progression curves, rolling averages, distribution histograms, and PB steps.
 */

const CubeCharts = (() => {

  function svgElement(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  }

  /**
   * Renders solve-time progression and rolling averages.
   * Container is an SVG element with viewBox="0 0 650 240".
   */
  function renderProgressionChart(svg, solves, targetCs, showRolling = true) {
    if (!svg) return;
    svg.innerHTML = '';
    const validSolves = solves.map((s, idx) => ({
      idx: idx + 1,
      cs: CubeStats.effectiveCs(s),
      date: s.createdAt,
      s
    })).filter(d => Number.isFinite(d.cs));

    if (validSolves.length === 0) {
      svg.innerHTML = '<text x="325" y="120" text-anchor="middle" fill="#7f91a6" font-size="13">No valid solves to display yet</text>';
      return;
    }

    // Limit display to the most recent 100 solves for visual clarity
    const displaySolves = validSolves.slice(-100);
    const times = displaySolves.map(d => d.cs);
    if (targetCs) times.push(targetCs);

    let minVal = Math.min(...times);
    let maxVal = Math.max(...times);
    const pad = Math.max(80, (maxVal - minVal) * 0.15);
    minVal = Math.max(0, minVal - pad);
    maxVal = maxVal + pad;

    const W = 650, H = 240;
    const padL = 50, padR = 20, padT = 20, padB = 40;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const scaleX = (i) => padL + (i / Math.max(1, displaySolves.length - 1)) * plotW;
    const scaleY = (v) => padT + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

    // Draw horizontal grid lines and Y-axis labels
    const gridG = svgElement('g', { class: 'chart-grid' });
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const val = minVal + (i / steps) * (maxVal - minVal);
      const y = scaleY(val);
      gridG.appendChild(svgElement('line', {
        x1: padL, x2: W - padR, y1: y, y2: y,
        stroke: '#1e2e44', 'stroke-dasharray': '3 4'
      }));
      const text = svgElement('text', {
        x: padL - 8, y: y + 4, 'text-anchor': 'end',
        fill: '#798da4', 'font-size': '10', 'font-family': 'sans-serif'
      });
      text.textContent = (val / 100).toFixed(1);
      gridG.appendChild(text);
    }
    svg.appendChild(gridG);

    // Target reference line
    if (targetCs && targetCs >= minVal && targetCs <= maxVal) {
      const targetY = scaleY(targetCs);
      const targetLine = svgElement('line', {
        x1: padL, x2: W - padR, y1: targetY, y2: targetY,
        stroke: '#e5b76c', 'stroke-dasharray': '6 4', 'stroke-width': '1.5'
      });
      svg.appendChild(targetLine);
      const targetLabel = svgElement('text', {
        x: W - padR, y: targetY - 6, 'text-anchor': 'end',
        fill: '#e5b76c', 'font-size': '9', 'font-weight': 'bold'
      });
      targetLabel.textContent = `Target: ${CubeStats.formatCs(targetCs)}`;
      svg.appendChild(targetLabel);
    }

    // Solve time path
    let pathD = '';
    displaySolves.forEach((d, i) => {
      const x = scaleX(i);
      const y = scaleY(d.cs);
      pathD += (i === 0 ? 'M' : 'L') + ` ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    const solvePath = svgElement('path', {
      d: pathD, fill: 'none', stroke: '#3bc9aa',
      'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    svg.appendChild(solvePath);

    // Rolling Ao5 curve (if enabled)
    if (showRolling && displaySolves.length >= 5) {
      let ao5Path = '';
      for (let i = 4; i < displaySolves.length; i++) {
        const window = displaySolves.slice(i - 4, i + 1).map(d => d.s);
        const avg = CubeStats.trimmedAverage(window);
        if (avg !== null && Number.isFinite(avg)) {
          const x = scaleX(i);
          const y = scaleY(avg);
          ao5Path += (ao5Path === '' ? 'M' : 'L') + ` ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      }
      if (ao5Path) {
        svg.appendChild(svgElement('path', {
          d: ao5Path, fill: 'none', stroke: '#6792ff',
          'stroke-width': '1.8', 'stroke-dasharray': '4 3'
        }));
      }
    }

    // Solve data points
    const pointsG = svgElement('g', { class: 'chart-points' });
    displaySolves.forEach((d, i) => {
      const x = scaleX(i);
      const y = scaleY(d.cs);
      const circle = svgElement('circle', {
        cx: x.toFixed(1), cy: y.toFixed(1), r: '3',
        fill: '#3bc9aa', class: 'chart-dot'
      });
      const title = svgElement('title');
      title.textContent = `Solve #${d.idx}: ${CubeStats.formatCs(d.cs)} (${new Date(d.date).toLocaleDateString()})`;
      circle.appendChild(title);
      pointsG.appendChild(circle);
    });
    svg.appendChild(pointsG);
  }

  /**
   * Renders a solve-time distribution histogram.
   * Container is an SVG element with viewBox="0 0 650 200".
   */
  function renderDistributionHistogram(svg, solves) {
    if (!svg) return;
    svg.innerHTML = '';
    const validTimes = solves.map(CubeStats.effectiveCs).filter(Number.isFinite);

    if (validTimes.length < 5) {
      svg.innerHTML = '<text x="325" y="100" text-anchor="middle" fill="#7f91a6" font-size="13">Need at least 5 solves for histogram</text>';
      return;
    }

    const min = Math.min(...validTimes);
    const max = Math.max(...validTimes);
    const binCount = Math.min(16, Math.max(6, Math.floor(Math.sqrt(validTimes.length))));
    const binWidth = (max - min) / binCount || 1;

    const bins = Array(binCount).fill(0);
    for (const t of validTimes) {
      const b = Math.min(binCount - 1, Math.floor((t - min) / binWidth));
      bins[b]++;
    }

    const maxFreq = Math.max(...bins, 1);
    const W = 650, H = 200;
    const padL = 40, padR = 20, padT = 20, padB = 40;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const barWidth = plotW / binCount;

    // Draw bars
    const g = svgElement('g');
    bins.forEach((freq, i) => {
      const barH = (freq / maxFreq) * plotH;
      const x = padL + i * barWidth;
      const y = padT + plotH - barH;

      const rect = svgElement('rect', {
        x: x + 2, y, width: Math.max(1, barWidth - 4), height: barH,
        fill: '#245258', rx: '3', class: 'hist-bar'
      });
      const title = svgElement('title');
      const binStart = min + i * binWidth;
      const binEnd = binStart + binWidth;
      title.textContent = `${CubeStats.formatCs(binStart)} – ${CubeStats.formatCs(binEnd)}: ${freq} solve${freq === 1 ? '' : 's'}`;
      rect.appendChild(title);
      g.appendChild(rect);

      // X-axis label
      if (i % 2 === 0 || binCount <= 8) {
        const text = svgElement('text', {
          x: x + barWidth / 2, y: H - padB + 16,
          'text-anchor': 'middle', fill: '#798da4', 'font-size': '9'
        });
        text.textContent = (binStart / 100).toFixed(1);
        g.appendChild(text);
      }
    });

    // Mean indicator line
    const stats = CubeStats.descriptiveStats(solves);
    if (stats.mean && stats.mean >= min && stats.mean <= max) {
      const meanX = padL + ((stats.mean - min) / (max - min)) * plotW;
      const line = svgElement('line', {
        x1: meanX, x2: meanX, y1: padT, y2: padT + plotH,
        stroke: '#3bc9aa', 'stroke-width': '2', 'stroke-dasharray': '3 3'
      });
      g.appendChild(line);
      const label = svgElement('text', {
        x: meanX, y: padT - 5, 'text-anchor': 'middle',
        fill: '#3bc9aa', 'font-size': '10', 'font-weight': 'bold'
      });
      label.textContent = `Mean: ${CubeStats.formatCs(stats.mean)}`;
      g.appendChild(label);
    }

    svg.appendChild(g);
  }

  return {
    renderProgressionChart,
    renderDistributionHistogram
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CubeCharts;
}
