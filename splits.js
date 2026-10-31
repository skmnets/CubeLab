"use strict";
/*
 * CubeLab Splits Engine - Stage-specific timing, validation, and bottleneck analytics.
 * Supports CFOP (3x3), Yau (4x4, 5x5), and user-customized stage configurations.
 */

const CubeSplits = (() => {

  const DEFAULT_STAGE_CONFIGS = {
    '3x3': [
      { id: 'cross', name: 'Cross', benchmarkPct: 12 },
      { id: 'f2l', name: 'F2L', benchmarkPct: 50 },
      { id: 'll', name: 'Last Layer', benchmarkPct: 38 }
    ],
    '4x4': [
      { id: 'f2c', name: 'First 2 Centers', benchmarkPct: 13 },
      { id: 'f3e', name: 'First 3 Edges', benchmarkPct: 12 },
      { id: 'l4c', name: 'Last 4 Centers', benchmarkPct: 18 },
      { id: 'edges', name: 'Edge Pairing (3-2-3)', benchmarkPct: 27 },
      { id: '3x3', name: '3×3 Stage', benchmarkPct: 30 }
    ],
    '5x5': [
      { id: 'centers', name: 'Centers', benchmarkPct: 35 },
      { id: 'cross_edges', name: 'Cross Edges', benchmarkPct: 15 },
      { id: 'edges', name: 'Edge Pairing', benchmarkPct: 25 },
      { id: '3x3', name: '3×3 Stage', benchmarkPct: 25 }
    ]
  };

  const STORAGE_KEY = 'cubelab-splits-config-v1';

  function loadStageConfigs() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        const merged = structuredClone(DEFAULT_STAGE_CONFIGS);
        for (const ev of Object.keys(DEFAULT_STAGE_CONFIGS)) {
          if (Array.isArray(saved[ev]) && saved[ev].length >= 2) {
            merged[ev] = saved[ev].map(s => ({
              id: String(s.id || s.name).toLowerCase().replace(/\s+/g, '_'),
              name: String(s.name || s.id),
              benchmarkPct: Number(s.benchmarkPct) || 25
            }));
          }
        }
        return merged;
      }
    } catch {
      // Fallback to defaults
    }
    return structuredClone(DEFAULT_STAGE_CONFIGS);
  }

  function saveStageConfigs(configs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    } catch {
      console.error('Failed to save stage configurations to localStorage.');
    }
  }

  /**
   * Validates splits:
   * Takes an array of stages [{ name, cs }, ...] or cumulative [{ name, cumulativeCs }, ...]
   * Checks that all cs values are non-negative and sum equals totalCs within ±2 centiseconds.
   */
  function validateSplits(stages, totalCs, isCumulative = false) {
    if (!Array.isArray(stages) || stages.length < 2) {
      return { valid: false, error: 'At least two stages are required.' };
    }

    const durations = [];
    if (isCumulative) {
      let prev = 0;
      for (let i = 0; i < stages.length; i++) {
        const cum = Number(stages[i].cumulativeCs);
        if (!Number.isFinite(cum) || cum < prev) {
          return { valid: false, error: `Stage ${i + 1} (${stages[i].name}) cumulative time must be greater than previous stage.` };
        }
        const stageDuration = cum - prev;
        durations.push({ name: stages[i].name, cs: stageDuration });
        prev = cum;
      }
    } else {
      for (let i = 0; i < stages.length; i++) {
        const d = Number(stages[i].cs);
        if (!Number.isFinite(d) || d < 0) {
          return { valid: false, error: `Stage ${i + 1} (${stages[i].name}) duration must be a non-negative number.` };
        }
        durations.push({ name: stages[i].name, cs: Math.round(d) });
      }
    }

    const sum = durations.reduce((acc, s) => acc + s.cs, 0);
    const diff = Math.abs(sum - totalCs);

    if (diff > 2) { // 2 centiseconds rounding margin
      return {
        valid: false,
        error: `Sum of stage splits (${(sum / 100).toFixed(2)}s) does not match total solve time (${(totalCs / 100).toFixed(2)}s). Difference: ${((sum - totalCs) / 100).toFixed(2)}s.`
      };
    }

    // Auto-adjust rounding difference onto the largest stage
    if (diff > 0 && diff <= 2) {
      const maxStage = durations.reduce((max, s) => s.cs > max.cs ? s : max, durations[0]);
      maxStage.cs += (totalCs - sum);
    }

    return { valid: true, stages: durations };
  }

  /**
   * Analyzes split performance across a list of solves for a given event.
   */
  function analyzeSplits(solves, eventId, configs = DEFAULT_STAGE_CONFIGS) {
    const stageDefs = configs[eventId] || DEFAULT_STAGE_CONFIGS[eventId] || [];
    const solvesWithSplits = solves.filter(s => Array.isArray(s.splits) && s.splits.length > 0 && s.penalty !== 'DNF');

    if (solvesWithSplits.length === 0) {
      return {
        hasData: false,
        sampleCount: 0,
        message: `No stage-split data recorded for ${eventId}. Record splits in the manual entry form or timer to view bottleneck diagnostics.`,
        stages: []
      };
    }

    // Aggregate durations per stage name
    const stageDataMap = {};
    for (const def of stageDefs) {
      stageDataMap[def.name] = {
        name: def.name,
        benchmarkPct: def.benchmarkPct,
        durations: []
      };
    }

    let totalRecordedSolveCs = 0;

    for (const s of solvesWithSplits) {
      totalRecordedSolveCs += s.baseCs;
      for (const st of s.splits) {
        if (!stageDataMap[st.name]) {
          stageDataMap[st.name] = {
            name: st.name,
            benchmarkPct: Math.round(100 / s.splits.length),
            durations: []
          };
        }
        stageDataMap[st.name].durations.push(st.cs);
      }
    }

    const analyzedStages = [];
    let dominantBottleneck = null;
    let highestDev = -Infinity;

    const allStageTotals = Object.values(stageDataMap).reduce((acc, st) => {
      const sum = st.durations.reduce((a, b) => a + b, 0);
      return acc + sum;
    }, 0);

    for (const st of Object.values(stageDataMap)) {
      if (st.durations.length === 0) continue;
      const count = st.durations.length;
      const sum = st.durations.reduce((a, b) => a + b, 0);
      const mean = sum / count;

      let variance = 0;
      if (count > 1) {
        variance = st.durations.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (count - 1);
      }
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
      const actualPct = allStageTotals > 0 ? (sum / allStageTotals) * 100 : 0;
      const deviationFromBenchmark = actualPct - st.benchmarkPct;

      if (deviationFromBenchmark > highestDev) {
        highestDev = deviationFromBenchmark;
        dominantBottleneck = {
          name: st.name,
          actualPct: Math.round(actualPct * 10) / 10,
          benchmarkPct: st.benchmarkPct,
          excessPct: Math.round(deviationFromBenchmark * 10) / 10,
          meanCs: Math.round(mean)
        };
      }

      analyzedStages.push({
        name: st.name,
        count,
        meanCs: Math.round(mean),
        stdDevCs: Math.round(stdDev * 10) / 10,
        cv: Math.round(cv * 10) / 10,
        actualPct: Math.round(actualPct * 10) / 10,
        benchmarkPct: st.benchmarkPct,
        deviationPct: Math.round(deviationFromBenchmark * 10) / 10
      });
    }

    return {
      hasData: true,
      sampleCount: solvesWithSplits.length,
      stages: analyzedStages,
      dominantBottleneck: dominantBottleneck && dominantBottleneck.excessPct > 2 ? dominantBottleneck : null
    };
  }

  return {
    DEFAULT_STAGE_CONFIGS,
    loadStageConfigs,
    saveStageConfigs,
    validateSplits,
    analyzeSplits
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CubeSplits;
}
