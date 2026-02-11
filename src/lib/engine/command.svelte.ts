
import { projectStore } from '../stores/projectStore.svelte';
import type { Project, Track, Cue, KeyframeTrack, Effect, StyleProps } from '../types';
import type { AnimationPreset } from '../stores/presetStore.svelte';

export interface Command {
    execute(): void;
    undo(): void;
}

export class CommandManager {
    // Svelte 5 runes for reactivity? Or just standard array?
    // If we want UI to update (Undo button enabled via store), we might need reactivity.
    undoStack = $state<Command[]>([]);
    redoStack = $state<Command[]>([]);

    // Limits
    private maxHistory = 50;

    constructor() { }

    execute(command: Command) {
        command.execute();
        this.undoStack.push(command);
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        this.redoStack = []; // Clear redo on new action
    }

    undo() {
        const command = this.undoStack.pop();
        if (command) {
            command.undo();
            this.redoStack.push(command);
        }
    }

    redo() {
        const command = this.redoStack.pop();
        if (command) {
            command.execute();
            this.undoStack.push(command);
        }
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }
}

export const commandManager = new CommandManager();

// --- Specific Commands ---

export class AddCueCommand implements Command {
    private createdCue: Cue | null = null;

    constructor(
        private trackId: string,
        private startMs: number,
        private endMs: number,
        private text: string,
        private fullCue?: Cue // Optional full cue for duplication/paste
    ) { }

    execute() {
        if (!this.createdCue) {
            if (this.fullCue) {
                // Use the provided full cue as a template
                this.createdCue = JSON.parse(JSON.stringify(this.fullCue));
                this.createdCue!.startMs = this.startMs;
                this.createdCue!.endMs = this.endMs;
                this.createdCue!.id = crypto.randomUUID(); // Always fresh ID for duplication
                projectStore.restoreCue(this.trackId, this.createdCue!);
            } else {
                this.createdCue = projectStore.addCue(this.trackId, this.startMs, this.endMs, this.text);
            }
        } else {
            projectStore.restoreCue(this.trackId, this.createdCue);
        }
    }

    undo() {
        if (this.createdCue) {
            projectStore.removeCue(this.trackId, this.createdCue.id);
        }
    }
}

export class RemoveCueCommand implements Command {
    private removedCue: Cue | null = null;

    constructor(private trackId: string, private cueId: string) { }

    execute() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.cueId);
        if (cue) {
            // Use JSON clone instead of structuredClone to avoid Svelte proxy issues
            this.removedCue = JSON.parse(JSON.stringify(cue));
            projectStore.removeCue(this.trackId, this.cueId);
        }
    }

    undo() {
        if (this.removedCue) {
            projectStore.restoreCue(this.trackId, this.removedCue);
        }
    }
}

export class MoveCueCommand implements Command {
    constructor(
        private oldTrackId: string,
        private cueId: string,
        private oldStart: number,
        private oldEnd: number,
        private newStart: number,
        private newEnd: number,
        private newTrackId: string = oldTrackId
    ) { }

    execute() {
        if (this.newTrackId !== this.oldTrackId) {
            // Moving between tracks
            const oldTrack = projectStore.project.tracks.find(t => t.id === this.oldTrackId);
            const cue = oldTrack?.cues.find(c => c.id === this.cueId);
            if (cue) {
                const cueCopy = JSON.parse(JSON.stringify(cue));
                cueCopy.startMs = this.newStart;
                cueCopy.endMs = this.newEnd;
                projectStore.removeCue(this.oldTrackId, this.cueId);
                projectStore.restoreCue(this.newTrackId, cueCopy);
                projectStore.selectedTrackId = this.newTrackId;
            }
        } else {
            projectStore.updateCue(this.oldTrackId, this.cueId, { startMs: this.newStart, endMs: this.newEnd });
        }
    }

    undo() {
        if (this.newTrackId !== this.oldTrackId) {
            // Find it in the new track before removing it to get the most recent data
            const newTrack = projectStore.project.tracks.find(t => t.id === this.newTrackId);
            const cue = newTrack?.cues.find(c => c.id === this.cueId);
            if (cue) {
                const cueCopy = JSON.parse(JSON.stringify(cue));
                cueCopy.startMs = this.oldStart;
                cueCopy.endMs = this.oldEnd;
                projectStore.removeCue(this.newTrackId, this.cueId);
                projectStore.restoreCue(this.oldTrackId, cueCopy);
                projectStore.selectedTrackId = this.oldTrackId;
            }
        } else {
            projectStore.updateCue(this.oldTrackId, this.cueId, { startMs: this.oldStart, endMs: this.oldEnd });
        }
    }
}

export class TextChangeCommand implements Command {
    constructor(
        private trackId: string,
        private cueId: string,
        private oldText: string,
        private newText: string
    ) { }
    execute() {
        projectStore.updateCue(this.trackId, this.cueId, { plainText: this.newText });
    }
    undo() {
        projectStore.updateCue(this.trackId, this.cueId, { plainText: this.oldText });
    }
}

export class TimeChangeCommand implements Command {
    constructor(
        private trackId: string,
        private cueId: string,
        private oldStart: number,
        private oldEnd: number,
        private newStart: number,
        private newEnd: number
    ) { }
    execute() {
        projectStore.updateCue(this.trackId, this.cueId, { startMs: this.newStart, endMs: this.newEnd });
    }
    undo() {
        projectStore.updateCue(this.trackId, this.cueId, { startMs: this.oldStart, endMs: this.oldEnd });
    }
}


import type { Span } from '../types';

export class AddSpanCommand implements Command {
    private createdSpan: Span | null = null;

    constructor(
        private trackId: string,
        private cueId: string,
        private startChar: number,
        private endChar: number,
        private stylePatch: Partial<StyleProps>
    ) { }

    execute() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.cueId);
        if (!cue) return;

        if (!this.createdSpan) {
            this.createdSpan = {
                startChar: this.startChar,
                endChar: this.endChar,
                stylePatch: this.stylePatch
            };
        }

        cue.spans.push(this.createdSpan);
        cue.spans.sort((a, b) => a.startChar - b.startChar);
        projectStore.project.updatedAt = new Date().toISOString();
    }

    undo() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.cueId);
        if (!cue || !this.createdSpan) return;

        const idx = cue.spans.indexOf(this.createdSpan);
        if (idx !== -1) {
            cue.spans.splice(idx, 1);
            projectStore.project.updatedAt = new Date().toISOString();
        }
    }
}

export class RemoveSpanCommand implements Command {
    private removedSpan: Span | null = null;

    constructor(
        private trackId: string,
        private cueId: string,
        private spanIndex: number
    ) { }

    execute() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.cueId);
        if (!cue) return;

        if (this.spanIndex >= 0 && this.spanIndex < cue.spans.length) {
            this.removedSpan = cue.spans[this.spanIndex];
            cue.spans.splice(this.spanIndex, 1);
            projectStore.project.updatedAt = new Date().toISOString();
        }
    }

    undo() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.cueId);
        if (!cue || !this.removedSpan) return;

        if (this.spanIndex >= 0) {
            cue.spans.splice(this.spanIndex, 0, this.removedSpan);
            projectStore.project.updatedAt = new Date().toISOString();
        }
    }
}

export class SplitCueCommand implements Command {
    private createdCue: Cue | null = null;
    private originalCueEndMs: number = 0;

    constructor(
        private trackId: string,
        private originalCueId: string,
        private splitTimeMs: number
    ) { }

    execute() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.originalCueId);

        if (!cue) return;

        // Save original state for undo
        this.originalCueEndMs = cue.endMs;

        // 1. Update original cue end time
        projectStore.updateCue(this.trackId, this.originalCueId, { endMs: this.splitTimeMs });

        // 2. Create new cue
        if (!this.createdCue) {
            // New cue starts at split time, ends at original end
            // Text is duplicated for now (or could be empty)
            this.createdCue = projectStore.addCue(
                this.trackId,
                this.splitTimeMs,
                this.originalCueEndMs,
                cue.plainText // Duplicate text
            );
            // Copy styles/spans if needed? 
            // For now, complex span splitting is hard. Let's just copy plain text.
            // Ideally we should split text based on estimated time or char count, but we don't have that info.
        } else {
            projectStore.restoreCue(this.trackId, this.createdCue);
        }
    }

    undo() {
        // 1. Remove the new cue
        if (this.createdCue) {
            projectStore.removeCue(this.trackId, this.createdCue.id);
        }

        // 2. Restore original cue end time
        projectStore.updateCue(this.trackId, this.originalCueId, { endMs: this.originalCueEndMs });
    }
}

export class MergeCuesCommand implements Command {
    private mergedCueId: string | null = null; // The ID of the cue we merged INTO (usually the first one)
    private removedCue: Cue | null = null;     // The cue that was removed (the second one)
    private originalFirstCueEndMs: number = 0;
    private originalFirstCueText: string = "";

    constructor(
        private trackId: string,
        private firstCueId: string,
        private secondCueId: string
    ) { }

    execute() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue1 = track?.cues.find(c => c.id === this.firstCueId);
        const cue2 = track?.cues.find(c => c.id === this.secondCueId);

        if (!cue1 || !cue2) return;

        this.mergedCueId = cue1.id;
        this.originalFirstCueEndMs = cue1.endMs;
        this.originalFirstCueText = cue1.plainText;

        // Save second cue for undo
        this.removedCue = JSON.parse(JSON.stringify(cue2));

        // 1. Update first cue: extend end time and append text
        const newEnd = Math.max(cue1.endMs, cue2.endMs);
        const newText = cue1.plainText + " " + cue2.plainText;

        projectStore.updateCue(this.trackId, cue1.id, {
            endMs: newEnd,
            plainText: newText
            // Spans merging is complex, ignoring for now (clearing spans might be safer or appending)
            // If cues have spans, the indices need offset. 
            // TODO: Handle spans
        });

        // 2. Remove second cue
        projectStore.removeCue(this.trackId, cue2.id);
    }

    undo() {
        if (!this.mergedCueId || !this.removedCue) return;

        // 1. Restore first cue
        projectStore.updateCue(this.trackId, this.mergedCueId, {
            endMs: this.originalFirstCueEndMs,
            plainText: this.originalFirstCueText
        });

        // 2. Restore second cue
        projectStore.restoreCue(this.trackId, this.removedCue);
    }
}

import type { Keyframe } from '../types';

export class AddKeyframeCommand<T> implements Command {
    constructor(
        private trackId: string,
        private paramPath: string, // e.g. "transform.xNorm"
        private keyframe: Keyframe<T>,
        private cueId?: string
    ) { }

    execute() {
        projectStore.addKeyframe(this.trackId, this.paramPath, this.keyframe, this.cueId);
    }

    undo() {
        projectStore.removeKeyframe(this.trackId, this.paramPath, this.keyframe.tMs, this.cueId);
    }
}

export class RemoveKeyframeCommand implements Command {
    private removedKeyframe: Keyframe<any> | null = null;

    constructor(
        private trackId: string,
        private paramPath: string,
        private tMs: number,
        private cueId?: string
    ) { }

    execute() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        let target: Track | Cue | undefined = track;
        if (this.cueId && track) {
            target = track.cues.find(c => c.id === this.cueId);
        }

        const animTrack = target?.animTracks.find(a => a.paramPath === this.paramPath);
        const kf = animTrack?.keyframes.find(k => Math.abs(k.tMs - this.tMs) < 0.001);

        if (kf) {
            this.removedKeyframe = JSON.parse(JSON.stringify(kf));
            projectStore.removeKeyframe(this.trackId, this.paramPath, this.tMs, this.cueId);
        }
    }

    undo() {
        if (this.removedKeyframe) {
            projectStore.addKeyframe(this.trackId, this.paramPath, this.removedKeyframe, this.cueId);
        }
    }
}

export class UpdateKeyframeValueCommand<T> implements Command {
    private oldValue: T | null = null;

    constructor(
        private trackId: string,
        private paramPath: string,
        private tMs: number,
        private newValue: T,
        private cueId?: string
    ) { }

    execute() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        let target: Track | Cue | undefined = track;
        if (this.cueId && track) {
            target = track.cues.find(c => c.id === this.cueId);
        }

        const animTrack = target?.animTracks.find(a => a.paramPath === this.paramPath);
        const kf = animTrack?.keyframes.find(k => Math.abs(k.tMs - this.tMs) < 0.001);

        if (kf) {
            this.oldValue = kf.value;
            projectStore.updateKeyframe(this.trackId, this.paramPath, this.tMs, { value: this.newValue }, this.cueId);
        }
    }

    undo() {
        if (this.oldValue !== null) {
            projectStore.updateKeyframe(this.trackId, this.paramPath, this.tMs, { value: this.oldValue }, this.cueId);
        }
    }
}

export class UpdateTrackStyleCommand implements Command {
    private oldStyle: Partial<StyleProps> = {};
    private removedSpans: { cueId: string; span: Span }[] = [];

    constructor(
        private trackId: string,
        private newStyle: Partial<StyleProps>
    ) { }

    execute() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        if (!track) return;

        // 1. Capture old style for undo (only the properties being changed)
        this.oldStyle = {};
        for (const key in this.newStyle) {
            const k = key as keyof StyleProps;
            this.oldStyle[k] = track.defaultStyle[k] as any;
        }

        // 2. Logic: If changing color, find "Full-Text Spans" to remove
        // Only calculate this on the FIRST execution (when removedSpans is empty)
        // On Redo, we just re-remove the same spans we captured.
        // Actually, on redo, the cues might have changed?
        // Command pattern assumes state is deterministic if we undo/redo in order.
        // But if we want to be robust, we can recalculate or just use the saved ones.
        // Saved ones is safer for "exact reverse".

        // Wait, if we use saved ones, we need to be sure they still exist?
        // If the user did: Change Color -> Undo -> Delete Cue -> Redo Change Color
        // The Redo would try to remove spans from a deleted cue.
        // But the "Delete Cue" should have been undone before we can Redo "Change Color".
        // So the state should be consistent.

        if (this.removedSpans.length === 0 && 'color' in this.newStyle) {
            for (const cue of track.cues) {
                // Clear cue-level style override if matches
                // (For simplicity/MVP, let's stick to Span cleanup as that was the main complex part.
                // Cue style override cleanup was also part of the logic. Let's handle spans first.)

                const textLen = cue.plainText.length;
                if (cue.spans && cue.spans.length > 0) {
                    // Find spans to remove
                    const spansToRemove = cue.spans.filter(span =>
                        span.startChar <= 0 && span.endChar >= textLen && span.stylePatch.color
                    );

                    for (const s of spansToRemove) {
                        this.removedSpans.push({ cueId: cue.id, span: JSON.parse(JSON.stringify(s)) });
                    }
                }
            }
        }

        // 3. Apply Style Change
        projectStore.updateTrackStyle(this.trackId, this.newStyle);

        // 4. Remove the spans
        if (this.removedSpans.length > 0) {
            for (const item of this.removedSpans) {
                const cue = track.cues.find(c => c.id === item.cueId);
                if (cue && cue.spans) {
                    // We need to find the span instance in the current cue
                    // matching the one we saved.
                    // Since spans don't have IDs, we match by value or assumption of existence?
                    // Or just filter it out again using the same logic?
                    // Re-filtering is robust.
                    // But we want to restore exact same ones.
                    // Let's rely on value equality for removal?
                    // Or better: just run the filter logic again to remove them?
                    // If we run filter logic, we maximize consistency with "what should happen".
                    // But for Undo to work, we MUST have saved them.

                    // Let's filter out by reference if we just captured them? No, reactivity proxies.
                    // Let's filter by index? Indices shift.
                    // Let's Filter by content (start/end/style).
                    const idx = cue.spans.findIndex(s =>
                        s.startChar === item.span.startChar &&
                        s.endChar === item.span.endChar &&
                        JSON.stringify(s.stylePatch) === JSON.stringify(item.span.stylePatch)
                    );
                    if (idx !== -1) {
                        cue.spans.splice(idx, 1);
                    }
                }
            }
            projectStore.project.updatedAt = new Date().toISOString();
        }
    }

    undo() {
        // 1. Restore Track Style
        projectStore.updateTrackStyle(this.trackId, this.oldStyle);

        // 2. Restore Spans
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        if (track && this.removedSpans.length > 0) {
            for (const item of this.removedSpans) {
                const cue = track.cues.find(c => c.id === item.cueId);
                if (cue) {
                    if (!cue.spans) cue.spans = [];
                    cue.spans.push(item.span);
                    cue.spans.sort((a, b) => a.startChar - b.startChar);
                }
            }
            projectStore.project.updatedAt = new Date().toISOString();
        }
    }
}

export class UpdateCueStyleCommand implements Command {
    private oldStyle: Partial<StyleProps> | undefined;

    constructor(
        private trackId: string,
        private cueId: string,
        private newStyle: Partial<StyleProps>
    ) { }

    execute() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.cueId);
        if (!cue) return;

        // Capture old style (snapshot the whole override object or just diff? 
        // UpdateCueStyle typically merges. 
        // If we want to undo a merge, we need the *state before merge*.
        // So let's snapshot the entire current `styleOverride`.
        if (this.oldStyle === undefined) {
            this.oldStyle = cue.styleOverride ? JSON.parse(JSON.stringify(cue.styleOverride)) : undefined;
        }

        projectStore.updateCueStyle(this.trackId, this.cueId, this.newStyle);
    }

    undo() {
        // To restore, we set the styleOverride back to oldStyle.
        // But `updateCueStyle` usually merges.
        // We need a way to SET (replace) the style.
        // projectStore doesn't have `setCueStyle`.
        // accessible via reference?
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.cueId);
        if (cue) {
            cue.styleOverride = this.oldStyle;
            projectStore.project.updatedAt = new Date().toISOString();
        }
    }
}

export class UpdateCuePositionCommand implements Command {
    constructor(
        private trackId: string,
        private cueId: string,
        private oldPos: any, // PositionOverride
        private newPos: any
    ) { }

    execute() {
        projectStore.updateCue(this.trackId, this.cueId, { posOverride: this.newPos });
    }

    undo() {
        projectStore.updateCue(this.trackId, this.cueId, { posOverride: this.oldPos });
    }
}

export class UpdateKeyframeTimeCommand implements Command {
    constructor(
        private trackId: string,
        private paramPath: string,
        private oldTMs: number,
        private newTMs: number,
        private cueId?: string
    ) { }

    execute() {
        projectStore.updateKeyframe(this.trackId, this.paramPath, this.oldTMs, { tMs: this.newTMs }, this.cueId);
        // We need to trigger sort? projectStore doesn't sort on update.
        // We should probably sort here or adding a sort method to store.
        // For now, let's assume store needs a fix or we do it manually?
        // Accessing store internal state is hard.
        // But since we are modifying the object in place (by reference in store), 
        // the array order is what matters.
        // Let's rely on projectStore exposing a sort check? 
        // Or better: Remove and Add?
        // Remove and Add is safer for sorting.
        // But Update preserves ID.
        // Let's stick to update for now, and maybe fix store later if needed.
        // Actually, interpolate often handles unsorted?
        // Let's check animation.ts later. 
        // For now, just the command.
    }

    undo() {
        projectStore.updateKeyframe(this.trackId, this.paramPath, this.newTMs, { tMs: this.oldTMs }, this.cueId);
    }
}

export class ReorderEffectsCommand implements Command {
    oldEffects: any[] = [];

    constructor(
        private trackId: string,
        private cueId: string,
        private newEffects: any[]
    ) { }

    execute() {
        const track = projectStore.project.tracks.find(t => t.id === this.trackId);
        if (!track) return;
        const cue = track.cues.find((c) => c.id === this.cueId);
        if (!cue) return;

        this.oldEffects = [...(cue.effects || [])];
        cue.effects = this.newEffects;
    }

    undo() {
        const track = projectStore.project.tracks.find(t => t.id === this.trackId);
        if (!track) return;
        const cue = track.cues.find((c) => c.id === this.cueId);
        if (!cue) return;

        cue.effects = this.oldEffects;
    }
}

export class RemoveTrackCommand implements Command {
    private removedTrack: Track | null = null;
    private removedIndex: number = -1;

    constructor(private trackId: string) { }

    execute() {
        const idx = projectStore.project.tracks.findIndex(t => t.id === this.trackId);
        if (idx !== -1) {
            this.removedTrack = JSON.parse(JSON.stringify(projectStore.project.tracks[idx]));
            this.removedIndex = idx;
            projectStore.removeTrack(this.trackId);
        }
    }

    undo() {
        if (this.removedTrack && this.removedIndex !== -1) {
            projectStore.addTrackAt(this.removedTrack, this.removedIndex);
        }
    }
}

export class AddEffectCommand implements Command {
    private createdEffect: any = null;
    constructor(
        private trackId: string,
        private effectType: string,
        private params: Record<string, any> = {},
        private cueId?: string
    ) { }
    execute() {
        if (!this.createdEffect) {
            this.createdEffect = projectStore.addEffect(this.trackId, this.effectType, this.params, this.cueId);
        } else {
            projectStore.restoreEffect(this.trackId, this.createdEffect, this.cueId);
        }
    }
    undo() {
        if (this.createdEffect) {
            projectStore.removeEffect(this.trackId, this.createdEffect.id, this.cueId);
        }
    }
}

export class RemoveEffectCommand implements Command {
    private removedEffect: any = null;
    constructor(
        private trackId: string,
        private effectId: string,
        private cueId?: string
    ) { }
    execute() {
        const track = projectStore.project.tracks.find(t => t.id === this.trackId);
        if (!track) return;
        const target = this.cueId ? track.cues.find(c => c.id === this.cueId) : track;
        if (!target) return;
        const effects = this.cueId ? (target as any).effects : (target as any).trackEffects;
        const effect = effects.find((e: any) => e.id === this.effectId);
        if (effect) {
            this.removedEffect = JSON.parse(JSON.stringify(effect));
            projectStore.removeEffect(this.trackId, this.effectId, this.cueId);
        }
    }
    undo() {
        if (this.removedEffect) {
            projectStore.restoreEffect(this.trackId, this.removedEffect, this.cueId);
        }
    }
}

export class UpdateEffectParamCommand implements Command {
    constructor(
        private trackId: string,
        private effectId: string,
        private oldParams: Record<string, any>,
        private newParams: Record<string, any>,
        private cueId?: string
    ) { }
    execute() {
        projectStore.updateEffect(this.trackId, this.effectId, this.newParams, this.cueId);
    }
    undo() {
        projectStore.updateEffect(this.trackId, this.effectId, this.oldParams, this.cueId);
    }
}

export class ToggleSpanStyleCommand implements Command {
    private originalSpans: Span[] = [];

    constructor(
        private trackId: string,
        private cueId: string,
        private startChar: number,
        private endChar: number,
        private styleProperty: keyof StyleProps,
        private toggleValue: any = true // e.g., true for boolean, or specific value
    ) { }

    execute() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.cueId);
        if (!cue) return;

        // If it's alignment, we usually want it to apply to the entire cue
        // regardless of selection, unless we want per-character alignment (rare).
        // Let's force whole-cue for 'align' property.
        if (this.styleProperty === 'align') {
            this.startChar = 0;
            this.endChar = cue.plainText.length;
        }

        // 1. Snapshot original spans for undo
        this.originalSpans = JSON.parse(JSON.stringify(cue.spans));

        // 2. Identify if we are adding or removing
        let allHaveStyle = true;
        const relevantSpans = cue.spans.filter(s =>
            s.startChar < this.endChar && s.endChar > this.startChar
        );

        // Check if the range is fully covered by spans with this property
        for (let i = this.startChar; i < this.endChar; i++) {
            const spanAtChar = relevantSpans.find(s => i >= s.startChar && i < s.endChar);
            if (!spanAtChar || spanAtChar.stylePatch[this.styleProperty] !== this.toggleValue) {
                allHaveStyle = false;
                break;
            }
        }

        const shouldAdd = !allHaveStyle;

        // 3. Apply the change
        if (shouldAdd) {
            this.applyStyle(cue, this.styleProperty, this.toggleValue);
        } else {
            this.removeStyle(cue, this.styleProperty);
        }

        // 4. Merge adjacent identical spans (cleanup)
        this.mergeSpans(cue);

        projectStore.project.updatedAt = new Date().toISOString();
    }

    private applyStyle(cue: Cue, prop: keyof StyleProps, val: any) {
        this.removeStyle(cue, prop); // Clear range first to avoid duplicates/conflicts

        this.splitSpansAt(cue, this.startChar);
        this.splitSpansAt(cue, this.endChar);

        // Update existing spans inside range
        cue.spans.forEach(s => {
            if (s.startChar >= this.startChar && s.endChar <= this.endChar) {
                s.stylePatch[prop] = val;
            }
        });

        // Fill gaps
        cue.spans.sort((a, b) => a.startChar - b.startChar);

        let currentPos = this.startChar;
        const newSpans: Span[] = [];

        const internalSpans = cue.spans.filter(s => s.startChar >= this.startChar && s.endChar <= this.endChar);

        for (const span of internalSpans) {
            if (span.startChar > currentPos) {
                newSpans.push({
                    startChar: currentPos,
                    endChar: span.startChar,
                    stylePatch: { [prop]: val }
                });
            }
            currentPos = span.endChar;
        }

        if (currentPos < this.endChar) {
            newSpans.push({
                startChar: currentPos,
                endChar: this.endChar,
                stylePatch: { [prop]: val }
            });
        }

        cue.spans.push(...newSpans);
        cue.spans.sort((a, b) => a.startChar - b.startChar);
    }

    private removeStyle(cue: Cue, prop: keyof StyleProps) {
        this.splitSpansAt(cue, this.startChar);
        this.splitSpansAt(cue, this.endChar);

        cue.spans.forEach(s => {
            if (s.startChar >= this.startChar && s.endChar <= this.endChar) {
                delete s.stylePatch[prop];
            }
        });

        cue.spans = cue.spans.filter(s => Object.keys(s.stylePatch).length > 0);
    }

    private splitSpansAt(cue: Cue, splitPos: number) {
        const toSplit = cue.spans.find(s => s.startChar < splitPos && s.endChar > splitPos);

        if (toSplit) {
            const rightHalf: Span = {
                startChar: splitPos,
                endChar: toSplit.endChar,
                stylePatch: { ...toSplit.stylePatch }
            };
            toSplit.endChar = splitPos;
            cue.spans.push(rightHalf);
        }
    }

    private mergeSpans(cue: Cue) {
        if (cue.spans.length < 2) return;

        cue.spans.sort((a, b) => a.startChar - b.startChar);

        const merged: Span[] = [];
        let current = cue.spans[0];

        for (let i = 1; i < cue.spans.length; i++) {
            const next = cue.spans[i];

            if (current.endChar === next.startChar && this.areStylesEqual(current.stylePatch, next.stylePatch)) {
                current.endChar = next.endChar;
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        cue.spans = merged;
    }

    private areStylesEqual(a: Partial<StyleProps>, b: Partial<StyleProps>) {
        const kA = Object.keys(a).sort();
        const kB = Object.keys(b).sort();
        if (kA.length !== kB.length) return false;

        for (let i = 0; i < kA.length; i++) {
            const key = kA[i] as keyof StyleProps;
            if (key !== kB[i]) return false;
            if (a[key] !== b[key]) return false;
        }
        return true;
    }

    undo() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.cueId);
        if (cue) {
            cue.spans = JSON.parse(JSON.stringify(this.originalSpans));
            projectStore.project.updatedAt = new Date().toISOString();
        }
    }
}

export class ApplyAnimationPresetCommand implements Command {
    private oldAnimTracks: KeyframeTrack<any>[] = [];
    private oldEffects: Effect[] = [];

    constructor(
        private trackId: string,
        private cueId: string,
        private preset: AnimationPreset
    ) { }

    execute() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.cueId);
        if (!cue) return;

        // Store current state for undo
        this.oldAnimTracks = JSON.parse(JSON.stringify(cue.animTracks));
        this.oldEffects = JSON.parse(JSON.stringify(cue.effects || []));

        // Clear current
        cue.animTracks = [];
        cue.effects = [];

        // Apply preset effects
        if (this.preset.effects) {
            cue.effects = JSON.parse(JSON.stringify(this.preset.effects));
            // Fresh IDs for effects just in case (though presets have their own IDs, 
            // maybe keep them or regen? Let's keep them so animation tracks match)
        }

        // Apply preset animation tracks
        if (this.preset.animTracks) {
            const clonedTracks: KeyframeTrack<any>[] = JSON.parse(JSON.stringify(this.preset.animTracks));

            // Rebase keyframes to match the cue's start time
            // Presets are assumed to be stored relative to 0ms (cue start)
            for (const at of clonedTracks) {
                at.targetId = cue.id;
                for (const kf of at.keyframes) {
                    kf.tMs = cue.startMs + kf.tMs;
                }
                cue.animTracks.push(at);
            }
        }

        projectStore.project.updatedAt = new Date().toISOString();
    }

    undo() {
        const track = projectStore.project?.tracks.find(t => t.id === this.trackId);
        const cue = track?.cues.find(c => c.id === this.cueId);
        if (!cue) return;

        cue.animTracks = this.oldAnimTracks;
        cue.effects = this.oldEffects;
        projectStore.project.updatedAt = new Date().toISOString();
    }
}
