<script lang="ts">
    import MainLayout from "$lib/components/layout/MainLayout.svelte";
    import {
        saveProject,
        loadProject,
        importSubtitle,
        exportSubtitle,
    } from "$lib/engine/io";
    import { projectStore } from "$lib/stores/projectStore.svelte";
    import VideoPlayer from "$lib/components/player/VideoPlayer.svelte";
    import WindowedWaveform from "$lib/components/timeline/WindowedWaveform.svelte";
    import Timeline from "$lib/components/timeline/Timeline.svelte";
    import Inspector from "$lib/components/inspector/Inspector.svelte";
    import {
        commandManager,
        RemoveCueCommand,
        AddCueCommand,
    } from "$lib/engine/command.svelte";
    import { Plus, Trash2 } from "lucide-svelte";

    // Clipboard for copy-paste of cue style/position
    let copiedCueData: {
        posOverride?: any;
        styleOverride?: any;
        effects?: any[];
    } | null = null;

    async function handleSave() {
        await saveProject(false, $state.snapshot(projectStore.project));
    }

    async function handleLoad() {
        await loadProject();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
        ) {
            return; // Don't trigger if editing text
        }

        if (e.ctrlKey && e.key === "s") {
            e.preventDefault();
            saveProject(false, $state.snapshot(projectStore.project));
        } else if (e.ctrlKey && e.key === "z") {
            e.preventDefault();
            commandManager.undo();
        } else if (
            (e.ctrlKey && e.key === "y") ||
            (e.ctrlKey && e.shiftKey && e.key === "z")
        ) {
            e.preventDefault();
            commandManager.redo();
        } else if (e.ctrlKey && e.key === "c") {
            // Copy selected cue's style, position, effects
            if (
                projectStore.selectedTrackId &&
                projectStore.selectedCueIds.size > 0
            ) {
                const track = projectStore.project.tracks.find(
                    (t) => t.id === projectStore.selectedTrackId,
                );
                if (track) {
                    const cueId = [...projectStore.selectedCueIds][0];
                    const cue = track.cues.find((c) => c.id === cueId);
                    if (cue) {
                        copiedCueData = {
                            posOverride: cue.posOverride
                                ? JSON.parse(JSON.stringify(cue.posOverride))
                                : undefined,
                            styleOverride: cue.styleOverride
                                ? JSON.parse(JSON.stringify(cue.styleOverride))
                                : undefined,
                            effects: cue.effects
                                ? JSON.parse(JSON.stringify(cue.effects))
                                : undefined,
                        };
                    }
                }
            }
        } else if (e.ctrlKey && e.key === "v") {
            // Paste copied style/position/effects to selected cue
            if (
                copiedCueData &&
                projectStore.selectedTrackId &&
                projectStore.selectedCueIds.size > 0
            ) {
                const track = projectStore.project.tracks.find(
                    (t) => t.id === projectStore.selectedTrackId,
                );
                if (track) {
                    for (const cueId of projectStore.selectedCueIds) {
                        const cue = track.cues.find((c) => c.id === cueId);
                        if (cue) {
                            if (copiedCueData.posOverride) {
                                cue.posOverride = JSON.parse(
                                    JSON.stringify(copiedCueData.posOverride),
                                );
                            }
                            if (copiedCueData.styleOverride) {
                                cue.styleOverride = JSON.parse(
                                    JSON.stringify(copiedCueData.styleOverride),
                                );
                            }
                            if (copiedCueData.effects) {
                                cue.effects = JSON.parse(
                                    JSON.stringify(copiedCueData.effects),
                                );
                            }
                        }
                    }
                    projectStore.project.updatedAt = new Date().toISOString();
                }
            }
        } else if (e.key === "Delete") {
            if (
                projectStore.selectedTrackId &&
                projectStore.selectedCueIds.size > 0
            ) {
                for (const cueId of projectStore.selectedCueIds) {
                    commandManager.execute(
                        new RemoveCueCommand(
                            projectStore.selectedTrackId,
                            cueId,
                        ),
                    );
                }
                projectStore.selectedCueIds = new Set();
            }
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<MainLayout>
    <div
        slot="toolbar"
        style="display: flex; gap: 0.5rem; align-items: center;"
    >
        <button onclick={handleLoad}>Open</button>
        <button
            onclick={() =>
                saveProject(false, $state.snapshot(projectStore.project))}
            >Save</button
        >
        <button
            onclick={() =>
                saveProject(true, $state.snapshot(projectStore.project))}
            >Save As...</button
        >
        <div
            style="width: 1px; height: 20px; background: #444; margin: 0 0.5rem;"
        ></div>
        <button onclick={importSubtitle} title="Import SRT/ASS"
            >Import Sub...</button
        >
        <button onclick={exportSubtitle} title="Export Selected Track"
            >Export Sub...</button
        >
        <div
            style="width: 1px; height: 20px; background: #444; margin: 0 0.5rem;"
        ></div>
        <button
            onclick={() => {
                const trackId = projectStore.selectedTrackId;
                if (!trackId) {
                    // If no track selected, select first or create one
                    if (projectStore.project.tracks.length === 0) {
                        projectStore.addTrack();
                    }
                    const t = projectStore.project.tracks[0];
                    if (t) {
                        projectStore.selectedTrackId = t.id;
                        commandManager.execute(
                            new AddCueCommand(
                                t.id,
                                projectStore.currentTime,
                                projectStore.currentTime + 2000,
                                "New Subtitle",
                            ),
                        );
                    }
                } else {
                    commandManager.execute(
                        new AddCueCommand(
                            trackId,
                            projectStore.currentTime,
                            projectStore.currentTime + 2000,
                            "New Subtitle",
                        ),
                    );
                }
            }}
            title="Add subtitle at playhead"
        >
            <Plus size={14} style="vertical-align: middle;" /> Add Sub
        </button>
        <button
            onclick={() => {
                if (
                    projectStore.selectedTrackId &&
                    projectStore.selectedCueIds.size > 0
                ) {
                    for (const cueId of projectStore.selectedCueIds) {
                        commandManager.execute(
                            new RemoveCueCommand(
                                projectStore.selectedTrackId,
                                cueId,
                            ),
                        );
                    }
                    projectStore.selectedCueIds = new Set();
                }
            }}
            disabled={projectStore.selectedCueIds.size === 0}
            title="Delete selected subtitle"
        >
            <Trash2 size={14} style="vertical-align: middle;" /> Delete
        </button>
        <div
            style="width: 1px; height: 20px; background: #444; margin: 0 0.5rem;"
        ></div>
        <button
            onclick={() => commandManager.undo()}
            disabled={!commandManager.canUndo()}>Undo</button
        >
        <button
            onclick={() => commandManager.redo()}
            disabled={!commandManager.canRedo()}>Redo</button
        >
        <span style="margin-left: 1rem; color: #888;">
            {projectStore.project?.name ?? "No Project"}
            {#if projectStore.filePath}
                <span style="font-size: 0.8em; opacity: 0.7;"
                    >({projectStore.filePath})</span
                >
            {/if}
        </span>
    </div>

    <div slot="preview" style="width: 100%; height: 100%; overflow: hidden;">
        <VideoPlayer />
    </div>

    <div slot="sidebar" style="height: 100%;">
        <Inspector />
    </div>

    <div
        slot="timeline"
        style="display: flex; flex-direction: column; height: 100%;"
    >
        <div style="height: 120px; border-bottom: 1px solid #333;">
            <WindowedWaveform />
        </div>

        <div
            style="flex: 1; overflow: hidden; display: flex; flex-direction: column;"
        >
            <div
                style="padding: 0.5rem; background: #222; border-bottom: 1px solid #333; display: flex; justify-content: space-between;"
            >
                <h3 style="margin: 0; font-size: 0.9rem; color: #ccc;">
                    Tracks
                </h3>
                <button
                    onclick={() => projectStore.addTrack()}
                    style="font-size: 0.8rem; padding: 2px 6px;">+ Track</button
                >
            </div>
            <div style="flex: 1; overflow: hidden;">
                <Timeline />
            </div>
        </div>
    </div>
</MainLayout>

<style>
    button {
        background: #333;
        color: #eee;
        border: 1px solid #444;
        padding: 0.25rem 0.75rem;
        cursor: pointer;
        font-size: 0.9rem;
    }
    button:hover {
        background: #444;
    }
    h3 {
        margin-top: 0;
        border-bottom: 1px solid #444;
        padding-bottom: 0.5rem;
    }
</style>
