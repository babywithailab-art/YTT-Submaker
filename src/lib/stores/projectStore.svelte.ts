
import type { Project, Track, Cue, StyleProps } from '../types';

function createDefaultProject(): Project {
    return {
        projectId: crypto.randomUUID(),
        name: 'New Project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        media: {
            videoPath: '',
            durationMs: 0
        },
        tracks: [],
        appLayout: {
            panels: {}
        }
    };
}

export class ProjectStore {
    project = $state<Project>(createDefaultProject());
    currentTime = $state(0);
    isPlaying = $state(false);
    filePath = $state<string | null>(null);

    // Selection
    selectedTrackId = $state<string | null>(null);
    selectedCueIds = $state<Set<string>>(new Set());
    recentColors = $state<string[]>([]);

    constructor() {
    }

    // --- Actions ---

    loadProject(newProject: Project) {
        this.project = newProject;
        this.selectedTrackId = null;
        this.selectedCueIds = new Set();
        this.currentTime = 0;
        this.isPlaying = false;
        this.filePath = null;
    }

    setFilePath(path: string | null) {
        this.filePath = path;
    }

    setMedia(videoPath: string, durationMs: number) {
        this.project.media.videoPath = videoPath;
        this.project.media.durationMs = durationMs;
        this.project.updatedAt = new Date().toISOString();
    }

    addTrack(name: string = 'New Track') {
        const track: Track = {
            id: crypto.randomUUID(),
            name,
            order: this.project.tracks.length,
            visible: true,
            locked: false,
            transform: { xNorm: 0.5, yNorm: 0.8, anchor: 7, scale: 1, rotation: 0 },
            defaultStyle: { fontSize: 24, color: '#ffffff' },
            trackEffects: [],
            height: 40,
            cues: [],
            animTracks: [],
            excludeFromExport: false,
            magnetEnabled: false
        };
        this.project.tracks.push(track);
        this.selectedTrackId = track.id;
        this.project.updatedAt = new Date().toISOString();
    }

    addCue(trackId: string, startMs: number, endMs: number, text: string = ''): Cue | null {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (!track) return null;

        const cue: Cue = {
            id: crypto.randomUUID(),
            startMs,
            endMs,
            plainText: text,
            spans: [],
            effects: [],
            animTracks: []
        };
        track.cues.push(cue);
        track.cues.sort((a, b) => a.startMs - b.startMs);

        this.selectedCueIds = new Set([cue.id]);
        this.project.updatedAt = new Date().toISOString();
        return cue;
    }

    restoreCue(trackId: string, cue: Cue) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (!track) return;

        // Double check it's not already there
        if (track.cues.some(c => c.id === cue.id)) return;

        track.cues.push(cue);
        track.cues.sort((a, b) => a.startMs - b.startMs);
        this.project.updatedAt = new Date().toISOString();
    }

    removeCue(trackId: string, cueId: string) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (!track) return;
        track.cues = track.cues.filter(c => c.id !== cueId);
        this.project.updatedAt = new Date().toISOString();
    }

    updateCue(trackId: string, cueId: string, updates: Partial<Cue>) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (!track) return;
        const cue = track.cues.find(c => c.id === cueId);
        if (!cue) return;

        Object.assign(cue, updates);

        if (updates.startMs !== undefined || updates.endMs !== undefined) {
            track.cues.sort((a, b) => a.startMs - b.startMs);
        }
        this.project.updatedAt = new Date().toISOString();
    }

    setTime(t: number) {
        this.currentTime = t;
    }

    setIsPlaying(playing: boolean) {
        this.isPlaying = playing;
    }

    // --- Keyframes ---

    addKeyframe(trackId: string, paramPath: string, keyframe: any, cueId?: string) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (!track) return;

        let target: Track | Cue = track;
        if (cueId) {
            const cue = track.cues.find(c => c.id === cueId);
            if (cue) target = cue;
        }

        let animTrack = target.animTracks.find(a => a.paramPath === paramPath);
        if (!animTrack) {
            animTrack = {
                paramPath,
                targetId: cueId || trackId,
                keyframes: [],
                enabled: true,
                defaultValue: typeof keyframe.value === 'number' ? keyframe.value : 0
            };
            target.animTracks.push(animTrack);
        }

        const existingIdx = animTrack.keyframes.findIndex(k => Math.abs(k.tMs - keyframe.tMs) < 0.001);
        if (existingIdx !== -1) {
            animTrack.keyframes[existingIdx] = keyframe;
        } else {
            animTrack.keyframes.push(keyframe);
        }

        animTrack.keyframes.sort((a, b) => a.tMs - b.tMs);
        this.project.updatedAt = new Date().toISOString();
    }

    removeKeyframe(trackId: string, paramPath: string, tMs: number, cueId?: string) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (!track) return;

        let target: Track | Cue = track;
        if (cueId) {
            const cue = track.cues.find(c => c.id === cueId);
            if (cue) target = cue;
        }

        const animTrack = target.animTracks.find(a => a.paramPath === paramPath);
        if (!animTrack) return;

        animTrack.keyframes = animTrack.keyframes.filter(k => Math.abs(k.tMs - tMs) >= 0.001);
        this.project.updatedAt = new Date().toISOString();
    }

    updateRecentColors(color: string) {
        if (!this.recentColors.includes(color)) {
            this.recentColors = [color, ...this.recentColors].slice(0, 16);
        }
    }

    updateKeyframe(trackId: string, paramPath: string, tMs: number, updates: any, cueId?: string) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (!track) return;

        let target: Track | Cue = track;
        if (cueId) {
            const cue = track.cues.find(c => c.id === cueId);
            if (cue) target = cue;
        }

        const animTrack = target.animTracks.find(a => a.paramPath === paramPath);
        if (!animTrack) return;

        const kf = animTrack.keyframes.find(k => Math.abs(k.tMs - tMs) < 0.001);
        if (kf) {
            Object.assign(kf, updates);
            this.project.updatedAt = new Date().toISOString();
        }
    }

    updateTrackHeight(trackId: string, height: number) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (track) {
            track.height = height;
            this.project.updatedAt = new Date().toISOString();
        }
    }

    removeTrack(trackId: string) {
        this.project.tracks = this.project.tracks.filter(t => t.id !== trackId);
        if (this.selectedTrackId === trackId) {
            this.selectedTrackId = null;
        }
        this.project.updatedAt = new Date().toISOString();
    }

    addTrackAt(track: Track, index: number) {
        this.project.tracks.splice(index, 0, track);
        this.project.updatedAt = new Date().toISOString();
    }

    toggleTrackExport(trackId: string) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (track) {
            track.excludeFromExport = !track.excludeFromExport;
            this.project.updatedAt = new Date().toISOString();
        }
    }

    toggleMagnet(trackId: string) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (track) {
            track.magnetEnabled = !track.magnetEnabled;
            this.project.updatedAt = new Date().toISOString();
        }
    }

    updateTrackStyle(trackId: string, style: Partial<StyleProps>) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (track) {
            track.defaultStyle = { ...track.defaultStyle, ...style };
            this.project.updatedAt = new Date().toISOString();
        }
    }

    updateCueStyle(trackId: string, cueId: string, style: any) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (!track) return;
        const cue = track.cues.find(c => c.id === cueId);
        if (cue) {
            cue.styleOverride = { ...(cue.styleOverride || {}), ...style };
            this.project.updatedAt = new Date().toISOString();
        }
    }

    toggleKeyframeTrack(trackId: string, paramPath: string, cueId?: string) {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (!track) return;
        let target: Track | Cue = track;
        if (cueId) {
            const cue = track.cues.find(c => c.id === cueId);
            if (cue) target = cue;
        }
        const existingIdx = target.animTracks.findIndex(a => a.paramPath === paramPath);
        if (existingIdx !== -1) {
            target.animTracks.splice(existingIdx, 1);
        } else {
            target.animTracks.push({
                paramPath,
                targetId: cueId || trackId,
                keyframes: [],
                enabled: true,
                defaultValue: 1 // Default for alpha
            });
        }
    }

    hasAnimation(trackId: string, paramPath: string, cueId?: string): boolean {
        const track = this.project.tracks.find(t => t.id === trackId);
        if (!track) return false;
        let target: Track | Cue = track;
        if (cueId) {
            const cue = track.cues.find(c => c.id === cueId);
            if (cue) target = cue;
        }
        return target.animTracks.some(a => a.paramPath === paramPath);
    }
}

export const projectStore = new ProjectStore();
