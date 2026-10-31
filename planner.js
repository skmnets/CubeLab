"use strict";
/*
 * CubeLab Training Planner - Dynamic daily schedule generation and speedcubing drill library.
 * Adapts training time allocation based on goal gaps, progression rates, and stage weaknesses.
 */

const CubePlanner = (() => {

  const PLAN_STORAGE_KEY = 'cubelab-plan-v2';

  const DEFAULT_PLAN = {
    dailyBudgetMinutes: 120,
    allocations: {
      '3x3': { minutes: 35, label: '3×3 CFOP Practice' },
      '4x4': { minutes: 35, label: '4×4 Yau Practice' },
      '5x5': { minutes: 45, label: '5×5 Yau Practice' },
      'review': { minutes: 5, label: 'Session Review & Analysis' }
    }
  };

  const DRILL_LIBRARY = {
    '3x3': [
      { id: '3x3_cross_inspection', title: 'Inspection Cross Planning', min: 10, desc: 'Plan complete cross in 15s inspection; execute with eyes closed.' },
      { id: '3x3_lookahead_f2l', title: 'Controlled Slow-Turn Lookahead', min: 15, desc: 'Turn at 50% max TPS without stopping between pairs. Track next piece during current insertion.' },
      { id: '3x3_rotation_reduction', title: 'Rotationless F2L Inserts', min: 10, desc: 'Solve pairs into back slots using F/B/L/R moves without rotating the cube.' },
      { id: '3x3_pll_recognition', title: '2-Side PLL Recognition', min: 10, desc: 'Recognize all 21 PLLs by looking at only 2 adjacent faces without rotating.' },
      { id: '3x3_comp_sim', title: 'Competition Simulation Ao5', min: 15, desc: 'Strict WCA 15s inspection with physical timer and +2/DNF enforcement.' }
    ],
    '4x4': [
      { id: '4x4_f2c_bars', title: 'F2C Bar Building', min: 10, desc: 'Construct first 2 centers in under 20 moves each without hesitation.' },
      { id: '4x4_edge_pairing_323', title: '3-2-3 Edge Pairing Flow', min: 15, desc: 'Execute 3-2-3 edge pairing with zero pauses between slice and flip.' },
      { id: '4x4_parity_recognition', title: 'OLL & PLL Parity Drills', min: 10, desc: 'Instant parity case recognition and fluid fingertrick execution.' },
      { id: '4x4_timed_solves', title: 'Timed Yau Solves', min: 15, desc: 'Full timed solves focusing on smooth reduction to 3x3 stage.' }
    ],
    '5x5': [
      { id: '5x5_center_reduction', title: 'Center 1×3 Bar Construction', min: 15, desc: 'Build 1x3 center bars using half-turn flips with minimal reorientations.' },
      { id: '5x5_edge_pairing', title: 'Freeslice / Edge Pairing', min: 15, desc: 'Systematic outer-wing to center-tread pairing without hunting.' },
      { id: '5x5_endgame_3x3', title: 'Big Cube 3×3 Stage Transitions', min: 10, desc: 'Explosive transition directly from last edges into 3x3 CFOP cross.' },
      { id: '5x5_timed_solves', title: 'Full Timed Solves', min: 15, desc: 'Paced complete solves focusing on endurance and consistent TPS.' }
    ],
    'review': [
      { id: 'review_analytics', title: 'Weekly Trend & Bottleneck Review', min: 5, desc: 'Review rolling Aos, inspect stage splits, and log any difficult cases.' }
    ]
  };

  function loadPlan() {
    try {
      const saved = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object' && saved.allocations) {
        return {
          dailyBudgetMinutes: Number(saved.dailyBudgetMinutes) || 120,
          allocations: {
            '3x3': { minutes: Number(saved.allocations['3x3']?.minutes) || 35, label: '3×3 CFOP Practice' },
            '4x4': { minutes: Number(saved.allocations['4x4']?.minutes) || 35, label: '4×4 Yau Practice' },
            '5x5': { minutes: Number(saved.allocations['5x5']?.minutes) || 45, label: '5×5 Yau Practice' },
            'review': { minutes: Number(saved.allocations['review']?.minutes) || 5, label: 'Session Review & Analysis' }
          }
        };
      }
    } catch {
      // Fallback
    }
    return structuredClone(DEFAULT_PLAN);
  }

  function savePlan(plan) {
    try {
      localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
    } catch {
      console.error('Failed to save training plan to localStorage.');
    }
  }

  /**
   * Generates a dynamic suggested training schedule based on:
   *  - Goal distance gap
   *  - Solve variability (CV)
   *  - Stage bottlenecks
   *  - Recent volume
   */
  function suggestSchedule(allSolves, goalsConfig, stageSplitsMap, totalMinutes = 120) {
    const reviewMinutes = 5;
    const available = Math.max(60, totalMinutes - reviewMinutes);

    // Calculate urgency score for each event
    const events = ['3x3', '4x4', '5x5'];
    const urgency = {};

    for (const ev of events) {
      const solves = allSolves.filter(s => s.event === ev);
      const targetCs = goalsConfig?.events?.[ev]?.competitionCs || (ev === '3x3' ? 800 : ev === '4x4' ? 3000 : 6000);
      const stats = CubeStats.descriptiveStats(solves);
      const latestAo12 = CubeStats.rollingAverage(solves, 12);

      let score = 1.0; // Baseline weight

      // Factor 1: Distance to goal (percentage gap)
      if (latestAo12 && latestAo12 > targetCs) {
        const gapRatio = (latestAo12 - targetCs) / targetCs;
        score += Math.min(1.5, gapRatio * 2.0);
      }

      // Factor 2: High variability penalty (needs more steady drill work)
      if (stats.cv && stats.cv > 18) {
        score += 0.4;
      }

      // Factor 3: Bottleneck urgency from splits
      const splitAnalysis = stageSplitsMap?.[ev];
      if (splitAnalysis?.dominantBottleneck?.excessPct > 4) {
        score += 0.5;
      }

      // Factor 4: Low recent volume
      const recentCount = solves.filter(s => (Date.now() - new Date(s.createdAt).getTime()) <= 7 * 86400000).length;
      if (recentCount < 10) {
        score += 0.3; // Boost to prevent neglect
      }

      urgency[ev] = score;
    }

    const totalUrgency = urgency['3x3'] + urgency['4x4'] + urgency['5x5'];

    // Distribute available minutes proportionally with bounded min 20m and max 55m
    const rawAlloc = {};
    for (const ev of events) {
      rawAlloc[ev] = (urgency[ev] / totalUrgency) * available;
    }

    // Clamp within 20m and 55m
    let alloc = {};
    for (const ev of events) {
      alloc[ev] = Math.max(20, Math.min(55, Math.round(rawAlloc[ev] / 5) * 5));
    }

    // Rebalance sum to exact available minutes
    let sum = alloc['3x3'] + alloc['4x4'] + alloc['5x5'];
    while (sum !== available) {
      if (sum < available) {
        // Add 5 min to highest urgency event under max
        const candidates = events.filter(e => alloc[e] < 55);
        if (!candidates.length) break;
        candidates.sort((a, b) => urgency[b] - urgency[a]);
        alloc[candidates[0]] += 5;
        sum += 5;
      } else {
        // Remove 5 min from lowest urgency event over min
        const candidates = events.filter(e => alloc[e] > 20);
        if (!candidates.length) break;
        candidates.sort((a, b) => urgency[a] - urgency[b]);
        alloc[candidates[0]] -= 5;
        sum -= 5;
      }
    }

    // Select recommended drills for each event
    const suggestedDrills = {};
    for (const ev of events) {
      const minutes = alloc[ev];
      const library = DRILL_LIBRARY[ev] || [];
      const splitAnalysis = stageSplitsMap?.[ev];

      let picked = [];
      if (splitAnalysis?.dominantBottleneck) {
        const botName = splitAnalysis.dominantBottleneck.name.toLowerCase();
        // Pick drill matching bottleneck
        const matched = library.find(d => d.id.toLowerCase().includes(botName) || d.desc.toLowerCase().includes(botName));
        if (matched) picked.push(matched);
      }

      // Fill remaining time with core drills
      for (const d of library) {
        if (!picked.some(p => p.id === d.id)) {
          picked.push(d);
        }
        const currentSum = picked.reduce((acc, p) => acc + p.min, 0);
        if (currentSum >= minutes) break;
      }

      suggestedDrills[ev] = picked;
    }

    return {
      dailyBudgetMinutes: totalMinutes,
      allocations: {
        '3x3': { minutes: alloc['3x3'], label: '3×3 CFOP Training' },
        '4x4': { minutes: alloc['4x4'], label: '4×4 Yau Training' },
        '5x5': { minutes: alloc['5x5'], label: '5×5 Yau Training' },
        'review': { minutes: reviewMinutes, label: 'Session Review & Analysis' }
      },
      drills: suggestedDrills,
      reasoning: `Schedule adjusted dynamically based on competition goal proximity, stage bottlenecks, and recent solve consistency.`
    };
  }

  return {
    DEFAULT_PLAN,
    DRILL_LIBRARY,
    loadPlan,
    savePlan,
    suggestSchedule
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CubePlanner;
}
