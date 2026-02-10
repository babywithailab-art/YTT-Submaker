<script lang="ts">
    import { projectStore } from "$lib/stores/projectStore.svelte";
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

        const viewStart = currentTime - windowSizeMs / 2;
        const viewEnd = currentTime + windowSizeMs / 2;

        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, 0, width, height);

        // No video loaded
        if (!projectStore.project?.media.videoPath) {
            ctx.fillStyle = "#555";
            ctx.font = "13px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("No video loaded", width / 2, height / 2);
            ctx.textAlign = "start";
            return;
        }

        // Grid
        const msPerPx = windowSizeMs / width;
        const firstTick = Math.ceil(viewStart / 1000) * 1000;

        ctx.strokeStyle = "#444";
        ctx.fillStyle = "#888";
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

        // Playhead
        const centerX = width / 2;
        ctx.strokeStyle = "#f00";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.stroke();

        // Waveform
        if (audioBuffer) {
            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = 1;
            ctx.beginPath();

            const midY = height / 2;
            ctx.moveTo(0, midY);

            const sampleRate = 8000;
            const startSampleIndex =
                ((viewStart - bufferStartMs) / 1000) * sampleRate;
            const samplesPerPx = ((windowSizeMs / 1000) * sampleRate) / width;

            for (let x = 0; x < width; x++) {
                const idx = Math.floor(startSampleIndex + x * samplesPerPx);

                if (idx >= 0 && idx < audioBuffer.length) {
                    const val = audioBuffer[idx];
                    const y = midY - val * height * 0.4;
                    ctx.lineTo(x, y);
                } else {
                    ctx.lineTo(x, midY);
                }
            }
            ctx.stroke();
        } else if (isFetching) {
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
</script>

<div class="waveform-container">
    <div class="controls">
        <span class="label">Waveform View:</span>
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
        role="presentation"
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
    .label {
        color: #888;
        font-size: 0.8rem;
        margin-right: 0.5rem;
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
