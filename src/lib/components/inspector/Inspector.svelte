<script lang="ts">
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
    } from "$lib/engine/command.svelte";
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
    } from "lucide-svelte";

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

    let activeTab = $state("inspector"); // inspector | keyframe | effect
    let activeEdgeTab = $state<"outline" | "shadow" | "glow" | "bevel">(
        "outline",
    );
    let originalText = "";
    let selectionStart = $state(0);
    let selectionEnd = $state(0);

    function handleTextFocus() {
        if (selectedData) originalText = selectedData.cue.plainText;
    }

    function handleTextBlur() {
        if (selectedData && originalText !== selectedData.cue.plainText) {
            commandManager.execute(
                new TextChangeCommand(
                    selectedData.trackId,
                    selectedData.cue.id,
                    originalText,
                    selectedData.cue.plainText,
                ),
            );
        }
    }

    function addSpan(style: Partial<StyleProps>) {
        if (!selectedData) return;
        const start = Math.min(selectionStart, selectionEnd);
        const end = Math.max(selectionStart, selectionEnd);

        commandManager.execute(
            new AddSpanCommand(
                selectedData.trackId,
                selectedData.cue.id,
                start,
                end,
                style,
            ),
        );
    }

    function splitCue() {
        if (!selectedData) return;
        commandManager.execute(
            new SplitCueCommand(
                selectedData.trackId,
                selectedData.cue.id,
                projectStore.currentTime,
            ),
        );
    }

    function mergeNext() {
        if (!selectedData) return;
        const track = projectStore.project?.tracks.find(
            (t) => t.id === selectedData.trackId,
        );
        if (!track) return;
        const idx = track.cues.findIndex((c) => c.id === selectedData.cue.id);
        if (idx === -1 || idx === track.cues.length - 1) return;
        const nextCue = track.cues[idx + 1];
        commandManager.execute(
            new MergeCuesCommand(
                selectedData.trackId,
                selectedData.cue.id,
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
    }

    function handleKeyframeTickMouseDown(e: MouseEvent, anim: any, kf: any) {
        e.stopPropagation();
        if (!selectedData) return;

        const startX = e.clientX;
        const initialTMs = kf.tMs;
        const cueStart = selectedData.cue.startMs;
        const cueEnd = selectedData.cue.endMs;
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
                        selectedData.trackId,
                        anim.paramPath,
                        initialTMs,
                        finalT,
                        selectedData.cue.id,
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
        if (style.edgeType && style.edgeType !== "none")
            return [style.edgeType];
        return [];
    }
</script>

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
                                        selectedData.trackId,
                                        selectedData.cue.id,
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
                    <label for="cue-text">Text</label>
                    <div class="toolbar-mini">
                        <button
                            onclick={() => addSpan({ fontWeight: "bold" })}
                            title="Bold"
                        >
                            <Bold size={14} />
                        </button>
                        <button
                            onclick={() => addSpan({ italic: true })}
                            title="Italic"
                        >
                            <Italic size={14} />
                        </button>
                        <button
                            onclick={() => addSpan({ underline: true })}
                            title="Underline"
                        >
                            <Underline size={14} />
                        </button>
                        <button
                            onclick={() => addSpan({ lineThrough: true })}
                            title="Strikeout"
                        >
                            <Strikethrough size={14} />
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
                                            selectedData.cue.plainText.length;
                                    }
                                    addSpan({
                                        color: (e.target as HTMLInputElement)
                                            .value,
                                    });
                                }}
                                style="width: 28px; height: 28px; padding: 1px; cursor: pointer; border: 1px solid var(--border-light); background: var(--bg-header); border-radius: 4px;"
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
                        bind:value={selectedData.cue.plainText}
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
                                value={selectedData.cue.startMs}
                                onchange={(e) => {
                                    const val = parseInt(
                                        (e.target as HTMLInputElement).value,
                                    );
                                    if (selectedData) {
                                        commandManager.execute(
                                            new TimeChangeCommand(
                                                selectedData.trackId,
                                                selectedData.cue.id,
                                                selectedData.cue.startMs,
                                                selectedData.cue.endMs,
                                                val,
                                                selectedData.cue.endMs,
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
                                value={selectedData.cue.endMs}
                                onchange={(e) => {
                                    const val = parseInt(
                                        (e.target as HTMLInputElement).value,
                                    );
                                    if (selectedData) {
                                        commandManager.execute(
                                            new TimeChangeCommand(
                                                selectedData.trackId,
                                                selectedData.cue.id,
                                                selectedData.cue.startMs,
                                                selectedData.cue.endMs,
                                                selectedData.cue.startMs,
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
                                selectedData.cue.animTracks.find(
                                    (a) => a.paramPath === paramPath,
                                )}
                            {@const currentVal = getCueValueAt(
                                selectedData.cue,
                                paramPath,
                                selectedData.cue.posOverride?.[
                                    p.key as keyof typeof selectedData.cue.posOverride
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
                                                ...(selectedData.cue
                                                    .posOverride || {}),
                                            };
                                            (pos as any)[p.key] = val;
                                            projectStore.updateCue(
                                                selectedData.trackId,
                                                selectedData.cue.id,
                                                { posOverride: pos },
                                            );

                                            if (animTrack) {
                                                if (hasKeyframe) {
                                                    commandManager.execute(
                                                        new UpdateKeyframeValueCommand(
                                                            selectedData.trackId,
                                                            paramPath,
                                                            projectStore.currentTime,
                                                            val,
                                                            selectedData.cue.id,
                                                        ),
                                                    );
                                                } else {
                                                    commandManager.execute(
                                                        new AddKeyframeCommand(
                                                            selectedData.trackId,
                                                            paramPath,
                                                            {
                                                                id: crypto.randomUUID(),
                                                                tMs: projectStore.currentTime,
                                                                value: val,
                                                                interp: "linear",
                                                            },
                                                            selectedData.cue.id,
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
                                                    selectedData.trackId,
                                                    paramPath,
                                                    projectStore.currentTime,
                                                    selectedData.cue.id,
                                                ),
                                            );
                                        } else {
                                            const val =
                                                selectedData.cue.posOverride?.[
                                                    p.key as keyof typeof selectedData.cue.posOverride
                                                ] ?? p.defaultVal;
                                            commandManager.execute(
                                                new AddKeyframeCommand(
                                                    selectedData.trackId,
                                                    paramPath,
                                                    {
                                                        id: crypto.randomUUID(),
                                                        tMs: projectStore.currentTime,
                                                        value: val,
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
                                        fill={hasKeyframe
                                            ? "currentColor"
                                            : "none"}
                                    />
                                </button>
                            </div>
                        {/each}
                    </div>
                </div>

                <div class="row">
                    <label for="track-color">Track Color</label>
                    <div class="color-row">
                        <div
                            class="color-input-wrapper"
                            title="Track Text Color (Base)"
                        >
                            <input
                                type="color"
                                value={selectedData.track.defaultStyle.color ||
                                    "#ffffff"}
                                onchange={(e) =>
                                    commandManager.execute(
                                        new UpdateTrackStyleCommand(
                                            selectedData.trackId,
                                            {
                                                color: (
                                                    e.target as HTMLInputElement
                                                ).value,
                                            },
                                        ),
                                    )}
                                style="width: 28px; height: 28px; padding: 1px; cursor: pointer; border: 1px solid var(--border-light); background: var(--bg-header); border-radius: 4px;"
                            />
                        </div>
                        <button
                            class="more-styles-btn"
                            onclick={() => openStylePopup("track")}
                            >Edit Style...</button
                        >
                    </div>
                </div>

                <div class="row">
                    <span class="label-text">Track Transform</span>
                    {#each [{ label: "X (%)", path: "transform.xNorm", step: 1, scale: 100, defaultVal: 0.5 }, { label: "Y (%)", path: "transform.yNorm", step: 1, scale: 100, defaultVal: 0.8 }, { label: "Scale", path: "transform.scale", step: 0.1, scale: 1, defaultVal: 1 }, { label: "Rotation", path: "transform.rotation", step: 1, scale: 1, defaultVal: 0 }] as p}
                        {@const track = projectStore.project.tracks.find(
                            (t) => t.id === selectedData?.trackId,
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
                                <label for="track-{p.path}">{p.label}</label>
                                <input
                                    id="track-{p.path}"
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
            {:else if activeTab === "keyframe"}
                <!-- Keyframe Tab Content -->
                <div class="keyframe-header">
                    <History size={16} />
                    <span>Animation Control</span>
                </div>

                <div class="cue-preview-box">
                    <span class="label-text">Current Subtitle</span>
                    <div class="preview-text">
                        "{selectedData.cue.plainText}"
                    </div>
                </div>

                <div class="keyframes-scroll-area">
                    {#each selectedData.cue.animTracks as anim}
                        <div class="anim-track-row">
                            <div class="track-info-header">
                                <div class="track-info">
                                    <span class="param-name"
                                        >{anim.paramPath
                                            .replace("posOverride.", "")
                                            .replace("edgeEffects.", "")
                                            .replace(".width", " Width")}</span
                                    >
                                    <span class="kf-count"
                                        >{anim.keyframes.length} keys</span
                                    >
                                </div>
                                <div class="kf-controls">
                                    <button
                                        class="mini-btn"
                                        onclick={() => jumpToPrevKeyframe(anim)}
                                        title="Previous Keyframe"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <div
                                        class="kf-mini-timeline"
                                        onclick={(e) => {
                                            const rect =
                                                e.currentTarget.getBoundingClientRect();
                                            const pct =
                                                (e.clientX - rect.left) /
                                                rect.width;
                                            const duration =
                                                selectedData.cue.endMs -
                                                selectedData.cue.startMs;
                                            projectStore.currentTime =
                                                selectedData.cue.startMs +
                                                pct * duration;
                                        }}
                                    >
                                        {#each anim.keyframes as kf}
                                            <div
                                                class="kf-tick"
                                                class:current={Math.abs(
                                                    kf.tMs -
                                                        projectStore.currentTime,
                                                ) < 1}
                                                style="left: {((kf.tMs -
                                                    selectedData.cue.startMs) /
                                                    (selectedData.cue.endMs -
                                                        selectedData.cue
                                                            .startMs)) *
                                                    100}%"
                                                onmousedown={(e) =>
                                                    handleKeyframeTickMouseDown(
                                                        e,
                                                        anim,
                                                        kf,
                                                    )}
                                            ></div>
                                        {/each}
                                    </div>
                                    <button
                                        class="mini-btn add-kf-btn"
                                        onclick={() => {
                                            if (!selectedData) return;
                                            const currentVal = getCueValueAt(
                                                selectedData.cue,
                                                anim.paramPath,
                                                anim.defaultValue || 0,
                                                projectStore.currentTime,
                                            );
                                            commandManager.execute(
                                                new AddKeyframeCommand(
                                                    selectedData.trackId,
                                                    anim.paramPath,
                                                    {
                                                        id: crypto.randomUUID(),
                                                        tMs: projectStore.currentTime,
                                                        value: currentVal,
                                                        interp: "linear",
                                                    },
                                                    selectedData.cue.id,
                                                ),
                                            );
                                        }}
                                        title="Add Keyframe at Current Time"
                                    >
                                        <Plus size={14} />
                                    </button>
                                    <button
                                        class="mini-btn"
                                        onclick={() => jumpToNextKeyframe(anim)}
                                        title="Next Keyframe"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>

                            <div class="kf-edit-list">
                                {#each anim.keyframes as kf (kf.id)}
                                    <div
                                        class="kf-edit-row"
                                        class:current={Math.abs(
                                            kf.tMs - projectStore.currentTime,
                                        ) < 1}
                                    >
                                        <button
                                            class="kf-jump-indicator"
                                            onclick={() =>
                                                (projectStore.currentTime =
                                                    kf.tMs)}
                                        >
                                            <Diamond
                                                size={8}
                                                fill={Math.abs(
                                                    kf.tMs -
                                                        projectStore.currentTime,
                                                ) < 1
                                                    ? "currentColor"
                                                    : "none"}
                                            />
                                        </button>
                                        <div class="kf-field t-field">
                                            <input
                                                type="number"
                                                value={Math.round(
                                                    kf.tMs -
                                                        selectedData.cue
                                                            .startMs,
                                                )}
                                                onchange={(e) => {
                                                    if (!selectedData) return;
                                                    const relT = parseInt(
                                                        (
                                                            e.target as HTMLInputElement
                                                        ).value,
                                                    );
                                                    let newT =
                                                        selectedData.cue
                                                            .startMs + relT;

                                                    // Clamp to cue boundaries
                                                    newT = Math.max(
                                                        selectedData.cue
                                                            .startMs,
                                                        Math.min(
                                                            selectedData.cue
                                                                .endMs,
                                                            newT,
                                                        ),
                                                    );

                                                    if (newT !== kf.tMs) {
                                                        commandManager.execute(
                                                            new UpdateKeyframeTimeCommand(
                                                                selectedData.trackId,
                                                                anim.paramPath,
                                                                kf.tMs,
                                                                newT,
                                                                selectedData.cue.id,
                                                            ),
                                                        );
                                                    }
                                                }}
                                            />
                                            <span class="unit">ms</span>
                                        </div>
                                        <div class="kf-field v-field">
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={kf.value}
                                                onchange={(e) => {
                                                    if (!selectedData) return;
                                                    const val = parseFloat(
                                                        (
                                                            e.target as HTMLInputElement
                                                        ).value,
                                                    );
                                                    commandManager.execute(
                                                        new UpdateKeyframeValueCommand(
                                                            selectedData.trackId,
                                                            anim.paramPath,
                                                            kf.tMs,
                                                            val,
                                                            selectedData.cue.id,
                                                        ),
                                                    );
                                                }}
                                            />
                                        </div>
                                        <select
                                            class="kf-interp-select"
                                            value={kf.interp}
                                            onchange={(e) => {
                                                const interp = (
                                                    e.target as HTMLSelectElement
                                                ).value;
                                                projectStore.updateKeyframe(
                                                    selectedData.trackId,
                                                    anim.paramPath,
                                                    kf.tMs,
                                                    { interp },
                                                    selectedData.cue.id,
                                                );
                                            }}
                                        >
                                            <option value="linear"
                                                >Linear</option
                                            >
                                            <option value="hold">Hold</option>
                                            <option value="easeIn"
                                                >Ease In</option
                                            >
                                            <option value="easeOut"
                                                >Ease Out</option
                                            >
                                            <option value="easeInOut"
                                                >Ease InOut</option
                                            >
                                        </select>
                                        <button
                                            class="mini-btn delete-kf"
                                            onclick={() => {
                                                commandManager.execute(
                                                    new RemoveKeyframeCommand(
                                                        selectedData.trackId,
                                                        anim.paramPath,
                                                        kf.tMs,
                                                        selectedData.cue.id,
                                                    ),
                                                );
                                            }}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/each}

                    {#if selectedData.cue.animTracks.length === 0}
                        <div class="placeholder-box">
                            No keyframes added to this cue yet. Use the diamond
                            icons in the Inspector tab to add keyframes.
                        </div>
                    {/if}
                </div>
            {:else}
                <!-- Effect Tab Content -->
                <div class="row">
                    <span class="label-text">Presets</span>
                    <div class="presets-grid">
                        <button class="preset-card" onclick={applyFadeIn}>
                            <div class="preset-preview fade-in"></div>
                            <span>Fade In</span>
                        </button>
                        <button class="preset-card" onclick={applyFadeOut}>
                            <div class="preset-preview fade-out"></div>
                            <span>Fade Out</span>
                        </button>
                    </div>
                </div>

                <div class="row">
                    <span class="label-text">Plugins (v0.1)</span>
                    <div class="placeholder-box">No plugins installed.</div>
                </div>
            {/if}
        </div>
    {:else}
        <div class="empty">Select a cue to edit properties.</div>
    {/if}

    {#if showStylePopup && selectedData}
        <div class="modal-overlay" onclick={closeStylePopup}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="style-popup" onclick={(e) => e.stopPropagation()}>
                <h3>
                    Advanced Styling ({popupType === "track"
                        ? "Track"
                        : "Individual"})
                </h3>

                <div class="popup-scroll">
                    {#if popupType === "track"}
                        {@const currentStyle = selectedData.track.defaultStyle}
                        {@const updateFn = (s: any) =>
                            commandManager.execute(
                                new UpdateTrackStyleCommand(
                                    selectedData.trackId,
                                    s,
                                ),
                            )}
                        <section>
                            <h4>Text Color</h4>
                            <div class="popup-row">
                                <label>Color:</label>
                                <input
                                    type="color"
                                    value={currentStyle.color || "#ffffff"}
                                    onchange={(e) =>
                                        updateFn({
                                            color: (
                                                e.target as HTMLInputElement
                                            ).value,
                                        })}
                                />
                            </div>
                        </section>
                        <section>
                            <h4>Background</h4>
                            <div class="popup-row">
                                <label>Box:</label>
                                <input
                                    type="checkbox"
                                    checked={!!currentStyle.backgroundColor}
                                    onchange={(e) =>
                                        updateFn({
                                            backgroundColor: (
                                                e.target as HTMLInputElement
                                            ).checked
                                                ? "#000000"
                                                : undefined,
                                        })}
                                />
                            </div>
                            {#if currentStyle.backgroundColor}
                                <div class="popup-row">
                                    <label>Color:</label>
                                    <input
                                        type="color"
                                        value={currentStyle.backgroundColor}
                                        onchange={(e) =>
                                            updateFn({
                                                backgroundColor: (
                                                    e.target as HTMLInputElement
                                                ).value,
                                            })}
                                    />
                                </div>
                                <div class="popup-row">
                                    <label>Alpha:</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={currentStyle.backgroundAlpha ??
                                            0.5}
                                        onchange={(e) =>
                                            updateFn({
                                                backgroundAlpha: parseFloat(
                                                    (
                                                        e.target as HTMLInputElement
                                                    ).value,
                                                ),
                                            })}
                                    />
                                    <span
                                        >{Math.round(
                                            (currentStyle.backgroundAlpha ??
                                                0.5) * 100,
                                        )}%</span
                                    >
                                </div>
                            {/if}
                        </section>
                        <section>
                            <h4>Edge Effect</h4>
                            <div class="popup-row edge-checks">
                                <label>Types:</label>
                                <div class="edge-check-group">
                                    {#each ["outline", "shadow", "glow", "bevel"] as type}
                                        <label class="edge-check-label">
                                            <input
                                                type="checkbox"
                                                checked={currentStyle
                                                    .edgeEffects?.[type]
                                                    ?.enabled ?? false}
                                                onchange={(e) => {
                                                    const active = (
                                                        e.target as HTMLInputElement
                                                    ).checked;
                                                    const nextEffects = {
                                                        ...(currentStyle.edgeEffects ||
                                                            {}),
                                                    };
                                                    nextEffects[
                                                        type as keyof typeof nextEffects
                                                    ] = {
                                                        ...(nextEffects[
                                                            type as keyof typeof nextEffects
                                                        ] || {
                                                            color: "#000000",
                                                            width: 1,
                                                        }),
                                                        enabled: active,
                                                    };
                                                    updateFn({
                                                        edgeEffects:
                                                            nextEffects,
                                                    });
                                                    if (active)
                                                        activeEdgeTab =
                                                            type as any;
                                                }}
                                            />
                                            {type.charAt(0).toUpperCase() +
                                                type.slice(1)}
                                        </label>
                                    {/each}
                                </div>
                            </div>

                            {#if Object.values(currentStyle.edgeEffects || {}).some((e) => e.enabled)}
                                <div class="edge-tabs">
                                    {#each ["outline", "shadow", "glow", "bevel"] as type}
                                        {#if currentStyle.edgeEffects?.[type as "outline"]?.enabled}
                                            <button
                                                class="edge-tab"
                                                class:active={activeEdgeTab ===
                                                    type}
                                                onclick={() =>
                                                    (activeEdgeTab =
                                                        type as any)}
                                            >
                                                {type}
                                            </button>
                                        {/if}
                                    {/each}
                                </div>

                                {@const activeConfig =
                                    currentStyle.edgeEffects?.[activeEdgeTab]}
                                {#if activeConfig && activeConfig.enabled}
                                    <div class="popup-row">
                                        <label>Color:</label>
                                        <input
                                            type="color"
                                            value={activeConfig.color ??
                                                "#000000"}
                                            onchange={(e) => {
                                                const nextEffects = {
                                                    ...(currentStyle.edgeEffects ||
                                                        {}),
                                                };
                                                nextEffects[activeEdgeTab] = {
                                                    ...activeConfig,
                                                    color: (
                                                        e.target as HTMLInputElement
                                                    ).value,
                                                };
                                                updateFn({
                                                    edgeEffects: nextEffects,
                                                });
                                            }}
                                        />
                                    </div>
                                    <div class="popup-row">
                                        <label>Width:</label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="10"
                                            step="0.5"
                                            value={activeConfig.width ?? 1}
                                            onchange={(e) => {
                                                const nextEffects = {
                                                    ...(currentStyle.edgeEffects ||
                                                        {}),
                                                };
                                                nextEffects[activeEdgeTab] = {
                                                    ...activeConfig,
                                                    width: parseFloat(
                                                        (
                                                            e.target as HTMLInputElement
                                                        ).value,
                                                    ),
                                                };
                                                updateFn({
                                                    edgeEffects: nextEffects,
                                                });
                                            }}
                                        />
                                        <span>{activeConfig.width}px</span>
                                    </div>
                                {/if}
                            {/if}
                        </section>
                    {:else}
                        {@const currentStyle =
                            selectedData.cue.styleOverride ??
                            selectedData.track.defaultStyle}
                        {@const updateFn = (s: any) =>
                            commandManager.execute(
                                new UpdateCueStyleCommand(
                                    selectedData.trackId,
                                    selectedData.cue.id,
                                    s,
                                ),
                            )}

                        <!-- Opacity Section with Keyframing -->
                        {@const alphaParamPath = "alpha"}
                        {@const alphaAnimTrack =
                            selectedData.cue.animTracks.find(
                                (a: any) => a.paramPath === alphaParamPath,
                            )}
                        {@const alphaHasKeyframe =
                            alphaAnimTrack?.keyframes.some(
                                (k: any) =>
                                    Math.abs(k.tMs - projectStore.currentTime) <
                                    1,
                            )}
                        {@const currentAlpha = getCueValueAt(
                            selectedData.cue,
                            alphaParamPath,
                            selectedData.cue.styleOverride?.alpha ??
                                selectedData.track.defaultStyle.alpha ??
                                1,
                            projectStore.currentTime,
                        )}

                        <section>
                            <div
                                style="display: flex; justify-content: space-between; align-items: center;"
                            >
                                <h4>Opacity (Fade In/Out)</h4>
                                <button
                                    class="small-btn kf-btn"
                                    class:active={alphaHasKeyframe}
                                    onclick={() => {
                                        if (alphaHasKeyframe) {
                                            commandManager.execute(
                                                new RemoveKeyframeCommand(
                                                    selectedData.trackId,
                                                    alphaParamPath,
                                                    projectStore.currentTime,
                                                    selectedData.cue.id,
                                                ),
                                            );
                                        } else {
                                            // Add keyframe with current value
                                            commandManager.execute(
                                                new AddKeyframeCommand(
                                                    selectedData.trackId,
                                                    alphaParamPath,
                                                    {
                                                        id: crypto.randomUUID(),
                                                        tMs: projectStore.currentTime,
                                                        value: currentAlpha,
                                                        interp: "linear",
                                                    },
                                                    selectedData.cue.id,
                                                ),
                                            );
                                        }
                                    }}
                                    title="Toggle Keyframe for Opacity"
                                >
                                    <Diamond
                                        size={12}
                                        fill={alphaHasKeyframe
                                            ? "currentColor"
                                            : "none"}
                                    />
                                </button>
                            </div>
                            <div class="popup-row">
                                <label>Value:</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={currentAlpha}
                                    onchange={(e) => {
                                        const val = parseFloat(
                                            (e.target as HTMLInputElement)
                                                .value,
                                        );
                                        // Update style
                                        updateFn({ alpha: val });

                                        // Update Keyframe if exists
                                        if (alphaHasKeyframe) {
                                            commandManager.execute(
                                                new UpdateKeyframeValueCommand(
                                                    selectedData.trackId,
                                                    alphaParamPath,
                                                    projectStore.currentTime,
                                                    val,
                                                    selectedData.cue.id,
                                                ),
                                            );
                                        } else if (alphaAnimTrack) {
                                            // Auto-add keyframe if track exists but no keyframe at this time?
                                            // The user logic usually requires explicit add if not present,
                                            // but for sliders often auto-add is preferred if track exists.
                                            // For now, let's just update value mostly.
                                            // But wait, the slider should update the base value OR the keyframe.
                                            // If anim exists, we should probably add keyframe.
                                            // Let's mimic the position logic:
                                            commandManager.execute(
                                                new AddKeyframeCommand(
                                                    selectedData.trackId,
                                                    alphaParamPath,
                                                    {
                                                        id: crypto.randomUUID(),
                                                        tMs: projectStore.currentTime,
                                                        value: val,
                                                        interp: "linear",
                                                    },
                                                    selectedData.cue.id,
                                                ),
                                            );
                                        }
                                    }}
                                />
                                <span>{Math.round(currentAlpha * 100)}%</span>
                            </div>
                        </section>

                        <section>
                            <h4>Background</h4>
                            <div class="popup-row">
                                <label>Box:</label>
                                <input
                                    type="checkbox"
                                    checked={!!currentStyle.backgroundColor}
                                    onchange={(e) =>
                                        updateFn({
                                            backgroundColor: (
                                                e.target as HTMLInputElement
                                            ).checked
                                                ? "#000000"
                                                : undefined,
                                        })}
                                />
                            </div>
                            {#if currentStyle.backgroundColor}
                                <div class="popup-row">
                                    <label>Color:</label>
                                    <input
                                        type="color"
                                        value={currentStyle.backgroundColor}
                                        onchange={(e) =>
                                            updateFn({
                                                backgroundColor: (
                                                    e.target as HTMLInputElement
                                                ).value,
                                            })}
                                    />
                                </div>
                                <div class="popup-row">
                                    <label>Alpha:</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={currentStyle.backgroundAlpha ??
                                            0.5}
                                        onchange={(e) =>
                                            updateFn({
                                                backgroundAlpha: parseFloat(
                                                    (
                                                        e.target as HTMLInputElement
                                                    ).value,
                                                ),
                                            })}
                                    />
                                    <span
                                        >{Math.round(
                                            (currentStyle.backgroundAlpha ??
                                                0.5) * 100,
                                        )}%</span
                                    >
                                </div>
                            {/if}
                        </section>
                        <section>
                            <h4>Edge Effect</h4>
                            <div class="popup-row edge-checks">
                                <label>Types:</label>
                                <div class="edge-check-group">
                                    {#each ["outline", "shadow", "glow", "bevel"] as type}
                                        <label class="edge-check-label">
                                            <input
                                                type="checkbox"
                                                checked={currentStyle
                                                    .edgeEffects?.[
                                                    type as "outline"
                                                ]?.enabled ?? false}
                                                onchange={(e) => {
                                                    const active = (
                                                        e.target as HTMLInputElement
                                                    ).checked;
                                                    const nextEffects = {
                                                        ...(currentStyle.edgeEffects ||
                                                            {}),
                                                    };
                                                    (nextEffects as any)[type] =
                                                        {
                                                            ...((
                                                                nextEffects as any
                                                            )[type] || {
                                                                color: "#000000",
                                                                width: 1,
                                                            }),
                                                            enabled: active,
                                                        };
                                                    updateFn({
                                                        edgeEffects:
                                                            nextEffects,
                                                    });
                                                    if (active)
                                                        activeEdgeTab =
                                                            type as any;
                                                }}
                                            />
                                            {type.charAt(0).toUpperCase() +
                                                type.slice(1)}
                                        </label>
                                    {/each}
                                </div>
                            </div>

                            {#if Object.values(currentStyle.edgeEffects || {}).some((e) => e.enabled)}
                                <div class="edge-tabs">
                                    {#each ["outline", "shadow", "glow", "bevel"] as type}
                                        {#if currentStyle.edgeEffects?.[type as "outline"]?.enabled}
                                            <button
                                                class="edge-tab"
                                                class:active={activeEdgeTab ===
                                                    type}
                                                onclick={() =>
                                                    (activeEdgeTab =
                                                        type as any)}
                                            >
                                                {type}
                                            </button>
                                        {/if}
                                    {/each}
                                </div>

                                {@const activeConfig =
                                    currentStyle.edgeEffects?.[activeEdgeTab]}
                                {#if activeConfig && activeConfig.enabled}
                                    {@const edgeParamPath = `edgeEffects.${activeEdgeTab}.width`}
                                    {@const edgeAnimTrack =
                                        selectedData.cue.animTracks.find(
                                            (a: any) =>
                                                a.paramPath === edgeParamPath,
                                        )}
                                    {@const edgeHasKeyframe =
                                        edgeAnimTrack?.keyframes.some(
                                            (k: any) =>
                                                Math.abs(
                                                    k.tMs -
                                                        projectStore.currentTime,
                                                ) < 1,
                                        )}
                                    {@const resolvedWidth = getCueValueAt(
                                        selectedData.cue,
                                        edgeParamPath,
                                        activeConfig.width ?? 1,
                                        projectStore.currentTime,
                                    )}

                                    <div class="popup-row">
                                        <label>Color:</label>
                                        <input
                                            type="color"
                                            value={activeConfig.color ??
                                                "#000000"}
                                            onchange={(e) => {
                                                const nextEffects = {
                                                    ...(currentStyle.edgeEffects ||
                                                        {}),
                                                };
                                                (nextEffects as any)[
                                                    activeEdgeTab
                                                ] = {
                                                    ...activeConfig,
                                                    color: (
                                                        e.target as HTMLInputElement
                                                    ).value,
                                                };
                                                updateFn({
                                                    edgeEffects: nextEffects,
                                                });
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="popup-row"
                                        style="margin-bottom: 4px;"
                                    >
                                        <div
                                            style="display: flex; justify-content: space-between; align-items: center; width: 100%;"
                                        >
                                            <label>Width:</label>
                                            <button
                                                class="small-btn kf-btn"
                                                class:active={edgeHasKeyframe}
                                                onclick={() => {
                                                    if (edgeHasKeyframe) {
                                                        commandManager.execute(
                                                            new RemoveKeyframeCommand(
                                                                selectedData.trackId,
                                                                edgeParamPath,
                                                                projectStore.currentTime,
                                                                selectedData.cue.id,
                                                            ),
                                                        );
                                                    } else {
                                                        commandManager.execute(
                                                            new AddKeyframeCommand(
                                                                selectedData.trackId,
                                                                edgeParamPath,
                                                                {
                                                                    id: crypto.randomUUID(),
                                                                    tMs: projectStore.currentTime,
                                                                    value: resolvedWidth,
                                                                    interp: "linear",
                                                                },
                                                                selectedData.cue.id,
                                                            ),
                                                        );
                                                    }
                                                }}
                                                title={`Toggle Keyframe for ${activeEdgeTab} width`}
                                            >
                                                <Diamond
                                                    size={12}
                                                    fill={edgeHasKeyframe
                                                        ? "currentColor"
                                                        : "none"}
                                                />
                                            </button>
                                        </div>
                                    </div>
                                    <div class="popup-row">
                                        <input
                                            type="range"
                                            min="0"
                                            max="10"
                                            step="0.5"
                                            value={resolvedWidth}
                                            onchange={(e) => {
                                                const val = parseFloat(
                                                    (
                                                        e.target as HTMLInputElement
                                                    ).value,
                                                );
                                                const nextEffects = {
                                                    ...(currentStyle.edgeEffects ||
                                                        {}),
                                                };
                                                (nextEffects as any)[
                                                    activeEdgeTab
                                                ] = {
                                                    ...activeConfig,
                                                    width: val,
                                                };
                                                updateFn({
                                                    edgeEffects: nextEffects,
                                                });

                                                if (edgeHasKeyframe) {
                                                    commandManager.execute(
                                                        new UpdateKeyframeValueCommand(
                                                            selectedData.trackId,
                                                            edgeParamPath,
                                                            projectStore.currentTime,
                                                            val,
                                                            selectedData.cue.id,
                                                        ),
                                                    );
                                                } else if (edgeAnimTrack) {
                                                    commandManager.execute(
                                                        new AddKeyframeCommand(
                                                            selectedData.trackId,
                                                            edgeParamPath,
                                                            {
                                                                id: crypto.randomUUID(),
                                                                tMs: projectStore.currentTime,
                                                                value: val,
                                                                interp: "linear",
                                                            },
                                                            selectedData.cue.id,
                                                        ),
                                                    );
                                                }
                                            }}
                                        />
                                        <span>{resolvedWidth}px</span>
                                    </div>
                                {/if}
                            {/if}
                        </section>
                    {/if}
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
    .presets-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
    }
    .preset-card {
        background: var(--bg-header);
        border: 1px solid var(--border-light);
        border-radius: 4px;
        padding: 8px;
        cursor: pointer;
        color: #ddd;
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .preset-card:hover {
        background: var(--border-light);
    }
    .preset-preview {
        height: 40px;
        background: #333;
        border-radius: 2px;
        position: relative;
        overflow: hidden;
    }
    .fade-in::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(to right, #000, #fff);
    }
    .fade-out::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(to left, #000, #fff);
    }

    .toolbar-mini {
        display: flex;
        gap: 0.25rem;
        margin-bottom: 0.25rem;
    }
    .toolbar-mini button {
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
    }
    .toolbar-mini button:hover {
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
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
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

    .color-preview {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 1px solid var(--border-light);
        flex-shrink: 0;
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
    .more-styles-btn {
        background: var(--bg-header);
        border: 1px solid var(--border-light);
        color: var(--text-dim);
        padding: 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
        white-space: nowrap;
    }
    .more-styles-btn:hover {
        color: var(--text-main);
        background: var(--border-light);
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
    .style-popup h3 {
        margin: 0;
        padding: 1rem;
        border-bottom: 1px solid var(--border-dark);
        font-size: 1rem;
        color: var(--accent);
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
    .popup-row select {
        flex: 1;
        background: var(--bg-input);
        color: var(--text-main);
        border: 1px solid var(--border-light);
        padding: 0.25rem;
        border-radius: 3px;
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

    /* Edge Effect Checkboxes */
    .edge-check-group {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.3rem 0.75rem;
        flex: 1;
    }
    .edge-check-label {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.8rem;
        color: var(--text-main);
        cursor: pointer;
    }
    .edge-check-label input[type="checkbox"] {
        width: auto;
        margin: 0;
        accent-color: var(--accent);
    }
    .edge-checks {
        align-items: flex-start;
    }

    /* Edge Tabs */
    .edge-tabs {
        display: flex;
        gap: 0.25rem;
        margin-top: 0.75rem;
        margin-bottom: 0.5rem;
        border-bottom: 1px solid var(--border-light);
        padding-bottom: 0.25rem;
    }
    .edge-tab {
        background: transparent;
        border: none;
        color: var(--text-dim);
        font-size: 0.75rem;
        padding: 0.25rem 0.5rem;
        cursor: pointer;
        border-radius: 3px;
        text-transform: capitalize;
    }
    .edge-tab:hover {
        background: var(--bg-hover);
        color: var(--text-main);
    }
    .edge-tab.active {
        background: var(--accent);
        color: #fff;
    }
</style>
