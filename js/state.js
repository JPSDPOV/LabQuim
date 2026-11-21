// Estado global compartido y utilidades de seguridad/red para LabQuim
export const GITHUB_RAW_URL = "https://raw.githubusercontent.com/JPSDPOV/LabQuim/main/labquim.json";

export const state = {
    reactionsBaseUrl: "./reactions/",
    cacheVersion: "3.1.1",
    atomColors: {
        'C': { bg: '#1e293b', border: '#94a3b8', text: '#f8fafc', r: 19 }
    },
    animDuration: 4200,
    animFrameId: null,
    lastSceneState: null,
    currentPrevSceneForScrub: null,
    currentTargetSceneForScrub: null,
    functionCatalog: [],
    functionMenus: {},
    unitFiles: {},
    loadedUnitUrls: new Set(),
    loadedReactions: new Set(),
    labData: {},
    currentFunction: '',
    currentCategory: '',
    currentKey: '',
    currentSubIdx: 0,
    currentCatIdx: 0,
    currentStepIdx: 0,
    autoPlayTimer: null,
    isStageFullscreen: false,
    isStageLightMode: false,
    wizardStage: 1
};

export function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function escSvg(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function parseFlexibleJson(rawText) {
    let cleaned = String(rawText || '').trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleaned);
}

export function isCompactMobile() {
    return window.innerWidth < 640 && !state.isStageFullscreen;
}

export function normalizeSearchText(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}
