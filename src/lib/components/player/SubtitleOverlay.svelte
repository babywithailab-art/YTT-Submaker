<script lang="ts">
    import { projectStore } from "$lib/stores/projectStore.svelte";
    import { getStyledSegments } from "$lib/utils/text";
    import { interpolate } from "$lib/utils/animation";
    import { effectRegistry } from "$lib/engine/effects";
    import type { Track, Cue } from "$lib/types";

    function getTrackValue<T>(
        track: Track,
        path: string,
        currentVal: T,
        t: number,
    ): T {
        const anim = track.animTracks.find(
            (a) => a.paramPath === path && a.enabled,
        );
        if (anim) {
            return interpolate(anim.keyframes, t, currentVal);
        }
        return currentVal;
    }

    function getCueValue<T>(
        cue: Cue,
        path: string,
        currentVal: T,
        t: number,
    ): T {
        const anim = cue.animTracks.find(
            (a) => a.paramPath === path && a.enabled,
        );
        if (anim) {
            return interpolate(anim.keyframes, t, currentVal);
        }
        return currentVal;
    }

    function getAlignX(cue: Cue): string {
        const align = cue.spans?.find((s) => s.stylePatch.align)?.stylePatch
            .align;
        if (align === "left") return "0%";
        if (align === "right") return "-100%";
        return "-50%";
    }

    let activeItems = $derived.by(() => {
        if (!projectStore.project) return [];
        const t = projectStore.currentTime;
        const items: {
            cue: Cue;
            trackId: string;
            style: any;
            transform: any;
            opacity: number;
            effectStyles: string;
            effectClasses: string[];
            wrappedText?: string;
        }[] = [];

        for (const track of projectStore.project.tracks) {
            if (!track.visible) continue;

            const tr = track.transform;
            const trackTransform = {
                xNorm: getTrackValue(track, "transform.xNorm", tr.xNorm, t),
                yNorm: getTrackValue(track, "transform.yNorm", tr.yNorm, t),
                scale: getTrackValue(track, "transform.scale", tr.scale, t),
                rotation: getTrackValue(
                    track,
                    "transform.rotation",
                    tr.rotation,
                    t,
                ),
            };

            for (const cue of track.cues) {
                if (t >= cue.startMs && t < cue.endMs) {
                    // 1. Check for cue keyframes first
                    // 2. Fallback to cue.posOverride
                    // 3. Fallback to trackTransform
                    const pos = cue.posOverride;

                    let finalTransform: any = {
                        xNorm: getCueValue(
                            cue,
                            "posOverride.xNorm",
                            pos?.xNorm ?? trackTransform.xNorm,
                            t,
                        ),
                        yNorm: getCueValue(
                            cue,
                            "posOverride.yNorm",
                            pos?.yNorm ?? trackTransform.yNorm,
                            t,
                        ),
                        scale: getCueValue(
                            cue,
                            "posOverride.scale",
                            pos?.scale ?? trackTransform.scale,
                            t,
                        ),
                        rotation: getCueValue(
                            cue,
                            "posOverride.rotation",
                            pos?.rotation ?? trackTransform.rotation,
                            t,
                        ),
                    };

                    // 1. Calculate Track Opacity (Animated)
                    const trackOpacity = getTrackValue(
                        track,
                        "defaultStyle.alpha",
                        track.defaultStyle.alpha ?? 1,
                        t,
                    );

                    // 2. Calculate Cue Opacity Override (Animated)
                    // We check if styleOverride.alpha is set OR if there is an animation for it.
                    const cueOpacityOverride = getCueValue(
                        cue,
                        "styleOverride.alpha",
                        cue.styleOverride?.alpha,
                        t,
                    );

                    // 3. Determine Base Opacity
                    // If cueOverride is defined (number), use it. Else fall back to trackOpacity.
                    const baseOpacity = cueOpacityOverride ?? trackOpacity;

                    // 4. Apply "alpha" (Fade) Multiplier (concerns simple fade in/out)
                    // If "alpha" track exists, it acts as a 0-1 multiplier on top of the base opacity.
                    const fadeOpacity = getCueValue(cue, "alpha", 1, t);

                    let opacity = baseOpacity * fadeOpacity;

                    let finalStyle = {
                        ...track.defaultStyle,
                        ...(cue.styleOverride || {}),
                    };

                    // Interpolate per-effect edge widths
                    if (finalStyle.edgeEffects) {
                        const types = [
                            "outline",
                            "shadow",
                            "glow",
                            "bevel",
                        ] as const;
                        const newEdgeEffects = { ...finalStyle.edgeEffects };
                        let changed = false;

                        for (const type of types) {
                            const config = newEdgeEffects[type];
                            if (config && config.enabled) {
                                const path = `edgeEffects.${type}.width`;
                                // Try cue-level first, then track-level
                                const trackVal = getTrackValue(
                                    track,
                                    path,
                                    config.width,
                                    t,
                                );
                                const finalWidth = getCueValue(
                                    cue,
                                    path,
                                    trackVal,
                                    t,
                                );

                                if (finalWidth !== config.width) {
                                    newEdgeEffects[type] = {
                                        ...config,
                                        width: finalWidth,
                                    };
                                    changed = true;
                                }
                            }
                        }
                        if (changed) {
                            finalStyle = {
                                ...finalStyle,
                                edgeEffects: newEdgeEffects,
                            };
                        }
                    }

                    let finalEffectStyles = "";
                    let effectClasses: string[] = [];
                    let wrappedText: string | undefined = undefined;

                    if (cue.effects) {
                        // Priority: Style/Other (0) -> Color (1).
                        // Lower priority applies first, Higher priority applies last (overriding).
                        // Note: User order within same category is preserved.
                        const sortedEffects = [...cue.effects].sort((a, b) => {
                            const pA = effectRegistry.get(a.type);
                            const pB = effectRegistry.get(b.type);
                            // If plugin missing, treat as lowest priority (0)
                            const catA = pA?.category === "color" ? 1 : 0;
                            const catB = pB?.category === "color" ? 1 : 0;

                            if (catA !== catB) return catA - catB;
                            // If same category, keep original index (stable sort logic)
                            // Since we use sort(), it depends on browser stability, but typically we want index check.
                            const idxA = cue.effects?.indexOf(a) ?? -1;
                            const idxB = cue.effects?.indexOf(b) ?? -1;
                            return idxA - idxB;
                        });

                        for (const effect of sortedEffects) {
                            const plugin = effectRegistry.get(effect.type);
                            if (plugin) {
                                // Interpolate parameters
                                const interpolatedParams = { ...effect.params };
                                for (const p of plugin.parameters) {
                                    if (
                                        p.type === "number" ||
                                        p.type === "color"
                                    ) {
                                        const path = `effects.${effect.id}.${p.id}`;
                                        interpolatedParams[p.id] = getCueValue(
                                            cue,
                                            path,
                                            effect.params[p.id] ?? p.default,
                                            t,
                                        );
                                    }
                                }

                                const result = plugin.apply(
                                    interpolatedParams,
                                    {
                                        t: t - cue.startMs,
                                        duration: cue.endMs - cue.startMs,
                                        text: cue.plainText,
                                    },
                                );

                                if (result.styles) {
                                    if (result.styles.opacity !== undefined) {
                                        opacity *= result.styles.opacity;
                                    }
                                    if (result.styles.transform) {
                                        // @ts-ignore
                                        finalTransform.effectTransform =
                                            (finalTransform.effectTransform ||
                                                "") +
                                            " " +
                                            result.styles.transform;
                                    }
                                    if (result.styles.filter) {
                                        finalEffectStyles += `filter: ${result.styles.filter}; `;
                                    }

                                    // Handle other styles
                                    for (const [key, val] of Object.entries(
                                        result.styles,
                                    )) {
                                        if (
                                            ![
                                                "opacity",
                                                "transform",
                                                "filter",
                                            ].includes(key)
                                        ) {
                                            // Append to override previous
                                            finalEffectStyles += `${key}: ${val}; `;
                                        }
                                    }
                                }

                                if (result.className) {
                                    effectClasses.push(result.className);
                                }
                                if (result.textWrapper) {
                                    wrappedText = result.textWrapper(
                                        wrappedText ?? cue.plainText,
                                    );
                                }
                            }
                        }
                    }

                    items.push({
                        cue,
                        trackId: track.id,
                        style: finalStyle,
                        transform: finalTransform,
                        opacity,
                        effectStyles: finalEffectStyles,
                        effectClasses,
                        wrappedText,
                    });
                }
            }
        }
        return items;
    });

    function getBackgroundStyles(style: any) {
        if (!style.backgroundColor) return "";
        const alpha = style.backgroundAlpha ?? 0.5;
        // Simple hex to rgba conversion
        const hex = style.backgroundColor.replace("#", "");
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `background-color: rgba(${r}, ${g}, ${b}, ${alpha});`;
    }

    function getEdgeStyles(style: any) {
        const shadows: string[] = [];

        // 1. New data model: edgeEffects map
        if (style.edgeEffects) {
            for (const [type, config] of Object.entries(style.edgeEffects)) {
                const c = config as any;
                if (!c.enabled) continue;

                const color = c.color ?? "#000000";
                const width = c.width ?? 1;

                if (type === "outline") {
                    shadows.push(
                        `-${width}px -${width}px 0 ${color}`,
                        `${width}px -${width}px 0 ${color}`,
                        `-${width}px ${width}px 0 ${color}`,
                        `${width}px ${width}px 0 ${color}`,
                    );
                } else if (type === "shadow") {
                    shadows.push(
                        `${width * 2}px ${width * 2}px ${width}px ${color}`,
                    );
                } else if (type === "glow") {
                    shadows.push(
                        `0 0 ${width * 2}px ${color}`,
                        `0 0 ${width}px ${color}`,
                    );
                } else if (type === "bevel") {
                    shadows.push(
                        `1px 1px 1px ${color}`,
                        `-1px -1px 1px #ffffff80`,
                    );
                }
            }
        }

        // 2. Fallback to legacy fields if no shadows yet
        if (shadows.length === 0) {
            const types: string[] =
                style.edgeTypes && style.edgeTypes.length > 0
                    ? style.edgeTypes
                    : style.edgeType && style.edgeType !== "none"
                      ? [style.edgeType]
                      : [];

            const color = style.edgeColor ?? "#000000";
            const width = style.outlineWidth ?? 1;

            for (const type of types) {
                if (type === "outline") {
                    shadows.push(
                        `-${width}px -${width}px 0 ${color}`,
                        `${width}px -${width}px 0 ${color}`,
                        `-${width}px ${width}px 0 ${color}`,
                        `${width}px ${width}px 0 ${color}`,
                    );
                } else if (type === "shadow") {
                    shadows.push(
                        `${width * 2}px ${width * 2}px ${width}px ${color}`,
                    );
                } else if (type === "glow") {
                    shadows.push(
                        `0 0 ${width * 2}px ${color}`,
                        `0 0 ${width}px ${color}`,
                    );
                } else if (type === "bevel") {
                    shadows.push(
                        `1px 1px 1px ${color}`,
                        `-1px -1px 1px #ffffff80`,
                    );
                }
            }
        }

        if (shadows.length === 0)
            return "text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);";
        return `text-shadow: ${shadows.join(", ")};`;
    }

    import {
        commandManager,
        UpdateCuePositionCommand,
        AddKeyframeCommand,
        UpdateKeyframeValueCommand,
        RemoveKeyframeCommand,
    } from "$lib/engine/command.svelte";

    let containerEl: HTMLDivElement;

    function handleSubtitleMouseDown(e: MouseEvent, trackId: string, cue: Cue) {
        e.stopPropagation();
        e.preventDefault();

        // Select this cue
        projectStore.selectedTrackId = trackId;
        projectStore.selectedCueIds = new Set([cue.id]);

        if (!containerEl) return;

        const rect = containerEl.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;

        // Initialize posOverride if not set
        if (!cue.posOverride) {
            const track = projectStore.project.tracks.find(
                (t) => t.id === trackId,
            );
            cue.posOverride = {
                xNorm: track?.transform.xNorm ?? 0.5,
                yNorm: track?.transform.yNorm ?? 0.8,
                scale: track?.transform.scale ?? 1,
                rotation: track?.transform.rotation ?? 0,
            };
        }

        const startXNorm = cue.posOverride.xNorm!;
        const startYNorm = cue.posOverride.yNorm!;

        // Capture initial state for Undo
        const initialPosOverride = JSON.parse(JSON.stringify(cue.posOverride));

        // Check for animations to decide Keyframe Mode vs Static Mode
        const xParam = "posOverride.xNorm";
        const yParam = "posOverride.yNorm";

        const xAnimTrack = cue.animTracks.find((a) => a.paramPath === xParam);
        const yAnimTrack = cue.animTracks.find((a) => a.paramPath === yParam);

        // Check if keyframes exist at current time (approx)
        const t = projectStore.currentTime;
        const existingKfX = xAnimTrack?.keyframes.find(
            (k) => Math.abs(k.tMs - t) < 1,
        );
        const existingKfY = yAnimTrack?.keyframes.find(
            (k) => Math.abs(k.tMs - t) < 1,
        );

        // Capture initial keyframe values if they exist
        const initialValX = existingKfX ? existingKfX.value : null;
        const initialValY = existingKfY ? existingKfY.value : null;

        function onMove(me: MouseEvent) {
            if (!cue.posOverride) return;
            const dx = (me.clientX - startX) / rect.width;
            const dy = (me.clientY - startY) / rect.height;

            const newX = Math.max(0, Math.min(1, startXNorm + dx));
            const newY = Math.max(0, Math.min(1, startYNorm + dy));

            // Update local state for preview
            cue.posOverride.xNorm = newX;
            cue.posOverride.yNorm = newY;

            // If Keyframed, we MUST update the keyframe directly to see the effect
            // because getCueValue prioritizes the keyframe.
            // We do a direct mutation here for preview, but we will "record" it via Command on up.
            if (xAnimTrack) {
                // If existing, update it. If not, we might need to add one temporarily?
                // Actually, if we add one temporarily, we clutter.
                // But without it, preview won't work for non-keyed frames interpolated.
                // Let's assume user is on a keyframe or okay with jump?
                // Creating temp keyframes is complex.
                // Let's just update existing if it exists.
                if (existingKfX) existingKfX.value = newX;
                // If not existing, we can't easily preview without adding.
                // Let's add it? But then we must remove it if we cancel?
                // For "Practicality", assume mostly editing existing or keyframe mode is off.
                // If auto-keyframe is desired, we should probably add it.
                // Let's stick to updating existing for now, or just setting posOverride (fallback).
                // Wait, if animation exists, posOverride is IGNORED by getCueValue logic (line 76).
                // So if we are at a time without keyframe, dragging does NOTHING visually.
                // That's bad.
                // Fix: Force `getTrackValue/getCueValue` to respect an "interactive override"?
                // Or just add the keyframe.
                if (!existingKfX) {
                    projectStore.addKeyframe(
                        trackId,
                        xParam,
                        {
                            id: crypto.randomUUID(),
                            tMs: t,
                            value: newX,
                            interp: "linear",
                        },
                        cue.id,
                    );
                } else {
                    projectStore.updateKeyframe(
                        trackId,
                        xParam,
                        t,
                        { value: newX },
                        cue.id,
                    );
                }
            }

            if (yAnimTrack) {
                if (!existingKfY) {
                    projectStore.addKeyframe(
                        trackId,
                        yParam,
                        {
                            id: crypto.randomUUID(),
                            tMs: t,
                            value: newY,
                            interp: "linear",
                        },
                        cue.id,
                    );
                } else {
                    projectStore.updateKeyframe(
                        trackId,
                        yParam,
                        t,
                        { value: newY },
                        cue.id,
                    );
                }
            }

            // Only trigger update if NOT keyframed (keyframe updates trigger their own)
            if (!xAnimTrack && !yAnimTrack) {
                projectStore.project.updatedAt = new Date().toISOString();
            }
        }

        function onUp(me: MouseEvent) {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);

            // Final values
            const dx = (me.clientX - startX) / rect.width;
            const dy = (me.clientY - startY) / rect.height;
            const finalX = Math.max(0, Math.min(1, startXNorm + dx));
            const finalY = Math.max(0, Math.min(1, startYNorm + dy));

            // Execute Commands to finalize and record history

            // X Axis
            if (xAnimTrack) {
                if (existingKfX) {
                    // Update: Undo should restore initialValX
                    // We run Execute to ensure stack is correct (it will just set value to finalX again)
                    // But we need to construct a custom command that knows old value?
                    // UpdateKeyframeValueCommand snapshots current value as old value.
                    // But current value is ALREADY finalX because we mutated it in onMove.
                    // So Undo would restore... finalX. Useless.
                    // WE NEED TO MANUALLY CONSTRUCT THE COMMAND with the OLD value we captured.
                    // Or revert the change locally first?
                    // Reverting locally is safer:
                    existingKfX.value = initialValX; // Reset
                    commandManager.execute(
                        new UpdateKeyframeValueCommand(
                            trackId,
                            xParam,
                            t,
                            finalX,
                            cue.id,
                        ),
                    );
                } else {
                    // Added new: Undo should remove it.
                    // We added it in onMove. We should remove it first?
                    projectStore.removeKeyframe(trackId, xParam, t, cue.id); // Reset
                    commandManager.execute(
                        new AddKeyframeCommand(
                            trackId,
                            xParam,
                            {
                                id: crypto.randomUUID(),
                                tMs: t,
                                value: finalX,
                                interp: "linear",
                            },
                            cue.id,
                        ),
                    );
                }
            }

            // Y Axis (Same logic)
            if (yAnimTrack) {
                if (existingKfY) {
                    existingKfY.value = initialValY;
                    commandManager.execute(
                        new UpdateKeyframeValueCommand(
                            trackId,
                            yParam,
                            t,
                            finalY,
                            cue.id,
                        ),
                    );
                } else {
                    projectStore.removeKeyframe(trackId, yParam, t, cue.id);
                    commandManager.execute(
                        new AddKeyframeCommand(
                            trackId,
                            yParam,
                            {
                                id: crypto.randomUUID(),
                                tMs: t,
                                value: finalY,
                                interp: "linear",
                            },
                            cue.id,
                        ),
                    );
                }
            }

            // Static Position (only if no anims)
            if (!xAnimTrack && !yAnimTrack) {
                // Revert local mutation first
                cue.posOverride = initialPosOverride;

                // Execute Command
                commandManager.execute(
                    new UpdateCuePositionCommand(
                        trackId,
                        cue.id,
                        initialPosOverride,
                        { ...initialPosOverride, xNorm: finalX, yNorm: finalY },
                    ),
                );
            }
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }

    function handleRotateMouseDown(e: MouseEvent, trackId: string, cue: Cue) {
        e.stopPropagation();
        e.preventDefault();

        if (!containerEl) return;

        // We need the center of the element to calculate angle
        const target = e.currentTarget as HTMLElement; // The handle
        const cueEl = target.parentElement as HTMLElement; // The cue-line div
        const rect = cueEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);

        // Initialize posOverride if needed (same as move)
        if (!cue.posOverride) {
            const track = projectStore.project.tracks.find(
                (t) => t.id === trackId,
            );
            cue.posOverride = {
                xNorm: track?.transform.xNorm ?? 0.5,
                yNorm: track?.transform.yNorm ?? 0.8,
                scale: track?.transform.scale ?? 1,
                rotation: track?.transform.rotation ?? 0,
            };
        }

        const initialRotation = cue.posOverride.rotation ?? 0;
        const initialPosOverride = JSON.parse(JSON.stringify(cue.posOverride));

        const rotParam = "posOverride.rotation";
        const rotAnimTrack = cue.animTracks.find(
            (a) => a.paramPath === rotParam,
        );
        const t = projectStore.currentTime;
        const existingKf = rotAnimTrack?.keyframes.find(
            (k) => Math.abs(k.tMs - t) < 1,
        );
        const initialVal = existingKf ? existingKf.value : null;

        function onMove(me: MouseEvent) {
            const currentAngle = Math.atan2(
                me.clientY - centerY,
                me.clientX - centerX,
            );
            let delta = (currentAngle - startAngle) * (180 / Math.PI);

            // Snap?
            if (me.shiftKey) {
                // Implement snap if needed
            }

            const newRotation = (initialRotation + delta) % 360;

            // Update state
            if (!cue.posOverride) return;
            cue.posOverride.rotation = newRotation;

            if (rotAnimTrack) {
                if (existingKf) {
                    existingKf.value = newRotation;
                } else {
                    // Keyframe auto-creation logic
                    projectStore.addKeyframe(
                        trackId,
                        rotParam,
                        {
                            id: crypto.randomUUID(),
                            tMs: t,
                            value: newRotation,
                            interp: "linear",
                        },
                        cue.id,
                    );
                }
            } else {
                projectStore.project.updatedAt = new Date().toISOString();
            }
        }

        function onUp(me: MouseEvent) {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);

            const currentAngle = Math.atan2(
                me.clientY - centerY,
                me.clientX - centerX,
            );
            let delta = (currentAngle - startAngle) * (180 / Math.PI);
            const finalRotation = (initialRotation + delta) % 360;

            if (rotAnimTrack) {
                if (existingKf) {
                    // Revert locally then execute command to be safe/correct with Undo
                    existingKf.value = initialVal;
                    commandManager.execute(
                        new UpdateKeyframeValueCommand(
                            trackId,
                            rotParam,
                            t,
                            finalRotation,
                            cue.id,
                        ),
                    );
                } else {
                    // We added a temp keyframe, remove it then properly add via command
                    projectStore.removeKeyframe(trackId, rotParam, t, cue.id);
                    commandManager.execute(
                        new AddKeyframeCommand(
                            trackId,
                            rotParam,
                            {
                                id: crypto.randomUUID(),
                                tMs: t,
                                value: finalRotation,
                                interp: "linear",
                            },
                            cue.id,
                        ),
                    );
                }
            } else {
                // Static update
                cue.posOverride = initialPosOverride;
                commandManager.execute(
                    new UpdateCuePositionCommand(
                        trackId,
                        cue.id,
                        initialPosOverride,
                        { ...initialPosOverride, rotation: finalRotation },
                    ),
                );
            }
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }
</script>

<div class="overlay-container" bind:this={containerEl}>
    {#each activeItems as { cue, trackId, style, transform, opacity, effectStyles, effectClasses, wrappedText }}
        {@const isSelected = projectStore.selectedCueIds.has(cue.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="cue-line {effectClasses.join(' ')}"
            class:selected={isSelected}
            style:font-size="{style.fontSize || 24}px"
            style:color={style.color || "#ffffff"}
            style:left="{transform.xNorm * 100}%"
            style:top="{transform.yNorm * 100}%"
            style:opacity
            style:text-align={(() => {
                const alignSpan = cue.spans?.find((s) => s.stylePatch.align);
                return alignSpan?.stylePatch.align || "left";
            })()}
            style="{getBackgroundStyles(style)} {getEdgeStyles(
                style,
            )} {effectStyles}"
            style:transform="translate({getAlignX(cue)}, -50%) scale({transform.scale})
            rotate({transform.rotation}deg) {transform.effectTransform || ''}"
            onmousedown={(e) => handleSubtitleMouseDown(e, trackId, cue)}
        >
            {#if isSelected}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="rotate-handle"
                    onmousedown={(e) => handleRotateMouseDown(e, trackId, cue)}
                >
                    <div class="rotate-knob"></div>
                </div>
            {/if}

            {#if wrappedText !== undefined}
                <div class="subtitle-text" style="white-space: pre;">
                    {@html wrappedText}
                </div>
            {:else}
                {#each getStyledSegments(cue.plainText, cue.spans || []) as segment}
                    <!-- Helper function for text decoration since we need both underline and line-through -->
                    {@const textDecoration = (() => {
                        const lines = [];
                        if (segment.style.underline) lines.push("underline");
                        if (segment.style.lineThrough)
                            lines.push("line-through");
                        return lines.length > 0 ? lines.join(" ") : "none";
                    })()}

                    {@const styles = `
                        font-weight: ${segment.style.fontWeight || "normal"};
                        font-style: ${segment.style.italic ? "italic" : "normal"};
                        text-decoration: ${textDecoration};
                        color: ${segment.style.color || "inherit"};
                        font-family: ${segment.style.fontFamily || "inherit"};
                        white-space: pre;
                    `}

                    <span style={styles} class="subtitle-text">
                        {#if segment.style.rubyEnabled}
                            {@html (() => {
                                // Simple regex for [Base/Ruby]
                                return segment.text.replace(
                                    /\[(.*?)\/(.*?)\]/g,
                                    "<ruby>$1<rt>$2</rt></ruby>",
                                );
                            })()}
                        {:else}
                            {segment.text}
                        {/if}
                    </span>
                {/each}
            {/if}
        </div>
    {/each}
</div>

<style>
    .overlay-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
        z-index: 10;
    }
    .cue-line {
        position: absolute;
        display: block;
        width: fit-content;
        min-width: max-content;
        white-space: pre; /* Support newlines, no auto-wrap */
        pointer-events: auto;
        cursor: grab;
        padding: 4px 8px;
        border-radius: 4px;
        border: 2px solid transparent;
        transition: border-color 0.15s;
        overflow: visible;
    }
    .cue-line:hover {
        border-color: rgba(255, 255, 255, 0.4);
    }
    .cue-line.selected {
        border-color: var(--accent, #4a90e2);
        box-shadow: 0 0 8px rgba(74, 144, 226, 0.5);
    }
    .cue-line:active {
        cursor: grabbing;
    }
    .subtitle-text {
        color: inherit;
        font-family: sans-serif;
        line-height: 1.2;
        white-space: pre; /* Ensure consistency for wrappedText and segments */
    }

    .rotate-handle {
        position: absolute;
        top: -30px;
        left: 50%;
        transform: translateX(-50%);
        width: 2px;
        height: 30px;
        background: var(--accent, #4a90e2);
        cursor: grab;
        z-index: 100;
        display: flex;
        flex-direction: column;
        align-items: center;
        /* Prevent rotation of handle itself from messing up mouse calc? 
           No, it's inside the rotated div, so it rotates WITH the div. 
           This is actually good for visual feedback, but might make atan2 math tricky if not careful using client coords.
           We used client coords in logic, so it should be fine. */
    }
    .rotate-knob {
        width: 10px;
        height: 10px;
        background: #fff;
        border: 2px solid var(--accent, #4a90e2);
        border-radius: 50%;
        position: absolute;
        top: -5px; /* Half of knob size */
        cursor: grab;
    }
    .rotate-handle:active,
    .rotate-knob:active {
        cursor: grabbing;
    }
</style>
