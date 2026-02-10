<script lang="ts">
    import type { Track } from "$lib/types";
    import TimelineCue from "./TimelineCue.svelte";
    import { projectStore } from "$lib/stores/projectStore.svelte";
    import {
        commandManager,
        AddCueCommand,
        RemoveTrackCommand,
    } from "$lib/engine/command.svelte";
    import { ask } from "@tauri-apps/plugin-dialog";

    let { track, pixelsPerSecond, mode } = $props<{
        track: Track;
        pixelsPerSecond: number;
        mode: "header" | "content";
    }>();

    let isSelected = $derived(projectStore.selectedTrackId === track.id);

    function handleTrackClick() {
        projectStore.selectedTrackId = track.id;
    }

    let isDeleting = $state(false);

    async function handleDeleteTrack(e: MouseEvent) {
        if (isDeleting) return;
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();

        const trackId = track.id;
        const trackName = track.name;

        try {
            const confirmed = await ask(`Delete track "${trackName}"?`, {
                title: "Confirm Deletion",
                kind: "warning",
            });

            if (confirmed) {
                isDeleting = true;
                commandManager.execute(new RemoveTrackCommand(trackId));
            }
        } catch (err) {
            console.error("Deletion confirmed error:", err);
        } finally {
            isDeleting = false;
        }
    }

    function handleToggleMagnet(e: MouseEvent) {
        e.stopPropagation();
        projectStore.toggleMagnet(track.id);
    }

    function handleToggleExport(e: MouseEvent) {
        e.stopPropagation();
        projectStore.toggleTrackExport(track.id);
    }

    function handleTrackDoubleClick(e: MouseEvent) {
        // Create Cue at click position
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const tMs = Math.max(0, (x / pixelsPerSecond) * 1000);

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

{#if mode === "header"}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
        class="track-head-only"
        class:selected={isSelected}
        style:height="{track.height}px"
        onclick={handleTrackClick}
        role="row"
        tabindex="0"
    >
        <div class="track-name" title={track.name}>{track.name}</div>
        <div class="track-btns">
            <button
                class="track-btn magnet-btn"
                class:active={track.magnetEnabled}
                onclick={handleToggleMagnet}
                title={track.magnetEnabled
                    ? "Magnet Enabled"
                    : "Magnet Disabled"}
            >
                🧲
            </button>
            <button
                class="track-btn export-btn"
                class:excluded={track.excludeFromExport}
                onclick={handleToggleExport}
                title={track.excludeFromExport
                    ? "Excluded from Export"
                    : "Included in Export"}
            >
                {track.excludeFromExport ? "🚫" : "📤"}
            </button>
            <button
                class="track-btn delete-btn"
                onmousedown={(e) => e.stopPropagation()}
                onclick={handleDeleteTrack}
                title="Delete Track"
            >
                🗑️
            </button>
        </div>
        <!-- Resize handle -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="resize-handle"
            onmousedown={handleResizeMouseDown}
            role="separator"
        ></div>
    </div>
{:else}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
        class="track-content-only"
        class:selected={isSelected}
        style:height="{track.height}px"
        onclick={handleTrackClick}
        ondblclick={handleTrackDoubleClick}
        role="row"
        tabindex="0"
        onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleTrackClick();
        }}
    >
        {#each track.cues as cue (cue.id)}
            <TimelineCue {cue} {pixelsPerSecond} trackId={track.id} />
        {/each}

        <!-- Resize handle sync? (usually just one is enough, putting it in content too helps visual) -->
        <div
            class="resize-handle"
            onmousedown={handleResizeMouseDown}
            role="separator"
        ></div>
    </div>
{/if}

<style>
    .track-head-only,
    .track-content-only {
        position: relative;
        background: var(--timeline-track-bg);
        border-bottom: 1px solid var(--border-dark);
        box-sizing: border-box;
    }
    .track-head-only.selected,
    .track-content-only.selected {
        background: var(--bg-header);
    }
    .track-head-only:hover,
    .track-content-only:hover {
        background: var(--timeline-track-hover);
    }

    .track-head-only {
        width: 150px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 4px 8px;
        border-right: 1px solid var(--border-dark);
        z-index: 10;
        cursor: pointer;
    }
    .track-content-only {
        min-width: 100%;
    }

    .track-name {
        font-size: 0.75rem;
        color: var(--text-main);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 500;
    }

    .track-btns {
        display: flex;
        gap: 4px;
        margin-top: 4px;
    }

    .track-btn {
        background: var(--bg-header);
        border: 1px solid var(--border-light);
        border-radius: 4px;
        padding: 2px 4px;
        cursor: pointer;
        font-size: 0.8rem;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        transition: all 0.1s;
    }

    .track-btn:hover {
        background: var(--bg-hover);
        border-color: var(--accent);
    }

    .export-btn.excluded {
        opacity: 0.5;
        border-color: transparent;
    }

    .magnet-btn.active {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
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
