import numpy as np
from scipy import signal


def production_smooth(values):
    values = np.asarray(values, dtype=float)
    kernel = min(13, len(values))
    if kernel % 2 == 0:
        kernel -= 1
    if kernel >= 3:
        return signal.medfilt(values, kernel_size=kernel)
    return values.copy()


def smooth_trajectory(values, max_delta=None, kernel_size=13):
    """
    Applies median filtering and strict slew-rate limiting to trajectory values.

    1. Kernel size clamping: Ensures odd kernel <= len(values).
    2. Median filtering via scipy.signal.medfilt.
    3. Slew-rate limiter (AF-02 invariant):
       If max_delta is provided, clamps every frame-to-frame delta:
         |x[t] - x[t-1]| <= max_delta
       Mathematically guarantees that no jump exceeds max_delta.
    """
    arr = np.asarray(values, dtype=float)
    n = len(arr)
    if n <= 1:
        return arr.copy()

    k = min(kernel_size, n)
    if k % 2 == 0:
        k -= 1

    if k >= 3:
        med = signal.medfilt(arr, kernel_size=k)
    else:
        med = arr.copy()

    if max_delta is not None and max_delta > 0:
        out = np.empty_like(med)
        out[0] = med[0]
        for t in range(1, n):
            delta = med[t] - out[t - 1]
            if delta > max_delta:
                out[t] = out[t - 1] + max_delta
            elif delta < -max_delta:
                out[t] = out[t - 1] - max_delta
            else:
                out[t] = med[t]
        return out

    return med


def test_known_outputs():
    cases = [
        ([1], [1]),
        ([1, 2], [1, 2]),
        ([1, 2, 3], [1, 2, 2]),
        ([1, 2, 3, 4], [1, 2, 3, 3]),
        ([1, 100, 3], [1, 3, 3]),
    ]

    for values, expected in cases:
        actual = production_smooth(values)
        assert np.allclose(actual, expected), (
            f"Input={values}, expected={expected}, actual={actual.tolist()}"
        )
        print(f"PASS: input={values}, output={actual.tolist()}")

    print("\nAll independent expected-output tests passed.")


def test_slew_rate_limiter_bounds():
    """Verify that smooth_trajectory with max_delta enforces |x[t] - x[t-1]| <= max_delta for all t."""
    max_delta = 15.0  # 15px max step
    # Massive step jump: 100 to 500
    jump_input = [100.0] * 10 + [500.0] * 10
    smoothed = smooth_trajectory(jump_input, max_delta=max_delta, kernel_size=13)

    deltas = np.abs(np.diff(smoothed))
    assert np.all(deltas <= max_delta + 1e-9), f"Delta exceeded max_delta: {deltas}"
    print(f"PASS: Step jump max delta = {np.max(deltas):.2f} <= {max_delta}")

    # Random extreme noise
    np.random.seed(42)
    noisy_input = np.random.uniform(0, 1000, size=100)
    smoothed_noisy = smooth_trajectory(noisy_input, max_delta=max_delta, kernel_size=13)
    noisy_deltas = np.abs(np.diff(smoothed_noisy))
    assert np.all(noisy_deltas <= max_delta + 1e-9), f"Noisy delta exceeded max_delta: {noisy_deltas}"
    print(f"PASS: Noisy input max delta = {np.max(noisy_deltas):.2f} <= {max_delta}")


if __name__ == "__main__":
    test_known_outputs()
    test_slew_rate_limiter_bounds()
