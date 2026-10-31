"use strict";
/*
 * CubeLab Stats Engine - Pure statistical and mathematical functions for speedcubing analysis.
 * Adheres strictly to WCA (World Cube Association) average regulations and standard inferential statistics.
 */

const CubeStats = (() => {

  /**
   * Calculates effective centiseconds for a solve object.
   * Penalty handling:
   *  - 'none': baseCs
   *  - '+2': baseCs + 200
   *  - 'DNF': Infinity
   */
  function effectiveCs(s) {
    if (!s) return Infinity;
    if (s.penalty === 'DNF') return Infinity;
    const base = Number(s.baseCs) || 0;
    return s.penalty === '+2' ? base + 200 : base;
  }

  /**
   * Formats centiseconds into human-readable text: "m:ss.cc" or "ss.cc", or "DNF".
   */
  function formatCs(cs) {
    if (!Number.isFinite(cs) || cs === null || cs === undefined) return 'DNF';
    cs = Math.round(cs);
    const mins = Math.floor(cs / 6000);
    const secs = Math.floor((cs % 6000) / 100);
    const cents = String(cs % 100).padStart(2, '0');
    return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}.${cents}` : `${secs}.${cents}`;
  }

  /**
   * Parses time string ("12.34", "1:23.45", "83.45") into centiseconds.
   */
  function parseTime(input) {
    const raw = String(input || '').trim();
    if (!/^(?:\d{1,3}:)?\d{1,2}(?:\.\d{1,3})?$/.test(raw) && !/^\d{1,5}(?:\.\d{1,3})?$/.test(raw)) return null;
    let seconds;
    if (raw.includes(':')) {
      const [min, sec] = raw.split(':').map(Number);
      if (sec >= 60) return null;
      seconds = min * 60 + sec;
    } else {
      seconds = Number(raw);
    }
    if (!(seconds > 0) || seconds > 86400) return null;
    return Math.round(seconds * 100);
  }

  /**
   * WCA Trimmed Average calculation.
   * For N = 3: Mean of 3 (Mo3) - arithmetic mean; if any solve is DNF, result is DNF.
   * For N >= 5: Drops top k and bottom k solves, where k = ceil(N * 0.05).
   *   - N = 5: k = ceil(0.25) = 1 (drops 1 best, 1 worst, averages middle 3).
   *   - N = 12: k = ceil(0.60) = 1 (drops 1 best, 1 worst, averages middle 10).
   *   - N = 50: k = ceil(2.50) = 3 (drops 3 best, 3 worst, averages middle 44).
   *   - N = 100: k = ceil(5.00) = 5 (drops 5 best, 5 worst, averages middle 90).
   * If any DNF remains in the middle kept window, the entire average is DNF (represented as Infinity).
   */
  function trimmedAverage(solves) {
    if (!Array.isArray(solves)) return null;
    const n = solves.length;
    if (n < 3) return null;

    if (n === 3) {
      const vals = solves.map(effectiveCs);
      if (vals.some(v => !Number.isFinite(v))) return Infinity;
      return Math.round(vals.reduce((a, b) => a + b, 0) / 3);
    }

    if (n < 5) return null;

    const trim = Math.ceil(n * 0.05);
    const sorted = solves.map(effectiveCs).sort((a, b) => a - b);
    const kept = sorted.slice(trim, n - trim);

    if (kept.some(v => !Number.isFinite(v))) return Infinity;
    const sum = kept.reduce((a, b) => a + b, 0);
    return Math.round(sum / kept.length);
  }

  /**
   * Rolling trimmed average over the most recent n items.
   */
  function rollingAverage(solves, n) {
    if (!Array.isArray(solves) || solves.length < n) return null;
    return trimmedAverage(solves.slice(-n));
  }

  /**
   * Best rolling trimmed average of window size n across an entire history.
   */
  function bestRollingAverage(solves, n) {
    if (!Array.isArray(solves) || solves.length < n) return null;
    let best = Infinity;
    for (let i = n; i <= solves.length; i++) {
      const avg = trimmedAverage(solves.slice(i - n, i));
      if (avg !== null && avg < best) {
        best = avg;
      }
    }
    return best === Infinity ? null : best;
  }

  /**
   * Calculates descriptive sample statistics on a set of solve objects.
   */
  function descriptiveStats(solves) {
    if (!Array.isArray(solves) || solves.length === 0) {
      return {
        count: 0,
        validCount: 0,
        dnfCount: 0,
        plusTwoCount: 0,
        dnfRate: 0,
        plusTwoRate: 0,
        mean: null,
        median: null,
        stdDev: null,
        variance: null,
        cv: null, // Coefficient of variation in %
        min: null,
        max: null,
        iqr: null,
        p10: null,
        p25: null,
        p50: null,
        p75: null,
        p90: null
      };
    }

    const total = solves.length;
    let dnfCount = 0;
    let plusTwoCount = 0;
    const validVals = [];

    for (const s of solves) {
      if (s.penalty === 'DNF') {
        dnfCount++;
      } else {
        if (s.penalty === '+2') plusTwoCount++;
        validVals.push(effectiveCs(s));
      }
    }

    const validCount = validVals.length;
    const dnfRate = (dnfCount / total) * 100;
    const plusTwoRate = (plusTwoCount / total) * 100;

    if (validCount === 0) {
      return {
        count: total,
        validCount: 0,
        dnfCount,
        plusTwoCount,
        dnfRate,
        plusTwoRate,
        mean: null,
        median: null,
        stdDev: null,
        variance: null,
        cv: null,
        min: null,
        max: null,
        iqr: null,
        p10: null,
        p25: null,
        p50: null,
        p75: null,
        p90: null
      };
    }

    validVals.sort((a, b) => a - b);
    const sum = validVals.reduce((a, b) => a + b, 0);
    const mean = sum / validCount;

    // Sample variance and standard deviation (Bessel's correction n-1)
    let variance = 0;
    if (validCount > 1) {
      const sumSqDiff = validVals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
      variance = sumSqDiff / (validCount - 1);
    }
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? (stdDev / mean) * 100 : 0;

    function getPercentile(arr, p) {
      if (arr.length === 1) return arr[0];
      const index = (p / 100) * (arr.length - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index - lower;
      return arr[lower] * (1 - weight) + arr[upper] * weight;
    }

    const p10 = getPercentile(validVals, 10);
    const p25 = getPercentile(validVals, 25);
    const p50 = getPercentile(validVals, 50);
    const p75 = getPercentile(validVals, 75);
    const p90 = getPercentile(validVals, 90);
    const iqr = p75 - p25;

    return {
      count: total,
      validCount,
      dnfCount,
      plusTwoCount,
      dnfRate,
      plusTwoRate,
      mean: Math.round(mean),
      median: Math.round(p50),
      stdDev: Math.round(stdDev * 10) / 10,
      variance: Math.round(variance),
      cv: Math.round(cv * 10) / 10,
      min: validVals[0],
      max: validVals[validVals.length - 1],
      iqr: Math.round(iqr),
      p10: Math.round(p10),
      p25: Math.round(p25),
      p50: Math.round(p50),
      p75: Math.round(p75),
      p90: Math.round(p90)
    };
  }

  /**
   * Approximate regularized incomplete beta function for Student's t distribution p-value.
   * Continuous continued fraction approximation.
   */
  function betainc(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Use symmetry if x > (a + 1) / (a + b + 2)
    if (x > (a + 1) / (a + b + 2)) {
      return 1 - betainc(1 - x, b, a);
    }

    // Log-gamma approximation via Lanczos formula
    function logGamma(z) {
      const g = 7;
      const C = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109583115912, 9.9843695780195716e-6, 1.5056327351493116e-7
      ];
      if (z < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
      }
      z -= 1;
      let base = C[0];
      for (let i = 1; i < g + 2; i++) base += C[i] / (z + i);
      const t = z + g + 0.5;
      return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(base);
    }

    const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));

    // Continued fraction
    let f = 1.0, c = 1.0, d = 0.0;
    for (let m = 0; m <= 100; m++) {
      let num;
      if (m === 0) {
        num = 1;
      } else {
        const k = Math.floor(m / 2);
        if (m % 2 === 0) {
          num = (k * (b - k) * x) / ((a + 2 * k - 1) * (a + 2 * k));
        } else {
          num = -((a + k) * (a + b + k) * x) / ((a + 2 * k) * (a + 2 * k + 1));
        }
      }
      d = 1.0 + num * d;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      d = 1.0 / d;
      c = 1.0 + num / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      const delta = c * d;
      f *= delta;
      if (Math.abs(delta - 1.0) < 1e-12) break;
    }
    return (front * (f - 1.0)) / a;
  }

  /**
   * Two-tailed p-value for Student's t distribution with degrees of freedom df.
   */
  function tDistributionPValue(tStat, df) {
    if (df <= 0 || !Number.isFinite(tStat)) return 1.0;
    const t2 = tStat * tStat;
    const x = df / (df + t2);
    const p = betainc(x, df / 2, 0.5);
    return Math.max(0, Math.min(1, p));
  }

  /**
   * Welch's Two-Sample t-test comparing group A and group B.
   * Assumes possibly unequal variances.
   * Returns:
   *   diff: meanB - meanA (negative means improvement)
   *   percentChange: ((meanB - meanA) / meanA) * 100
   *   tStat, df, pValue
   *   isSignificant: boolean (pValue < 0.05)
   */
  function compareSubsets(solvesA, solvesB) {
    const statsA = descriptiveStats(solvesA);
    const statsB = descriptiveStats(solvesB);

    if (statsA.validCount < 5 || statsB.validCount < 5) {
      return {
        sufficientData: false,
        message: 'At least 5 valid solves are required in each sample for statistical comparison.',
        statsA,
        statsB
      };
    }

    const nA = statsA.validCount;
    const nB = statsB.validCount;
    const meanA = statsA.mean;
    const meanB = statsB.mean;
    const varA = statsA.variance;
    const varB = statsB.variance;

    const diff = meanB - meanA;
    const percentChange = meanA > 0 ? (diff / meanA) * 100 : 0;
    const seDiff = Math.sqrt(varA / nA + varB / nB);

    let tStat = 0;
    let df = 1;
    let pValue = 1.0;

    if (seDiff > 0) {
      tStat = Math.abs(diff) / seDiff;
      // Welch–Satterthwaite equation for degrees of freedom
      const num = Math.pow(varA / nA + varB / nB, 2);
      const den = Math.pow(varA / nA, 2) / (nA - 1) + Math.pow(varB / nB, 2) / (nB - 1);
      df = den > 0 ? Math.max(1, num / den) : 1;
      pValue = tDistributionPValue(tStat, df);
    }

    const isSignificant = pValue < 0.05;
    const cvDiff = statsB.cv - statsA.cv;

    return {
      sufficientData: true,
      statsA,
      statsB,
      diff, // in centiseconds
      percentChange: Math.round(percentChange * 10) / 10,
      cvDiff: Math.round(cvDiff * 10) / 10,
      tStat: Math.round(tStat * 100) / 100,
      df: Math.round(df * 10) / 10,
      pValue: Math.round(pValue * 1000) / 1000,
      isSignificant,
      conclusion: isSignificant
        ? (diff < 0
          ? `Statistically significant improvement of ${formatCs(Math.abs(diff))} (${Math.abs(Math.round(percentChange * 10) / 10)}%) (p = ${pValue.toFixed(3)}).`
          : `Statistically significant regression of +${formatCs(diff)} (+${(Math.round(percentChange * 10) / 10)}%) (p = ${pValue.toFixed(3)}).`)
        : `Difference of ${diff <= 0 ? '-' : '+'}${formatCs(Math.abs(diff))} is within normal variance (p = ${pValue.toFixed(3)}, not significant at α = 0.05).`
    };
  }

  /**
   * Linear regression model over points (x, y).
   * Used for improvement slope and goal forecasting.
   */
  function linearRegression(points) {
    if (!Array.isArray(points) || points.length < 3) return null;
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
      sumY2 += p.y * p.y;
    }

    const denominator = (n * sumX2 - sumX * sumX);
    if (Math.abs(denominator) < 1e-12) return null;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // Standard error of estimate (residuals)
    let ssRes = 0;
    for (const p of points) {
      const pred = slope * p.x + intercept;
      ssRes += Math.pow(p.y - pred, 2);
    }
    const se = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

    // Pearson r correlation
    const numR = (n * sumXY - sumX * sumY);
    const denR = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    const r = denR > 0 ? numR / denR : 0;

    return { slope, intercept, se, r, r2: r * r };
  }

  /**
   * Forecasts goal attainment based on rolling averages over time.
   * Uses rolling Ao12 (or Ao50) across date timestamps.
   */
  function forecastGoal(solves, targetCs, competitionDateStr, windowSize = 12) {
    if (!Array.isArray(solves) || solves.length < windowSize + 10) {
      return {
        hasData: false,
        message: `Need at least ${windowSize + 10} solves to model a statistically sound forecast trajectory.`
      };
    }

    // Generate rolling Ao series with timestamps
    const points = [];
    const firstTime = new Date(solves[0].createdAt).getTime();

    for (let i = windowSize; i <= solves.length; i++) {
      const windowSolves = solves.slice(i - windowSize, i);
      const avg = trimmedAverage(windowSolves);
      if (avg !== null && Number.isFinite(avg)) {
        const lastSolve = windowSolves[windowSolves.length - 1];
        const days = (new Date(lastSolve.createdAt).getTime() - firstTime) / (86400000);
        points.push({ x: days, y: avg, solveIndex: i });
      }
    }

    if (points.length < 5) {
      return {
        hasData: false,
        message: 'Insufficient rolling average data points.'
      };
    }

    // Focus regression on recent trend (up to last 100 rolling points to reflect current trajectory)
    const recentPoints = points.slice(-100);
    const reg = linearRegression(recentPoints);
    if (!reg) {
      return {
        hasData: false,
        message: 'Could not compute linear regression.'
      };
    }

    const currentAo = points[points.length - 1].y;
    const distanceToGoal = currentAo - targetCs; // in centiseconds
    const currentDay = points[points.length - 1].x;

    const [compY, compM, compD] = competitionDateStr.split('-').map(Number);
    const compTimestamp = Date.UTC(compY, compM - 1, compD);
    const daysUntilComp = Math.max(0, Math.round((compTimestamp - Date.now()) / 86400000));

    // Slope is cs per day
    const csPerDay = reg.slope;
    const csPerWeek = reg.slope * 7;
    const requiredCsPerDay = daysUntilComp > 0 ? distanceToGoal / daysUntilComp : 0;

    let projectedDate = null;
    let confidenceIntervalDays = null;
    let projectedStatus = 'unknown';
    let message = '';

    if (distanceToGoal <= 0) {
      projectedStatus = 'achieved';
      message = `Goal achieved! Current rolling Ao${windowSize} (${formatCs(currentAo)}) already beats the ${formatCs(targetCs)} target.`;
    } else if (csPerDay >= 0) {
      projectedStatus = 'plateau';
      message = `Current trajectory is flat or slightly increasing (+${Math.abs(Math.round(csPerWeek * 10) / 10)} cs/week). Need -${(Math.round(requiredCsPerDay * 7 * 10) / 10)} cs/week to hit target by ${competitionDateStr}.`;
    } else {
      // Improving! csPerDay is negative
      const improvementPerDay = Math.abs(csPerDay);
      const daysNeeded = distanceToGoal / improvementPerDay;
      const targetTimestamp = Date.now() + (daysNeeded * 86400000);
      projectedDate = new Date(targetTimestamp).toISOString().split('T')[0];

      // Standard error bound on days
      if (reg.se > 0 && improvementPerDay > 0) {
        confidenceIntervalDays = Math.round((1.96 * reg.se) / improvementPerDay);
      }

      if (daysNeeded <= daysUntilComp) {
        projectedStatus = 'on_track';
        message = `On track! Improving at -${(Math.round(improvementPerDay * 7 * 10) / 10)} cs/week (required: -${(Math.round(requiredCsPerDay * 7 * 10) / 10)} cs/week). Projected date: ${projectedDate} (±${confidenceIntervalDays || '—'} days).`;
      } else {
        projectedStatus = 'behind_pace';
        message = `Improving at -${(Math.round(improvementPerDay * 7 * 10) / 10)} cs/week, but target pace requires -${(Math.round(requiredCsPerDay * 7 * 10) / 10)} cs/week to reach goal before competition. Projected: ${projectedDate}.`;
      }
    }

    return {
      hasData: true,
      currentAo,
      targetCs,
      distanceToGoal,
      daysUntilComp,
      csPerDay: Math.round(csPerDay * 100) / 100,
      csPerWeek: Math.round(csPerWeek * 10) / 10,
      requiredCsPerWeek: Math.round(requiredCsPerDay * 7 * 10) / 10,
      projectedDate,
      confidenceIntervalDays,
      projectedStatus,
      correlationR2: Math.round(reg.r2 * 100) / 100,
      residualSE: Math.round(reg.se),
      message
    };
  }

  /**
   * Personal Best tracker across chronological solves.
   */
  function trackPersonalBests(solves) {
    if (!Array.isArray(solves) || solves.length === 0) {
      return { singleHistory: [], ao5History: [], ao12History: [] };
    }

    const singleHistory = [];
    const ao5History = [];
    const ao12History = [];

    let bestSingle = Infinity;
    let bestAo5 = Infinity;
    let bestAo12 = Infinity;

    for (let i = 0; i < solves.length; i++) {
      const s = solves[i];
      const eff = effectiveCs(s);

      // Single PB
      if (Number.isFinite(eff) && eff < bestSingle) {
        bestSingle = eff;
        singleHistory.push({
          solveIndex: i + 1,
          timeCs: eff,
          date: s.createdAt,
          scramble: s.scramble || ''
        });
      }

      // Ao5 PB
      if (i >= 4) {
        const ao5 = trimmedAverage(solves.slice(i - 4, i + 1));
        if (ao5 !== null && Number.isFinite(ao5) && ao5 < bestAo5) {
          bestAo5 = ao5;
          ao5History.push({
            solveIndex: i + 1,
            timeCs: ao5,
            date: s.createdAt
          });
        }
      }

      // Ao12 PB
      if (i >= 11) {
        const ao12 = trimmedAverage(solves.slice(i - 11, i + 1));
        if (ao12 !== null && Number.isFinite(ao12) && ao12 < bestAo12) {
          bestAo12 = ao12;
          ao12History.push({
            solveIndex: i + 1,
            timeCs: ao12,
            date: s.createdAt
          });
        }
      }
    }

    return { singleHistory, ao5History, ao12History };
  }

  return {
    effectiveCs,
    formatCs,
    parseTime,
    trimmedAverage,
    rollingAverage,
    bestRollingAverage,
    descriptiveStats,
    compareSubsets,
    linearRegression,
    forecastGoal,
    trackPersonalBests
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CubeStats;
}
