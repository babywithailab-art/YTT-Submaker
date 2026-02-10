import { Command } from '@tauri-apps/plugin-shell';
import { readFile, remove, exists, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { projectStore } from '$lib/stores/projectStore.svelte';

interface AudioCache {
    [chunkIndex: number]: Float32Array;
}

class AudioEngine {
    private cache: AudioCache = {};
    private pendingRequests: Map<number, Promise<Float32Array>> = new Map();
    private videoPath: string | null = null;

    // Config
    private sampleRate = 8000;
    private CHUNK_SIZE_SEC = 30; // 30 seconds per chunk

    constructor() { }

    setVideoPath(path: string) {
        if (this.videoPath !== path) {
            this.videoPath = path;
            this.cache = {};
            this.pendingRequests.clear();
        }
    }

    async getWaveformData(startMs: number, endMs: number): Promise<Float32Array> {
        if (!this.videoPath) return new Float32Array(0);

        const startChunk = Math.floor(startMs / 1000 / this.CHUNK_SIZE_SEC);
        const endChunk = Math.floor(endMs / 1000 / this.CHUNK_SIZE_SEC);

        const promises: Promise<Float32Array>[] = [];
        for (let i = startChunk; i <= endChunk; i++) {
            promises.push(this.getChunk(i));
        }

        const chunks = await Promise.all(promises);

        // Merge chunks
        let totalLength = 0;
        chunks.forEach(c => totalLength += c.length);
        const merged = new Float32Array(totalLength);
        let offset = 0;
        chunks.forEach(c => {
            merged.set(c, offset);
            offset += c.length;
        });

        // Slice to requested range
        // Calculate offset of reqStart relative to first chunk start
        const firstChunkStartSec = startChunk * this.CHUNK_SIZE_SEC;
        const reqStartSec = startMs / 1000;
        const relativeStartSec = reqStartSec - firstChunkStartSec;

        const reqDurationSec = (endMs - startMs) / 1000;

        const startSample = Math.floor(relativeStartSec * this.sampleRate);
        const endSample = Math.floor((relativeStartSec + reqDurationSec) * this.sampleRate);

        // Boundary checks
        if (startSample >= merged.length) return new Float32Array(0);

        return merged.slice(startSample, Math.min(merged.length, endSample));
    }

    private getChunk(index: number): Promise<Float32Array> {
        if (this.cache[index]) {
            return Promise.resolve(this.cache[index]);
        }
        if (this.pendingRequests.has(index)) {
            return this.pendingRequests.get(index)!;
        }

        const promise = this.extractChunk(index).then(data => {
            if (data.length > 0) {
                this.cache[index] = data;
            }
            this.pendingRequests.delete(index);
            return data;
        });

        this.pendingRequests.set(index, promise);
        return promise;
    }

    private async extractChunk(index: number): Promise<Float32Array> {
        if (!this.videoPath) return new Float32Array(0);

        try {
            console.log("=== WAVEFORM ENGINE V2: START EXTRACTION ===");
            const baseDir: string = await invoke('get_exe_dir');
            console.log(`[Waveform] executableDir (custom): ${baseDir}`);
            const tempDirPath = await join(baseDir, 'temp');
            console.log(`[Waveform] Resolved Temp Dir: ${tempDirPath}`);

            try {
                console.log(`[Waveform] Attempting mkdir: ${tempDirPath}`);
                await mkdir(tempDirPath, { recursive: true });
                console.log(`[Waveform] mkdir success`);
            } catch (e: any) {
                console.log(`[Waveform] mkdir info/error: ${e?.message || e}`);
                // Continue, maybe it already exists
            }

            const tempFileName = `Waveform_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.wav`;
            const tempFilePath = await join(tempDirPath, tempFileName);
            console.log(`[Waveform] Target File Path: ${tempFilePath}`);

            const start = index * this.CHUNK_SIZE_SEC;
            const duration = this.CHUNK_SIZE_SEC;

            console.log(`[Waveform] Running FFmpeg for index ${index}...`);
            const command = Command.create('ffmpeg', [
                '-y',
                '-ss', start.toString(),
                '-i', this.videoPath,
                '-t', duration.toString(),
                '-ar', this.sampleRate.toString(),
                '-ac', '1',
                '-f', 'wav',
                tempFilePath
            ]);

            const output = await command.execute();

            if (output.code !== 0) {
                const error = `FFmpeg failed (code ${output.code}): ${output.stderr || 'No stderr output'}`;
                console.error(error);
                throw new Error(error);
            }
            console.log(`[Waveform] FFmpeg success, output code 0`);

            console.log(`[Waveform] Attempting to readFile: ${tempFilePath}`);
            let fileData;
            try {
                fileData = await readFile(tempFilePath);
                console.log(`[Waveform] readFile success, size: ${fileData.length}`);
            } catch (e: any) {
                console.error(`[Waveform] readFile FAILED: ${e?.message || e}`);
                throw e;
            }

            console.log(`[Waveform] Attempting to remove temp file: ${tempFilePath}`);
            remove(tempFilePath).catch((re) => {
                console.warn(`[Waveform] Cleanup failed: ${re?.message || re}`);
            });

            return await this.decodeWav(fileData);

        } catch (e: any) {
            console.error(`[Waveform] CRITICAL FAILURE in extractChunk ${index}:`, e);
            throw e;
        }
    }

    private async decodeWav(buffer: Uint8Array): Promise<Float32Array> {
        // Ensure we have a valid ArrayBuffer copy
        const arrayBuffer = (buffer.buffer as ArrayBuffer).slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return await this.decodeWebAudio(arrayBuffer);
    }

    private audioCtx: AudioContext | null = null;

    private async decodeWebAudio(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
        if (!this.audioCtx) {
            this.audioCtx = new AudioContext({ sampleRate: this.sampleRate });
        }
        try {
            const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
            return audioBuffer.getChannelData(0);
        } catch (e) {
            console.warn('WebAudio decode failed', e);
            return new Float32Array(0);
        }
    }
}

export const audioEngine = new AudioEngine();
