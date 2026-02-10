<script lang="ts">
    import type { Cue } from "$lib/types";
    import { projectStore } from "$lib/stores/projectStore.svelte";
    import { commandManager, MoveCueCommand } from "$lib/engine/command.svelte";

    interface Props {
        cue: Cue;
        pixelsPerSecond: number;
        trackId: string;
    }
    let { cue, pixelsPerSecond, trackId } = $props();

    let left = $derived((cue.startMs / 1000) * pixelsPerSecond);
    let width = $derived(((cue.endMs - cue.startMs) / 1000) * pixelsPerSecond);
    let isSelected = $derived(projectStore.selectedCueIds.has(cue.id));

    function handleMouseDown(e: MouseEvent) {
        e.stopPropagation();
        // Select with reassignment for reactivity
        if (!e.ctrlKey && !e.shiftKey) {
            projectStore.selectedCueIds = new Set([cue.id]);
        } else {
            const next = new Set(projectStore.selectedCueIds);
            if (next.has(cue.id)) {
                next.delete(cue.id);
            } else {
                next.add(cue.id);
            }
            projectStore.selectedCueIds = next;
        }
        projectStore.selectedTrackId = trackId;

        // Drag logic (Move)
        const startX = e.clientX;
        const originalStart = cue.startMs;
        const originalEnd = cue.endMs;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaMs = (deltaX / pixelsPerSecond) * 1000;

            projectStore.updateCue(trackId, cue.id, {
                startMs: Math.max(0, originalStart + deltaMs),
                endMs: Math.max(0, originalEnd + deltaMs),
            });
        };

        const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);

            // Commit change to CommandHistory
            if (cue.startMs !== originalStart || cue.endMs !== originalEnd) {
                commandManager.execute(
                    new MoveCueCommand(
                        trackId,
                        cue.id,
                        originalStart,
                        originalEnd,
                        cue.startMs,
                        cue.endMs,
                    ),
                );
            }
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }

    function handleResize(e: MouseEvent, edge: "start" | "end") {
        e.stopImmediatePropagation();
        e.preventDefault();

        const startX = e.clientX;
        const originalStart = cue.startMs;
        const originalEnd = cue.endMs;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaMs = (deltaX / pixelsPerSecond) * 1000;

            if (edge === "start") {
                const newStart = Math.min(
                    originalEnd - 100,
                    Math.max(0, originalStart + deltaMs),
                );
                projectStore.updateCue(trackId, cue.id, { startMs: newStart });
            } else {
                const newEnd = Math.max(
                    originalStart + 100,
                    originalEnd + deltaMs,
                );
                projectStore.updateCue(trackId, cue.id, { endMs: newEnd });
            }
        };

        const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);

            if (cue.startMs !== originalStart || cue.endMs !== originalEnd) {
                commandManager.execute(
                    new MoveCueCommand(
                        trackId,
                        cue.id,
                        originalStart,
                        originalEnd,
                        cue.startMs,
                        cue.endMs,
                    ),
                );
            }
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }

    function getMarkerX(tMs: number) {
        return ((tMs - cue.startMs) / 1000) * pixelsPerSecond;
    }

    function handleKeyframeMouseDown(
        e: MouseEvent,
        marker: { tMs: number; paramPath: string },
    ) {
        e.stopPropagation();
        e.preventDefault();

        const startX = e.clientX;
        const originalTMs = marker.tMs;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaMs = (deltaX / pixelsPerSecond) * 1000;
            const newTMs = Math.max(
                cue.startMs,
                Math.min(cue.endMs, originalTMs + deltaMs),
            );

            projectStore.updateKeyframe(
                trackId,
                marker.paramPath,
                originalTMs,
                { tMs: newTMs },
                cue.id,
            );
        };

        const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }
</script>

<div
    class="cue"
    class:selected={isSelected}
    style="left: {left}px; width: {width}px;"
    onmousedown={handleMouseDown}
    role="button"
    tabindex="0"
>
    <!-- Resize Handles -->
    <div
        class="handle start"
        onmousedown={(e) => handleResize(e, "start")}
        role="button"
        tabindex="0"
    ></div>
    <div class="content">{cue.plainText || "New Cue"}</div>
    <div
        class="handle end"
        onmousedown={(e) => handleResize(e, "end")}
        role="button"
        tabindex="0"
    ></div>
</div>

<style>
    .cue {
        position: absolute;
        top: 2px;
        bottom: 2px;
        background: var(--bg-header); /* slightly lighter than track */
        border: 1px solid var(--border-light);
        border-radius: 4px;
        cursor: grab;
        color: var(--text-main);
        font-size: 11px;
        overflow: hidden;
        white-space: nowrap;
        user-select: none;
        box-sizing: border-box;
    }
    .cue.selected {
        background: var(--selection-bg);
        border-color: var(--selection-border);
        z-index: 10;
    }
    .content {
        padding: 0 6px;
        pointer-events: none; /* Let drag propagate */
    }
    .handle {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 6px;
        cursor: ew-resize;
        z-index: 5;
    }
    .handle.start {
        left: 0;
    }
    .handle.end {
        right: 0;
    }
    .handle:hover {
        background: rgba(255, 255, 255, 0.3);
    }
</style>
