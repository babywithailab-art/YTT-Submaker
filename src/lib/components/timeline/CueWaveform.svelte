<script lang="ts">
    import { audioEngine } from "$lib/engine/audio";
    import { projectStore } from "$lib/stores/projectStore.svelte";

    let { startMs, endMs, height = 60 } = $props();

    let canvas: HTMLCanvasElement;
    let width = $state(0);
    let containerHeight = $state(0);
    let audioBuffer: Float32Array | null = $state(null);
    let isFetching = $state(false);
    let errorMsg = $state("");

    // Re-fetch when range changes
    $effect(() => {
        if (
            projectStore.project?.media.videoPath &&
            startMs >= 0 &&
            endMs > startMs
        ) {
            fetchAudio();
        }
    });

    // Redraw when buffer or dimensions change, or time updates (for playhead)
    $effect(() => {
        // dep on currentTime to redraw playhead
        const t = projectStore.currentTime;
        if (audioBuffer && width > 0 && containerHeight > 0) {
            draw(t);
        }
    });

    async function fetchAudio() {
        if (isFetching) return;
        isFetching = true;
        errorMsg = "";
        try {
            // Fetch exact range
            const data = await audioEngine.getWaveformData(startMs, endMs);
            if (data.length > 0) {
                audioBuffer = data;
            } else {
                errorMsg = "No audio";
            }
        } catch (e: any) {
            errorMsg = "Error";
            console.error(e);
        } finally {
            isFetching = false;
        }
    }

    function draw(currentTime: number) {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = width;
        canvas.height = containerHeight;
        const h = containerHeight;

        // Background
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, width, h);

        if (!audioBuffer) return;

        // Waveform
        ctx.strokeStyle = "#4a90e2";
        ctx.lineWidth = 1;
        ctx.beginPath();

        const midY = h / 2;
        const step = audioBuffer.length / width;

        for (let x = 0; x < width; x++) {
            const idx = Math.floor(x * step);
            const val = audioBuffer[idx] || 0;
            const y = midY - val * h * 0.45; // Scale amplitude slightly
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Playhead (relative to cue)
        if (currentTime >= startMs && currentTime <= endMs) {
            const progress = (currentTime - startMs) / (endMs - startMs);
            const x = progress * width;

            ctx.strokeStyle = "#ff3e3e";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
    }
</script>

<div
    class="cue-waveform"
    bind:clientWidth={width}
    bind:clientHeight={containerHeight}
    style="height: {height}px"
>
    <canvas bind:this={canvas}></canvas>
    {#if errorMsg}
        <div class="error">{errorMsg}</div>
    {/if}
</div>

<style>
    .cue-waveform {
        width: 100%;
        position: relative;
        background: #000;
        overflow: hidden;
        border-radius: 4px;
        border: 1px solid #333;
    }
    canvas {
        display: block;
        width: 100%;
        height: 100%;
    }
    .error {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 10px;
        color: #777;
    }
</style>
