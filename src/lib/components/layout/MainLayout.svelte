<script lang="ts">
    let timelineHeight = $state(300);
    let sidebarWidth = $state(350);
    let isDraggingTimeline = $state(false);
    let isDraggingSidebar = $state(false);

    function handleTimelineDragStart(e: MouseEvent) {
        isDraggingTimeline = true;
        const startY = e.clientY;
        const startHeight = timelineHeight;

        function onMove(me: MouseEvent) {
            const delta = startY - me.clientY;
            timelineHeight = Math.max(100, Math.min(800, startHeight + delta));
        }

        function onUp() {
            isDraggingTimeline = false;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }

    function handleSidebarDragStart(e: MouseEvent) {
        isDraggingSidebar = true;
        const startX = e.clientX;
        const startWidth = sidebarWidth;

        function onMove(me: MouseEvent) {
            const delta = startX - me.clientX;
            sidebarWidth = Math.max(200, Math.min(600, startWidth + delta));
        }

        function onUp() {
            isDraggingSidebar = false;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }
</script>

<div class="app-container">
    <header class="toolbar">
        <slot name="toolbar"></slot>
    </header>

    <div class="main-area">
        <div class="preview-area">
            <slot name="preview">
                <div class="placeholder">Video Preview</div>
            </slot>
        </div>

        <!-- Sidebar Resize Handle -->
        <div
            class="resize-handle-v"
            class:active={isDraggingSidebar}
            onmousedown={handleSidebarDragStart}
            role="separator"
            tabindex="0"
            aria-orientation="vertical"
        ></div>

        <aside class="sidebar-area" style="width: {sidebarWidth}px;">
            <slot name="sidebar">
                <div class="placeholder">Inspector / Editor</div>
            </slot>
        </aside>
    </div>

    <!-- Timeline Resize Handle -->
    <div
        class="resize-handle-h"
        class:active={isDraggingTimeline}
        onmousedown={handleTimelineDragStart}
        role="separator"
        tabindex="0"
        aria-orientation="horizontal"
    ></div>

    <div class="timeline-area" style="height: {timelineHeight}px;">
        <slot name="timeline">
            <div class="placeholder">Timeline</div>
        </slot>
    </div>
</div>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        font-family: var(--font-ui);
        background: var(--bg-dark);
        color: var(--text-main);
    }

    .app-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 100vw;
        overflow: hidden;
    }

    .toolbar {
        height: 40px;
        background-color: var(--bg-header);
        border-bottom: 1px solid var(--border-dark);
        display: flex;
        align-items: center;
        padding: 0 1rem;
        gap: 1rem;
    }

    .logo {
        font-weight: bold;
        color: var(--accent);
    }

    .main-area {
        flex: 1;
        display: flex;
        overflow: hidden;
    }

    .preview-area {
        flex: 1;
        background-color: #000;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .sidebar-area {
        background-color: var(--bg-panel);
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        flex-shrink: 0;
    }

    .resize-handle-h {
        height: 5px;
        background: var(--border-dark);
        cursor: ns-resize;
        flex-shrink: 0;
        transition: background 0.15s;
    }

    .resize-handle-h:hover,
    .resize-handle-h.active {
        background: var(--accent);
    }

    .resize-handle-v {
        width: 5px;
        background: var(--border-dark);
        cursor: ew-resize;
        flex-shrink: 0;
        transition: background 0.15s;
    }

    .resize-handle-v:hover,
    .resize-handle-v.active {
        background: var(--accent);
    }

    .timeline-area {
        background-color: var(--timeline-track-bg);
        border-top: 1px solid var(--border-dark);
        overflow-x: hidden;
        flex-shrink: 0;
    }

    .placeholder {
        color: var(--text-muted);
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
    }
</style>
