import { browser } from "$app/environment";

export type Language = "ko" | "en";
export type Theme = "dark" | "light";

class SettingsStore {
    language = $state<Language>("ko");
    theme = $state<Theme>("dark");

    constructor() {
        if (browser) {
            const savedLang = localStorage.getItem("ytt_language") as Language;
            const savedTheme = localStorage.getItem("ytt_theme") as Theme;
            if (savedLang) this.language = savedLang;
            if (savedTheme) this.theme = savedTheme;

            this.applyTheme();
        }

        $effect.root(() => {
            $effect(() => {
                if (browser) {
                    localStorage.setItem("ytt_language", this.language);
                    localStorage.setItem("ytt_theme", this.theme);
                    this.applyTheme();
                }
            });
        });
    }

    private applyTheme() {
        if (!browser) return;
        document.documentElement.classList.remove("theme-dark", "theme-light");
        document.documentElement.classList.add(`theme-${this.theme}`);

        // Also set a data attribute for CSS targeting if needed
        document.documentElement.setAttribute("data-theme", this.theme);
    }
}

export const settingsStore = new SettingsStore();
