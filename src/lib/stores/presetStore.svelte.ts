
import type { KeyframeTrack, Effect } from '../types';

export interface AnimationPreset {
    id: string;
    name: string;
    animTracks: KeyframeTrack<any>[];
    effects: Effect[];
}

export class PresetStore {
    presets = $state<AnimationPreset[]>([]);

    constructor() {
        this.loadFromLocalStorage();
    }

    savePreset(name: string, animTracks: KeyframeTrack<any>[], effects: Effect[]) {
        const preset: AnimationPreset = {
            id: crypto.randomUUID(),
            name,
            animTracks: JSON.parse(JSON.stringify(animTracks)),
            effects: JSON.parse(JSON.stringify(effects))
        };
        this.presets.push(preset);
        this.saveToLocalStorage();
    }

    deletePreset(id: string) {
        this.presets = this.presets.filter(p => p.id !== id);
        this.saveToLocalStorage();
    }

    private saveToLocalStorage() {
        if (typeof window !== 'undefined') {
            localStorage.setItem('ytt_animation_presets', JSON.stringify(this.presets));
        }
    }

    private loadFromLocalStorage() {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('ytt_animation_presets');
            if (stored) {
                try {
                    this.presets = JSON.parse(stored);
                } catch (e) {
                    console.error('Failed to load presets', e);
                }
            }
        }
    }
}

export const presetStore = new PresetStore();
