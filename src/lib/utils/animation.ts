import type { Keyframe } from "$lib/types";

export function interpolate<T>(
    keyframes: Keyframe<T>[],
    tMs: number,
    defaultValue: T
): T {
    if (!keyframes || keyframes.length === 0) return defaultValue;

    // Sort keyframes just in case (though they should be sorted)
    // Optimization: Assume sorted or sort continuously maintained
    const sorted = [...keyframes].sort((a, b) => a.tMs - b.tMs);

    // If before first keyframe
    if (tMs < sorted[0].tMs) {
        return sorted[0].value;
    }

    // If after last keyframe
    if (tMs >= sorted[sorted.length - 1].tMs) {
        return sorted[sorted.length - 1].value;
    }

    // Find interval [k1, k2]
    for (let i = 0; i < sorted.length - 1; i++) {
        const k1 = sorted[i];
        const k2 = sorted[i + 1];

        if (tMs >= k1.tMs && tMs < k2.tMs) {
            return interpolateValue(k1, k2, tMs);
        }
    }

    return defaultValue;
}

function interpolateValue<T>(k1: Keyframe<T>, k2: Keyframe<T>, tMs: number): T {
    const t = (tMs - k1.tMs) / (k2.tMs - k1.tMs);
    let factor = t;

    // Easing
    switch (k2.interp) {
        case "hold": // Step interpolation
            return k1.value;
        case "easeIn":
            factor = t * t;
            break;
        case "easeOut":
            factor = t * (2 - t);
            break;
        case "easeInOut":
            factor = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            break;
        case "linear":
        default:
            factor = t;
            break;
    }

    // Value interpolation (Number only for MVP)
    if (typeof k1.value === "number" && typeof k2.value === "number") {
        return (k1.value + (k2.value - k1.value) * factor) as unknown as T;
    }

    // Fallback for non-numbers (colors? strings?)
    // Color interpolation requires separate logic, sticking to Hold for now.
    return k1.value;
}
