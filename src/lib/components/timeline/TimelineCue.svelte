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

    let isDraggingView = $state(false);
    let dragOffsetY = $state(0);

    function getMagnetSnapPoints(excludeCurrentTrack = false): number[] {
        const points: number[] = [0]; // Always snap to start
        projectStore.project.tracks.forEach((t) => {
            if (t.magnetEnabled && (!excludeCurrentTrack || t.id !== trackId)) {
                t.cues.forEach((c) => {
                    if (c.id !== cue.id) {
                        points.push(c.startMs);
                        points.push(c.endMs);
                    }
                });
            }
        });
        return [...new Set(points)];
    }

    function snapValue(valueMs: number, points: number[]): number {
        const thresholdMs = (10 / pixelsPerSecond) * 1000; // 10px threshold
        for (const p of points) {
            if (Math.abs(valueMs - p) < thresholdMs) return p;
        }
        return valueMs;
    }

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
        const startY = e.clientY;
        const originalStart = cue.startMs;
        const originalEnd = cue.endMs;
        const duration = originalEnd - originalStart;

        const snapPoints = getMagnetSnapPoints();
        let currentTrackId = trackId;

        const onMouseMove = (moveEvent: MouseEvent) => {
            isDraggingView = true;
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;

            dragOffsetY = deltaY;

            let newStart = originalStart + (deltaX / pixelsPerSecond) * 1000;
            newStart = Math.max(0, newStart);

            // Snap start or end
            const snapPoints = getMagnetSnapPoints();
            const snappedStart = snapValue(newStart, snapPoints);
            const snappedEnd = snapValue(newStart + duration, snapPoints);

            if (snappedStart !== newStart) {
                newStart = snappedStart;
            } else if (snappedEnd !== newStart + duration) {
                newStart = snappedEnd - duration;
            }

            const newEnd = newStart + duration;

            // Track switching logic
            const tracksContainer = document.querySelector(".tracks-container");
            if (tracksContainer) {
                const rect = tracksContainer.getBoundingClientRect();
                const relativeY = moveEvent.clientY - rect.top;

                let accumulatedHeight = 0;
                let foundTrackId = trackId;
                for (const t of projectStore.project.tracks) {
                    accumulatedHeight += t.height;
                    if (relativeY < accumulatedHeight) {
                        foundTrackId = t.id;
                        break;
                    }
                }
                currentTrackId = foundTrackId;
            }

            projectStore.updateCue(trackId, cue.id, {
                startMs: newStart,
                endMs: newEnd,
            });
        };

        const onMouseUp = () => {
            isDraggingView = false;
            dragOffsetY = 0;
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);

            if (
                cue.startMs !== originalStart ||
                cue.endMs !== originalEnd ||
                currentTrackId !== trackId
            ) {
                commandManager.execute(
                    new MoveCueCommand(
                        trackId,
                        cue.id,
                        originalStart,
                        originalEnd,
                        cue.startMs,
                        cue.endMs,
                        currentTrackId,
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
        const snapPoints = getMagnetSnapPoints();

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaMs = (deltaX / pixelsPerSecond) * 1000;

            if (edge === "start") {
                let newStart = Math.max(0, originalStart + deltaMs);
                newStart = Math.min(originalEnd - 100, newStart);
                newStart = snapValue(newStart, snapPoints);
                projectStore.updateCue(trackId, cue.id, { startMs: newStart });
            } else {
                let newEnd = originalEnd + deltaMs;
                newEnd = Math.max(originalStart + 100, newEnd);
                newEnd = snapValue(newEnd, snapPoints);
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
    style="left: {left}px; width: {width}px; transform: translateY({dragOffsetY}px);"
    class:dragging={isDraggingView}
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
    .cue.dragging {
        z-index: 100;
        opacity: 0.8;
        pointer-events: none; /* Let track detection work under it more easily if needed */
        cursor: grabbing;
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
