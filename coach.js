"use strict";
/*
 * CubeLab Coach - Explainable, evidence-grounded speedcubing coaching & weekly review engine.
 * Deterministic rule-based evaluation. Every recommendation links directly to measured statistics.
 */

const CubeCoach = (() => {

  /**
   * Generates actionable coaching recommendations based on measured performance metrics.
   * Returns up to 3 highest-priority recommendations.
   */
  function generateRecommendations(solves, eventId, goalConfig, splitsAnalysis) {
    if (!Array.isArray(solves) || solves.length < 5) {
      return [{
        id: 'need_data',
        priority: 1,
        event: eventId,
        pattern: 'Insufficient solve data for reliable coaching analysis',
        evidence: `Only ${solves.length} solve${solves.length === 1 ? '' : 's'} recorded.`,
        interpretation: 'A representative sample of at least 15–25 solves is required to distinguish systematic bottlenecks from session noise.',
        recommendation: 'Complete a continuous session of 15–20 timed practice solves.',
        intendedOutcome: 'Establish an accurate baseline for rolling averages and solve variance.',
        confidence: 'Low (Sample < 15)'
      }];
    }

    const recs = [];
    const stats = CubeStats.descriptiveStats(solves);
    const recent25 = solves.slice(-25);
    const recentStats = CubeStats.descriptiveStats(recent25);
    const targetCs = goalConfig ? goalConfig.competitionCs : 800;

    // Confidence metric based on sample size
    const confidenceLevel = solves.length >= 50 ? 'High (N ≥ 50)' : solves.length >= 20 ? 'Moderate (20 ≤ N < 50)' : 'Preliminary (N < 20)';

    // Rule 1: High Solve Variability / Inconsistent Lookahead
    if (recentStats.cv !== null && recentStats.cv > 17.5) {
      recs.push({
        id: 'high_variability',
        priority: 95,
        event: eventId,
        pattern: `High solve variability (Coefficient of Variation = ${recentStats.cv}%)`,
        evidence: `Standard deviation is ±${CubeStats.formatCs(recentStats.stdDev)} on a mean of ${CubeStats.formatCs(recentStats.mean)} (IQR = ${CubeStats.formatCs(recentStats.iqr)}).`,
        interpretation: 'Wide swings in solve time usually stem from aggressive turning interspersed with sudden, full-stop pauses to find pieces. When lookahead breaks down, solve times surge.',
        recommendation: 'Slow down turning speed by 15–20% (metronome or smooth slow-turning). Eliminate mid-solve lockups and pauses. Maintain continuous piece tracking into the next slot.',
        intendedOutcome: 'Compress the spread of solve times and lower standard deviation below 12% CV before pushing pure turning speed.',
        confidence: confidenceLevel
      });
    }

    // Rule 2: Excessive Penalty / DNF Frequency
    const totalPenalties = recentStats.plusTwoRate + recentStats.dnfRate;
    if (totalPenalties >= 6.0) {
      recs.push({
        id: 'penalties_dnf',
        priority: 90,
        event: eventId,
        pattern: `Elevated penalty/DNF rate (${recentStats.dnfRate.toFixed(1)}% DNF, ${recentStats.plusTwoRate.toFixed(1)}% +2)`,
        evidence: `${recentStats.dnfCount} DNF and ${recentStats.plusTwoCount} (+2) occurrences in the last ${recentStats.count} solves.`,
        interpretation: 'Rushing the final layer and stopping the timer before complete alignment causes avoidable +2s. Attempting unfamiliar algorithms in timed solves causes DNFs.',
        recommendation: 'Train deliberate AUF (Adjust U-Face) recognition and clean timer stopping. Reserve experimental algorithms for untimed drills until execution reaches 100% reliability.',
        intendedOutcome: 'Eliminate artificial time inflation (+2.00s) and restore valid average calculations.',
        confidence: confidenceLevel
      });
    }

    // Rule 3: Stage Splits Bottleneck (CFOP / Yau)
    if (splitsAnalysis && splitsAnalysis.hasData && splitsAnalysis.dominantBottleneck) {
      const b = splitsAnalysis.dominantBottleneck;
      if (b.excessPct >= 3.0) {
        let stageInterp = `The ${b.name} stage is consuming an excessive proportion of total solve time.`;
        let stageDrill = `Dedicate 20 minutes daily to focused ${b.name} isolation drills.`;
        let stageOutcome = `Reduce ${b.name} time toward the ${b.benchmarkPct}% benchmark.`;

        if (b.name.toLowerCase().includes('f2l')) {
          stageInterp = `F2L represents ${b.actualPct}% of total solve duration (optimal benchmark: ~${b.benchmarkPct}%). Pauses during pair recognition and excessive cube rotations are diluting turning speed.`;
          stageDrill = 'Practice Cross-to-first-pair inspection (plan cross + 1st pair in 15s inspection). Drill 2-look F2L deduction and back-slot pair insertions to eliminate rotations.';
          stageOutcome = 'Save 1.5–3.0 seconds across the solve by transitioning into F2L seamlessly without an inspection-pause.';
        } else if (b.name.toLowerCase().includes('cross')) {
          stageInterp = `Cross accounts for ${b.actualPct}% of total time (optimal benchmark: ~${b.benchmarkPct}%). This indicates solving the cross face-first or inefficient move count (>8 moves).`;
          stageDrill = 'Unlimited inspection cross-planning drills: plan the complete cross (6–7 moves) and execute with eyes closed.';
          stageOutcome = 'Consistent sub-1.5s cross with blind execution, leaving cognitive bandwidth for first-pair tracking.';
        } else if (b.name.toLowerCase().includes('last layer') || b.name.toLowerCase().includes('ll')) {
          stageInterp = `Last layer accounts for ${b.actualPct}% of solve time. Recognition delays on OLL/PLL or two-look hesitations are holding back times.`;
          stageDrill = 'Flashcard algorithm drills with an automated PLL/OLL trainer; focus on 2-side PLL recognition.';
          stageOutcome = 'Fluid recognition in <0.4s and algorithmic execution without hesitation.';
        } else if (b.name.toLowerCase().includes('edge') || b.name.toLowerCase().includes('3-2-3')) {
          stageInterp = `Edge pairing consumes ${b.actualPct}% of solve time on big cubes. Searching for matching wing edges without lookahead stalls TPS.`;
          stageDrill = 'Yau 3-2-3 edge pairing isolation: practice buffer piece tracking and slice-flip-slice flow without looking at solved areas.';
          stageOutcome = 'Continuous edge pairing flow without mid-reduction pauses.';
        } else if (b.name.toLowerCase().includes('center')) {
          stageInterp = `Center construction is taking ${b.actualPct}% of total time. Inefficient bar building or excessive cube rotations.`;
          stageDrill = 'Center-only solves: build 1x3 bars with half-turn flips and minimal cube reorientations.';
          stageOutcome = 'Crisp, rotationless center reduction in fewer total moves.';
        }

        recs.push({
          id: `bottleneck_${b.name.toLowerCase().replace(/\s+/g, '_')}`,
          priority: 85,
          event: eventId,
          pattern: `Stage Bottleneck: ${b.name} is ${b.excessPct}% over target benchmark (${b.actualPct}% actual vs ${b.benchmarkPct}% expected)`,
          evidence: `Average ${b.name} duration is ${CubeStats.formatCs(b.meanCs)} across ${splitsAnalysis.sampleCount} timed split solves.`,
          interpretation: stageInterp,
          recommendation: stageDrill,
          intendedOutcome: stageOutcome,
          confidence: splitsAnalysis.sampleCount >= 20 ? 'High (N ≥ 20 splits)' : 'Moderate (splits sample limited)'
        });
      }
    } else if (solves.length >= 25 && (!splitsAnalysis || !splitsAnalysis.hasData)) {
      recs.push({
        id: 'enable_splits',
        priority: 70,
        event: eventId,
        pattern: 'No stage-split diagnostic data recorded yet',
        evidence: `${solves.length} total solves recorded, but none include stage breakdown timestamps.`,
        interpretation: 'Without stage splits, it is impossible to determine whether solve stagnation is caused by cross, F2L, or last-layer hesitation.',
        recommendation: 'Enable stage-split timing for a block of 10–15 practice solves to reveal your true efficiency distribution.',
        intendedOutcome: 'Pinpoint the exact solving stage that offers the greatest time return on investment.',
        confidence: 'N/A (Diagnostic guidance)'
      });
    }

    // Rule 4: Goal Pace Evaluation
    const ao12 = CubeStats.rollingAverage(solves, 12);
    if (ao12 !== null && Number.isFinite(ao12)) {
      const diffFromTarget = ao12 - targetCs;
      if (diffFromTarget <= 0) {
        recs.push({
          id: 'goal_achieved',
          priority: 60,
          event: eventId,
          pattern: `Current performance exceeds competition target!`,
          evidence: `Latest Ao12 (${CubeStats.formatCs(ao12)}) is faster than your ${CubeStats.formatCs(targetCs)} goal by ${CubeStats.formatCs(Math.abs(diffFromTarget))}.`,
          interpretation: 'Your current rolling pace consistently meets competition standards.',
          recommendation: 'Introduce match-condition stress training: cold solves (no warmup), official 15s inspection enforcement, and noisy background practice.',
          intendedOutcome: 'Build competition-floor resilience and consistency under psychological pressure.',
          confidence: confidenceLevel
        });
      } else if (diffFromTarget > 0 && diffFromTarget <= 150) {
        recs.push({
          id: 'goal_close',
          priority: 75,
          event: eventId,
          pattern: `Within striking distance of target (${CubeStats.formatCs(diffFromTarget)} gap)`,
          evidence: `Latest Ao12 is ${CubeStats.formatCs(ao12)} vs ${CubeStats.formatCs(targetCs)} target.`,
          interpretation: 'You are within 1.5 seconds of your goal. Major technique overhauls are unnecessary; incremental consistency gains and eliminating 1 pause per solve will achieve the target.',
          recommendation: 'Focus on clean solves without lockups. Do not change algorithms now; refine execution ergonomics on existing cases.',
          intendedOutcome: 'Shave the final centiseconds required to lock in a sub-target average.',
          confidence: confidenceLevel
        });
      }
    }

    // Sort by priority descending and take top 3
    recs.sort((a, b) => b.priority - a.priority);
    return recs.slice(0, 3);
  }

  /**
   * Generates an automated local weekly performance review comparing the last 7 days to prior 7 days.
   */
  function generateWeeklyReview(allSolves, eventId, goalConfig) {
    const now = Date.now();
    const oneDay = 86400000;
    const sevenDaysAgo = now - 7 * oneDay;
    const fourteenDaysAgo = now - 14 * oneDay;

    const eventSolves = allSolves.filter(s => s.event === eventId);
    const thisWeek = eventSolves.filter(s => {
      const t = new Date(s.createdAt).getTime();
      return t >= sevenDaysAgo && t <= now;
    });
    const lastWeek = eventSolves.filter(s => {
      const t = new Date(s.createdAt).getTime();
      return t >= fourteenDaysAgo && t < sevenDaysAgo;
    });

    const thisStats = CubeStats.descriptiveStats(thisWeek);
    const lastStats = CubeStats.descriptiveStats(lastWeek);
    const comparison = CubeStats.compareSubsets(lastWeek, thisWeek);

    // Identify new PBs set this week
    const pbData = CubeStats.trackPersonalBests(eventSolves);
    const newSinglesThisWeek = pbData.singleHistory.filter(pb => new Date(pb.date).getTime() >= sevenDaysAgo);
    const newAo5sThisWeek = pbData.ao5History.filter(pb => new Date(pb.date).getTime() >= sevenDaysAgo);

    const targetCs = goalConfig ? goalConfig.competitionCs : 800;
    const latestAo12 = CubeStats.rollingAverage(eventSolves, 12);
    const goalGap = latestAo12 ? latestAo12 - targetCs : null;

    let narrative = '';
    if (thisStats.count === 0) {
      narrative = `No practice solves recorded for ${eventId} in the past 7 days. Consistent weekly volume is vital for motor memory retention.`;
    } else {
      narrative = `You completed ${thisStats.count} solves this week with a mean time of ${CubeStats.formatCs(thisStats.mean)} and median of ${CubeStats.formatCs(thisStats.median)}. `;

      if (lastStats.count >= 5) {
        if (comparison.isSignificant) {
          narrative += comparison.diff < 0
            ? `Your solve time improved significantly by ${CubeStats.formatCs(Math.abs(comparison.diff))} (${Math.abs(comparison.percentChange)}%) compared to last week (p = ${comparison.pValue}). `
            : `Your mean time slowed by ${CubeStats.formatCs(comparison.diff)} compared to last week (p = ${comparison.pValue}). `;
        } else {
          narrative += `Performance was steady compared to last week (${comparison.conclusion}). `;
        }
      }

      if (newSinglesThisWeek.length > 0) {
        const fastestPB = newSinglesThisWeek.reduce((min, pb) => pb.timeCs < min.timeCs ? pb : min, newSinglesThisWeek[0]);
        narrative += `Celebration: You set a new personal best single of ${CubeStats.formatCs(fastestPB.timeCs)} this week! `;
      }

      if (newAo5sThisWeek.length > 0) {
        const fastestAo5 = newAo5sThisWeek.reduce((min, pb) => pb.timeCs < min.timeCs ? pb : min, newAo5sThisWeek[0]);
        narrative += `You also achieved a new PB Ao5 of ${CubeStats.formatCs(fastestAo5.timeCs)}. `;
      }

      if (goalGap !== null) {
        if (goalGap <= 0) {
          narrative += `Current rolling Ao12 is beating your competition target by ${CubeStats.formatCs(Math.abs(goalGap))}.`;
        } else {
          narrative += `Current distance to competition goal is ${CubeStats.formatCs(goalGap)}.`;
        }
      }
    }

    return {
      eventId,
      thisWeekCount: thisStats.count,
      lastWeekCount: lastStats.count,
      thisWeekMean: thisStats.mean,
      lastWeekMean: lastStats.mean,
      thisWeekCV: thisStats.cv,
      lastWeekCV: lastStats.cv,
      bestSingleThisWeek: thisStats.min,
      newPBsCount: newSinglesThisWeek.length + newAo5sThisWeek.length,
      comparison,
      narrative
    };
  }

  return {
    generateRecommendations,
    generateWeeklyReview
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CubeCoach;
}
