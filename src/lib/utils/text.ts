
import type { Span, StyleProps } from '$lib/types';

export interface StyledSegment {
    text: string;
    style: Partial<StyleProps>;
}

export function getStyledSegments(text: string, spans: Span[]): StyledSegment[] {
    if (!spans || spans.length === 0) {
        return [{ text, style: {} }];
    }

    // 1. Collect all boundaries
    const boundaries = new Set<number>();
    boundaries.add(0);
    boundaries.add(text.length);
    spans.forEach(s => {
        boundaries.add(Math.max(0, Math.min(text.length, s.startChar)));
        boundaries.add(Math.max(0, Math.min(text.length, s.endChar)));
    });

    const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);
    const segments: StyledSegment[] = [];

    // 2. Iterate intervals
    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
        const start = sortedBoundaries[i];
        const end = sortedBoundaries[i + 1];
        if (start === end) continue;

        const segmentText = text.slice(start, end);

        // Find active spans
        const activeSpans = spans.filter(s => s.startChar <= start && s.endChar >= end);

        // Merge styles
        let mergedStyle: Partial<StyleProps> = {};
        // Sort active spans by startChar (or maybe priority? Insert order?)
        // For now, let's assume later spans override earlier ones if they have conflict properties
        // But the input spans might not be sorted by creation time here. 
        // We usually sort by startChar. 
        // Let's iterate activeSpans in order they appear in the `spans` array (assuming preserving order matters)

        activeSpans.forEach(s => {
            mergedStyle = { ...mergedStyle, ...s.stylePatch };
        });

        segments.push({
            text: segmentText,
            style: mergedStyle
        });
    }

    return segments;
}
