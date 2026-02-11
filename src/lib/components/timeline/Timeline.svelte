<script lang="ts">
    import { projectStore } from "$lib/stores/projectStore.svelte";
    import TimelineTrack from "./TimelineTrack.svelte";

    let scrollContainer: HTMLDivElement;
    let pixelsPerSecond = $state(50);
    let isScrubbing = $state(false);

    let duration = $derived(
        Math.max(projectStore.project?.media.durationMs || 0, 60000) + 10000,
    );
    let width = $derived((duration / 1000) * pixelsPerSecond);
    let playheadLeft = $derived(
        (projectStore.currentTime / 1000) * pixelsPerSecond,
    );

    // Adaptive tick interval based on zoom
    let tickInterval = $derived.by(() => {
        // Target: roughly 80-150px between major ticks
        const targetPx = 100;
        const rawSec = targetPx / pixelsPerSecond;
        // Snap to nice intervals: 1, 2, 5, 10, 15, 30, 60, 120, 300...
        const niceIntervals = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
        for (const n of niceIntervals) {
            if (n >= rawSec) return n;
        }
        return 600;
    });

    let minorTickInterval = $derived.by(() => {
        if (tickInterval <= 1) return 0.25;
        if (tickInterval <= 5) return 1;
        if (tickInterval <= 15) return 5;
        if (tickInterval <= 60) return 10;
        if (tickInterval <= 300) return 60;
        return 60;
    });

    function formatTimeLabel(sec: number): string {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        if (m === 0) return `${s}s`;
        if (s === 0) return `${m}m`;
        return `${m}:${s.toString().padStart(2, "0")}`;
    }

    function handleWheel(e: WheelEvent) {
        if (e.ctrlKey) {
            e.preventDefault();

            // Store playhead position relative to screen before zoom
            const playheadScreenPos = playheadLeft - scrollContainer.scrollLeft;

            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const newPixelsPerSecond = Math.max(
                10,
                Math.min(500, pixelsPerSecond * factor),
            );

            if (newPixelsPerSecond !== pixelsPerSecond) {
                pixelsPerSecond = newPixelsPerSecond;

                // After zoom, update scrollLeft to keep playhead at the same screen position
                // Use setTimeout to wait for $derived to update playheadLeft
                setTimeout(() => {
                    if (scrollContainer) {
                        scrollContainer.scrollLeft =
                            playheadLeft - playheadScreenPos;
                    }
                }, 0);
            }
        }
    }

    function seekFromEvent(e: MouseEvent) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const tMs = Math.max(0, (x / pixelsPerSecond) * 1000);
        projectStore.setTime(tMs);
    }

    function handleRulerMouseDown(e: MouseEvent) {
        isScrubbing = true;
        seekFromEvent(e);

        const ruler = e.currentTarget as HTMLElement;

        function onMove(me: MouseEvent) {
            const rect = ruler.getBoundingClientRect();
            const x = me.clientX - rect.left;
            const tMs = Math.max(0, (x / pixelsPerSecond) * 1000);
            projectStore.setTime(tMs);
        }

        function onUp() {
            isScrubbing = false;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }
</script>

<div class="timeline-wrapper">
    <div class="timeline-grid">
        <!-- Left column: Track Headers (Vertical scroll sync) -->
        <div class="headers-wrapper">
            <div class="ruler-corner"></div>
            <div class="headers-content" id="headers-scroller">
                {#if projectStore.project}
                    {#each projectStore.project.tracks as track (track.id)}
                        <TimelineTrack
                            {track}
                            {pixelsPerSecond}
                            mode="header"
                        />
                    {/each}
                {/if}
            </div>
        </div>

        <!-- Right column: Time Ruler (Horizontal scroll) and Track Cues (Both) -->
        <div
            class="scroll-container"
            bind:this={scrollContainer}
            onwheel={handleWheel}
            onscroll={(e) => {
                const head = document.getElementById("headers-scroller");
                if (head) {
                    head.scrollTop = e.currentTarget.scrollTop;
                }
            }}
        >
            <div class="content-width" style="width: {width}px;">
                <!-- Ruler -->
                <div
                    class="ruler"
                    class:scrubbing={isScrubbing}
                    onmousedown={handleRulerMouseDown}
                    role="slider"
                    tabindex="0"
                    aria-valuenow={projectStore.currentTime}
                    onkeydown={(e) => {
                        if (e.key === " ") {
                            e.preventDefault();
                            projectStore.setIsPlaying(!projectStore.isPlaying);
                        }
                    }}
                >
                    <!-- Minor ticks -->
                    {#each { length: Math.ceil(duration / 1000 / minorTickInterval) } as _, i}
                        {@const tSec = i * minorTickInterval}
                        {#if tSec % tickInterval !== 0}
                            <div
                                class="tick minor"
                                style="left: {tSec * pixelsPerSecond}px;"
                            ></div>
                        {/if}
                    {/each}
                    <!-- Major ticks -->
                    {#each { length: Math.ceil(duration / 1000 / tickInterval) } as _, i}
                        {@const tSec = i * tickInterval}
                        <div
                            class="tick major"
                            style="left: {tSec * pixelsPerSecond}px;"
                        >
                            <span class="label">{formatTimeLabel(tSec)}</span>
                        </div>
                    {/each}
                </div>

                <!-- Tracks content -->
                {#if projectStore.project}
                    <div class="tracks-container">
                        {#each projectStore.project.tracks as track (track.id)}
                            <TimelineTrack
                                {track}
                                {pixelsPerSecond}
                                mode="content"
                            />
                        {/each}
                    </div>
                {/if}

                <!-- Playhead -->
                <div class="playhead" style="left: {playheadLeft}px;"></div>
            </div>
        </div>
    </div>
</div>

<style>
    .timeline-wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background: var(--bg-dark);
        overflow: hidden;
    }

    .timeline-grid {
        flex: 1;
        display: grid;
        grid-template-columns: 150px 1fr;
        height: 100%;
        overflow: hidden;
    }

    .headers-wrapper {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--bg-panel);
        border-right: 1px solid var(--border-dark);
        z-index: 20;
    }

    .headers-content {
        flex: 1;
        overflow-y: hidden; /* Scrolled by sync */
    }

    .ruler-corner {
        height: 24px;
        background: var(--bg-panel);
        border-bottom: 1px solid var(--border-light);
    }

    .scroll-container {
        flex: 1;
        overflow: auto;
        position: relative;
    }

    .content-width {
        position: relative;
        min-height: 100%;
    }

    .tracks-container {
        position: relative;
        width: 100%;
    }

    .ruler {
        height: 24px;
        background: var(--timeline-ruler-bg);
        border-bottom: 1px solid var(--border-light);
        position: sticky;
        top: 0;
        z-index: 10;
        cursor: pointer;
        user-select: none;
    }

    .ruler.scrubbing {
        cursor: ew-resize;
    }

    .tick {
        position: absolute;
        bottom: 0;
    }

    .tick.major {
        width: 1px;
        height: 10px;
        background: var(--text-muted);
    }

    .tick.minor {
        width: 1px;
        height: 5px;
        background: var(--border-light);
    }

    .tick .label {
        position: absolute;
        top: -14px;
        left: 2px;
        font-size: 10px;
        color: var(--text-dim);
        pointer-events: none;
        white-space: nowrap;
    }

    .playhead {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 1px;
        background: var(--timeline-playhead);
        pointer-events: none;
        z-index: 15;
    }

    .playhead::before {
        content: "";
        position: absolute;
        top: 0;
        left: -5px;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 8px solid var(--timeline-playhead);
    }
</style>
