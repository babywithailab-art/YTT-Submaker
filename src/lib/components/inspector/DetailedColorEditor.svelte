<script lang="ts">
    import { projectStore } from "$lib/stores/projectStore.svelte";
    import {
        commandManager,
        UpdateKeyframeValueCommand,
        AddKeyframeCommand,
        RemoveKeyframeCommand,
        UpdateKeyframeTimeCommand,
    } from "$lib/engine/command.svelte";
    import { effectRegistry } from "$lib/engine/effects";
    import { interpolate } from "$lib/utils/animation";
    import {
        X,
        Palette,
        Trash2,
        Plus,
        Move,
        Maximize2,
        Diamond,
        Minimize2,
        PanelLeft,
        PanelLeftClose,
    } from "lucide-svelte";
    import { fade } from "svelte/transition";
    import type { EffectParameter } from "$lib/engine/effects";

    type AnimationRow =
        | {
              type: "composite-color";
              id: string;
              label: string;
              subParams: EffectParameter[];
              ids: string[];
          }
        | {
              type: "composite-number";
              id: string;
              label: string;
              subParams?: never;
              ids?: never;
          }
        | EffectParameter;

    let {
        show = $bindable(),
        effectId,
        trackId,
        cueId,
        docked = false,
        onDock,
    } = $props();

    let cue = $derived(
        projectStore.project?.tracks
            .find((t) => t.id === trackId)
            ?.cues.find((c) => c.id === cueId),
    );
    let effect = $derived(cue?.effects?.find((e) => e.id === effectId));
    let plugin = $derived(effect ? effectRegistry.get(effect.type) : null);

    // Define rows for the timeline (grouping some if needed)
    let parameterRows = $derived.by<AnimationRow[]>(() => {
        if (!plugin) return [];
        const params = plugin.parameters.filter((p) => p.id !== "intensity");

        if (effect?.type === "neon") {
            const others = params.filter(
                (p) => p.id !== "color" && p.id !== "blur",
            );
            const color = params.find((p) => p.id === "color");
            const blur = params.find((p) => p.id === "blur");
            if (color && blur) {
                return [
                    {
                        id: "neon-composite",
                        label: "Glow Settings",
                        type: "composite-color",
                        subParams: [color, blur],
                        ids: ["color", "blur"],
                    },
                    ...others,
                ];
            }
        } else if (effect?.type === "glitch") {
            // ... (rest of glitch logic)
            // returning params directly is fine as they match EffectParameter
            const others = params.filter(
                (p) => !["jitterX", "jitterY", "frequency"].includes(p.id),
            );
            const jitterX = params.find((p) => p.id === "jitterX");
            const jitterY = params.find((p) => p.id === "jitterY");
            const freq = params.find((p) => p.id === "frequency");

            // For now, just return all params flat as requested/decided
            return params;
        }
        return params;
    });

    let allTracks = $derived(cue?.animTracks || []);

    // Window logic only if not docked
    let pos = $state({ x: 100, y: 100 });
    let size = $state({ w: 600, h: 400 });
    let isDragging = $state(false);
    let isResizing = $state(false);
    let dragStart = { x: 0, y: 0 };
    let selectedKfId = $state<string | null>(null);

    function close() {
        show = false;
    }

    function handleHeaderMouseDown(e: MouseEvent) {
        if (docked) return;
        isDragging = true;
        dragStart = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        window.addEventListener("mousemove", onHeaderMove);
        window.addEventListener("mouseup", onHeaderUp);
    }

    function onHeaderMove(e: MouseEvent) {
        if (!isDragging) return;
        pos = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
    }

    function onHeaderUp() {
        isDragging = false;
        window.removeEventListener("mousemove", onHeaderMove);
        window.removeEventListener("mouseup", onHeaderUp);
    }

    function handleResizeMouseDown(e: MouseEvent) {
        if (docked) return;
        e.stopPropagation();
        isResizing = true;
        dragStart = { x: e.clientX, y: e.clientY };
        const startSize = { ...size };

        function onResizeMove(me: MouseEvent) {
            const dw = me.clientX - dragStart.x;
            const dh = me.clientY - dragStart.y;
            size = {
                w: Math.max(400, startSize.w + dw),
                h: Math.max(300, startSize.h + dh),
            };
        }

        function onResizeUp() {
            isResizing = false;
            window.removeEventListener("mousemove", onResizeMove);
            window.removeEventListener("mouseup", onResizeUp);
        }

        window.addEventListener("mousemove", onResizeMove);
        window.addEventListener("mouseup", onResizeUp);
    }

    function addKeyframeAtTime(paramIdOrIds: string | string[], tMs: number) {
        if (!effectId || !cueId) return;
        const ids = Array.isArray(paramIdOrIds) ? paramIdOrIds : [paramIdOrIds];

        for (const pid of ids) {
            const path = `effects.${effectId}.${pid}`;
            const track = allTracks.find((t) => t.paramPath === path);
            const param = plugin?.parameters.find((p) => p.id === pid);
            const currentValue = effect?.params?.[pid] ?? param?.default;

            const val = track
                ? interpolate(track.keyframes, tMs, currentValue)
                : currentValue;

            commandManager.execute(
                new AddKeyframeCommand(
                    trackId,
                    path,
                    {
                        id: crypto.randomUUID(),
                        tMs: tMs,
                        value: val,
                        interp: "linear",
                    },
                    cueId,
                ),
            );
        }
    }

    function updateKfValue(path: string, tMs: number, value: any) {
        commandManager.execute(
            new UpdateKeyframeValueCommand(trackId, path, tMs, value, cueId),
        );
    }

    function removeKf(path: string | string[], tMs: number) {
        const paths = Array.isArray(path) ? path : [path];
        for (const p of paths) {
            commandManager.execute(
                new RemoveKeyframeCommand(trackId, p, tMs, cueId),
            );
        }
        selectedKfId = null;
    }

    let dragMoved = false;

    function handleKfMouseDown(
        e: MouseEvent,
        paramPaths: string | string[],
        kf: any,
    ) {
        e.stopPropagation();
        selectedKfId = kf.id;
        dragMoved = false;

        const paths = Array.isArray(paramPaths) ? paramPaths : [paramPaths];
        const initialTMs = kf.tMs;

        // Find all keyframes at the same time in sibling tracks if composite
        const siblingKeyframes: any[] = [];
        if (paths.length > 1) {
            for (const path of paths) {
                const fullPath = `effects.${effectId}.${path}`;
                const track = allTracks.find((t) => t.paramPath === fullPath);
                if (track) {
                    const found = track.keyframes.find(
                        (k) => Math.abs(k.tMs - initialTMs) < 0.1,
                    );
                    if (found && found.id !== kf.id) {
                        siblingKeyframes.push({ track, kf: found });
                    }
                }
            }
        }

        const startX = e.clientX;
        const cueStart = cue?.startMs || 0;
        const cueEnd = cue?.endMs || 1000;

        function onKfMove(me: MouseEvent) {
            const dx = me.clientX - startX;
            if (Math.abs(dx) > 3) dragMoved = true;

            const timelineWidth = size.w - 180;
            const duration = cueEnd - cueStart;
            const dT = (dx / timelineWidth) * duration;
            let newT = Math.round(initialTMs + dT);
            newT = Math.max(cueStart, Math.min(cueEnd, newT));

            kf.tMs = newT;
            for (const sib of siblingKeyframes) {
                sib.kf.tMs = newT;
            }
        }

        function onKfUp() {
            window.removeEventListener("mousemove", onKfMove);
            window.removeEventListener("mouseup", onKfUp);

            const finalT = kf.tMs;
            kf.tMs = initialTMs; // Restore for command
            for (const sib of siblingKeyframes) {
                sib.kf.tMs = initialTMs;
            }

            if (finalT !== initialTMs && dragMoved) {
                // Execute for main
                const mainPath = Array.isArray(paramPaths)
                    ? `effects.${effectId}.${paramPaths[0]}`
                    : `effects.${effectId}.${paramPaths}`;
                const mainTrack = allTracks.find(
                    (t) => t.paramPath === mainPath,
                );
                if (mainTrack) {
                    commandManager.execute(
                        new UpdateKeyframeTimeCommand(
                            trackId,
                            mainTrack.paramPath,
                            initialTMs,
                            finalT,
                            cueId,
                        ),
                    );
                }

                // Execute for siblings
                for (const sib of siblingKeyframes) {
                    commandManager.execute(
                        new UpdateKeyframeTimeCommand(
                            trackId,
                            sib.track.paramPath,
                            initialTMs,
                            finalT,
                            cueId,
                        ),
                    );
                }
            }
        }

        window.addEventListener("mousemove", onKfMove);
        window.addEventListener("mouseup", onKfUp);
    }

    function getGradient(track: any, type: string) {
        if (type !== "color" && type !== "composite-color") return "none";

        if (!track || track.keyframes.length === 0) return "none";
        const sorted = [...track.keyframes].sort((a, b) => a.tMs - b.tMs);
        const duration = (cue?.endMs || 1000) - (cue?.startMs || 0);

        const firstVal = sorted[0].value;
        if (typeof firstVal !== "string" || !firstVal.startsWith("#"))
            return "none";

        const stops = sorted
            .map((k) => {
                const pct = ((k.tMs - (cue?.startMs || 0)) / duration) * 100;
                return `${k.value} ${pct}%`;
            })
            .join(", ");

        return `linear-gradient(to right, ${stops})`;
    }
</script>

{#if (show || docked) && effect && plugin}
    <div
        class="detailed-editor"
        class:docked
        style={!docked
            ? `left: ${pos.x}px; top: ${pos.y}px; width: ${size.w}px; height: ${size.h}px;`
            : ""}
        transition:fade={{ duration: 150 }}
    >
        <div
            class="editor-header"
            onmousedown={handleHeaderMouseDown}
            role="button"
            tabindex="0"
            aria-label="Editor Header{docked ? '' : ' (Drag to move)'}"
            style={docked ? "cursor: default;" : ""}
        >
            <div class="title">
                <Palette size={16} />
                <span>Detailed Color Editor - {plugin.label}</span>
            </div>
            <div class="header-actions">
                {#if !docked && onDock}
                    <button
                        class="icon-btn"
                        onclick={onDock}
                        title="Dock to Inspector"
                    >
                        <PanelLeft size={16} />
                    </button>
                {/if}
                {#if docked && onDock}
                    <button
                        class="icon-btn"
                        onclick={onDock}
                        title="Undock window"
                    >
                        <PanelLeftClose size={16} />
                    </button>
                {/if}
                {#if !docked}
                    <button class="close-btn" onclick={close}
                        ><X size={18} /></button
                    >
                {/if}
            </div>
        </div>

        <div class="editor-content">
            {#each parameterRows as row}
                {@const isComposite = row.type === "composite-color"}
                {@const track = !isComposite
                    ? allTracks.find(
                          (t) =>
                              t.paramPath === `effects.${effectId}.${row.id}`,
                      )
                    : allTracks.find(
                          (t) =>
                              t.paramPath ===
                              `effects.${effectId}.${row.ids[0]}`,
                      )}
                <div class="param-group">
                    <div class="param-header">
                        <span class="label">{row.label} Timeline</span>
                        <button
                            class="add-btn"
                            onclick={() =>
                                addKeyframeAtTime(
                                    isComposite ? row.ids : row.id,
                                    projectStore.currentTime,
                                )}
                        >
                            <Plus size={14} /> Add keyframe at playhead
                        </button>
                    </div>

                    <div class="timeline-container">
                        <div class="timeline-ruler">
                            {#if cue}
                                <div
                                    class="playhead"
                                    style="left: {((projectStore.currentTime -
                                        cue.startMs) /
                                        (cue.endMs - cue.startMs)) *
                                        100}%"
                                ></div>
                            {/if}
                        </div>

                        <div
                            class="timeline-track"
                            class:numeric={row.type === "number" ||
                                row.type === "boolean"}
                            style="background: {getGradient(track, row.type)}"
                            onclick={(e) => {
                                if (!cue || isResizing || isDragging) return;
                                const rect = (
                                    e.currentTarget as HTMLElement
                                ).getBoundingClientRect();
                                const pct =
                                    (e.clientX - rect.left) / rect.width;
                                const tMs =
                                    cue.startMs +
                                    pct * (cue.endMs - cue.startMs);
                                projectStore.setTime(tMs);
                            }}
                            role="button"
                            tabindex="0"
                            aria-label="Timeline (Click to move playhead)"
                        >
                            {#if track}
                                {#each track.keyframes as kf (kf.id)}
                                    <div
                                        class="kf-marker"
                                        class:selected={selectedKfId === kf.id}
                                        style="left: {((kf.tMs -
                                            (cue?.startMs || 0)) /
                                            ((cue?.endMs || 1000) -
                                                (cue?.startMs || 0))) *
                                            100}%"
                                        onmousedown={(e) =>
                                            handleKfMouseDown(
                                                e,
                                                isComposite ? row.ids : row.id,
                                                kf,
                                            )}
                                        role="button"
                                        tabindex="0"
                                    >
                                        <Diamond
                                            size={16}
                                            fill={selectedKfId === kf.id
                                                ? "var(--accent)"
                                                : row.type === "color" ||
                                                    isComposite
                                                  ? kf.value
                                                  : "#fff"}
                                            stroke={selectedKfId === kf.id
                                                ? "#fff"
                                                : "rgba(0,0,0,0.5)"}
                                            stroke-width={2}
                                        />
                                    </div>
                                {/each}
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        <div class="kf-controls-panel">
            {#if selectedKfId}
                {@const selectedTrack = allTracks.find((t) =>
                    t.keyframes.some((k) => k.id === selectedKfId),
                )}
                {@const kf = selectedTrack?.keyframes.find(
                    (k) => k.id === selectedKfId,
                )}

                {@const activeRow = parameterRows.find((row) => {
                    if (row.type === "composite-color") {
                        return row.ids.includes(
                            selectedTrack!.paramPath.split(".").pop()!,
                        );
                    } else {
                        return (
                            `effects.${effectId}.${row.id}` ===
                            selectedTrack!.paramPath
                        );
                    }
                })}

                {#if kf && activeRow}
                    {@const isComposite = activeRow.type === "composite-color"}

                    <div class="kf-edit-box">
                        <div class="kv">
                            <label for="kf-time-{kf.id}">Time (ms):</label>
                            <input
                                id="kf-time-{kf.id}"
                                type="number"
                                value={Math.round(kf.tMs - (cue?.startMs || 0))}
                                onchange={(e) => {
                                    const relT = parseInt(
                                        (e.target as HTMLInputElement).value,
                                    );
                                    const newT = (cue?.startMs || 0) + relT;
                                    commandManager.execute(
                                        new UpdateKeyframeTimeCommand(
                                            trackId,
                                            selectedTrack!.paramPath,
                                            kf.tMs,
                                            newT,
                                            cueId,
                                        ),
                                    );
                                    if (isComposite) {
                                        for (const pid of activeRow.ids) {
                                            const path = `effects.${effectId}.${pid}`;
                                            if (
                                                path ===
                                                selectedTrack!.paramPath
                                            )
                                                continue;
                                            commandManager.execute(
                                                new UpdateKeyframeTimeCommand(
                                                    trackId,
                                                    path,
                                                    kf.tMs,
                                                    newT,
                                                    cueId,
                                                ),
                                            );
                                        }
                                    }
                                }}
                            />
                        </div>

                        {#if isComposite}
                            {#each activeRow.subParams as sub}
                                {@const subPath = `effects.${effectId}.${sub.id}`}
                                {@const subTrack = allTracks.find(
                                    (t) => t.paramPath === subPath,
                                )}
                                {@const subKf = subTrack?.keyframes.find(
                                    (k) => Math.abs(k.tMs - kf.tMs) < 0.1,
                                )}
                                {#if subKf}
                                    <div class="kv">
                                        <label for="kf-val-{sub.id}-{subKf.id}"
                                            >{sub.label}:</label
                                        >
                                        {#if sub.type === "color"}
                                            <input
                                                id="kf-val-{sub.id}-{subKf.id}"
                                                type="color"
                                                value={subKf.value}
                                                oninput={(e) =>
                                                    updateKfValue(
                                                        subPath,
                                                        subKf.tMs,
                                                        (
                                                            e.target as HTMLInputElement
                                                        ).value,
                                                    )}
                                            />
                                        {:else}
                                            <input
                                                id="kf-val-{sub.id}-{subKf.id}"
                                                type="number"
                                                step={sub.step || 1}
                                                min={sub.min}
                                                max={sub.max}
                                                value={subKf.value}
                                                oninput={(e) =>
                                                    updateKfValue(
                                                        subPath,
                                                        subKf.tMs,
                                                        parseFloat(
                                                            (
                                                                e.target as HTMLInputElement
                                                            ).value,
                                                        ),
                                                    )}
                                            />
                                        {/if}
                                    </div>
                                {/if}
                            {/each}
                        {:else}
                            <div class="kv">
                                <label for="kf-val-{kf.id}"
                                    >{activeRow.label}:</label
                                >
                                {#if activeRow.type === "color"}
                                    <input
                                        id="kf-val-{kf.id}"
                                        type="color"
                                        value={kf.value}
                                        oninput={(e) =>
                                            updateKfValue(
                                                selectedTrack!.paramPath,
                                                kf.tMs,
                                                (e.target as HTMLInputElement)
                                                    .value,
                                            )}
                                    />
                                {:else}
                                    <input
                                        id="kf-val-{kf.id}"
                                        type="number"
                                        step={(activeRow as any).step || 1}
                                        min={(activeRow as any).min}
                                        max={(activeRow as any).max}
                                        value={kf.value}
                                        oninput={(e) =>
                                            updateKfValue(
                                                selectedTrack!.paramPath,
                                                kf.tMs,
                                                parseFloat(
                                                    (
                                                        e.target as HTMLInputElement
                                                    ).value,
                                                ),
                                            )}
                                    />
                                {/if}
                            </div>
                        {/if}

                        <button
                            class="delete-kf-btn"
                            onclick={() =>
                                removeKf(
                                    isComposite
                                        ? activeRow.ids.map(
                                              (id) =>
                                                  `effects.${effectId}.${id}`,
                                          )
                                        : selectedTrack!.paramPath,
                                    kf.tMs,
                                )}
                        >
                            <Trash2 size={14} /> Remove
                        </button>
                    </div>
                {/if}
            {:else}
                <div class="empty-hint">
                    Select a keyframe on the timeline to edit.
                </div>
            {/if}
        </div>

        {#if !docked}
            <div
                class="resize-handle"
                onmousedown={handleResizeMouseDown}
                role="button"
                tabindex="0"
                aria-label="Resize handle"
            >
                <Maximize2 size={12} />
            </div>
        {/if}
    </div>
{/if}

<style>
    .detailed-editor {
        position: fixed;
        background: #1e1e2e;
        border: 1px solid #313244;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        user-select: none;
    }
    .detailed-editor.docked {
        position: static;
        width: 100% !important;
        height: 100% !important;
        border: none;
        box-shadow: none;
        border-radius: 0;
        z-index: auto;
    }

    .editor-header {
        padding: 0.75rem 1rem;
        background: #242437;
        border-bottom: 1px solid #313244;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        border-radius: 8px 8px 0 0;
    }
    .detailed-editor.docked .editor-header {
        cursor: default;
        border-radius: 0;
    }

    .title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #cdd6f4;
        font-weight: 600;
        font-size: 0.9rem;
    }

    .header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .icon-btn,
    .close-btn {
        background: transparent;
        border: none;
        color: #6c7086;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .icon-btn:hover,
    .close-btn:hover {
        color: #f38ba8;
    }
    .icon-btn:hover {
        color: #89b4fa;
    }

    .editor-content {
        flex: 1;
        padding: 1rem;
        overflow-y: auto;
    }

    .param-group {
        margin-bottom: 2rem;
    }

    .param-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }

    .label {
        font-size: 0.85rem;
        color: #a6adc8;
        font-weight: 500;
    }

    .add-btn {
        background: #313244;
        border: 1px solid #45475a;
        color: #cdd6f4;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
    }
    .add-btn:hover {
        background: #45475a;
    }

    .timeline-container {
        position: relative;
        margin: 1.5rem 0;
    }

    .timeline-ruler {
        height: 12px;
        position: relative;
        margin-bottom: 4px;
    }

    .playhead {
        position: absolute;
        width: 2px;
        height: 40px;
        background: #f38ba8;
        z-index: 5;
        top: 10px;
        pointer-events: none;
    }

    .timeline-track {
        height: 24px;
        border-radius: 4px;
        border: 1px solid #45475a;
        position: relative;
        cursor: crosshair;
    }

    .timeline-track.numeric {
        background: #242437 !important;
        cursor: default;
    }

    .kf-marker {
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        cursor: pointer;
        z-index: 10;
        color: white;
    }
    .kf-marker:hover {
        filter: brightness(1.2);
    }
    .kf-marker.selected {
        color: var(--accent, #89b4fa);
    }

    .kf-controls-panel {
        background: #181825;
        border-radius: 6px;
        padding: 0.75rem;
        min-height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #313244;
        margin-top: auto; /* Push to bottom if needed */
    }

    .kf-edit-box {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        width: 100%;
    }

    .kv {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .kv label {
        font-size: 0.8rem;
        color: #a6adc8;
    }
    .kv input[type="number"] {
        width: 70px;
        background: #313244;
        border: 1px solid #45475a;
        color: #cdd6f4;
        border-radius: 4px;
    }

    .resize-handle {
        position: absolute;
        bottom: 4px;
        right: 4px;
        cursor: nwse-resize;
        color: #6c7086;
        padding: 4px;
    }
    .resize-handle:hover {
        color: #f38ba8;
    }
    .empty-hint {
        color: #6c7086;
        font-style: italic;
        font-size: 0.9rem;
    }
</style>
