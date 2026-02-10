<script lang="ts">
    import type { Track } from "$lib/types";
    import TimelineCue from "./TimelineCue.svelte";
    import { projectStore } from "$lib/stores/projectStore.svelte";
    import { commandManager, AddCueCommand } from "$lib/engine/command.svelte";

    let { track, pixelsPerSecond } = $props<{
        track: Track;
        pixelsPerSecond: number;
    }>();

    let isSelected = $derived(projectStore.selectedTrackId === track.id);

    function handleTrackClick() {
        projectStore.selectedTrackId = track.id;
    }

    function handleTrackDoubleClick(e: MouseEvent) {
        // Create Cue at click position
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const tMs = (x / pixelsPerSecond) * 1000;

        // Snap to frame? For now raw time.
        commandManager.execute(
            new AddCueCommand(track.id, tMs, tMs + 2000, "New Subtitle"),
        );
    }

    function handleResizeMouseDown(e: MouseEvent) {
        e.stopPropagation();
        e.preventDefault();

        const startY = e.clientY;
        const startHeight = track.height;

        function onMouseMove(me: MouseEvent) {
            const dy = me.clientY - startY;
            const newHeight = Math.max(24, startHeight + dy);
            projectStore.updateTrackHeight(track.id, newHeight);
        }

        function onMouseUp() {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        }

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
    class="track-row"
    class:selected={isSelected}
    style:height="{track.height}px"
    onclick={handleTrackClick}
    ondblclick={handleTrackDoubleClick}
    role="row"
    tabindex="0"
>
    {#each track.cues as cue (cue.id)}
        <TimelineCue {cue} {pixelsPerSecond} trackId={track.id} />
    {/each}

    <!-- Resize handle -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="resize-handle"
        onmousedown={handleResizeMouseDown}
        role="separator"
    ></div>
</div>

<style>
    .track-row {
        position: relative;
        background: var(--timeline-track-bg);
        border-bottom: 1px solid var(--border-dark);
        width: 100%;
        min-width: 100%;
        box-sizing: border-box;
    }
    .track-row.selected {
        background: var(--bg-header);
        border-left: 3px solid var(--accent);
    }
    .track-row:hover {
        background: var(--timeline-track-hover);
    }

    .resize-handle {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 4px;
        cursor: ns-resize;
        z-index: 10;
        opacity: 0;
    }
    .resize-handle:hover,
    .resize-handle:active {
        background: var(--accent);
        opacity: 0.5;
    }
</style>
