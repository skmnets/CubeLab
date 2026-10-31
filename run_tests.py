# Standalone verification runner for CubeLab v4 algorithms
import math

def effective_cs(base_cs, penalty):
    if penalty == 'DNF': return float('inf')
    return base_cs + 200 if penalty == '+2' else base_cs

def trimmed_average(solves):
    n = len(solves)
    if n < 3: return None
    if n == 3:
        vals = [effective_cs(s['baseCs'], s['penalty']) for s in solves]
        if any(math.isinf(v) for v in vals): return float('inf')
        return round(sum(vals) / 3)
    if n < 5: return None
    trim = math.ceil(n * 0.05)
    sorted_vals = sorted([effective_cs(s['baseCs'], s['penalty']) for s in solves])
    kept = sorted_vals[trim : n - trim]
    if any(math.isinf(v) for v in kept): return float('inf')
    return round(sum(kept) / len(kept))

def descriptive_stats(solves):
    valid = [effective_cs(s['baseCs'], s['penalty']) for s in solves if s['penalty'] != 'DNF']
    if not valid: return None
    valid.sort()
    n = len(valid)
    mean = sum(valid) / n
    variance = sum((x - mean) ** 2 for x in valid) / (n - 1) if n > 1 else 0
    std_dev = math.sqrt(variance)
    cv = (std_dev / mean) * 100 if mean > 0 else 0
    median = valid[n // 2] if n % 2 == 1 else (valid[n // 2 - 1] + valid[n // 2]) / 2
    return {'mean': round(mean), 'std_dev': round(std_dev, 1), 'cv': round(cv, 1), 'median': round(median)}

def run_all_tests():
    print("Running Python algorithmic verification suite...")
    
    # 1. Ao5 trimming
    ao5_data = [{'baseCs': x, 'penalty': 'none'} for x in [800, 1200, 900, 1100, 1000]]
    assert trimmed_average(ao5_data) == 1000, "Ao5 failed"
    print("[PASS] Ao5 trimming")

    # 2. Ao5 single DNF
    ao5_dnf1 = [{'baseCs': x, 'penalty': 'none'} for x in [800, 900, 1000, 1100]] + [{'baseCs': 1500, 'penalty': 'DNF'}]
    assert trimmed_average(ao5_dnf1) == 1000, "Ao5 single DNF failed"
    print("[PASS] Ao5 single DNF handled as slowest")

    # 3. Ao5 two DNFs
    ao5_dnf2 = [{'baseCs': 800, 'penalty': 'none'}, {'baseCs': 900, 'penalty': 'none'}, {'baseCs': 1000, 'penalty': 'none'}, {'baseCs': 1100, 'penalty': 'DNF'}, {'baseCs': 1200, 'penalty': 'DNF'}]
    assert math.isinf(trimmed_average(ao5_dnf2)), "Ao5 2 DNFs failed"
    print("[PASS] Ao5 multiple DNFs returns DNF")

    # 4. Ao50 5% trim (ceil 50*0.05 = 3)
    ao50_data = [{'baseCs': i * 100, 'penalty': 'none'} for i in range(1, 51)]
    assert trimmed_average(ao50_data) == 2550, "Ao50 trim failed"
    print("[PASS] Ao50 5% trim calculation")

    # 5. Descriptive Stats
    stats = descriptive_stats([{'baseCs': x, 'penalty': 'none'} for x in [1000, 1200, 1400, 1600, 1800]])
    assert stats['mean'] == 1400 and stats['median'] == 1400, "Stats mean/median failed"
    assert abs(stats['std_dev'] - 316.2) < 0.5, "Stats std_dev failed"
    assert abs(stats['cv'] - 22.6) < 0.5, "Stats CV failed"
    print("[PASS] Descriptive stats (Mean, Median, Sample StdDev, CV)")

    print("\nAll algorithmic verification tests passed successfully!")

if __name__ == '__main__':
    run_all_tests()
