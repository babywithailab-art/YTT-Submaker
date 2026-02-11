import type { Effect } from '../types';

export interface EffectParameter {
    id: string;
    label: string;
    type: 'number' | 'string' | 'color' | 'boolean';
    default: any;
    min?: number;
    max?: number;
    step?: number;
}

export interface EffectPlugin {
    type: string;
    label: string;
    description: string;
    category: 'color' | 'style' | 'other';
    parameters: EffectParameter[];
    apply: (params: Record<string, any>, context: { t: number; duration: number; text: string }) => {
        styles?: {
            filter?: string;
            transform?: string;
            opacity?: number;
            [key: string]: string | number | undefined;
        };
        className?: string; // CSS class name
        textWrapper?: (text: string) => string; // Optional: wrap or modify text
    };
}

class EffectRegistry {
    private plugins = new Map<string, EffectPlugin>();

    register(plugin: EffectPlugin) {
        this.plugins.set(plugin.type, plugin);
    }

    get(type: string) {
        return this.plugins.get(type);
    }

    getAll() {
        return Array.from(this.plugins.values());
    }
}

export const effectRegistry = new EffectRegistry();

// --- Built-in Plugins ---

// 1. Blur Effect
effectRegistry.register({
    type: 'blur',
    label: 'Blur',
    description: 'Applies a Gaussian blur to the text.',
    category: 'style',
    parameters: [
        { id: 'radius', label: 'Radius (px)', type: 'number', default: 2, min: 0, max: 20, step: 0.5 }
    ],
    apply: (params) => ({
        styles: {
            filter: `blur(${params.radius ?? 2}px)`
        }
    })
});

// 2. Shake Effect
effectRegistry.register({
    type: 'shake',
    label: 'Shake',
    description: 'Makes the text shake randomly.',
    category: 'style',
    parameters: [
        { id: 'intensity', label: 'Intensity', type: 'number', default: 5, min: 0, max: 50 },
        { id: 'speed', label: 'Speed', type: 'number', default: 10, min: 1, max: 100 }
    ],
    apply: (params, { t }) => {
        const intensity = params.intensity ?? 5;
        const speed = params.speed ?? 10;
        const seed = Math.sin(t * 0.01 * speed);
        const seed2 = Math.cos(t * 0.01 * speed * 1.3);
        const dx = seed * intensity;
        const dy = seed2 * intensity;
        return {
            styles: {
                transform: `translate(${dx}px, ${dy}px)`
            }
        };
    }
});

// 3. Fade In
effectRegistry.register({
    type: 'fade-in',
    label: 'Fade In',
    description: 'Fades the text in over time.',
    category: 'style',
    parameters: [
        { id: 'alpha', label: 'Alpha', type: 'number', default: 1, min: 0, max: 1, step: 0.1 }
    ],
    apply: (params) => ({
        styles: {
            opacity: params.alpha ?? 1
        }
    })
});

// 4. Fade Out
effectRegistry.register({
    type: 'fade-out',
    label: 'Fade Out',
    description: 'Fades the text out over time.',
    category: 'style',
    parameters: [
        { id: 'alpha', label: 'Alpha', type: 'number', default: 1, min: 0, max: 1, step: 0.1 }
    ],
    apply: (params) => ({
        styles: {
            opacity: params.alpha ?? 1
        }
    })
});

// 4. Typewriter Effect
effectRegistry.register({
    type: 'typewriter',
    label: 'Typewriter',
    description: 'Shows text one character at a time.',
    category: 'style',
    parameters: [
        { id: 'speed', label: 'Chars/Sec', type: 'number', default: 10, min: 1, max: 100 }
    ],
    apply: (params, { t, text }) => {
        const speed = params.speed ?? 10;
        const charCount = Math.floor((t / 1000) * speed);
        const visibleText = text.slice(0, charCount);
        const invisibleText = text.slice(charCount);

        return {
            textWrapper: () => {
                return `<span>${visibleText}</span><span style="opacity: 0">${invisibleText}</span>`;
            }
        };
    }
});
// 5. Slide In
effectRegistry.register({
    type: 'slide-in',
    label: 'Slide In',
    description: 'Slides text in from the bottom.',
    category: 'style',
    parameters: [
        { id: 'y', label: 'Vertical Offset (%)', type: 'number', default: 0, min: -100, max: 100 }
    ],
    apply: (params) => ({
        styles: {
            transform: `translateY(${params.y ?? 0}%)`
        }
    })
});

// 6. Slide Out
effectRegistry.register({
    type: 'slide-out',
    label: 'Slide Out',
    description: 'Slides text out to the bottom.',
    category: 'style',
    parameters: [
        { id: 'y', label: 'Vertical Offset (%)', type: 'number', default: 0, min: -100, max: 100 }
    ],
    apply: (params) => ({
        styles: {
            transform: `translateY(${params.y ?? 0}%)`
        }
    })
});

// 7. Zoom In
effectRegistry.register({
    type: 'zoom-in',
    label: 'Zoom In',
    description: 'Zooms text in from a scale.',
    category: 'style',
    parameters: [
        { id: 'scale', label: 'Scale', type: 'number', default: 1, min: 0, max: 5, step: 0.1 }
    ],
    apply: (params) => ({
        styles: {
            transform: `scale(${params.scale ?? 1})`
        }
    })
});

// 8. Zoom Out
effectRegistry.register({
    type: 'zoom-out',
    label: 'Zoom Out',
    description: 'Zooms text out to a scale.',
    category: 'style',
    parameters: [
        { id: 'scale', label: 'Scale', type: 'number', default: 1, min: 0, max: 5, step: 0.1 }
    ],
    apply: (params) => ({
        styles: {
            transform: `scale(${params.scale ?? 1})`
        }
    })
});

// 9. Blur In/Reveal
effectRegistry.register({
    type: 'blur-in',
    label: 'Blur In',
    description: 'Starts blurred and clears up.',
    category: 'style',
    parameters: [
        { id: 'radius', label: 'Blur Radius', type: 'number', default: 0, min: 0, max: 50 }
    ],
    apply: (params) => ({
        styles: {
            filter: `blur(${params.radius ?? 0}px)`
        }
    })
});

// 10. Blur Out
effectRegistry.register({
    type: 'blur-out',
    label: 'Blur Out',
    description: 'Becomes blurred over time.',
    category: 'style',
    parameters: [
        { id: 'radius', label: 'Blur Radius', type: 'number', default: 0, min: 0, max: 50 }
    ],
    apply: (params) => ({
        styles: {
            filter: `blur(${params.radius ?? 0}px)`
        }
    })
});
// 11. Glitch Effect
effectRegistry.register({
    type: 'glitch',
    label: 'Glitch',
    description: 'Adds a digital glitch distortion effect.',
    category: 'color',
    parameters: [
        { id: 'intensity', label: 'Jitter Amount', type: 'number', default: 5, min: 0, max: 20 },
        { id: 'jitterX', label: 'Jitter X Range', type: 'number', default: 5, min: 0, max: 50 },
        { id: 'jitterY', label: 'Jitter Y Range', type: 'number', default: 2, min: 0, max: 50 },
        { id: 'frequency', label: 'Frequency', type: 'number', default: 10, min: 1, max: 100 },
        { id: 'color1', label: 'Red Layer', type: 'color', default: '#ff00c1' },
        { id: 'color2', label: 'Cyan Layer', type: 'color', default: '#00fff9' },
        { id: 'color3', label: 'Center Layer', type: 'color', default: '#ffffff' }
    ],
    apply: (params, { t }) => {
        const intensity = params.intensity ?? 5;
        const jX = params.jitterX ?? 5;
        const jY = params.jitterY ?? 2;
        const freq = params.frequency ?? 10;
        const c1 = params.color1 ?? '#ff00c1';
        const c2 = params.color2 ?? '#00fff9';

        const active = Math.sin(t * 0.05 * freq) > 0.8;
        if (!active) return {};

        const offset1X = (Math.random() - 0.5) * jX * (intensity / 5);
        const offset2X = (Math.random() - 0.5) * jX * (intensity / 5);
        const offsetY = (Math.random() - 0.5) * jY * (intensity / 5);

        return {
            styles: {
                'text-shadow': `${offset1X}px 0 ${c1}, ${offset2X}px 0 ${c2}`,
                transform: `translate(${(Math.random() - 0.5) * jX}px, ${offsetY}px)`
            }
        };
    }
});

// 12. Pulse Effect
effectRegistry.register({
    type: 'pulse',
    label: 'Pulse',
    description: 'Makes the text pulse in and out.',
    category: 'style',
    parameters: [
        { id: 'intensity', label: 'Scale Range', type: 'number', default: 0.1, min: 0, max: 0.5, step: 0.01 },
        { id: 'speed', label: 'Speed', type: 'number', default: 5, min: 1, max: 20 }
    ],
    apply: (params, { t }) => {
        const intensity = params.intensity ?? 0.1;
        const speed = params.speed ?? 5;
        const scale = 1 + Math.sin(t * 0.005 * speed) * intensity;
        return {
            styles: {
                transform: `scale(${scale})`
            }
        };
    }
});

// 13. Flicker Effect
effectRegistry.register({
    type: 'flicker',
    label: 'Flicker',
    description: 'Makes the text flicker randomly.',
    category: 'style',
    parameters: [
        { id: 'intensity', label: 'Intensity', type: 'number', default: 0.5, min: 0, max: 1, step: 0.1 },
        { id: 'speed', label: 'Speed', type: 'number', default: 10, min: 1, max: 50 }
    ],
    apply: (params, { t }) => {
        const intensity = params.intensity ?? 0.5;
        const speed = params.speed ?? 10;
        const val = Math.sin(t * 0.01 * speed);
        const opacity = val > (1 - intensity) ? 1 : (1 - intensity);
        return {
            styles: {
                opacity
            }
        };
    }
});

// 14. Neon Glow
effectRegistry.register({
    type: 'neon',
    label: 'Neon Glow',
    description: 'Adds a bright neon glow effect.',
    category: 'color',
    parameters: [
        { id: 'intensity', label: 'Effect Application', type: 'number', default: 100, min: 0, max: 100 },
        { id: 'color', label: 'Glow Color', type: 'color', default: '#00ffff' },
        { id: 'blur', label: 'Glow Size', type: 'number', default: 10, min: 2, max: 50 }
    ],
    apply: (params) => {
        const intensity = (params.intensity ?? 100) / 100;
        const color = params.color ?? '#00ffff';
        const blur = (params.blur ?? 10) * intensity;

        if (intensity <= 0) return {};

        return {
            styles: {
                'text-shadow': `0 0 ${blur / 2}px rgba(255,255,255,${intensity}), 0 0 ${blur}px ${color}, 0 0 ${blur * 1.5}px ${color}, 0 0 ${blur * 2}px ${color}`
            }
        };
    }
});


