
import type { Cue, Span } from '$lib/types';
import { interpolate } from './animation';

// Helper to parse SRT timestamp "00:00:00,000" -> ms
function parseSrtTime(timeStr: string): number {
    const [main, ms] = timeStr.split(',');
    const [h, m, s] = main.split(':').map(Number);
    return (h * 3600 + m * 60 + s) * 1000 + parseInt(ms, 10);
}

// Helper to parse ASS timestamp "0:00:00.00" -> ms
function parseAssTime(timeStr: string): number {
    const [main, cs] = timeStr.split('.');
    const [h, m, s] = main.split(':').map(Number);
    // ASS centiseconds (1/100s)
    return (h * 3600 + m * 60 + s) * 1000 + parseInt(cs, 10) * 10;
}

export interface ParsedCue {
    startMs: number;
    endMs: number;
    text: string;
}

export function parseSRT(content: string): ParsedCue[] {
    const cues: ParsedCue[] = [];
    // Normalize newlines
    const normalized = content.replace(/\r\n/g, '\n');
    const blocks = normalized.split('\n\n');

    for (const block of blocks) {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) continue;

        // Line 1: Index (skip)
        // Line 2: Time
        let timeLineIndex = 0;
        // Sometimes index is missing or merged? Standard SRT has index.
        // Let's look for the arrow "-->"
        const arrowIndex = lines.findIndex(l => l.includes('-->'));
        if (arrowIndex === -1) continue;

        const timeLine = lines[arrowIndex];
        const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());

        try {
            const startMs = parseSrtTime(startStr);
            const endMs = parseSrtTime(endStr);
            // Text is everything after time line
            const text = lines.slice(arrowIndex + 1).join('\n');

            cues.push({ startMs, endMs, text });
        } catch (e) {
            console.warn('Failed to parse SRT block', block);
        }
    }
    return cues;
}

export function parseASS(content: string): ParsedCue[] {
    const cues: ParsedCue[] = [];
    const lines = content.split(/\r?\n/);

    let format: string[] = [];
    let inEvents = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '[Events]') {
            inEvents = true;
            continue;
        }
        if (!inEvents) continue;

        if (trimmed.startsWith('Format:')) {
            format = trimmed.substring(7).split(',').map(s => s.trim());
        } else if (trimmed.startsWith('Dialogue:')) {
            if (format.length === 0) continue; // No format found yet

            // Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
            // Split by comma, but Text can contain commas, so simple split is dangerous for the last field.
            // We need to split only into `format.length` parts.

            const rawValues = trimmed.substring(9).trim();
            // Split by comma, limited to format.length
            // JS split limit doesn't work like "rest", it truncates.
            // We implement custom split

            const parts: string[] = [];
            let current = '';
            let quotes = false; // ASS doesn't use quotes like CSV, just commas

            // Actually, simply split by comma `format.length - 1` times
            let remaining = rawValues;
            for (let i = 0; i < format.length - 1; i++) {
                const idx = remaining.indexOf(',');
                if (idx === -1) break;
                parts.push(remaining.substring(0, idx).trim());
                remaining = remaining.substring(idx + 1); // keep leading space? ASS usually trims?
            }
            parts.push(remaining); // The Text part (rest of string)

            if (parts.length !== format.length) continue;

            const startIdx = format.indexOf('Start');
            const endIdx = format.indexOf('End');
            const textIdx = format.indexOf('Text');

            if (startIdx !== -1 && endIdx !== -1 && textIdx !== -1) {
                try {
                    const startMs = parseAssTime(parts[startIdx]);
                    const endMs = parseAssTime(parts[endIdx]);
                    let text = parts[textIdx];

                    // Simple ASS tag stripping: {\...}
                    text = text.replace(/\{.*?\}/g, '');
                    // Handle \N for newline
                    text = text.replace(/\\N/g, '\n').replace(/\\n/g, '\n');

                    cues.push({ startMs, endMs, text });
                } catch (e) {
                    console.warn('Failed to parse ASS line', line);
                }
            }
        }
    }
    return cues;
}

// --- Export Helpers ---

function formatSrtTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mill = Math.floor(ms % 1000);

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${mill.toString().padStart(3, '0')}`;
}

function formatAssTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const cs = Math.floor((ms % 1000) / 10);

    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

// Helper to format Ruby text [Base/Ruby] -> Base(Ruby) for export
function formatRubyForExport(text: string): string {
    return text.replace(/\[(.*?)\/(.*?)\]/g, '$1($2)');
}

export function cuesToSRT(cues: Cue[]): string {
    return cues.map((cue, index) => {
        const indexLine = (index + 1).toString();
        const timeLine = `${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}`;
        const text = formatRubyForExport(cue.plainText);
        return `${indexLine}\n${timeLine}\n${text}\n`;
    }).join('\n');
}

export function cuesToASS(cues: Cue[], title = 'YTT Project'): string {
    const header = `[Script Info]
; Script generated by YTT Submaker
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,1,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events = cues.map(cue => {
        const start = formatAssTime(cue.startMs);
        const end = formatAssTime(cue.endMs);
        // Format Ruby first
        let text = formatRubyForExport(cue.plainText);
        // Replace newlines with \N
        text = text.replace(/\n/g, '\\N');
        return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    }).join('\n');

    return header + events;
}

export function cuesToYTT(cues: Cue[]): string {
    let xml = `<?xml version="1.0" encoding="utf-8" ?>\n<timedtext format="3">\n  <head>\n`;

    const wpMap = new Map<string, number>();
    const wsMap = new Map<string, number>();
    const penMap = new Map<string, number>();

    // Default Window Position
    xml += `    <wp id="0" ap="7" ah="50" av="95" />\n`;
    wpMap.set('0.5-0.95-7', 0);

    // Default Window Style (transparent bg)
    xml += `    <ws id="0" ju="2" />\n`;
    wsMap.set('transparent', 0);

    // Default Pen (white)
    xml += `    <pen id="0" fc="#FFFFFF" fo="255" />\n`;
    penMap.set('#FFFFFF-255-none', 0);

    let nextWpId = 1;
    let nextWsId = 1;
    let nextPenId = 1;

    const bodyParts = cues.map(cue => {
        // Animation Baking Logic
        // Check if cue has any enabled animation tracks with keyframes
        const hasAnim = cue.animTracks?.some(a => a.enabled && a.keyframes.length > 0);

        if (!hasAnim) {
            // Static Export (Original Logic)
            const t = cue.startMs;
            const d = cue.endMs - cue.startMs;

            // ... (rest of static logic same as before, essentially)
            const style = cue.styleOverride || { color: '#FFFFFF', fontSize: 24 };

            // 1. Window Position (wp)
            let wpId = 0;
            if (cue.posOverride) {
                const { xNorm = 0.5, yNorm = 0.95, anchor = 7 } = cue.posOverride;
                const key = `${xNorm.toFixed(3)}-${yNorm.toFixed(3)}-${anchor}`;
                if (wpMap.has(key)) {
                    wpId = wpMap.get(key)!;
                } else {
                    wpId = nextWpId++;
                    wpMap.set(key, wpId);
                    const ah = Math.round(xNorm * 100);
                    const av = Math.round(yNorm * 100);
                    xml += `    <wp id="${wpId}" ap="${anchor}" ah="${ah}" av="${av}" />\n`;
                }
            }

            // 2. Window Style (ws)
            let wsId = 0;
            if (style.backgroundColor) {
                const bgHex = style.backgroundColor.toUpperCase();
                const bgAlpha = Math.round((style.backgroundAlpha ?? 0.5) * 255);
                const wsKey = `${bgHex}-${bgAlpha}`;
                if (wsMap.has(wsKey)) {
                    wsId = wsMap.get(wsKey)!;
                } else {
                    wsId = nextWsId++;
                    wsMap.set(wsKey, wsId);
                    xml += `    <ws id="${wsId}" bc="${bgHex}" bo="${bgAlpha}" />\n`;
                }
            }

            // 3. Pen Style (pen) - color/alpha
            let penId = 0;
            const fc = (style.color || '#FFFFFF').toUpperCase();
            const fo = Math.round((style.alpha ?? 1.0) * 255);
            const etMap: Record<string, number> = { 'none': 0, 'outline': 3, 'shadow': 4, 'glow': 3, 'bevel': 1 };
            // Use edgeTypes array (first entry) or fallback to edgeType
            const primaryEdge = (style.edgeTypes && style.edgeTypes.length > 0) ? style.edgeTypes[0] : (style.edgeType || 'none');
            const et = etMap[primaryEdge] ?? 0;
            const ec = (style.edgeColor || '#000000').toUpperCase();
            const penKey = `${fc}-${fo}-${et}-${ec}`;

            if (penMap.has(penKey)) {
                penId = penMap.get(penKey)!;
            } else {
                penId = nextPenId++;
                penMap.set(penKey, penId);
                let penAttr = `fc="${fc}" fo="${fo}"`;
                if (et > 0) penAttr += ` et="${et}" ec="${ec}"`;
                xml += `    <pen id="${penId}" ${penAttr} />\n`;
            }

            const formattedText = formatRubyForExport(cue.plainText);
            const escapedText = formattedText
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');

            return `    <p t="${t}" d="${d}" wp="${wpId}" ws="${wsId}"><s p="${penId}">${escapedText}</s></p>`;
        } else {
            // Animated Export (Baking)
            const FPS = 30;
            const INTERVAL = Math.floor(1000 / FPS); // ~33ms
            let buffer = "";

            // Helper to get animated value for a cue at time t
            const getValue = (path: string, def: number, time: number) => {
                const anim = cue.animTracks.find(a => a.paramPath === path && a.enabled);
                if (anim) return interpolate(anim.keyframes, time, def);
                return def;
            };

            const basePos = cue.posOverride || { xNorm: 0.5, yNorm: 0.95, scale: 1, rotation: 0 };
            const baseStyle = cue.styleOverride || { color: '#FFFFFF', fontSize: 24, alpha: 1, backgroundAlpha: 0.5 };

            // Glitch Effect Check
            const glitchEffect = cue.effects?.find(e => e.type === 'glitch' && e.enabled);
            const isGlitch = !!glitchEffect;

            for (let t = cue.startMs; t < cue.endMs; t += INTERVAL) {
                // Determine duration of this frame
                // Clamp to endMs
                const nextT = Math.min(t + INTERVAL, cue.endMs);
                const d = nextT - t;
                if (d <= 0) break;

                // Interpolate Values
                const xNorm = getValue("posOverride.xNorm", basePos.xNorm ?? 0.5, t);
                const yNorm = getValue("posOverride.yNorm", basePos.yNorm ?? 0.95, t);
                // Scale/Rotation not easily supported in standard srv3 without transforms, skipping for now
                // Opacity
                const alpha = getValue("alpha", baseStyle.alpha ?? 1.0, t);
                const bgAlpha = getValue("backgroundAlpha", baseStyle.backgroundAlpha ?? 0.5, t);

                // --- Generate Layers (Glitch vs Normal) ---
                const layers = [];

                if (isGlitch) {
                    const params = glitchEffect!.params || {};
                    const intensity = params.intensity ?? 5; // Use as general probability/scale if needed
                    const jX = params.jitterX ?? 5;
                    const jY = params.jitterY ?? 2;
                    // Colors
                    const c1 = params.color1 ?? '#FF00C1';
                    const c2 = params.color2 ?? '#00FFF9';
                    const c3 = params.color3 ?? '#FFFFFF';

                    // Convert pixel jitter to normalized coords roughly
                    // Assuming 720p base for calculation (YTT doesn't have fixed px)
                    // standard YTT: 100 ah = 100% width.
                    // xNorm 0-1.
                    // Let's assume 1280x720. 1px ~ 0.00078 width.
                    const pxToNormX = 1 / 1280;
                    const pxToNormY = 1 / 720;

                    const jXNorm = jX * pxToNormX;
                    const jYNorm = jY * pxToNormY;

                    // Random offsets
                    const rX1 = (Math.random() - 0.5) * jXNorm;
                    const rY1 = (Math.random() - 0.5) * jYNorm;
                    const rX2 = (Math.random() - 0.5) * jXNorm;
                    const rY2 = (Math.random() - 0.5) * jYNorm;
                    // Center jitter (maybe less?)
                    const rXc = (Math.random() - 0.5) * jXNorm * 0.2;
                    const rYc = (Math.random() - 0.5) * jYNorm * 0.2;

                    layers.push({ x: xNorm + rX1, y: yNorm + rY1, color: c1, alpha: 0.7 });
                    layers.push({ x: xNorm + rX2, y: yNorm + rY2, color: c2, alpha: 0.7 });
                    layers.push({ x: xNorm + rXc, y: yNorm + rYc, color: c3, alpha: alpha });
                } else {
                    layers.push({ x: xNorm, y: yNorm, color: baseStyle.color || '#FFFFFF', alpha: alpha });
                }

                for (const layer of layers) {
                    // --- Generate WP (Position) ---
                    let wpId = 0;
                    // Always use standard anchor 7 for mapping x/y
                    const anchor = 7;
                    // Clamp coords to 0-1 to verify valid YTT? (YTT can handle Out of bounds?)
                    // Keep them raw for now.
                    const key = `${layer.x.toFixed(4)}-${layer.y.toFixed(4)}-${anchor}`;

                    if (wpMap.has(key)) {
                        wpId = wpMap.get(key)!;
                    } else {
                        wpId = nextWpId++;
                        wpMap.set(key, wpId);
                        const ah = Math.round(layer.x * 100);
                        const av = Math.round(layer.y * 100);
                        xml += `    <wp id="${wpId}" ap="${anchor}" ah="${ah}" av="${av}" />\n`;
                    }

                    // --- Generate WS (Background) ---
                    let wsId = 0;
                    if (baseStyle.backgroundColor) {
                        const bgHex = baseStyle.backgroundColor.toUpperCase();
                        const bgAlphaInt = Math.round(bgAlpha * 255);
                        const wsKey = `${bgHex}-${bgAlphaInt}`;
                        if (wsMap.has(wsKey)) {
                            wsId = wsMap.get(wsKey)!;
                        } else {
                            wsId = nextWsId++;
                            wsMap.set(wsKey, wsId);
                            xml += `    <ws id="${wsId}" bc="${bgHex}" bo="${bgAlphaInt}" />\n`;
                        }
                    }

                    // --- Generate Pen (Text Color/Alpha) ---
                    let penId = 0;
                    const fc = (layer.color || '#FFFFFF').toUpperCase();
                    // Animated alpha
                    const fo = Math.round(layer.alpha * 255);
                    const etMap: Record<string, number> = { 'none': 0, 'outline': 3, 'shadow': 4, 'glow': 3, 'bevel': 1 };
                    // Use edgeTypes array (first entry) or fallback to edgeType
                    const primaryEdge = (baseStyle.edgeTypes && baseStyle.edgeTypes.length > 0) ? baseStyle.edgeTypes[0] : (baseStyle.edgeType || 'none');
                    const et = etMap[primaryEdge] ?? 0;
                    const ec = (baseStyle.edgeColor || '#000000').toUpperCase();
                    const penKey = `${fc}-${fo}-${et}-${ec}`;

                    if (penMap.has(penKey)) {
                        penId = penMap.get(penKey)!;
                    } else {
                        penId = nextPenId++;
                        penMap.set(penKey, penId);
                        let penAttr = `fc="${fc}" fo="${fo}"`;
                        if (et > 0) penAttr += ` et="${et}" ec="${ec}"`;
                        xml += `    <pen id="${penId}" ${penAttr} />\n`;
                    }

                    const formattedText = formatRubyForExport(cue.plainText);
                    const escapedText = formattedText
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&apos;');

                    buffer += `    <p t="${t}" d="${d}" wp="${wpId}" ws="${wsId}"><s p="${penId}">${escapedText}</s></p>\n`;
                }
            }
            return buffer.trimEnd(); // Remove trailing newline
        }
    });

    xml += `  </head>\n  <body>\n${bodyParts.join('\n')}\n  </body>\n</timedtext>`;
    return xml;
}
