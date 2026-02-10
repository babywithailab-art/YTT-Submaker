<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { X, Pipette } from "lucide-svelte";

    let { initialColor = "#ffffff", recentColors = [] } = $props<{
        initialColor?: string;
        recentColors?: string[];
    }>();

    const dispatch = createEventDispatcher();

    // State
    let color = $state(initialColor);
    let r = $state(255);
    let g = $state(255);
    let b = $state(255);

    // HSV State (0-360, 0-1, 0-1)
    let h = $state(0);
    let s = $state(0);
    let v = $state(1);

    let spectrumEl = $state<HTMLElement>();
    let hueSliderEl = $state<HTMLElement>();

    // Initial sync
    $effect(() => {
        if (initialColor) {
            color = initialColor;
            parseHex(initialColor);
        }
    });

    function parseHex(hexStr: string) {
        const hex = hexStr.replace("#", "");
        if (hex.length === 6) {
            const nr = parseInt(hex.substring(0, 2), 16);
            const ng = parseInt(hex.substring(2, 4), 16);
            const nb = parseInt(hex.substring(4, 6), 16);
            r = nr;
            g = ng;
            b = nb;
            updateHSVFromRGB();
        }
    }

    function updateHSVFromRGB() {
        const { h: nh, s: ns, v: nv } = rgbToHsv(r, g, b);
        h = nh;
        s = ns;
        v = nv;
    }

    function updateRGBFromHSV() {
        const { r: nr, g: ng, b: nb } = hsvToRgb(h, s, v);
        r = nr;
        g = ng;
        b = nb;
        updateHex();
    }

    function updateHex() {
        const toHex = (n: number) => n.toString(16).padStart(2, "0");
        color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    // Converters
    function rgbToHsv(r: number, g: number, b: number) {
        const rNorm = r / 255,
            gNorm = g / 255,
            bNorm = b / 255;
        const max = Math.max(rNorm, gNorm, bNorm),
            min = Math.min(rNorm, gNorm, bNorm);
        const d = max - min;
        let h = 0;
        const s = max === 0 ? 0 : d / max;
        const v = max;

        if (d !== 0) {
            switch (max) {
                case rNorm:
                    h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
                    break;
                case gNorm:
                    h = (bNorm - rNorm) / d + 2;
                    break;
                case bNorm:
                    h = (rNorm - gNorm) / d + 4;
                    break;
            }
            h /= 6;
        }
        return { h: h * 360, s, v };
    }

    function hsvToRgb(h: number, s: number, v: number) {
        const i = Math.floor(h / 60);
        const f = h / 60 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        let r = 0,
            g = 0,
            b = 0;
        switch (i % 6) {
            case 0:
                r = v;
                g = t;
                b = p;
                break;
            case 1:
                r = q;
                g = v;
                b = p;
                break;
            case 2:
                r = p;
                g = v;
                b = t;
                break;
            case 3:
                r = p;
                g = q;
                b = v;
                break;
            case 4:
                r = t;
                g = p;
                b = v;
                break;
            case 5:
                r = v;
                g = p;
                b = q;
                break;
        }
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255),
        };
    }

    // Interaction
    function handleSpectrumMouseDown(e: MouseEvent) {
        e.preventDefault();
        function onMove(me: MouseEvent) {
            if (!spectrumEl) return;
            const rect = spectrumEl.getBoundingClientRect();
            s = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
            v = Math.max(
                0,
                Math.min(1, 1 - (me.clientY - rect.top) / rect.height),
            );
            updateRGBFromHSV();
        }
        function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        }
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        onMove(e);
    }

    function handleHueMouseDown(e: MouseEvent) {
        e.preventDefault();
        function onMove(me: MouseEvent) {
            if (!hueSliderEl) return;
            const rect = hueSliderEl.getBoundingClientRect();
            h = Math.max(
                0,
                Math.min(359, ((me.clientY - rect.top) / rect.height) * 360),
            );
            updateRGBFromHSV();
        }
        function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        }
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        onMove(e);
    }

    function handleOk() {
        dispatch("select", { color });
    }
    function handleCancel() {
        dispatch("cancel");
    }

    async function pickColor() {
        if (!("EyeDropper" in window)) return alert("Not supported");
        const eyeDropper = new (window as any).EyeDropper();
        try {
            const result = await eyeDropper.open();
            color = result.sRGBHex;
            parseHex(color);
        } catch (err) {}
    }

    function selectRecent(c: string) {
        color = c;
        parseHex(c);
    }

    let assHex = $derived.by(() => {
        const toHex = (n: number) =>
            n.toString(16).padStart(2, "0").toUpperCase();
        return `&H${toHex(b)}${toHex(g)}${toHex(r)}&`;
    });

    let hueRgb = $derived(hsvToRgb(h, 1, 1));
    let hueColor = $derived(`rgb(${hueRgb.r}, ${hueRgb.g}, ${hueRgb.b})`);
</script>

<div class="color-picker-window">
    <div class="header">
        <span>Color Spectrum</span>
        <button class="close-btn" onclick={handleCancel}><X size={14} /></button
        >
    </div>

    <div class="main-layout">
        <div class="spectrum-container">
            <div
                class="spectrum-box"
                bind:this={spectrumEl}
                onmousedown={handleSpectrumMouseDown}
                style="background-color: {hueColor}"
                role="button"
                tabindex="0"
                aria-label="Color spectrum"
            >
                <div class="spectrum-gradient"></div>
                <div
                    class="spectrum-cursor"
                    style="left: {s * 100}%; top: {(1 - v) * 100}%"
                ></div>
            </div>

            <div
                class="hue-slider"
                bind:this={hueSliderEl}
                onmousedown={handleHueMouseDown}
                role="slider"
                tabindex="0"
                aria-valuenow={h}
                aria-valuemin="0"
                aria-valuemax="360"
            >
                <div class="hue-cursor" style="top: {(h / 360) * 100}%"></div>
            </div>
        </div>

        <div class="controls-container">
            <section class="rgb-section">
                <h3>RGB Color</h3>
                <div class="input-grid">
                    <label for="cp-r">Red:</label>
                    <input
                        id="cp-r"
                        type="number"
                        bind:value={r}
                        oninput={() => {
                            updateHex();
                            updateHSVFromRGB();
                        }}
                        min="0"
                        max="255"
                    />
                    <label for="cp-g">Green:</label>
                    <input
                        id="cp-g"
                        type="number"
                        bind:value={g}
                        oninput={() => {
                            updateHex();
                            updateHSVFromRGB();
                        }}
                        min="0"
                        max="255"
                    />
                    <label for="cp-b">Blue:</label>
                    <input
                        id="cp-b"
                        type="number"
                        bind:value={b}
                        oninput={() => {
                            updateHex();
                            updateHSVFromRGB();
                        }}
                        min="0"
                        max="255"
                    />
                </div>
                <div class="hex-codes">
                    <div class="code-row">
                        <label for="cp-ass">ASS:</label>
                        <input
                            id="cp-ass"
                            type="text"
                            readonly
                            value={assHex}
                        />
                    </div>
                    <div class="code-row">
                        <label for="cp-html">HTML:</label>
                        <input
                            id="cp-html"
                            type="text"
                            value={color}
                            oninput={(e) =>
                                parseHex((e.target as HTMLInputElement).value)}
                        />
                    </div>
                </div>
            </section>

            <div class="preview-tools">
                <button class="eyedropper" onclick={pickColor}
                    ><Pipette size={24} /></button
                >
                <div class="color-preview" style="background: {color}"></div>
            </div>

            <section class="recent-section">
                <h3>Recent Colors</h3>
                <div class="recent-grid">
                    {#each recentColors as rc}
                        <button
                            class="recent-item"
                            style="background: {rc}"
                            onclick={() => selectRecent(rc)}
                            aria-label="Select color {rc}"
                        ></button>
                    {/each}
                    {#each Array(Math.max(0, 16 - recentColors.length)) as _}
                        <div class="recent-item empty"></div>
                    {/each}
                </div>
            </section>
        </div>
    </div>

    <div class="footer">
        <button class="dialog-btn ok" onclick={handleOk}>OK</button>
        <button class="dialog-btn cancel" onclick={handleCancel}>Cancel</button>
    </div>
</div>

<style>
    .color-picker-window {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 600px;
        background: #f0f0f0;
        border: 1px solid #999;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        color: #333;
        font-family: sans-serif;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        padding: 4px;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        background: #fff;
        font-size: 12px;
        border-bottom: 1px solid #ddd;
    }
    .close-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px;
    }

    .main-layout {
        display: flex;
        gap: 12px;
        padding: 12px;
        flex: 1;
    }

    .spectrum-container {
        flex: 1;
        display: flex;
        gap: 8px;
    }
    .spectrum-box {
        flex: 1;
        height: 256px;
        border: 1px solid #999;
        position: relative;
        cursor: crosshair;
        overflow: hidden;
    }
    .spectrum-gradient {
        width: 100%;
        height: 100%;
        background: linear-gradient(to top, #000, transparent),
            linear-gradient(to right, #fff, transparent);
    }
    .spectrum-cursor {
        position: absolute;
        width: 12px;
        height: 12px;
        border: 2px solid #fff;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
        pointer-events: none;
    }
    .hue-slider {
        width: 20px;
        height: 256px;
        background: linear-gradient(
            to bottom,
            #f00 0%,
            #ff0 17%,
            #0f0 33%,
            #0ff 50%,
            #00f 67%,
            #f0f 83%,
            #f00 100%
        );
        border: 1px solid #999;
        position: relative;
        cursor: crosshair;
    }
    .hue-cursor {
        position: absolute;
        width: 100%;
        height: 4px;
        background: white;
        border: 1px solid #000;
        left: 0;
        transform: translateY(-50%);
        pointer-events: none;
    }

    .controls-container {
        width: 280px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    h3 {
        font-size: 11px;
        margin: 0 0 8px 0;
        color: #666;
        border-bottom: 1px solid #ddd;
        padding-bottom: 2px;
    }

    .input-grid {
        display: grid;
        grid-template-columns: 50px 1fr;
        gap: 4px;
        align-items: center;
        font-size: 12px;
    }
    input[type="number"] {
        width: 60px;
        padding: 2px;
        border: 1px solid #999;
    }

    .hex-codes {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .code-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
    }
    .code-row input {
        flex: 1;
        padding: 2px;
        background: #fff;
        border: 1px solid #999;
    }

    .preview-tools {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-top: 8px;
    }
    .eyedropper {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #fff;
        border: 1px solid #999;
        cursor: pointer;
    }
    .color-preview {
        flex: 1;
        height: 48px;
        border: 1px solid #999;
    }

    .recent-section {
        margin-top: auto;
    }
    .recent-grid {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 2px;
    }
    .recent-item {
        aspect-ratio: 1;
        border: 1px solid #999;
        cursor: pointer;
    }
    .recent-item.empty {
        background: #ddd;
    }

    .footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 8px;
        border-top: 1px solid #ddd;
    }
    .dialog-btn {
        padding: 4px 16px;
        border: 1px solid #999;
        background: #fff;
        cursor: pointer;
        font-size: 12px;
    }
    .dialog-btn:hover {
        background: #eee;
    }
    .dialog-btn.ok {
        background: #4a90e2;
        color: #fff;
        border-color: #357abd;
    }
</style>
