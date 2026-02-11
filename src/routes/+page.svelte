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
    import { Plus, Trash2, Settings } from "lucide-svelte";
    import { t } from "$lib/utils/i18n";
    import { settingsStore } from "$lib/stores/settingsStore.svelte";
    import { type Cue as CueType } from "$lib/types";

    // Clipboard for full cue duplication
    let copiedCues = $state<
        {
            cue: CueType;
            relativeStartMs: number;
        }[]
    >([]);

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
            // Copy full selected cues
            let trackId = projectStore.selectedTrackId;
            // Fallback: finding which track has the selected cues
            if (!trackId && projectStore.selectedCueIds.size > 0) {
                const firstId = [...projectStore.selectedCueIds][0];
                for (const t of projectStore.project.tracks) {
                    if (t.cues.some((c) => c.id === firstId)) {
                        trackId = t.id;
                        break;
                    }
                }
            }

            if (trackId && projectStore.selectedCueIds.size > 0) {
                e.preventDefault();
                const track = projectStore.project.tracks.find(
                    (t) => t.id === trackId,
                );
                if (track) {
                    const selected = track.cues.filter((c) =>
                        projectStore.selectedCueIds.has(c.id),
                    );
                    if (selected.length > 0) {
                        const minStart = Math.min(
                            ...selected.map((c) => c.startMs),
                        );
                        // Use $state.snapshot to get a clean object
                        copiedCues = selected.map((c) => ({
                            cue: JSON.parse(JSON.stringify($state.snapshot(c))),
                            relativeStartMs: c.startMs - minStart,
                        }));
                        console.log(
                            "Cues copied to buffer:",
                            copiedCues.length,
                        );
                    }
                }
            }
        } else if (e.ctrlKey && e.key === "v") {
            // Paste copied cues at playhead with overlap avoidance
            if (copiedCues.length > 0) {
                e.preventDefault();
                const playheadMs = projectStore.currentTime;
                let targetTrackId =
                    projectStore.selectedTrackId ||
                    projectStore.project.tracks[0]?.id;

                if (!targetTrackId) return;

                console.log(
                    "Pasting",
                    copiedCues.length,
                    "cues at",
                    playheadMs,
                );

                for (const item of copiedCues) {
                    const duration = item.cue.endMs - item.cue.startMs;
                    const pasteStart = playheadMs + item.relativeStartMs;
                    const pasteEnd = pasteStart + duration;

                    // Find track without overlaps
                    let finalTrackId = targetTrackId;
                    let foundSafeTrack = false;

                    // Try current and subsequent tracks
                    const startIdx = projectStore.project.tracks.findIndex(
                        (t) => t.id === targetTrackId,
                    );
                    for (
                        let i = startIdx;
                        i < projectStore.project.tracks.length;
                        i++
                    ) {
                        const t = projectStore.project.tracks[i];
                        const hasOverlap = t.cues.some(
                            (c) => pasteStart < c.endMs && pasteEnd > c.startMs,
                        );
                        if (!hasOverlap) {
                            finalTrackId = t.id;
                            foundSafeTrack = true;
                            break;
                        }
                    }

                    if (!foundSafeTrack) {
                        // Create new track
                        projectStore.addTrack(`Pasted Track`);
                        finalTrackId =
                            projectStore.project.tracks[
                                projectStore.project.tracks.length - 1
                            ].id;
                    }

                    commandManager.execute(
                        new AddCueCommand(
                            finalTrackId,
                            pasteStart,
                            pasteEnd,
                            item.cue.plainText,
                            item.cue,
                        ),
                    );
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

    let showOptionsPopup = $state(false);
</script>

<svelte:window onkeydown={handleKeydown} />

<MainLayout>
    <div
        slot="toolbar"
        style="display: flex; gap: 0.5rem; align-items: center;"
    >
        <button onclick={handleLoad}>{t("open")}</button>
        <button
            onclick={() =>
                saveProject(false, $state.snapshot(projectStore.project))}
            >{t("save")}</button
        >
        <button
            onclick={() =>
                saveProject(true, $state.snapshot(projectStore.project))}
            >{t("saveAs")}</button
        >

        <div style="position: relative;">
            <button onclick={() => (showOptionsPopup = !showOptionsPopup)}>
                <Settings size={14} style="vertical-align: middle;" />
                {t("options")}
            </button>

            {#if showOptionsPopup}
                <div class="options-popup">
                    <div class="option-row">
                        <label for="lang-select">{t("language")}</label>
                        <select
                            id="lang-select"
                            bind:value={settingsStore.language}
                        >
                            <option value="ko">한국어</option>
                            <option value="en">English</option>
                        </select>
                    </div>
                    <div class="option-row">
                        <label for="theme-select">{t("theme")}</label>
                        <select
                            id="theme-select"
                            bind:value={settingsStore.theme}
                        >
                            <option value="dark">{t("dark")}</option>
                            <option value="light">{t("light")}</option>
                        </select>
                    </div>
                </div>
            {/if}
        </div>

        <div
            style="width: 1px; height: 20px; background: #444; margin: 0 0.5rem;"
        ></div>
        <button onclick={importSubtitle} title="Import SRT/ASS"
            >{t("importSub")}</button
        >
        <button onclick={exportSubtitle} title="Export Selected Track"
            >{t("exportSub")}</button
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
            <Plus size={14} style="vertical-align: middle;" />
            {t("addSub")}
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
            <Trash2 size={14} style="vertical-align: middle;" />
            {t("delete")}
        </button>
        <div
            style="width: 1px; height: 20px; background: #444; margin: 0 0.5rem;"
        ></div>
        <button
            onclick={() => commandManager.undo()}
            disabled={!commandManager.canUndo()}>{t("undo")}</button
        >
        <button
            onclick={() => commandManager.redo()}
            disabled={!commandManager.canRedo()}>{t("redo")}</button
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
                style="padding: 0.5rem; background: #222; border-bottom: 1px solid #333; display: flex; justify-content: flex-start;"
            >
                <button
                    onclick={() => projectStore.addTrack()}
                    style="font-size: 0.8rem; padding: 2px 6px;"
                    >{t("addTrack")}</button
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
    .options-popup {
        position: absolute;
        top: 100%;
        left: 0;
        background: var(--bg-panel);
        border: 1px solid var(--border-light);
        padding: 0.75rem;
        z-index: 100;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 150px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        margin-top: 0.5rem;
    }

    .option-row {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .option-row label {
        font-size: 0.8rem;
        color: var(--text-dim);
    }

    select {
        background: var(--bg-input);
        color: var(--text-main);
        border: 1px solid var(--border-light);
        padding: 0.25rem;
        font-size: 0.9rem;
    }
</style>
