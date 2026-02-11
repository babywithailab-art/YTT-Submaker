<script lang="ts">
    import { projectStore } from "$lib/stores/projectStore.svelte";
    import {
        commandManager,
        TimeChangeCommand,
    } from "$lib/engine/command.svelte";
    import { audioEngine } from "$lib/engine/audio";

    let canvasElement: HTMLCanvasElement;
    let windowSizeMs = $state(5000);
    let containerW = $state(0);
    let containerH = $state(0);
    let errorMsg = $state("");

    let audioBuffer: Float32Array | null = null;
    let bufferStartMs = 0;
    let bufferEndMs = 0;
    const BUFFER_PADDING_MS = 10000;
    let isFetching = false;

    // Interaction state
    let dragState = $state<{
        cueId: string;
        trackId: string;
        type: "start" | "end" | "move";
        initialStart: number;
        initialEnd: number;
        startX: number;
    } | null>(null);

    let hoverState = $state<{
        cueId: string;
        type: "start" | "end" | "move";
    } | null>(null);

    $effect(() => {
        if (projectStore.project?.media.videoPath) {
            audioEngine.setVideoPath(projectStore.project.media.videoPath);
            audioBuffer = null;
            bufferStartMs = 0;
            bufferEndMs = 0;
            errorMsg = "";
        }
    });

    $effect(() => {
        const t = projectStore.currentTime;
        const cw = containerW;
        const ch = containerH;

        if (canvasElement && cw > 0 && ch > 0) {
            if (canvasElement.width !== cw || canvasElement.height !== ch) {
                canvasElement.width = cw;
                canvasElement.height = ch;
            }
        }

        ensureBuffer(t);
        draw(t);
    });

    // Re-draw when cues or interaction state changes
    $effect(() => {
        // Dependencies to trigger re-draw
        projectStore.project?.updatedAt;
        projectStore.selectedCueIds;
        hoverState;
        dragState;
        draw(projectStore.currentTime);
    });

    async function ensureBuffer(currentTime: number) {
        if (isFetching) return;

        const viewStart = currentTime - windowSizeMs / 2;
        const viewEnd = currentTime + windowSizeMs / 2;

        const needsUpdate =
            !audioBuffer ||
            viewStart < bufferStartMs + 2000 ||
            viewEnd > bufferEndMs - 2000;

        if (needsUpdate) {
            isFetching = true;
            const fetchStart = Math.max(0, viewStart - BUFFER_PADDING_MS);
            const fetchEnd = viewEnd + BUFFER_PADDING_MS;

            try {
                const data = await audioEngine.getWaveformData(
                    fetchStart,
                    fetchEnd,
                );
                if (data.length > 0) {
                    audioBuffer = data;
                    bufferStartMs = fetchStart;
                    bufferEndMs = fetchEnd;
                    errorMsg = "";
                } else if (!audioBuffer) {
                    errorMsg = "No audio data. Check FFmpeg is installed.";
                }
            } catch (e: any) {
                errorMsg = `Waveform error: ${e?.message || e}`;
            } finally {
                isFetching = false;
                if (!projectStore.isPlaying) draw(projectStore.currentTime);
            }
        }
    }

    function draw(currentTime: number) {
        if (!canvasElement) return;
        const ctx = canvasElement.getContext("2d");
        if (!ctx) return;

        const width = canvasElement.width;
        const height = canvasElement.height;

        // Grid
        const msPerPx = windowSizeMs / width;
        const viewStart = currentTime - windowSizeMs / 2;
        const viewEnd = currentTime + windowSizeMs / 2;

        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, 0, width, height);

        // Grid lines
        const firstTick = Math.ceil(viewStart / 1000) * 1000;
        ctx.strokeStyle = "#333";
        ctx.fillStyle = "#666";
        ctx.font = "10px sans-serif";
        ctx.lineWidth = 1;

        for (let t = firstTick; t < viewEnd; t += 1000) {
            const x = (t - viewStart) / msPerPx;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            ctx.fillText((t / 1000).toFixed(0) + "s", x + 4, 12);
        }

        // Cues Rendering
        const track = projectStore.project?.tracks.find(
            (t) => t.id === projectStore.selectedTrackId,
        );
        if (track) {
            for (const cue of track.cues) {
                if (cue.endMs < viewStart || cue.startMs > viewEnd) continue;

                const x1 = (cue.startMs - viewStart) / msPerPx;
                const x2 = (cue.endMs - viewStart) / msPerPx;
                const isSelected = projectStore.selectedCueIds.has(cue.id);

                // Background
                ctx.fillStyle = isSelected
                    ? "rgba(74, 144, 226, 0.2)"
                    : "rgba(255, 255, 255, 0.05)";
                ctx.fillRect(x1, 0, x2 - x1, height);

                // Borders
                ctx.strokeStyle = isSelected ? "#4a90e2" : "#555";
                ctx.lineWidth = isSelected ? 2 : 1;
                ctx.strokeRect(x1, 0, x2 - x1, height);

                // Handles/Hover feedback
                if (hoverState?.cueId === cue.id) {
                    ctx.fillStyle = "rgba(74, 144, 226, 0.4)";
                    if (hoverState.type === "start") {
                        ctx.fillRect(x1 - 5, 0, 10, height);
                    } else if (hoverState.type === "end") {
                        ctx.fillRect(x2 - 5, 0, 10, height);
                    }
                }

                // Text preview
                ctx.fillStyle = isSelected ? "#fff" : "#aaa";
                ctx.font = "11px sans-serif";
                const label = cue.plainText || "[empty]";
                const labelWidth = ctx.measureText(label).width;
                if (x2 - x1 > labelWidth + 10) {
                    ctx.fillText(label, x1 + 5, height - 10);
                }
            }
        }

        // Waveform
        if (audioBuffer) {
            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = 1;
            ctx.beginPath();

            const midY = height / 2;
            const sampleRate = 8000;
            const startSampleIndex =
                ((viewStart - bufferStartMs) / 1000) * sampleRate;
            const samplesPerPx = ((windowSizeMs / 1000) * sampleRate) / width;

            for (let x = 0; x < width; x++) {
                const idx = Math.floor(startSampleIndex + x * samplesPerPx);
                if (idx >= 0 && idx < audioBuffer.length) {
                    const val = audioBuffer[idx];
                    const y = midY - val * height * 0.4;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        // Playhead
        const centerX = width / 2;
        ctx.strokeStyle = "#f00";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.stroke();

        // Footer status (dragging)
        if (dragState) {
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, height - 20, width, 20);
            ctx.fillStyle = "#fff";
            ctx.font = "10px sans-serif";
            const cue = track?.cues.find((c) => c.id === dragState?.cueId);
            if (cue) {
                const dur = ((cue.endMs - cue.startMs) / 1000).toFixed(2);
                ctx.fillText(
                    `Adjusting: ${dragState.type.toUpperCase()} | Duration: ${dur}s`,
                    10,
                    height - 6,
                );
            }
        }

        if (isFetching && !audioBuffer) {
            ctx.fillStyle = "#666";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Loading waveform...", width / 2, height / 2);
            ctx.textAlign = "start";
        } else if (errorMsg) {
            ctx.fillStyle = "#c44";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(errorMsg, width / 2, height / 2);
            ctx.textAlign = "start";
        }
    }

    function handleWheel(e: WheelEvent) {
        if (e.ctrlKey) {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 1.1 : 0.9;
            windowSizeMs = Math.max(
                1000,
                Math.min(30000, windowSizeMs * factor),
            );
        }
    }

    function handleMouseDown(e: MouseEvent) {
        if (!hoverState) return;

        const track = projectStore.project?.tracks.find(
            (t) => t.id === projectStore.selectedTrackId,
        );
        const cue = track?.cues.find((c) => c.id === hoverState?.cueId);
        if (!track || !cue) return;

        dragState = {
            cueId: cue.id,
            trackId: track.id,
            type: hoverState.type,
            initialStart: cue.startMs,
            initialEnd: cue.endMs,
            startX: e.clientX,
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
    }

    function handleMouseMove(e: MouseEvent) {
        const msPerPx = windowSizeMs / containerW;

        if (dragState) {
            const dx = e.clientX - dragState.startX;
            const dt = dx * msPerPx;

            let newStart = dragState.initialStart;
            let newEnd = dragState.initialEnd;

            if (dragState.type === "start") {
                newStart = Math.min(newEnd - 100, dragState.initialStart + dt);
            } else if (dragState.type === "end") {
                newEnd = Math.max(newStart + 100, dragState.initialEnd + dt);
            } else if (dragState.type === "move") {
                newStart = dragState.initialStart + dt;
                newEnd = dragState.initialEnd + dt;
            }

            projectStore.updateCue(dragState.trackId, dragState.cueId, {
                startMs: newStart,
                endMs: newEnd,
            });
            return;
        }

        // Hover detection
        const rect = canvasElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const viewStart = projectStore.currentTime - windowSizeMs / 2;
        const timeAtMouse = viewStart + x * msPerPx;

        const track = projectStore.project?.tracks.find(
            (t) => t.id === projectStore.selectedTrackId,
        );
        if (!track) {
            hoverState = null;
            return;
        }

        let newHover: typeof hoverState = null;
        for (const cue of track.cues) {
            const distStart = Math.abs(timeAtMouse - cue.startMs) / msPerPx;
            const distEnd = Math.abs(timeAtMouse - cue.endMs) / msPerPx;

            if (distStart < 8) {
                newHover = { cueId: cue.id, type: "start" };
                break;
            } else if (distEnd < 8) {
                newHover = { cueId: cue.id, type: "end" };
                break;
            } else if (timeAtMouse >= cue.startMs && timeAtMouse <= cue.endMs) {
                newHover = { cueId: cue.id, type: "move" };
                break;
            }
        }
        hoverState = newHover;
    }

    function handleMouseUp() {
        if (dragState) {
            const track = projectStore.project?.tracks.find(
                (t) => t.id === dragState?.trackId,
            );
            const cue = track?.cues.find((c) => c.id === dragState?.cueId);

            if (
                cue &&
                (cue.startMs !== dragState.initialStart ||
                    cue.endMs !== dragState.initialEnd)
            ) {
                commandManager.execute(
                    new TimeChangeCommand(
                        dragState.trackId,
                        dragState.cueId,
                        dragState.initialStart,
                        dragState.initialEnd,
                        cue.startMs,
                        cue.endMs,
                    ),
                );
            }
            dragState = null;
        }
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
    }
</script>

<div class="waveform-container">
    <div class="controls">
        <button
            onclick={() => (windowSizeMs = 2500)}
            class:active={Math.abs(windowSizeMs - 2500) < 100}>±2.5s</button
        >
        <button
            onclick={() => (windowSizeMs = 5000)}
            class:active={Math.abs(windowSizeMs - 5000) < 100}>±5s</button
        >
        <button
            onclick={() => (windowSizeMs = 10000)}
            class:active={Math.abs(windowSizeMs - 10000) < 100}>±10s</button
        >
    </div>

    <div
        class="canvas-wrapper"
        bind:clientWidth={containerW}
        bind:clientHeight={containerH}
        onwheel={handleWheel}
        onmousedown={handleMouseDown}
        onmousemove={handleMouseMove}
        onmouseleave={() => (hoverState = null)}
        role="presentation"
        style:cursor={hoverState
            ? hoverState.type === "move"
                ? "grab"
                : "ew-resize"
            : "crosshair"}
    >
        <canvas bind:this={canvasElement}></canvas>
    </div>
</div>

<style>
    .waveform-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background: #111;
        border-top: 1px solid #333;
    }
    .controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem;
        background: #222;
        border-bottom: 1px solid #333;
    }
    button {
        background: #333;
        border: 1px solid #444;
        color: #aaa;
        font-size: 0.75rem;
        padding: 2px 8px;
        cursor: pointer;
        border-radius: 2px;
    }
    button:hover {
        background: #444;
        color: #eee;
    }
    button.active {
        background: #4a90e2;
        color: #fff;
        border-color: #357abd;
    }
    .canvas-wrapper {
        flex: 1;
        overflow: hidden;
        position: relative;
        cursor: crosshair;
    }
    canvas {
        display: block;
    }
</style>
