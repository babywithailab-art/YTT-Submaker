<script lang="ts">
    import { projectStore } from "$lib/stores/projectStore.svelte";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import { onMount } from "svelte";
    import { loadMedia } from "$lib/engine/io";
    import SubtitleOverlay from "./SubtitleOverlay.svelte";

    let videoElement = $state<HTMLVideoElement>();
    let videoSrc = $state("");

    $effect(() => {
        if (projectStore.project?.media.videoPath) {
            videoSrc = convertFileSrc(projectStore.project.media.videoPath);
        } else {
            videoSrc = "";
        }
    });

    $effect(() => {
        if (videoElement) {
            if (projectStore.isPlaying && videoElement.paused) {
                videoElement
                    .play()
                    .catch((e) => console.error("Play error:", e));
            } else if (!projectStore.isPlaying && !videoElement.paused) {
                videoElement.pause();
            }
        }
    });

    // Sync time from store to video (seeking)
    // Only seek if difference is > 100ms to avoid feedback loop
    $effect(() => {
        // Dependency on currentTime
        const t = projectStore.currentTime;
        if (
            videoElement &&
            Math.abs(videoElement.currentTime * 1000 - t) > 100
        ) {
            videoElement.currentTime = t / 1000;
        }
    });

    let rafId: number;

    $effect(() => {
        if (projectStore.isPlaying) {
            // Start RAF loop
            const loop = () => {
                if (
                    videoElement &&
                    !videoElement.paused &&
                    !videoElement.seeking
                ) {
                    projectStore.setTime(videoElement.currentTime * 1000);
                    rafId = requestAnimationFrame(loop);
                }
            };
            rafId = requestAnimationFrame(loop);
        } else {
            // Stop RAF loop
            if (rafId) cancelAnimationFrame(rafId);
        }

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
        };
    });

    function handleTimeUpdate() {
        if (!videoElement) return;
        // Only update from event if NOT playing (e.g. scrubbing)
        // or as a fallback.
        // If playing, RAF handles it for smoothness.
        if (!projectStore.isPlaying && !videoElement.seeking) {
            projectStore.setTime(videoElement.currentTime * 1000);
        }
    }

    function handleEnded() {
        projectStore.setIsPlaying(false);
        if (rafId) cancelAnimationFrame(rafId);
    }

    function handlePlay() {
        projectStore.setIsPlaying(true);
    }

    function handlePause() {
        projectStore.setIsPlaying(false);
    }

    function handleLoadedMetadata() {
        if (projectStore.project && videoElement && videoElement.duration) {
            projectStore.setMedia(
                projectStore.project.media.videoPath,
                videoElement.duration * 1000,
            );
        }
    }

    async function openVideo() {
        await loadMedia();
    }
</script>

<div class="video-container">
    {#if videoSrc}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
            bind:this={videoElement}
            src={videoSrc}
            ontimeupdate={handleTimeUpdate}
            onplay={handlePlay}
            onpause={handlePause}
            onended={handleEnded}
            onloadedmetadata={handleLoadedMetadata}
            class="video-element"
            preload="auto"
        ></video>

        <!-- Play/pause on click - behind subtitle overlay -->
        <div
            class="controls-overlay"
            onclick={() => projectStore.setIsPlaying(!projectStore.isPlaying)}
            role="button"
            tabindex="0"
            onkeydown={(e) => {
                if (e.key === " " || e.key === "Enter")
                    projectStore.setIsPlaying(!projectStore.isPlaying);
            }}
        ></div>

        <!-- Subtitle overlay on top so subtitles are clickable/draggable -->
        <SubtitleOverlay />
    {:else}
        <div class="placeholder">
            <p>No Video Loaded</p>
            <button onclick={openVideo}>Open Video File...</button>
        </div>
    {/if}
</div>

<style>
    .video-container {
        width: 100%;
        height: 100%;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    }
    .video-element {
        max-width: 100%;
        max-height: 100%;
        display: block;
    }
    .placeholder {
        color: var(--text-muted);
        text-align: center;
    }
    .placeholder button {
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        background: var(--bg-header);
        color: var(--text-main);
        border: 1px solid var(--border-dark);
        cursor: pointer;
    }
    .controls-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        cursor: pointer;
        z-index: 1;
    }
</style>
