<script lang="ts">
    import { dndzone } from "svelte-dnd-action";
    import { flip } from "svelte/animate";
    import { projectStore } from "$lib/stores/projectStore.svelte";
    import {
        commandManager,
        TextChangeCommand,
        TimeChangeCommand,
        AddSpanCommand,
        RemoveSpanCommand,
        SplitCueCommand,
        MergeCuesCommand,
        RemoveCueCommand,
        AddKeyframeCommand,
        RemoveKeyframeCommand,
        UpdateKeyframeValueCommand,
        UpdateTrackStyleCommand,
        UpdateCueStyleCommand,
        UpdateCuePositionCommand,
        UpdateKeyframeTimeCommand,
        AddEffectCommand,
        RemoveEffectCommand,
        UpdateEffectParamCommand,
        ToggleSpanStyleCommand,
        ApplyAnimationPresetCommand,
        ReorderEffectsCommand,
    } from "$lib/engine/command.svelte";
    import { presetStore } from "$lib/stores/presetStore.svelte";
    import { effectRegistry } from "$lib/engine/effects";
    import { interpolate } from "$lib/utils/animation";
    import type { StyleProps, Track, Cue } from "$lib/types";
    import {
        Scissors,
        Merge,
        Bold,
        Italic,
        Underline,
        Strikethrough,
        History,
        ChevronLeft,
        ChevronRight,
        Diamond,
        Plus,
        Settings,
        Trash2,
        Save,
        X,
        AlignLeft,
        AlignCenter,
        AlignRight,
        Type,
    } from "lucide-svelte";

    const FONTS = [
        "Carrois Gothic SC",
        "Comic Sans MS",
        "Courier New",
        "Lucida Console",
        "Monotype Corsiva",
        "Roboto",
        "Times New Roman",
        "바탕",
        "맑은 고딕",
        "궁서",
        "돋움",
        "굴림",
    ];

    let selectedData = $derived.by(() => {
        if (!projectStore.project || projectStore.selectedCueIds.size === 0)
            return null;
        const cueId = Array.from(projectStore.selectedCueIds)[0];
        for (const track of projectStore.project.tracks) {
            const found = track.cues.find((c) => c.id === cueId);
            if (found) return { cue: found, trackId: track.id, track: track };
        }
        return null;
    });

    let activeTab = $state("inspector"); // inspector | keyframe | effect | color-effect
    const COLOR_EFFECTS = ["neon", "rainbow", "gradient"];
    let activeEdgeTab = $state<"outline" | "shadow" | "glow" | "bevel">(
        "outline",
    );
    let originalText = "";
    let selectionStart = $state(0);
    let selectionEnd = $state(0);
    let selectedPresetId = $state("");
    let editingEffectId = $state<string | null>(null);
    let showFontMenu = $state(false);

    function handleTextFocus() {
        if (selectedData) originalText = selectedData!.cue.plainText;
    }

    function handleTextBlur() {
        if (selectedData && originalText !== selectedData!.cue.plainText) {
            commandManager.execute(
                new TextChangeCommand(
                    selectedData!.trackId,
                    selectedData!.cue.id,
                    originalText,
                    selectedData!.cue.plainText,
                ),
            );
        }
    }

    function saveAnimationPreset() {
        if (!selectedData) return;
        const name = prompt("Enter preset name:");
        if (!name) return;

        // Relative rebase: keyframes are stored relative to 0ms (cue start)
        const relTracks = selectedData.cue.animTracks.map((track) => ({
            ...track,
            keyframes: track.keyframes.map((kf) => ({
                ...kf,
                tMs: kf.tMs - selectedData!.cue.startMs,
            })),
        }));

        presetStore.savePreset(name, relTracks, selectedData.cue.effects || []);
    }

    function deleteAnimationPreset() {
        if (!selectedPresetId) return;
        const p = presetStore.presets.find((x) => x.id === selectedPresetId);
        if (!p) return;
        if (confirm(`Delete preset "${p.name}"?`)) {
            presetStore.deletePreset(selectedPresetId);
            selectedPresetId = "";
        }
    }

    function addSpan(style: Partial<StyleProps>) {
        if (!selectedData) return;
        const start = Math.min(selectionStart, selectionEnd);
        const end = Math.max(selectionStart, selectionEnd);

        if (start === end) return; // No selection

        commandManager.execute(
            new AddSpanCommand(
                selectedData!.trackId,
                selectedData!.cue.id,
                start,
                end,
                style,
            ),
        );
    }

    function toggleStyle(prop: keyof StyleProps, val: any = true) {
        if (!selectedData) return;
        const start = Math.min(selectionStart, selectionEnd);
        const end = Math.max(selectionStart, selectionEnd);

        if (start === end && prop !== "align") return; // No selection, unless it's alignment

        commandManager.execute(
            new ToggleSpanStyleCommand(
                selectedData!.trackId,
                selectedData!.cue.id,
                start,
                end,
                prop,
                val,
            ),
        );
    }

    function splitCue() {
        if (!selectedData) return;
        commandManager.execute(
            new SplitCueCommand(
                selectedData!.trackId,
                selectedData!.cue.id,
                projectStore.currentTime,
            ),
        );
    }

    function mergeNext() {
        if (!selectedData) return;
        const track = projectStore.project?.tracks.find(
            (t) => t.id === selectedData!.trackId,
        );
        if (!track) return;
        const idx = track.cues.findIndex((c) => c.id === selectedData!.cue.id);
        if (idx === -1 || idx === track.cues.length - 1) return;
        const nextCue = track.cues[idx + 1];
        commandManager.execute(
            new MergeCuesCommand(
                selectedData!.trackId,
                selectedData!.cue.id,
                nextCue.id,
            ),
        );
    }

    function applyFadeIn() {
        if (!selectedData) return;
        const { trackId, cue } = selectedData;
        const mid = cue.startMs + 500;
        projectStore.addKeyframe(
            trackId,
            "alpha",
            {
                id: crypto.randomUUID(),
                tMs: cue.startMs,
                value: 0,
                interp: "linear",
            },
            cue.id,
        );
        projectStore.addKeyframe(
            trackId,
            "alpha",
            { id: crypto.randomUUID(), tMs: mid, value: 1, interp: "linear" },
            cue.id,
        );
    }

    function applyFadeOut() {
        if (!selectedData) return;
        const { trackId, cue } = selectedData;
        const mid = cue.endMs - 500;
        projectStore.addKeyframe(
            trackId,
            "alpha",
            { id: crypto.randomUUID(), tMs: mid, value: 1, interp: "linear" },
            cue.id,
        );
        projectStore.addKeyframe(
            trackId,
            "alpha",
            {
                id: crypto.randomUUID(),
                tMs: cue.endMs,
                value: 0,
                interp: "linear",
            },
            cue.id,
        );
    }

    function getTrackValue(
        track: Track,
        path: string,
        defaultVal: number,
        t: number,
    ): number {
        let baseVal = defaultVal;
        if (path === "transform.xNorm") baseVal = track.transform.xNorm;
        else if (path === "transform.yNorm") baseVal = track.transform.yNorm;
        else if (path === "transform.scale") baseVal = track.transform.scale;
        else if (path === "transform.rotation")
            baseVal = track.transform.rotation;

        const anim = track.animTracks.find(
            (a: any) => a.paramPath === path && a.enabled,
        );
        if (anim && anim.keyframes.length > 0) {
            return interpolate(anim.keyframes, t, baseVal);
        }
        return baseVal;
    }

    function getCueValueAt(
        cue: Cue,
        path: string,
        defaultVal: number,
        t: number,
    ): number {
        const anim = cue.animTracks.find(
            (a) => a.paramPath === path && a.enabled,
        );
        if (anim && anim.keyframes.length > 0) {
            return interpolate(anim.keyframes, t, defaultVal);
        }
        return defaultVal;
    }

    function jumpToNextKeyframe(animTrack: any) {
        if (!animTrack) return;
        const next = animTrack.keyframes.find(
            (k: any) => k.tMs > projectStore.currentTime,
        );
        if (next) projectStore.currentTime = next.tMs;
    }

    function jumpToPrevKeyframe(animTrack: any) {
        if (!animTrack) return;
        const prev = [...animTrack.keyframes]
            .reverse()
            .find((k: any) => k.tMs < projectStore.currentTime);
        if (prev) projectStore.currentTime = prev.tMs;
    }

    let showStylePopup = $state(false);
    let popupType: "track" | "cue" = $state("track");

    function openStylePopup(type: "track" | "cue") {
        popupType = type;
        showStylePopup = true;
    }

    function closeStylePopup() {
        showStylePopup = false;
        isStyleDocked = false;
    }

    let isStyleDocked = $state(false);
    let popupPos = $state({ x: 100, y: 100 });
    let isDraggingPopup = $state(false);
    let dragOffset = { x: 0, y: 0 };
    let isOverDockZone = $state(false);

    function handlePopupMouseDown(e: MouseEvent) {
        if (isStyleDocked) return;
        isDraggingPopup = true;
        dragOffset = {
            x: e.clientX - popupPos.x,
            y: e.clientY - popupPos.y,
        };

        window.addEventListener("mousemove", handlePopupMouseMove);
        window.addEventListener("mouseup", handlePopupMouseUp);
    }

    function handlePopupMouseMove(e: MouseEvent) {
        if (!isDraggingPopup) return;
        popupPos = {
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y,
        };

        // Detect dock zone (Inspector tabs area)
        const tabsEl = document.querySelector(".inspector .tabs");
        if (tabsEl) {
            const rect = tabsEl.getBoundingClientRect();
            isOverDockZone =
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom;
        }
    }

    function handlePopupMouseUp() {
        if (isOverDockZone) {
            isStyleDocked = true;
            showStylePopup = false;
            activeTab = "style";
        }
        isDraggingPopup = false;
        isOverDockZone = false;
        window.removeEventListener("mousemove", handlePopupMouseMove);
        window.removeEventListener("mouseup", handlePopupMouseUp);
    }

    // --- Drag and Drop for Effects (svelte-dnd-action) ---
    let currentActiveEffects = $state<any[]>([]);
    let currentColorEffects = $state<any[]>([]);

    // Sync with store
    $effect(() => {
        if (selectedData?.cue?.effects) {
            currentActiveEffects = selectedData.cue.effects.filter(
                (e) => !COLOR_EFFECTS.includes(e.type),
            );
            currentColorEffects = selectedData.cue.effects.filter((e) =>
                COLOR_EFFECTS.includes(e.type),
            );
        } else {
            currentActiveEffects = [];
            currentColorEffects = [];
        }
    });

    function handleActiveConsider(e: CustomEvent<any>) {
        currentActiveEffects = e.detail.items;
    }

    function handleActiveFinalize(e: CustomEvent<any>) {
        currentActiveEffects = e.detail.items;
        if (!selectedData) return;

        const newEffects = [...currentActiveEffects, ...currentColorEffects];
        commandManager.execute(
            new ReorderEffectsCommand(
                selectedData.trackId,
                selectedData.cue.id,
                newEffects,
            ),
        );
    }

    function handleColorConsider(e: CustomEvent<any>) {
        currentColorEffects = e.detail.items;
    }

    function handleColorFinalize(e: CustomEvent<any>) {
        currentColorEffects = e.detail.items;
        if (!selectedData) return;

        const newEffects = [...currentActiveEffects, ...currentColorEffects];
        commandManager.execute(
            new ReorderEffectsCommand(
                selectedData.trackId,
                selectedData.cue.id,
                newEffects,
            ),
        );
    }

    function handleKeyframeTickMouseDown(e: MouseEvent, anim: any, kf: any) {
        e.stopPropagation();
        if (!selectedData) return;

        const startX = e.clientX;
        const initialTMs = kf.tMs;
        const cueStart = selectedData!.cue.startMs;
        const cueEnd = selectedData!.cue.endMs;
        const duration = cueEnd - cueStart;
        const timelineWidth = (
            e.currentTarget as HTMLElement
        ).parentElement!.getBoundingClientRect().width;

        function onMove(me: MouseEvent) {
            if (!selectedData) return;
            const dx = me.clientX - startX;
            const dT = (dx / timelineWidth) * duration;
            let newT = Math.round(initialTMs + dT);

            // Clamp to cue boundaries
            newT = Math.max(cueStart, Math.min(cueEnd, newT));

            // Preview update (local mutation)
            kf.tMs = newT;
            projectStore.project.updatedAt = new Date().toISOString();
        }

        function onUp(me: MouseEvent) {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);

            if (!selectedData) return;

            const finalT = kf.tMs;

            // Revert local mutation so Command can execute properly from old state
            kf.tMs = initialTMs;

            if (finalT !== initialTMs) {
                commandManager.execute(
                    new UpdateKeyframeTimeCommand(
                        selectedData!.trackId,
                        anim.paramPath,
                        initialTMs,
                        finalT,
                        selectedData!.cue.id,
                    ),
                );
            }
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }

    function getActiveEdges(style: any): string[] {
        if (style.edgeTypes && style.edgeTypes.length > 0)
            return style.edgeTypes;
        return [];
    }

    function deletePreset(id: string) {
        if (!id) return;
        const preset = presetStore.presets.find((p) => p.id === id);
        if (!preset) return;
        if (confirm(`Delete preset "${preset.name}"?`)) {
            presetStore.deletePreset(id);
            selectedPresetId = "";
        }
    }
</script>

{#snippet styleContent()}
    {#if selectedData}
        {@const isTrack = popupType === "track"}
        {@const currentStyle = isTrack
            ? selectedData.track.defaultStyle
            : selectedData.cue.styleOverride || {}}
        {@const updateFn = (s: any) => {
            if (isTrack) {
                commandManager.execute(
                    new UpdateTrackStyleCommand(selectedData!.trackId, s),
                );
            } else {
                commandManager.execute(
                    new UpdateCueStyleCommand(
                        selectedData!.trackId,
                        selectedData!.cue.id,
                        s,
                    ),
                );
            }
        }}

        <section>
            <h4>Background</h4>
            <div class="popup-row">
                <label>Box:</label>
                <input
                    type="checkbox"
                    checked={!!currentStyle.backgroundColor}
                    onchange={(e) =>
                        updateFn({
                            backgroundColor: (e.target as HTMLInputElement)
                                .checked
                                ? "#000000"
                                : undefined,
                        })}
                />
            </div>
            {#if currentStyle.backgroundColor}
                <div class="row">
                    <label for="track-bg-color">Color:</label>
                    <input
                        id="track-bg-color"
                        type="color"
                        value={currentStyle.backgroundColor}
                        onchange={(e) =>
                            updateFn({
                                backgroundColor: (e.target as HTMLInputElement)
                                    .value,
                            })}
                    />
                </div>
                <div class="row">
                    <label for="bg-radius">Corner Radius:</label>
                    <input
                        id="bg-radius"
                        type="number"
                        min="0"
                        step="1"
                        value={currentStyle.borderRadius ?? 0}
                        onchange={(e) =>
                            updateFn({
                                borderRadius: parseFloat(
                                    (e.target as HTMLInputElement).value,
                                ),
                            })}
                    />
                    <span class="unit">px</span>
                </div>
            {/if}
        </section>

        <section>
            <h4>Edge Effects</h4>
            <div class="edge-tabs-container">
                {#each ["outline", "shadow", "glow", "bevel"] as edge}
                    {@const isActive =
                        getActiveEdges(currentStyle).includes(edge)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="edge-tab-item"
                        class:active={activeEdgeTab === edge}
                        onclick={() => (activeEdgeTab = edge as any)}
                    >
                        <input
                            type="checkbox"
                            checked={isActive}
                            onclick={(e) => e.stopPropagation()}
                            onchange={(e) => {
                                const checked = (e.target as HTMLInputElement)
                                    .checked;
                                let types = new Set(
                                    getActiveEdges(currentStyle),
                                );
                                if (checked) types.add(edge);
                                else types.delete(edge);
                                updateFn({
                                    edgeTypes: Array.from(types),
                                });
                                if (checked) {
                                    activeEdgeTab = edge as any;
                                }
                            }}
                        />
                        <span class="tab-label">
                            {edge.charAt(0).toUpperCase() + edge.slice(1)}
                        </span>
                    </div>
                {/each}
            </div>

            <div class="edge-content">
                {#if activeEdgeTab === "outline"}
                    <div class="popup-row">
                        <label>Color:</label>
                        <input
                            type="color"
                            value={currentStyle.outlineColor || "#000000"}
                            onchange={(e) =>
                                updateFn({
                                    outlineColor: (e.target as HTMLInputElement)
                                        .value,
                                })}
                        />
                    </div>
                    <div class="popup-row">
                        <label>Width:</label>
                        <input
                            type="number"
                            step="0.5"
                            value={currentStyle.outlineWidth ?? 2}
                            onchange={(e) =>
                                updateFn({
                                    outlineWidth: parseFloat(
                                        (e.target as HTMLInputElement).value,
                                    ),
                                })}
                        />
                    </div>
                {:else if activeEdgeTab === "shadow"}
                    <div class="popup-row">
                        <label>Color:</label>
                        <input
                            type="color"
                            value={currentStyle.shadowColor || "#000000"}
                            onchange={(e) =>
                                updateFn({
                                    shadowColor: (e.target as HTMLInputElement)
                                        .value,
                                })}
                        />
                    </div>
                    <div class="popup-row">
                        <label>Blur:</label>
                        <input
                            type="number"
                            step="1"
                            value={currentStyle.shadowBlur ?? 4}
                            onchange={(e) =>
                                updateFn({
                                    shadowBlur: parseFloat(
                                        (e.target as HTMLInputElement).value,
                                    ),
                                })}
                        />
                    </div>
                    <div class="popup-row">
                        <label>Off X:</label>
                        <input
                            type="number"
                            step="1"
                            value={currentStyle.shadowOffsetX ?? 2}
                            onchange={(e) =>
                                updateFn({
                                    shadowOffsetX: parseFloat(
                                        (e.target as HTMLInputElement).value,
                                    ),
                                })}
                        />
                    </div>
                    <div class="popup-row">
                        <label>Off Y:</label>
                        <input
                            type="number"
                            step="1"
                            value={currentStyle.shadowOffsetY ?? 2}
                            onchange={(e) =>
                                updateFn({
                                    shadowOffsetY: parseFloat(
                                        (e.target as HTMLInputElement).value,
                                    ),
                                })}
                        />
                    </div>
                {:else if activeEdgeTab === "glow"}
                    <div class="popup-row">
                        <label>Color:</label>
                        <input
                            type="color"
                            value={currentStyle.edgeEffects?.glow?.color ||
                                "#FFFF00"}
                            onchange={(e) => {
                                const glow =
                                    currentStyle.edgeEffects?.glow || {};
                                updateFn({
                                    edgeEffects: {
                                        ...currentStyle.edgeEffects,
                                        glow: {
                                            ...glow,
                                            color: (
                                                e.target as HTMLInputElement
                                            ).value,
                                        },
                                    },
                                });
                            }}
                        />
                    </div>
                    <div class="popup-row">
                        <label>Width:</label>
                        <input
                            type="number"
                            step="1"
                            value={currentStyle.edgeEffects?.glow?.width ?? 5}
                            onchange={(e) => {
                                const glow =
                                    currentStyle.edgeEffects?.glow || {};
                                updateFn({
                                    edgeEffects: {
                                        ...currentStyle.edgeEffects,
                                        glow: {
                                            ...glow,
                                            width: parseFloat(
                                                (e.target as HTMLInputElement)
                                                    .value,
                                            ),
                                        },
                                    },
                                });
                            }}
                        />
                    </div>
                {:else if activeEdgeTab === "bevel"}
                    <div class="popup-row">
                        <label>Color:</label>
                        <input
                            type="color"
                            value={currentStyle.edgeEffects?.bevel?.color ||
                                "#FFFFFF"}
                            onchange={(e) => {
                                const bevel =
                                    currentStyle.edgeEffects?.bevel || {};
                                updateFn({
                                    edgeEffects: {
                                        ...currentStyle.edgeEffects,
                                        bevel: {
                                            ...bevel,
                                            color: (
                                                e.target as HTMLInputElement
                                            ).value,
                                        },
                                    },
                                });
                            }}
                        />
                    </div>
                    <div class="popup-row">
                        <label>Width:</label>
                        <input
                            type="number"
                            step="0.5"
                            value={currentStyle.edgeEffects?.bevel?.width ?? 2}
                            onchange={(e) => {
                                const bevel =
                                    currentStyle.edgeEffects?.bevel || {};
                                updateFn({
                                    edgeEffects: {
                                        ...currentStyle.edgeEffects,
                                        bevel: {
                                            ...bevel,
                                            width: parseFloat(
                                                (e.target as HTMLInputElement)
                                                    .value,
                                            ),
                                        },
                                    },
                                });
                            }}
                        />
                    </div>
                {/if}
            </div>
        </section>
    {/if}
{/snippet}

<div class="inspector">
    <div class="tabs">
        <button
            class="tab-btn"
            class:active={activeTab === "inspector"}
            onclick={() => (activeTab = "inspector")}
        >
            Inspector
        </button>
        <button
            class="tab-btn"
            class:active={activeTab === "keyframe"}
            onclick={() => (activeTab = "keyframe")}
        >
            Keyframe
        </button>
        <button
            class="tab-btn"
            class:active={activeTab === "effect"}
            onclick={() => (activeTab = "effect")}
        >
            Effect
        </button>
        <button
            class="tab-btn"
            class:active={activeTab === "color-effect"}
            onclick={() => (activeTab = "color-effect")}
        >
            Color Effect
        </button>

        {#if isStyleDocked}
            <div class="tab-btn style-tab" class:active={activeTab === "style"}>
                <button
                    class="tab-inner-btn"
                    onclick={() => (activeTab = "style")}
                >
                    Style
                </button>
                <button
                    class="tab-close-btn"
                    onclick={(e) => {
                        e.stopPropagation();
                        isStyleDocked = false;
                        if (activeTab === "style") activeTab = "inspector";
                    }}
                >
                    <X size={12} />
                </button>
            </div>
        {/if}
    </div>

    {#if selectedData}
        <div class="content">
            {#if activeTab === "inspector"}
                <!-- Inspector Content -->
                <div class="row">
                    <div class="tools-row">
                        <button
                            class="tool-btn"
                            onclick={splitCue}
                            title="Split at Cursor"
                        >
                            <Scissors size={16} /> Split
                        </button>
                        <button
                            class="tool-btn"
                            onclick={mergeNext}
                            title="Merge with Next"
                        >
                            <Merge size={16} /> Merge Next
                        </button>
                        <button
                            class="tool-btn"
                            style="color: #e55;"
                            onclick={() => {
                                if (!selectedData) return;
                                commandManager.execute(
                                    new RemoveCueCommand(
                                        selectedData!.trackId,
                                        selectedData!.cue.id,
                                    ),
                                );
                                projectStore.selectedCueIds = new Set();
                            }}
                            title="Delete this cue"
                        >
                            <Trash2 size={16} /> Delete
                        </button>
                    </div>
                </div>

                <div class="row">
                    <div class="toolbar-mini">
                        <div class="font-dropdown-container">
                            <button
                                class="font-btn"
                                onclick={() => (showFontMenu = !showFontMenu)}
                                title="Font Family"
                            >
                                <Type size={14} />
                            </button>
                            {#if showFontMenu}
                                <div class="font-menu">
                                    {#each FONTS as font}
                                        <button
                                            class="font-menu-item"
                                            style:font-family={font}
                                            onclick={() => {
                                                toggleStyle("fontFamily", font);
                                                showFontMenu = false;
                                            }}
                                        >
                                            {font}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>

                        <button
                            class:active={(() => {
                                if (
                                    !selectedData ||
                                    selectionStart === selectionEnd
                                )
                                    return false;
                                const start = Math.min(
                                    selectionStart,
                                    selectionEnd,
                                );
                                const end = Math.max(
                                    selectionStart,
                                    selectionEnd,
                                );
                                const spans = selectedData.cue.spans.filter(
                                    (s) =>
                                        s.startChar < end && s.endChar > start,
                                );
                                for (let i = start; i < end; i++) {
                                    const s = spans.find(
                                        (sp) =>
                                            i >= sp.startChar && i < sp.endChar,
                                    );
                                    if (!s || !s.stylePatch.fontWeight)
                                        return false;
                                }
                                return true;
                            })()}
                            onclick={() => toggleStyle("fontWeight", "bold")}
                            title="Bold"
                        >
                            <Bold size={14} />
                        </button>
                        <button
                            class:active={(() => {
                                if (
                                    !selectedData ||
                                    selectionStart === selectionEnd
                                )
                                    return false;
                                const start = Math.min(
                                    selectionStart,
                                    selectionEnd,
                                );
                                const end = Math.max(
                                    selectionStart,
                                    selectionEnd,
                                );
                                const spans = selectedData.cue.spans.filter(
                                    (s) =>
                                        s.startChar < end && s.endChar > start,
                                );
                                for (let i = start; i < end; i++) {
                                    const s = spans.find(
                                        (sp) =>
                                            i >= sp.startChar && i < sp.endChar,
                                    );
                                    if (!s || !s.stylePatch.italic)
                                        return false;
                                }
                                return true;
                            })()}
                            onclick={() => toggleStyle("italic")}
                            title="Italic"
                        >
                            <Italic size={14} />
                        </button>
                        <button
                            class:active={false}
                            onclick={() => {
                                if (!selectedData) return;
                                const spans = selectedData.cue.spans || [];
                                const start = Math.min(
                                    selectionStart,
                                    selectionEnd,
                                );
                                const end = Math.max(
                                    selectionStart,
                                    selectionEnd,
                                );

                                // Pick current align from selection start or right before caret
                                const targetChar =
                                    start === end
                                        ? Math.max(0, start - 1)
                                        : start;
                                const s = selectedData.cue.spans.find(
                                    (sp) =>
                                        targetChar >= sp.startChar &&
                                        targetChar < sp.endChar,
                                );
                                const current = s?.stylePatch.align || "left";

                                let next: "left" | "center" | "right" =
                                    "center";
                                if (current === "left") next = "center";
                                else if (current === "center") next = "right";
                                else next = "left";

                                toggleStyle("align", next);
                            }}
                            title="Text Alignment (Left/Center/Right)"
                        >
                            {#key (() => {
                                if (!selectedData) return "left";
                                const start = Math.min(selectionStart, selectionEnd);
                                const end = Math.max(selectionStart, selectionEnd);
                                const targetChar = start === end ? Math.max(0, start - 1) : start;
                                const s = selectedData.cue.spans.find((sp) => targetChar >= sp.startChar && targetChar < sp.endChar);
                                return s?.stylePatch.align || "left";
                            })()}
                                {@const align = (() => {
                                    if (!selectedData) return "left";
                                    const start = Math.min(
                                        selectionStart,
                                        selectionEnd,
                                    );
                                    const end = Math.max(
                                        selectionStart,
                                        selectionEnd,
                                    );
                                    const targetChar =
                                        start === end
                                            ? Math.max(0, start - 1)
                                            : start;
                                    const s = selectedData.cue.spans.find(
                                        (sp) =>
                                            targetChar >= sp.startChar &&
                                            targetChar < sp.endChar,
                                    );
                                    return s?.stylePatch.align || "left";
                                })()}
                                {#if align === "center"}
                                    <AlignCenter size={14} />
                                {:else if align === "right"}
                                    <AlignRight size={14} />
                                {:else}
                                    <AlignLeft size={14} />
                                {/if}
                            {/key}
                        </button>
                        <button
                            class:active={(() => {
                                if (
                                    !selectedData ||
                                    selectionStart === selectionEnd
                                )
                                    return false;
                                const start = Math.min(
                                    selectionStart,
                                    selectionEnd,
                                );
                                const end = Math.max(
                                    selectionStart,
                                    selectionEnd,
                                );
                                const spans = selectedData.cue.spans.filter(
                                    (s) =>
                                        s.startChar < end && s.endChar > start,
                                );
                                for (let i = start; i < end; i++) {
                                    const s = spans.find(
                                        (sp) =>
                                            i >= sp.startChar && i < sp.endChar,
                                    );
                                    if (!s || !s.stylePatch.underline)
                                        return false;
                                }
                                return true;
                            })()}
                            onclick={() => toggleStyle("underline")}
                            title="Underline"
                        >
                            <Underline size={14} />
                        </button>
                        <button
                            class:active={(() => {
                                if (
                                    !selectedData ||
                                    selectionStart === selectionEnd
                                )
                                    return false;
                                const start = Math.min(
                                    selectionStart,
                                    selectionEnd,
                                );
                                const end = Math.max(
                                    selectionStart,
                                    selectionEnd,
                                );
                                const spans = selectedData.cue.spans.filter(
                                    (s) =>
                                        s.startChar < end && s.endChar > start,
                                );
                                for (let i = start; i < end; i++) {
                                    const s = spans.find(
                                        (sp) =>
                                            i >= sp.startChar && i < sp.endChar,
                                    );
                                    if (!s || !s.stylePatch.lineThrough)
                                        return false;
                                }
                                return true;
                            })()}
                            onclick={() => toggleStyle("lineThrough")}
                            title="Strikeout"
                        >
                            <Strikethrough size={14} />
                        </button>
                        <button
                            class:active={(() => {
                                const spans = selectedData?.cue.spans || [];
                                const start = Math.min(
                                    selectionStart,
                                    selectionEnd,
                                );
                                const end = Math.max(
                                    selectionStart,
                                    selectionEnd,
                                );

                                if (start === end) {
                                    // If caret, check if inside a ruby span?
                                    // Actually, ruby is usually entire cue or span-based.
                                    // Let's make it span-based like others.
                                    const s = spans.find(
                                        (sp) =>
                                            start >= sp.startChar &&
                                            start < sp.endChar,
                                    );
                                    return s?.stylePatch.rubyEnabled || false;
                                }

                                // If selection, check if ALL chars in range have ruby
                                // Rough check: check if we have any span with ruby in this range
                                return spans.some(
                                    (sp) =>
                                        sp.startChar < end &&
                                        sp.endChar > start &&
                                        sp.stylePatch.rubyEnabled,
                                );
                            })()}
                            onclick={() => toggleStyle("rubyEnabled")}
                            title="Ruby (Furigana) [Base/Ruby]"
                            style="font-family: serif; font-weight: bold; font-size: 14px;"
                        >
                            Rb
                        </button>
                        <div
                            class="color-input-wrapper"
                            title="Text Color (Highlight)"
                        >
                            <input
                                type="color"
                                oninput={(e) => {
                                    if (
                                        selectionStart === selectionEnd &&
                                        selectedData
                                    ) {
                                        // Auto-select all if nothing selected to ensure highlight priority
                                        selectionStart = 0;
                                        selectionEnd =
                                            selectedData!.cue.plainText.length;
                                    }
                                    addSpan({
                                        color: (e.target as HTMLInputElement)
                                            .value,
                                    });
                                }}
                                style="width: 24px; height: 24px; padding: 0; cursor: pointer; border: 1px solid var(--border-light); background: var(--bg-header); border-radius: 4px;"
                            />
                        </div>
                        <button
                            onclick={() => openStylePopup("cue")}
                            title="Advanced Style (Background, Effects, Opacity)"
                        >
                            <Settings size={14} />
                        </button>
                    </div>
                    <textarea
                        id="cue-text"
                        bind:value={selectedData!.cue.plainText}
                        onfocus={handleTextFocus}
                        onblur={handleTextBlur}
                        onselect={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            selectionStart = target.selectionStart || 0;
                            selectionEnd = target.selectionEnd || 0;
                        }}
                        onclick={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            selectionStart = target.selectionStart || 0;
                            selectionEnd = target.selectionEnd || 0;
                        }}
                        onkeyup={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            selectionStart = target.selectionStart || 0;
                            selectionEnd = target.selectionEnd || 0;
                        }}
                    ></textarea>
                    <div class="selection-info">
                        Selection: {selectionStart} - {selectionEnd}
                    </div>
                </div>

                <div class="row">
                    <div class="time-row">
                        <div class="time-input">
                            <label for="cue-start">Start (ms)</label>
                            <input
                                id="cue-start"
                                type="number"
                                value={selectedData!.cue.startMs}
                                onchange={(e) => {
                                    const val = parseInt(
                                        (e.target as HTMLInputElement).value,
                                    );
                                    if (selectedData) {
                                        commandManager.execute(
                                            new TimeChangeCommand(
                                                selectedData!.trackId,
                                                selectedData!.cue.id,
                                                selectedData!.cue.startMs,
                                                selectedData!.cue.endMs,
                                                val,
                                                selectedData!.cue.endMs,
                                            ),
                                        );
                                    }
                                }}
                            />
                        </div>
                        <div class="time-input">
                            <label for="cue-end">End (ms)</label>
                            <input
                                id="cue-end"
                                type="number"
                                value={selectedData!.cue.endMs}
                                onchange={(e) => {
                                    const val = parseInt(
                                        (e.target as HTMLInputElement).value,
                                    );
                                    if (selectedData) {
                                        commandManager.execute(
                                            new TimeChangeCommand(
                                                selectedData!.trackId,
                                                selectedData!.cue.id,
                                                selectedData!.cue.startMs,
                                                selectedData!.cue.endMs,
                                                selectedData!.cue.startMs,
                                                val,
                                            ),
                                        );
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div class="row">
                    <span class="label-text"
                        >Subtitle Position (Individual)</span
                    >

                    <div class="input-grid-mini">
                        {#each [{ label: "X (%)", key: "xNorm", scale: 100, defaultVal: 0.5 }, { label: "Y (%)", key: "yNorm", scale: 100, defaultVal: 0.5 }, { label: "Scale", key: "scale", scale: 1, defaultVal: 1 }, { label: "Rotation", key: "rotation", scale: 1, defaultVal: 0 }] as p}
                            {@const paramPath = `posOverride.${p.key}`}
                            {@const animTrack =
                                selectedData!.cue.animTracks.find(
                                    (a) => a.paramPath === paramPath,
                                )}
                            {@const currentVal = getCueValueAt(
                                selectedData!.cue,
                                paramPath,
                                (selectedData!.cue.posOverride as any)?.[
                                    p.key
                                ] ?? p.defaultVal,
                                projectStore.currentTime,
                            )}
                            {@const hasKeyframe = animTrack?.keyframes.some(
                                (k) =>
                                    Math.abs(k.tMs - projectStore.currentTime) <
                                    1,
                            )}
                            <div class="field-with-kf">
                                <div class="field">
                                    <label for="pos-{p.key}">{p.label}</label>
                                    <input
                                        id="pos-{p.key}"
                                        type="number"
                                        step={p.key === "scale" ? 0.1 : 1}
                                        value={currentVal * p.scale}
                                        onchange={(e) => {
                                            if (!selectedData) return;
                                            const val =
                                                parseFloat(
                                                    (
                                                        e.target as HTMLInputElement
                                                    ).value,
                                                ) / p.scale;
                                            const pos = {
                                                ...(selectedData!.cue
                                                    .posOverride || {}),
                                            };
                                            (pos as any)[p.key] = val;
                                            projectStore.updateCue(
                                                selectedData!.trackId,
                                                selectedData!.cue.id,
                                                { posOverride: pos },
                                            );

                                            if (animTrack) {
                                                if (hasKeyframe) {
                                                    commandManager.execute(
                                                        new UpdateKeyframeValueCommand(
                                                            selectedData!.trackId,
                                                            paramPath,
                                                            projectStore.currentTime,
                                                            val,
                                                            selectedData!.cue.id,
                                                        ),
                                                    );
                                                } else {
                                                    commandManager.execute(
                                                        new AddKeyframeCommand(
                                                            selectedData!.trackId,
                                                            paramPath,
                                                            {
                                                                id: crypto.randomUUID(),
                                                                tMs: projectStore.currentTime,
                                                                value: val,
                                                                interp: "linear",
                                                            },
                                                            selectedData!.cue.id,
                                                        ),
                                                    );
                                                }
                                            }
                                        }}
                                    />
                                </div>
                                <button
                                    class="small-btn kf-btn"
                                    class:active={hasKeyframe}
                                    onclick={() => {
                                        if (!selectedData) return;
                                        if (hasKeyframe) {
                                            commandManager.execute(
                                                new RemoveKeyframeCommand(
                                                    selectedData!.trackId,
                                                    paramPath,
                                                    projectStore.currentTime,
                                                    selectedData!.cue.id,
                                                ),
                                            );
                                        } else {
                                            const val =
                                                (
                                                    selectedData!.cue
                                                        .posOverride as any
                                                )?.[p.key] ?? p.defaultVal;
                                            commandManager.execute(
                                                new AddKeyframeCommand(
                                                    selectedData!.trackId,
                                                    paramPath,
                                                    {
                                                        id: crypto.randomUUID(),
                                                        tMs: projectStore.currentTime,
                                                        value: val,
                                                        interp: "linear",
                                                    },
                                                    selectedData!.cue.id,
                                                ),
                                            );
                                        }
                                    }}
                                >
                                    <Diamond
                                        size={10}
                                        fill={hasKeyframe
                                            ? "currentColor"
                                            : "none"}
                                    />
                                </button>
                            </div>
                        {/each}
                    </div>

                    <!-- Opacity for Cue -->
                    {#if selectedData}
                        {@const cueAlphaPath = "styleOverride.alpha"}
                        {@const cueAlphaDefault =
                            selectedData.cue.styleOverride?.alpha ?? 1}
                        {@const cueAlphaVal = getCueValueAt(
                            selectedData.cue,
                            cueAlphaPath,
                            cueAlphaDefault,
                            projectStore.currentTime,
                        )}
                        {@const cueAlphaAnim = selectedData.cue.animTracks.find(
                            (a) => a.paramPath === cueAlphaPath,
                        )}
                        {@const cueHasKf = cueAlphaAnim?.keyframes.some(
                            (k) =>
                                Math.abs(k.tMs - projectStore.currentTime) < 1,
                        )}

                        <div class="row" style="margin-top: 0.5rem;">
                            <label for="cue-opacity">Opacity (%)</label>

                            <div class="field-with-kf">
                                <div class="field time-input">
                                    <input
                                        id="cue-opacity"
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value={cueAlphaVal * 100}
                                        onchange={(e) => {
                                            if (selectedData) {
                                                const val =
                                                    parseFloat(
                                                        (
                                                            e.target as HTMLInputElement
                                                        ).value,
                                                    ) / 100;
                                                // Update base value
                                                commandManager.execute(
                                                    new UpdateCueStyleCommand(
                                                        selectedData.trackId,
                                                        selectedData.cue.id,
                                                        { alpha: val },
                                                    ),
                                                );

                                                // Update keyframe if exists
                                                if (cueHasKf) {
                                                    commandManager.execute(
                                                        new UpdateKeyframeValueCommand(
                                                            selectedData.trackId,
                                                            cueAlphaPath,
                                                            projectStore.currentTime,
                                                            val,
                                                            selectedData.cue.id,
                                                        ),
                                                    );
                                                }
                                            }
                                        }}
                                    />
                                    <span class="unit" style="float: right;"
                                        >{Math.round(cueAlphaVal * 100)}%</span
                                    >
                                </div>
                                <button
                                    class="small-btn kf-btn"
                                    class:active={cueHasKf}
                                    onclick={() => {
                                        if (!selectedData) return;
                                        if (cueHasKf) {
                                            commandManager.execute(
                                                new RemoveKeyframeCommand(
                                                    selectedData.trackId,
                                                    cueAlphaPath,
                                                    projectStore.currentTime,
                                                    selectedData.cue.id,
                                                ),
                                            );
                                        } else {
                                            commandManager.execute(
                                                new AddKeyframeCommand(
                                                    selectedData.trackId,
                                                    cueAlphaPath,
                                                    {
                                                        id: crypto.randomUUID(),
                                                        tMs: projectStore.currentTime,
                                                        value: cueAlphaVal,
                                                        interp: "linear",
                                                    },
                                                    selectedData.cue.id,
                                                ),
                                            );
                                        }
                                    }}
                                >
                                    <Diamond
                                        size={10}
                                        fill={cueHasKf
                                            ? "currentColor"
                                            : "none"}
                                    />
                                </button>
                            </div>
                        </div>
                    {/if}
                </div>

                <div class="row">
                    <label for="track-color">Track Color</label>
                    <div class="color-row">
                        <div
                            class="color-input-wrapper"
                            title="Track Text Color (Base)"
                        >
                            <input
                                id="track-color"
                                type="color"
                                value={selectedData!.track.defaultStyle.color ||
                                    "#ffffff"}
                                onchange={(e) =>
                                    commandManager.execute(
                                        new UpdateTrackStyleCommand(
                                            selectedData!.trackId,
                                            {
                                                color: (
                                                    e.target as HTMLInputElement
                                                ).value,
                                            },
                                        ),
                                    )}
                                style="width: 24px; height: 24px; padding: 0; cursor: pointer; border: 1px solid var(--border-light); background: var(--bg-header); border-radius: 4px;"
                            />
                        </div>
                        <button
                            class=""
                            onclick={() => openStylePopup("track")}
                            title="Advanced Track Style"
                            style="width: 24px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; background: var(--bg-header); border: 1px solid var(--border-light); color: var(--text-dim); cursor: pointer; border-radius: 4px;"
                        >
                            <Settings size={14} />
                        </button>
                    </div>
                </div>

                <div class="row">
                    <span class="label-text">Track Transform</span>
                    {#each [{ label: "X (%)", path: "transform.xNorm", step: 1, scale: 100, defaultVal: 0.5 }, { label: "Y (%)", path: "transform.yNorm", step: 1, scale: 100, defaultVal: 0.8 }, { label: "Scale", path: "transform.scale", step: 0.1, scale: 1, defaultVal: 1 }, { label: "Rotation", path: "transform.rotation", step: 1, scale: 1, defaultVal: 0 }] as p}
                        {@const track = projectStore.project?.tracks.find(
                            (t) => t.id === selectedData!.trackId,
                        )}
                        {@const animTrack = track?.animTracks.find(
                            (a) => a.paramPath === p.path,
                        )}
                        {@const currentVal = track
                            ? getTrackValue(
                                  track,
                                  p.path,
                                  p.defaultVal,
                                  projectStore.currentTime,
                              )
                            : p.defaultVal}
                        {@const hasKeyframe = animTrack?.keyframes.some(
                            (k: any) =>
                                Math.abs(k.tMs - projectStore.currentTime) < 1,
                        )}

                        <div
                            class="time-row"
                            style="margin-bottom: 0.5rem; align-items: center;"
                        >
                            <div class="time-input">
                                <label for="track-{p.path.replace('.', '-')}"
                                    >{p.label}</label
                                >
                                <input
                                    id="track-{p.path.replace('.', '-')}"
                                    type="number"
                                    step={p.step}
                                    value={currentVal * p.scale}
                                    onchange={(e) => {
                                        const val =
                                            parseFloat(
                                                (e.target as HTMLInputElement)
                                                    .value,
                                            ) / p.scale;
                                        if (track) {
                                            if (p.path === "transform.xNorm")
                                                track.transform.xNorm = val;
                                            if (p.path === "transform.yNorm")
                                                track.transform.yNorm = val;
                                            if (p.path === "transform.scale")
                                                track.transform.scale = val;
                                            if (p.path === "transform.rotation")
                                                track.transform.rotation = val;
                                            projectStore.project.updatedAt =
                                                new Date().toISOString();
                                            if (hasKeyframe) {
                                                commandManager.execute(
                                                    new UpdateKeyframeValueCommand(
                                                        track.id,
                                                        p.path,
                                                        projectStore.currentTime,
                                                        val,
                                                    ),
                                                );
                                            }
                                        }
                                    }}
                                />
                            </div>
                            <button
                                class="small-btn"
                                style="margin-top: 1.2rem; margin-left: 0.5rem; color: {hasKeyframe
                                    ? 'var(--accent)'
                                    : 'var(--text-dim)'}"
                                onclick={() => {
                                    if (!track) return;
                                    if (hasKeyframe) {
                                        commandManager.execute(
                                            new RemoveKeyframeCommand(
                                                track.id,
                                                p.path,
                                                projectStore.currentTime,
                                            ),
                                        );
                                    } else {
                                        let val = p.defaultVal;
                                        if (p.path === "transform.xNorm")
                                            val = track.transform.xNorm;
                                        if (p.path === "transform.yNorm")
                                            val = track.transform.yNorm;
                                        if (p.path === "transform.scale")
                                            val = track.transform.scale;
                                        if (p.path === "transform.rotation")
                                            val = track.transform.rotation;
                                        commandManager.execute(
                                            new AddKeyframeCommand(
                                                track.id,
                                                p.path,
                                                {
                                                    id: crypto.randomUUID(),
                                                    tMs: projectStore.currentTime,
                                                    value: val,
                                                    interp: "linear",
                                                },
                                            ),
                                        );
                                    }
                                }}
                            >
                                <div
                                    style="width: 8px; height: 8px; border-radius: 50%; background: currentColor;"
                                ></div>
                            </button>
                        </div>
                    {/each}
                </div>

                <!-- Opacity for Track -->
                {#if selectedData}
                    {@const trackAlphaPath = "defaultStyle.alpha"}
                    {@const trackAlphaDefault =
                        selectedData.track.defaultStyle.alpha ?? 1}
                    {@const trackAlphaVal = getTrackValue(
                        selectedData.track,
                        trackAlphaPath,
                        trackAlphaDefault,
                        projectStore.currentTime,
                    )}
                    {@const trackAlphaAnim = selectedData.track.animTracks.find(
                        (a) => a.paramPath === trackAlphaPath,
                    )}
                    {@const trackHasKf = trackAlphaAnim?.keyframes.some(
                        (k) => Math.abs(k.tMs - projectStore.currentTime) < 1,
                    )}

                    <div class="row">
                        <label for="track-opacity">Track Opacity (%)</label>

                        <div class="field-with-kf">
                            <div class="field time-input">
                                <input
                                    id="track-opacity"
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={trackAlphaVal * 100}
                                    onchange={(e) => {
                                        if (selectedData) {
                                            const val =
                                                parseFloat(
                                                    (
                                                        e.target as HTMLInputElement
                                                    ).value,
                                                ) / 100;
                                            // Update base value
                                            commandManager.execute(
                                                new UpdateTrackStyleCommand(
                                                    selectedData.trackId,
                                                    { alpha: val },
                                                ),
                                            );

                                            // Update keyframe if exists
                                            if (trackHasKf) {
                                                commandManager.execute(
                                                    new UpdateKeyframeValueCommand(
                                                        selectedData.trackId,
                                                        trackAlphaPath,
                                                        projectStore.currentTime,
                                                        val,
                                                    ),
                                                );
                                            }
                                        }
                                    }}
                                />
                                <span class="unit" style="float: right;"
                                    >{Math.round(trackAlphaVal * 100)}%</span
                                >
                            </div>
                            <button
                                class="small-btn kf-btn"
                                class:active={trackHasKf}
                                onclick={() => {
                                    if (!selectedData) return;
                                    if (trackHasKf) {
                                        commandManager.execute(
                                            new RemoveKeyframeCommand(
                                                selectedData.trackId,
                                                trackAlphaPath,
                                                projectStore.currentTime,
                                            ),
                                        );
                                    } else {
                                        commandManager.execute(
                                            new AddKeyframeCommand(
                                                selectedData.trackId,
                                                trackAlphaPath,
                                                {
                                                    id: crypto.randomUUID(),
                                                    tMs: projectStore.currentTime,
                                                    value: trackAlphaVal,
                                                    interp: "linear",
                                                },
                                            ),
                                        );
                                    }
                                }}
                            >
                                <Diamond
                                    size={10}
                                    fill={trackHasKf ? "currentColor" : "none"}
                                />
                            </button>
                        </div>
                    </div>
                {/if}
            {:else if activeTab === "keyframe"}
                <!-- Keyframe Tab Content -->
                <div class="keyframe-header">
                    <History size={16} />
                    <span>Timeline & Effects</span>
                </div>

                <div class="preset-controls-row">
                    <select
                        class="preset-select"
                        bind:value={selectedPresetId}
                        onchange={(e) => {
                            const pid = (e.target as HTMLSelectElement).value;
                            if (pid && selectedData) {
                                const preset = presetStore.presets.find(
                                    (p) => p.id === pid,
                                );
                                if (preset) {
                                    commandManager.execute(
                                        new ApplyAnimationPresetCommand(
                                            selectedData.trackId,
                                            selectedData.cue.id,
                                            preset,
                                        ),
                                    );
                                }
                            }
                        }}
                    >
                        <option value="">Apply Preset...</option>
                        {#each presetStore.presets as p}
                            <option value={p.id}>{p.name}</option>
                        {/each}
                    </select>
                    <button
                        class="preset-icon-btn"
                        onclick={saveAnimationPreset}
                        title="Save as Preset"
                    >
                        <Save size={16} />
                    </button>
                    <button
                        class="preset-icon-btn"
                        onclick={deleteAnimationPreset}
                        disabled={!selectedPresetId}
                        title="Delete Preset"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>

                <div class="effect-tracks-list">
                    <p class="section-label">Active Effects</p>

                    {#if selectedData.cue.effects && selectedData.cue.effects.length > 0}
                        {#each selectedData.cue.effects as effect}
                            {@const plugin = effectRegistry.get(effect.type)}
                            {@const kfCount = selectedData.cue.animTracks
                                .filter((a) =>
                                    a.paramPath.startsWith(
                                        `effects.${effect.id}`,
                                    ),
                                )
                                .reduce(
                                    (acc, a) => acc + a.keyframes.length,
                                    0,
                                )}
                            <div
                                class="effect-track-item"
                                onclick={() => {
                                    editingEffectId = effect.id;
                                    if (COLOR_EFFECTS.includes(effect.type)) {
                                        activeTab = "color-effect";
                                    } else {
                                        activeTab = "effect";
                                    }
                                }}
                            >
                                <div class="track-icon">
                                    <Diamond size={14} />
                                </div>
                                <div class="track-info">
                                    <span class="track-name"
                                        >{plugin?.label || effect.type}</span
                                    >
                                    <span class="track-meta">
                                        {kfCount} keyframes
                                    </span>
                                </div>
                                <button class="track-edit-btn">
                                    <Settings size={14} />
                                </button>
                            </div>
                        {/each}
                    {:else}
                        <div class="empty-tracks">
                            No effects applied. Go to Effects tab to add one.
                        </div>
                    {/if}
                </div>
            {:else if activeTab === "effect" && selectedData}
                <!-- Effect Tab Content -->
                <div class="effect-tab-header">
                    <span>Active Effects</span>
                    <select
                        class="add-effect-select"
                        onchange={(e) => {
                            const type = (e.target as HTMLSelectElement).value;
                            if (type && selectedData) {
                                commandManager.execute(
                                    new AddEffectCommand(
                                        selectedData!.trackId,
                                        type,
                                        {},
                                        selectedData!.cue.id,
                                    ),
                                );
                                (e.target as HTMLSelectElement).value = "";
                            }
                        }}
                    >
                        <option value="">+ Add Effect...</option>
                        {#each effectRegistry
                            .getAll()
                            .filter((p) => !COLOR_EFFECTS.includes(p.type)) as plugin}
                            <option value={plugin.type}>{plugin.label}</option>
                        {/each}
                    </select>
                </div>

                <div
                    class="effects-list"
                    use:dndzone={{
                        items: currentActiveEffects,
                        flipDurationMs: 200,
                        dropTargetStyle: {},
                    }}
                    onconsider={handleActiveConsider}
                    onfinalize={handleActiveFinalize}
                >
                    {#each currentActiveEffects as effect (effect.id)}
                        {@const plugin = effectRegistry.get(effect.type)}
                        <div
                            class="effect-item-card"
                            role="listitem"
                            animate:flip={{ duration: 200 }}
                        >
                            <div class="effect-item-header">
                                <span class="effect-label"
                                    >{plugin?.label || effect.type}</span
                                >
                                <button
                                    class="mini-btn delete-effect"
                                    onclick={() => {
                                        if (selectedData) {
                                            commandManager.execute(
                                                new RemoveEffectCommand(
                                                    selectedData!.trackId,
                                                    effect.id,
                                                    selectedData!.cue.id,
                                                ),
                                            );
                                        }
                                    }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            <div class="effect-params">
                                {#if plugin}
                                    {#each plugin.parameters as p}
                                        <div class="param-row">
                                            <label for="eff-{effect.id}-{p.id}"
                                                >{p.label}</label
                                            >
                                            <div class="param-input-wrap">
                                                {#if p.type === "number"}
                                                    {@const path = `effects.${effect.id}.${p.id}`}
                                                    <input
                                                        id="eff-{effect.id}-{p.id}"
                                                        type="range"
                                                        min={p.min ?? 0}
                                                        max={p.max ?? 100}
                                                        step={p.step ?? 1}
                                                        value={effect.params[
                                                            p.id
                                                        ] ?? p.default}
                                                        onchange={(e) => {
                                                            const val =
                                                                parseFloat(
                                                                    (
                                                                        e.target as HTMLInputElement
                                                                    ).value,
                                                                );
                                                            commandManager.execute(
                                                                new UpdateEffectParamCommand(
                                                                    selectedData!.trackId,
                                                                    effect.id,
                                                                    {
                                                                        [p.id]: effect
                                                                            .params[
                                                                            p.id
                                                                        ],
                                                                    },
                                                                    {
                                                                        [p.id]: val,
                                                                    },
                                                                    selectedData!.cue.id,
                                                                ),
                                                            );
                                                        }}
                                                    />
                                                    <span class="param-val"
                                                        >{effect.params[p.id] ??
                                                            p.default}</span
                                                    >

                                                    <button
                                                        class="kf-btn"
                                                        class:active={projectStore.hasAnimation(
                                                            selectedData!
                                                                .trackId,
                                                            path,
                                                            selectedData!.cue
                                                                .id,
                                                        )}
                                                        onclick={() =>
                                                            projectStore.toggleKeyframeTrack(
                                                                selectedData!
                                                                    .trackId,
                                                                path,
                                                                selectedData!
                                                                    .cue.id,
                                                            )}
                                                        title="Animate this"
                                                    >
                                                        <Diamond
                                                            size={12}
                                                            fill={projectStore.hasAnimation(
                                                                selectedData!
                                                                    .trackId,
                                                                path,
                                                                selectedData!
                                                                    .cue.id,
                                                            )
                                                                ? "currentColor"
                                                                : "none"}
                                                        />
                                                    </button>

                                                    <button
                                                        class="kf-add-btn"
                                                        onclick={() => {
                                                            const currentVal =
                                                                effect.params[
                                                                    p.id
                                                                ] ?? p.default;
                                                            commandManager.execute(
                                                                new AddKeyframeCommand(
                                                                    selectedData!.trackId,
                                                                    path,
                                                                    {
                                                                        id: crypto.randomUUID(),
                                                                        tMs: projectStore.currentTime,
                                                                        value: currentVal,
                                                                        interp: "linear",
                                                                    },
                                                                    selectedData!.cue.id,
                                                                ),
                                                            );
                                                        }}
                                                        title="Add Keyframe at current playhead"
                                                    >
                                                        <Plus size={12} />
                                                    </button>
                                                {:else if p.type === "color"}
                                                    <input
                                                        type="color"
                                                        value={effect.params[
                                                            p.id
                                                        ] ?? p.default}
                                                        onchange={(e) => {
                                                            const val = (
                                                                e.target as HTMLInputElement
                                                            ).value;
                                                            commandManager.execute(
                                                                new UpdateEffectParamCommand(
                                                                    selectedData!.trackId,
                                                                    effect.id,
                                                                    {
                                                                        [p.id]: effect
                                                                            .params[
                                                                            p.id
                                                                        ],
                                                                    },
                                                                    {
                                                                        [p.id]: val,
                                                                    },
                                                                    selectedData!.cue.id,
                                                                ),
                                                            );
                                                        }}
                                                    />
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}

                                    {#if effect.type.endsWith("-in") || effect.type.endsWith("-out")}
                                        {@const isIn =
                                            effect.type.endsWith("-in")}
                                        <div class="fade-shortcuts">
                                            <button
                                                class="shortcut-btn"
                                                onclick={() => {
                                                    const type = effect.type;

                                                    // Map params to their in/out values
                                                    const config: Record<
                                                        string,
                                                        {
                                                            hidden: number;
                                                            visible: number;
                                                        }
                                                    > = {
                                                        fade: {
                                                            hidden: 0,
                                                            visible: 1,
                                                        },
                                                        slide: {
                                                            hidden: 100,
                                                            visible: 0,
                                                        },
                                                        zoom: {
                                                            hidden: 0,
                                                            visible: 1,
                                                        },
                                                        blur: {
                                                            hidden: 20,
                                                            visible: 0,
                                                        },
                                                    };

                                                    const prefix =
                                                        type.split("-")[0];
                                                    const cfg = config[
                                                        prefix
                                                    ] || {
                                                        hidden: 0,
                                                        visible: 1,
                                                    };
                                                    const paramName =
                                                        prefix === "fade"
                                                            ? "alpha"
                                                            : prefix === "slide"
                                                              ? "y"
                                                              : prefix ===
                                                                  "zoom"
                                                                ? "scale"
                                                                : prefix ===
                                                                    "blur"
                                                                  ? "radius"
                                                                  : "alpha";

                                                    const path = `effects.${effect.id}.${paramName}`;

                                                    if (isIn) {
                                                        // Set In End Point
                                                        commandManager.execute(
                                                            new AddKeyframeCommand(
                                                                selectedData!.trackId,
                                                                path,
                                                                {
                                                                    id: crypto.randomUUID(),
                                                                    tMs: selectedData!
                                                                        .cue
                                                                        .startMs,
                                                                    value: cfg.hidden,
                                                                    interp: "linear",
                                                                },
                                                                selectedData!.cue.id,
                                                            ),
                                                        );
                                                        commandManager.execute(
                                                            new AddKeyframeCommand(
                                                                selectedData!.trackId,
                                                                path,
                                                                {
                                                                    id: crypto.randomUUID(),
                                                                    tMs: projectStore.currentTime,
                                                                    value: cfg.visible,
                                                                    interp: "linear",
                                                                },
                                                                selectedData!.cue.id,
                                                            ),
                                                        );
                                                    } else {
                                                        // Set Out Start Point
                                                        commandManager.execute(
                                                            new AddKeyframeCommand(
                                                                selectedData!.trackId,
                                                                path,
                                                                {
                                                                    id: crypto.randomUUID(),
                                                                    tMs: projectStore.currentTime,
                                                                    value: cfg.visible,
                                                                    interp: "linear",
                                                                },
                                                                selectedData!.cue.id,
                                                            ),
                                                        );
                                                        commandManager.execute(
                                                            new AddKeyframeCommand(
                                                                selectedData!.trackId,
                                                                path,
                                                                {
                                                                    id: crypto.randomUUID(),
                                                                    tMs: selectedData!
                                                                        .cue
                                                                        .endMs,
                                                                    value: cfg.hidden,
                                                                    interp: "linear",
                                                                },
                                                                selectedData!.cue.id,
                                                            ),
                                                        );
                                                    }
                                                }}
                                            >
                                                {isIn
                                                    ? `Set ${plugin?.label || "In"} End (Point)`
                                                    : `Set ${plugin?.label || "Out"} Start (Point)`}
                                            </button>
                                        </div>
                                    {/if}
                                {/if}
                            </div>
                        </div>
                    {/each}

                    {#if !selectedData.cue.effects || selectedData!.cue.effects.length === 0}
                        <div class="placeholder-box">
                            No effects added to this cue.
                        </div>
                    {/if}
                </div>
            {:else if activeTab === "color-effect" && selectedData}
                <!-- Color Effect Tab Content -->
                <div class="effect-tab-header">
                    <span>Color Effects</span>
                    <select
                        class="add-effect-select"
                        onchange={(e) => {
                            const type = (e.target as HTMLSelectElement).value;
                            if (type && selectedData) {
                                commandManager.execute(
                                    new AddEffectCommand(
                                        selectedData!.trackId,
                                        type,
                                        {},
                                        selectedData!.cue.id,
                                    ),
                                );
                                (e.target as HTMLSelectElement).value = "";
                            }
                        }}
                    >
                        <option value="">+ Add Color Effect...</option>
                        {#each effectRegistry
                            .getAll()
                            .filter( (p) => COLOR_EFFECTS.includes(p.type), ) as plugin}
                            <option value={plugin.type}>{plugin.label}</option>
                        {/each}
                    </select>
                </div>

                <div
                    class="effects-list"
                    use:dndzone={{
                        items: currentColorEffects,
                        flipDurationMs: 200,
                        dropTargetStyle: {},
                    }}
                    onconsider={handleColorConsider}
                    onfinalize={handleColorFinalize}
                >
                    {#each currentColorEffects as effect (effect.id)}
                        {@const plugin = effectRegistry.get(effect.type)}
                        <div
                            class="effect-item-card"
                            role="listitem"
                            animate:flip={{ duration: 200 }}
                        >
                            <div class="effect-item-header">
                                <span class="effect-label"
                                    >{plugin?.label || effect.type}</span
                                >
                                <div class="effect-actions">
                                    <button
                                        class="mini-btn-icon"
                                        onclick={() => {
                                            if (effect.id) {
                                                editingEffectId = effect.id;
                                                activeTab = "color-effect";
                                            }
                                        }}
                                        title="Detailed Color Editor"
                                    >
                                        <Settings size={14} />
                                    </button>
                                    <button
                                        class="mini-btn-icon delete"
                                        onclick={() => {
                                            if (selectedData) {
                                                commandManager.execute(
                                                    new RemoveEffectCommand(
                                                        selectedData!.trackId,
                                                        effect.id,
                                                        selectedData!.cue.id,
                                                    ),
                                                );
                                            }
                                        }}
                                        title="Remove Effect"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            <div class="effect-params">
                                {#each (plugin?.parameters || []).filter((p) => !COLOR_EFFECTS.includes(effect.type) || p.id === "intensity") as param}
                                    {@const path = `effects.${effect.id}.${param.id}`}
                                    {@const track =
                                        selectedData.cue.animTracks.find(
                                            (t) => t.paramPath === path,
                                        )}
                                    <div class="param-row">
                                        <div class="param-label-group">
                                            <label
                                                for="color-eff-{effect.id}-{param.id}"
                                                >{param.label}</label
                                            >
                                        </div>
                                        <div class="param-input-group">
                                            {#if param.type === "number"}
                                                <input
                                                    id="color-eff-{effect.id}-{param.id}"
                                                    type="range"
                                                    min={param.min}
                                                    max={param.max}
                                                    step={param.step || 1}
                                                    value={effect.params[
                                                        param.id
                                                    ] ?? param.default}
                                                    oninput={(e) => {
                                                        const val = parseFloat(
                                                            (
                                                                e.target as HTMLInputElement
                                                            ).value,
                                                        );
                                                        const oldParams = {
                                                            ...effect.params,
                                                        };
                                                        const newParams = {
                                                            ...oldParams,
                                                            [param.id]: val,
                                                        };
                                                        commandManager.execute(
                                                            new UpdateEffectParamCommand(
                                                                selectedData!.trackId,
                                                                effect.id,
                                                                oldParams,
                                                                newParams,
                                                                selectedData!.cue.id,
                                                            ),
                                                        );
                                                    }}
                                                />
                                                <span class="num-val"
                                                    >{effect.params[param.id] ??
                                                        param.default}</span
                                                >
                                                <button
                                                    class="mini-btn-icon kf-toggle"
                                                    class:active={track &&
                                                        track.keyframes.length >
                                                            0}
                                                    onclick={() =>
                                                        projectStore.toggleKeyframeTrack(
                                                            selectedData!
                                                                .trackId,
                                                            path,
                                                            selectedData!.cue
                                                                .id,
                                                        )}
                                                    title="Toggle Keyframe Track"
                                                >
                                                    <Diamond
                                                        size={12}
                                                        fill={track &&
                                                        track.keyframes.length >
                                                            0
                                                            ? "currentColor"
                                                            : "none"}
                                                    />
                                                </button>
                                                <button
                                                    class="mini-btn-icon kf-add-btn"
                                                    onclick={() => {
                                                        const currentVal =
                                                            effect.params[
                                                                param.id
                                                            ] ?? param.default;
                                                        commandManager.execute(
                                                            new AddKeyframeCommand(
                                                                selectedData!.trackId,
                                                                path,
                                                                {
                                                                    id: crypto.randomUUID(),
                                                                    tMs: projectStore.currentTime,
                                                                    value: currentVal,
                                                                    interp: "linear",
                                                                },
                                                                selectedData!.cue.id,
                                                            ),
                                                        );
                                                    }}
                                                    title="Add Keyframe at Current Time"
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            {:else if param.type === "color"}
                                                <input
                                                    id="color-eff-{effect.id}-{param.id}"
                                                    type="color"
                                                    value={effect.params[
                                                        param.id
                                                    ] ?? param.default}
                                                    oninput={(e) => {
                                                        const val = (
                                                            e.target as HTMLInputElement
                                                        ).value;
                                                        const oldParams = {
                                                            ...effect.params,
                                                        };
                                                        const newParams = {
                                                            ...oldParams,
                                                            [param.id]: val,
                                                        };
                                                        commandManager.execute(
                                                            new UpdateEffectParamCommand(
                                                                selectedData!.trackId,
                                                                effect.id,
                                                                oldParams,
                                                                newParams,
                                                                selectedData!.cue.id,
                                                            ),
                                                        );
                                                    }}
                                                />
                                            {/if}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/each}

                    {#if !selectedData.cue.effects || !selectedData.cue.effects.some( (e) => COLOR_EFFECTS.includes(e.type), )}
                        <div class="placeholder-box">
                            No color effects added to this cue.
                        </div>
                    {/if}
                </div>
            {:else if activeTab === "style" && isStyleDocked}
                <div class="style-dock-content">
                    <div class="dock-header">
                        <h3>
                            Advanced Styling ({popupType === "track"
                                ? "Track"
                                : "Individual"})
                        </h3>
                    </div>
                    <div class="style-controls-container">
                        <section class="style-section-content">
                            <!-- Style content will be rendered here via snippet or duplicated logic -->
                            {@render styleContent()}
                        </section>
                    </div>
                </div>
            {/if}
        </div>
    {:else}
        <div class="empty">Select a cue to edit properties.</div>
    {/if}
    {#if showStylePopup && selectedData}
        <div
            class="style-popup-container"
            style="left: {popupPos.x}px; top: {popupPos.y}px;"
            class:dragging={isDraggingPopup}
            class:over-dock={isOverDockZone}
        >
            <div class="style-popup">
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="popup-header" onmousedown={handlePopupMouseDown}>
                    <h3>
                        Advanced Styling ({popupType === "track"
                            ? "Track"
                            : "Individual"})
                    </h3>
                    <button class="close-btn" onclick={closeStylePopup}>
                        <X size={16} />
                    </button>
                </div>

                <div class="popup-scroll">
                    {@render styleContent()}
                </div>

                <div class="popup-footer">
                    <button class="ok-btn" onclick={closeStylePopup}
                        >Done</button
                    >
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .inspector {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bg-panel);
        border-left: 1px solid var(--border-dark);
        color: var(--text-main);
    }
    .tabs {
        display: flex;
        background: var(--bg-header);
        border-bottom: 1px solid var(--border-dark);
    }
    .tab-btn {
        flex: 1;
        padding: 0.5rem;
        background: none;
        border: none;
        color: var(--text-dim);
        cursor: pointer;
        font-size: 0.85rem;
        border-bottom: 2px solid transparent;
    }
    .tab-btn.active {
        color: var(--accent);
        border-bottom-color: var(--accent);
        background: rgba(255, 255, 255, 0.05);
    }
    .content {
        padding: 1rem;
        flex: 1;
        overflow-y: auto;
    }
    .empty {
        padding: 2rem;
        text-align: center;
        color: var(--text-muted);
        font-style: italic;
    }
    .row {
        margin-bottom: 1.2rem;
    }
    label,
    .label-text {
        display: block;
        margin-bottom: 0.25rem;
        font-size: 0.8rem;
        color: var(--text-dim);
    }
    textarea,
    input {
        width: 100%;
        background: var(--bg-input);
        border: 1px solid var(--border-light);
        color: var(--text-main);
        padding: 0.5rem;
        border-radius: 4px;
        box-sizing: border-box;
    }
    textarea {
        height: 60px;
        resize: vertical;
    }
    .time-row {
        display: flex;
        gap: 0.5rem;
    }
    .time-input {
        flex: 1;
    }
    .field-with-kf {
        display: flex;
        align-items: flex-end;
        gap: 0.25rem;
    }
    .kf-btn {
        margin-bottom: 3px;
        color: var(--text-dim);
    }
    .kf-btn.active {
        color: var(--accent);
    }
    .input-grid-mini {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem 0.5rem;
    }
    .toolbar-mini {
        display: flex;
        gap: 0.25rem;
        margin-bottom: 0.25rem;
    }
    .toolbar-mini > button,
    .toolbar-mini > .font-dropdown-container > button {
        background: var(--bg-header);
        border: 1px solid var(--border-light);
        color: #ccc;
        width: 24px;
        height: 24px;
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
    }
    .toolbar-mini > button:hover,
    .toolbar-mini > .font-dropdown-container > button:hover {
        background: var(--border-light);
        color: #fff;
    }
    .selection-info {
        font-size: 0.7rem;
        color: var(--text-muted);
        text-align: right;
        margin-top: 0.1rem;
    }
    .tools-row {
        display: flex;
        gap: 0.5rem;
    }
    .tool-btn {
        flex: 1;
        background: var(--bg-header);
        border: 1px solid var(--border-light);
        color: #ddd;
        padding: 6px;
        font-size: 0.75rem;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
    }
    .tool-btn:hover {
        background: var(--border-light);
    }
    .small-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
    }
    .placeholder-box {
        padding: 1rem;
        background: var(--bg-input);
        border: 1px dashed var(--border-light);
        color: var(--text-muted);
        text-align: center;
        border-radius: 4px;
        font-size: 0.8rem;
    }

    /* Modal overlay removed for non-modal behavior */

    /* Tab enhancements */
    .style-tab {
        position: relative;
        padding-right: 28px;
        display: flex;
        align-items: center;
        padding-left: 0;
    }
    .tab-inner-btn {
        background: none;
        border: none;
        color: inherit;
        font: inherit;
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        flex: 1;
        text-align: left;
    }
    .tab-close-btn {
        position: absolute;
        right: 4px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: var(--text-dim);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 4px;
    }
    .tab-close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-main);
    }

    /* Keyframe Tab Styles */
    .keyframe-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
        font-weight: 500;
        margin-bottom: 1rem;
        color: var(--accent);
    }
    .cue-preview-box {
        background: rgba(255, 255, 255, 0.05);
        padding: 0.75rem;
        border-radius: 4px;
        margin-bottom: 1rem;
    }
    .preview-text {
        font-size: 0.85rem;
        color: #fff;
        font-style: italic;
    }
    .anim-track-row {
        background: var(--bg-header);
        border: 1px solid var(--border-light);
        border-radius: 4px;
        margin-bottom: 0.5rem;
        padding: 0.5rem;
    }
    .track-info {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.5rem;
    }
    .param-name {
        font-size: 0.75rem;
        text-transform: capitalize;
        color: #bbb;
    }
    .kf-count {
        font-size: 0.7rem;
        color: var(--text-muted);
    }
    .kf-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .mini-btn {
        background: none;
        border: none;
        color: var(--text-dim);
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
    }
    .mini-btn:hover {
        color: #fff;
    }
    .kf-mini-timeline {
        flex: 1;
        height: 4px;
        background: #333;
        border-radius: 2px;
        position: relative;
    }
    .kf-tick {
        position: absolute;
        top: -6px;
        width: 12px;
        height: 12px;
        background: var(--text-dim);
        border-radius: 50%;
        transform: translateX(-50%);
        cursor: ew-resize;
        z-index: 10;
        border: 2px solid var(--bg-panel);
    }
    .kf-tick.current {
        background: var(--accent);
        box-shadow: 0 0 4px var(--accent);
    }

    /* New Keyframe Edit List Styles */
    .preset-controls-row {
        display: flex;
        gap: 0.25rem;
        margin-bottom: 1rem;
        align-items: center;
    }
    .preset-select {
        flex: 1;
        background: var(--bg-input);
        border: 1px solid var(--border-light);
        color: var(--text-main);
        font-size: 0.8rem;
        padding: 4px;
        border-radius: 4px;
        height: 28px;
    }
    .preset-icon-btn {
        width: 28px;
        height: 28px;
        padding: 0;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: 1px solid var(--border-light);
        color: var(--text-dim);
        border-radius: 4px;
        cursor: pointer;
    }
    .preset-icon-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.05);
    }
    .preset-icon-btn.p-accent {
        color: var(--accent);
        border-color: var(--accent);
    }
    .preset-icon-btn.p-accent:hover:not(:disabled) {
        background: rgba(74, 144, 226, 0.1);
    }
    .preset-icon-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    /* New Keyframe Edit List Styles */
    .kf-edit-list {
        margin-top: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .kf-edit-row {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        background: rgba(0, 0, 0, 0.2);
        padding: 0.2rem 0.4rem;
        border-radius: 4px;
        border: 1px solid transparent;
    }
    .kf-edit-row.current {
        border-color: var(--accent);
        background: rgba(74, 144, 226, 0.1);
    }
    .kf-jump-indicator {
        background: none;
        border: none;
        color: var(--text-dim);
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
    }
    .kf-edit-row.current .kf-jump-indicator {
        color: var(--accent);
    }
    .kf-field {
        display: flex;
        align-items: center;
        background: var(--bg-input);
        border: 1px solid var(--border-light);
        border-radius: 3px;
        padding: 0 0.25rem;
        flex: 1; /* Allow fields to grow */
        min-width: 0;
    }
    .kf-field input {
        border: none;
        background: none;
        padding: 2px 4px;
        font-size: 0.75rem;
        width: 100%; /* Take up field space */
        text-align: right;
    }
    .kf-field.v-field {
        flex: 1.2; /* Values might be longer */
    }
    .unit {
        font-size: 0.65rem;
        color: var(--text-dim);
        margin-left: 2px;
        white-space: nowrap;
    }
    .kf-interp-select {
        background: var(--bg-input);
        border: 1px solid var(--border-light);
        color: var(--text-main);
        font-size: 0.75rem;
        padding: 1px 2px;
        border-radius: 3px;
        flex: 1.5; /* Give interpolation select a bit more space */
        min-width: 0;
    }
    .delete-kf {
        opacity: 0.5;
    }
    .delete-kf:hover {
        opacity: 1;
        color: #f55 !important;
    }

    .keyframes-scroll-area {
        max-height: 400px;
        overflow-y: auto;
        padding-right: 4px;
    }

    /* Advanced Styles Popup */
    .color-row {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .style-popup {
        background: var(--bg-panel);
        border: 1px solid var(--border-dark);
        border-radius: 8px;
        width: 340px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }
    .style-popup-container {
        position: fixed;
        z-index: 1000;
        pointer-events: auto;
    }
    .style-popup-container.dragging {
        opacity: 0.8;
        cursor: grabbing;
    }
    .style-popup-container.over-dock .style-popup {
        outline: 2px dashed var(--accent);
        background: rgba(74, 144, 226, 0.2);
    }

    .popup-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 1rem;
        cursor: grab;
        border-bottom: 1px solid var(--border-dark);
        background: var(--bg-header);
        user-select: none;
    }
    .popup-header:active {
        cursor: grabbing;
    }
    .style-popup h3 {
        margin: 0;
        font-size: 0.9rem;
        color: var(--accent);
    }
    .close-btn {
        background: none;
        border: none;
        color: var(--text-dim);
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
    }
    .close-btn:hover {
        color: #fff;
    }
    .popup-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
    }
    .popup-scroll section {
        margin-bottom: 1.5rem;
    }
    .popup-scroll h4 {
        margin: 0 0 0.75rem 0;
        font-size: 0.85rem;
        color: var(--text-main);
        opacity: 0.9;
    }
    .popup-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
    }
    .popup-row label {
        width: 70px;
        margin: 0;
        font-size: 0.8rem;
        color: var(--text-dim);
    }
    .popup-row input[type="color"] {
        flex: 1;
        height: 30px;
        padding: 2px;
        background: var(--bg-input);
        border: 1px solid var(--border-light);
    }
    .popup-row input[type="range"] {
        flex: 1;
    }
    .popup-row input[type="checkbox"] {
        width: auto;
    }
    .popup-footer {
        padding: 1rem;
        border-top: 1px solid var(--border-dark);
        display: flex;
        justify-content: flex-end;
    }
    .ok-btn {
        background: var(--accent);
        color: #fff;
        border: none;
        padding: 0.5rem 1.5rem;
        border-radius: 4px;
        font-weight: 500;
        cursor: pointer;
    }
    .ok-btn:hover {
        opacity: 0.9;
    }

    /* Docked Content Styles */
    .style-dock-content {
        display: flex;
        flex-direction: column;
        height: 100%;
    }
    .dock-header {
        margin-bottom: 1rem;
    }
    .dock-header h3 {
        margin: 0;
        font-size: 1rem;
        color: var(--accent);
    }
    .style-section-content {
        padding-bottom: 2rem;
    }

    /* Effect Tab Styles */
    .effect-tab-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        font-size: 0.9rem;
        color: var(--accent);
    }
    .add-effect-select {
        background: var(--bg-input);
        color: var(--text-main);
        border: 1px solid var(--border-light);
        border-radius: 4px;
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
        cursor: pointer;
    }
    .effects-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    .effect-item-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--border-light);
        border-radius: 6px;
        padding: 0.75rem;
    }
    .effect-item-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .effect-label {
        font-size: 0.85rem;
        font-weight: 500;
        color: #fff;
    }

    .param-label-group {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.25rem;
    }

    .param-label-group label {
        font-size: 0.8rem;
        color: #a6adc8;
    }

    .mini-btn-icon.kf-toggle {
        opacity: 0.5;
        transition: all 0.2s;
        border: none;
        background: transparent;
        color: #a6adc8;
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
    }

    .mini-btn-icon.kf-toggle:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }

    .mini-btn-icon.kf-toggle.active {
        opacity: 1;
        color: var(--accent, #89b4fa);
    }

    .num-val {
        font-size: 0.75rem;
        color: #a6adc8;
        min-width: 25px;
        text-align: right;
    }

    .param-input-group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
    }

    .param-input-group input[type="range"] {
        flex: 1;
    }
    .delete-effect {
        opacity: 0.5;
    }
    .delete-effect:hover {
        opacity: 1;
        color: #f55 !important;
    }
    .effect-params {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .param-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .param-row label {
        width: 80px;
        margin: 0;
        font-size: 0.75rem;
        color: var(--text-dim);
    }
    .param-input-wrap {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .param-val {
        font-size: 0.7rem;
        color: var(--text-muted);
        min-width: 30px;
        text-align: right;
    }
    .param-input-wrap input[type="range"] {
        flex: 1;
    }
    .param-input-wrap input[type="color"] {
        width: 100%;
        height: 24px;
        border: none;
        padding: 0;
        background: none;
    }

    /* Keyframe Buttons in Effects */
    .kf-btn,
    .kf-add-btn {
        background: transparent;
        border: none;
        color: var(--text-muted);
        padding: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        border-radius: 4px;
    }
    .kf-btn:hover,
    .kf-add-btn:hover {
        background: var(--bg-hover);
        color: var(--text-main);
    }
    .kf-btn.active {
        color: var(--accent);
    }
    .kf-add-btn:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
    }

    /* Fade Shortcuts */
    .fade-shortcuts {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    .shortcut-btn {
        flex: 1;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border-light);
        color: var(--text-dim);
        font-size: 0.7rem;
        padding: 0.3rem;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .shortcut-btn:hover {
        background: var(--accent);
        color: #fff;
        border-color: var(--accent);
    }

    /* Edge Effect Tabs */
    .edge-tabs-container {
        display: flex;
        background: var(--bg-header);
        border: 1px solid var(--border-light);
        border-radius: 4px;
        margin-bottom: 0.75rem;
        overflow: hidden;
    }

    .edge-tab-item {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        padding: 0.5rem 0.25rem;
        cursor: pointer;
        font-size: 0.8rem;
        color: var(--text-dim);
        border-right: 1px solid var(--border-light);
        background: rgba(255, 255, 255, 0.02);
        transition: all 0.2s;
    }

    .edge-tab-item:last-child {
        border-right: none;
    }

    .edge-tab-item:hover {
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-main);
    }

    .edge-tab-item.active {
        background: var(--accent);
        color: #fff;
        border-color: var(--accent);
    }

    /* Ensure checkbox stands out on active/dark bg */
    .edge-tab-item input[type="checkbox"] {
        cursor: pointer;
        margin: 0;
        accent-color: #fff; /* White check when active */
    }

    /* Inactive state checkbox accent */
    /* Effect Tracks List */
    .effect-tracks-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .section-label {
        font-size: 0.75rem;
        color: var(--text-dim);
        text-transform: uppercase;
        margin-bottom: 0.5rem;
    }
    .effect-track-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        background: var(--bg-header);
        border: 1px solid var(--border-light);
        padding: 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .effect-track-item:hover {
        background: var(--bg-hover);
        border-color: var(--accent);
    }
    .track-icon {
        color: var(--accent);
        display: flex;
        align-items: center;
    }
    .track-info {
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    .track-name {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--text-main);
    }
    .track-meta {
        font-size: 0.7rem;
        color: var(--text-muted);
    }
    .track-edit-btn {
        background: none;
        border: none;
        color: var(--text-dim);
        cursor: pointer;
        padding: 4px;
    }
    .track-edit-btn:hover {
        color: #fff;
    }
    .empty-tracks {
        font-size: 0.8rem;
        color: var(--text-muted);
        text-align: center;
        padding: 1rem;
        border: 1px dashed var(--border-light);
        border-radius: 4px;
    }

    /* Preset Controls */
    .preset-controls-row {
        display: flex;
        gap: 0.5rem;
        padding: 0 0.5rem;
        margin-bottom: 1rem;
        align-items: center;
    }
    .preset-select {
        flex: 1;
        background: var(--bg-input);
        border: 1px solid var(--border-light);
        color: var(--text-main);
        padding: 0.35rem;
        border-radius: 4px;
        font-size: 0.8rem;
    }
    .preset-icon-btn {
        background: var(--bg-header);
        border: 1px solid var(--border-light);
        color: var(--text-dim);
        padding: 0.35rem;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }
    .preset-icon-btn:hover:not(:disabled) {
        background: var(--bg-hover);
        color: var(--accent);
        border-color: var(--accent);
    }
    .preset-icon-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Font Dropdown */
    .font-dropdown-container {
        position: relative;
        display: inline-block;
        width: 24px;
        height: 24px;
    }
    .font-btn {
        background: var(--bg-header);
        border: 1px solid var(--border-light);
        color: #ccc;
        width: 24px;
        height: 24px;
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
    }
    .font-btn:hover {
        background: var(--border-light);
        color: #fff;
    }
    .font-menu {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 5px;
        background: var(--bg-header);
        border: 1px solid var(--border-light);
        border-radius: 4px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        z-index: 1000;
        width: fit-content;
        min-width: 160px;
        max-height: 400px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        padding: 4px;
        box-sizing: border-box;
    }
    .font-menu-item {
        all: unset;
        display: block;
        width: 100%;
        height: auto;
        padding: 8px 12px;
        color: var(--text-main);
        cursor: pointer;
        border-radius: 4px;
        font-size: 0.9rem;
        transition: background 0.2s;
        white-space: nowrap;
        box-sizing: border-box;
        text-align: right;
        background: transparent !important;
        border: none !important;
    }
    .font-menu-item::before,
    .font-menu-item::after {
        content: none !important;
        display: none !important;
    }
    .font-menu-item:hover {
        background: var(--bg-hover);
        color: var(--accent);
    }
</style>
