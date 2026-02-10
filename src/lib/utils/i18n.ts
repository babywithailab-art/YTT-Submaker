import { settingsStore } from "../stores/settingsStore.svelte";

const translations = {
    ko: {
        open: "열기",
        save: "저장",
        saveAs: "다른 이름으로 저장...",
        importSub: "자막 가져오기...",
        exportSub: "자막 보내기...",
        addSub: "자막 추가",
        delete: "삭제",
        undo: "되돌리기",
        redo: "다시 실행",
        options: "옵션",
        language: "언어",
        theme: "테마",
        dark: "다크",
        light: "라이트",
        tracks: "트랙",
        addTrack: "+ 트랙"
    },
    en: {
        open: "Open",
        save: "Save",
        saveAs: "Save As...",
        importSub: "Import Sub...",
        exportSub: "Export Sub...",
        addSub: "Add Sub",
        delete: "Delete",
        undo: "Undo",
        redo: "Redo",
        options: "Options",
        language: "Language",
        theme: "Theme",
        dark: "Dark",
        light: "Light",
        tracks: "Tracks",
        addTrack: "+ Track"
    }
};

export type TranslationKey = keyof typeof translations.en;

export function t(key: TranslationKey): string {
    const lang = settingsStore.language;
    return translations[lang][key] || translations.en[key] || key;
}
