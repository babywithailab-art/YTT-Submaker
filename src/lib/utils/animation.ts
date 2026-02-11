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

    // Value interpolation
    if (typeof k1.value === "number" && typeof k2.value === "number") {
        return (k1.value + (k2.value - k1.value) * factor) as unknown as T;
    }

    // Color interpolation (hex format)
    if (typeof k1.value === "string" && k1.value.startsWith("#") &&
        typeof k2.value === "string" && k2.value.startsWith("#")) {
        return interpolateColor(k1.value, k2.value, factor) as unknown as T;
    }

    return k1.value;
}

function interpolateColor(c1: string, c2: string, factor: number): string {
    const r1 = parseInt(c1.substring(1, 3), 16);
    const g1 = parseInt(c1.substring(3, 5), 16);
    const b1 = parseInt(c1.substring(5, 7), 16);

    const r2 = parseInt(c2.substring(1, 3), 16);
    const g2 = parseInt(c2.substring(3, 5), 16);
    const b2 = parseInt(c2.substring(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
