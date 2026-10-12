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


if __name__ == "__main__":
    test_known_outputs()
