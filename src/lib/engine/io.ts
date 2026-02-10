
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { projectStore } from '../stores/projectStore.svelte';
import type { Project } from '../types';

export async function saveProject(forceSaveAs: boolean = false, project?: Project): Promise<boolean> {
    const currentProject = project || projectStore.project;
    if (!currentProject) return false;

    let path = projectStore.filePath;

    if (!path || forceSaveAs) {
        path = await save({
            filters: [{
                name: 'YTT Project',
                extensions: ['yttproj']
            }],
            defaultPath: currentProject.name
        });
    }

    if (!path) {
        return false; // User cancelled
    }

    try {
        const data = JSON.stringify(currentProject, null, 2);
        await writeTextFile(path, data);
        projectStore.setFilePath(path);
        // Update project name from filename? Optional.
        return true;
    } catch (e) {
        console.error('Failed to save project:', e);
        return false;
    }
}

export async function loadProject(): Promise<boolean> {
    const path = await open({
        multiple: false,
        filters: [{
            name: 'YTT Project',
            extensions: ['yttproj']
        }]
    });

    if (!path) return false;

    try {
        const data = await readTextFile(path);
        const project: Project = JSON.parse(data);

        // Basic validation or migration could go here

        projectStore.loadProject(project);
        projectStore.setFilePath(path);
        return true;
    } catch (e) {
        return false;
    }
}

export async function loadMedia(): Promise<boolean> {
    try {
        const file = await open({
            multiple: false,
            filters: [{
                name: 'Video',
                extensions: ['mp4', 'mkv', 'webm', 'mov']
            }]
        });

        if (file && typeof file === 'string') {
            // Set 0 duration initially, let player update it
            projectStore.setMedia(file, 0);
            return true;
        }
    } catch (e) {
        console.error('Failed to load media:', e);
    }
    return false;
}

import { parseSRT, parseASS } from '$lib/utils/subtitleParser';

export async function importSubtitle() {
    try {
        const file = await open({
            multiple: false,
            filters: [{
                name: 'Subtitle',
                extensions: ['srt', 'ass']
            }]
        });

        if (file && typeof file === 'string') {
            const content = await readTextFile(file);
            let cues: any[] = [];

            if (file.toLowerCase().endsWith('.srt')) {
                cues = parseSRT(content);
            } else if (file.toLowerCase().endsWith('.ass')) {
                cues = parseASS(content);
            }

            if (cues.length > 0) {
                // Add a new track with filename
                // Need to extract filename from path first
                // Basic split for now
                const filename = file.split(/[\\/]/).pop() || 'Imported Subtitle';

                // We add track using store
                projectStore.addTrack(filename);
                const track = projectStore.project.tracks[projectStore.project.tracks.length - 1]; // Get last added

                // Add all cues
                cues.forEach(c => {
                    projectStore.addCue(track.id, c.startMs, c.endMs, c.text);
                });

                return true;
            }
        }
    } catch (e) {
        console.error('Failed to import subtitle:', e);
    }
    return false;
}

import { cuesToSRT, cuesToASS, cuesToYTT } from '$lib/utils/subtitleParser';

export async function exportSubtitle() {
    const trackId = projectStore.selectedTrackId ?? projectStore.project?.tracks[0]?.id;
    if (!trackId) {
        console.warn('No track to export');
        return false;
    }

    const track = projectStore.project.tracks.find(t => t.id === trackId);
    if (!track) return false;

    if (track.excludeFromExport) {
        console.warn('Track is excluded from export');
        // Optional: show a message to the user?
    }

    const path = await save({
        filters: [{
            name: 'Subtitle',
            extensions: ['srt', 'ass', 'ytt', 'srv3']
        }],
        defaultPath: track.name
    });

    if (path) {
        let content = '';
        const lowerPath = path.toLowerCase();
        if (lowerPath.endsWith('.srt')) {
            content = cuesToSRT(track.cues);
        } else if (lowerPath.endsWith('.ass')) {
            content = cuesToASS(track.cues, projectStore.project.name);
        } else if (lowerPath.endsWith('.ytt') || lowerPath.endsWith('.srv3')) {
            content = cuesToYTT(track.cues);
        }

        if (content) {
            await writeTextFile(path, content);
            return true;
        }
    }
    return false;
}
