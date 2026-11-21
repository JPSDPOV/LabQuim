import { state, GITHUB_RAW_URL, parseFlexibleJson } from './state.js';
import { loadFormulaDictionary, expandStepsToVisualMicroSteps } from './chem-parser.js';
import { currentViewBox, renderInterpolatedFrame } from './svg-renderer.js';
import {
    openNomenclatureSetup,
    closeNomenclatureMode,
    toggleAllNomenclatureGroups,
    updateNomenclatureAvailableCount,
    startNomenclatureSession,
    prevNomenclatureCard,
    nextNomenclatureCard,
    initNomenclatureCardGestures,
    handleNomenclatureDynamicSearch,
    selectSearchedNomenclatureItem,
    clearNomenclatureSearch,
    toggleNomDirectSearchPanel,
    proceedToNomenclatureCountStep,
    backToNomenclatureGroupsStep,
    handleNomenclaturePracticeBack,
    finishNomenclatureSession,
    openCardFromSummary,
    flipNomenclatureCard,
    gradeNomenclatureCard,
    retryMissedNomenclature
} from './nomenclature.js';
import {
    EXAM_QUESTIONS_DB,
    mergeExamMenusIntoUnits,
    loadExternalExamsBank,
    renderFilteredUnitExams,
    handleHomeExamSearchAndFilter,
    clearHomeExamSearch,
    openSearchedExamQuestion,
    wizardSelectExamQuestion,
    selectExamOption,
    launchExamAnimatedExplanation,
    goToNextExamItem
} from './exams.js';

export function buildCandidateRawUrls(primaryUrl) {
    const urls = ['./labquim.json'];
    const clean = (primaryUrl || '').trim();
    if (clean) {
        urls.push(clean.replace('/refs/heads/', '/'));
        const ghMatch = clean.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?([^/]+)\/(.+)$/);
        if (ghMatch) {
            const [, user, repo, branch, filePath] = ghMatch;
            urls.push(`https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${filePath}`);
        }
    }
    return [...new Set(urls)];
}

export function buildCandidateReactionUrls(rxnKey) {
    const base = state.reactionsBaseUrl.endsWith('/') ? state.reactionsBaseUrl : `${state.reactionsBaseUrl}/`;
    const urls = [`./reactions/${rxnKey}.json`, `${base.replace('/refs/heads/', '/')}${rxnKey}.json`];
    const ghMatch = GITHUB_RAW_URL.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//);
    if (ghMatch) {
        const [, user, repo, branch] = ghMatch;
        urls.push(`https://raw.githubusercontent.com/${user}/${repo}/${branch}/reactions/${rxnKey}.json`);
    }
    return [...new Set(urls)];
}

function toggleStageLightMode() {
    state.isStageLightMode = !state.isStageLightMode;
    applyStageThemeUI();
    if (state.currentTargetSceneForScrub && !state.animFrameId) {
        renderInterpolatedFrame(state.currentPrevSceneForScrub || state.currentTargetSceneForScrub, state.currentTargetSceneForScrub, 1);
    }
}

function applyStageThemeUI() {
    const wrapper = document.getElementById('svgScrollWrapper');
    const bgBase = document.getElementById('svgBgBase');
    const bgGrid = document.getElementById('svgBgGrid');
    const iconEl = document.getElementById('stageThemeIcon');
    const textEl = document.getElementById('stageThemeText');
    const btnHeader = document.getElementById('btnToggleStageTheme');
    const floatBtn = document.getElementById('floatingStep1ThemeBtn');
    const floatIcon = document.getElementById('floatingThemeIcon');
    const floatLabel = document.getElementById('floatingThemeLabel');

    if (state.isStageLightMode) {
        if (wrapper) {
            wrapper.classList.remove('bg-slate-950');
            wrapper.classList.add('bg-white');
        }
        if (bgBase) bgBase.setAttribute('fill', '#ffffff');
        if (bgGrid) bgGrid.setAttribute('fill', 'url(#labGridLight)');
        if (iconEl) iconEl.innerText = '🌙';
        if (textEl) textEl.innerText = 'Fondo Oscuro';
        if (btnHeader) {
            btnHeader.className = 'px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-extrabold text-cyan-200 flex items-center gap-1.5 transition active:scale-95 cursor-pointer';
        }
        if (floatIcon) floatIcon.innerText = '🌙';
        if (floatLabel) floatLabel.innerText = 'Fondo Oscuro';
        if (floatBtn) {
            floatBtn.className = 'absolute top-3 right-3 z-20 px-3.5 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-200 text-xs font-extrabold shadow-lg flex items-center gap-1.5 transition active:scale-95 cursor-pointer';
        }
    } else {
        if (wrapper) {
            wrapper.classList.remove('bg-white');
            wrapper.classList.add('bg-slate-950');
        }
        if (bgBase) bgBase.setAttribute('fill', '#020617');
        if (bgGrid) bgGrid.setAttribute('fill', 'url(#labGrid)');
        if (iconEl) iconEl.innerText = '☀️';
        if (textEl) textEl.innerText = 'Fondo Blanco';
        if (btnHeader) {
            btnHeader.className = 'px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-xs font-extrabold text-amber-200 flex items-center gap-1.5 transition active:scale-95 cursor-pointer';
        }
        if (floatIcon) floatIcon.innerText = '☀️';
        if (floatLabel) floatLabel.innerText = 'Fondo Blanco';
        if (floatBtn) {
            floatBtn.className = 'absolute top-3 right-3 z-20 px-3.5 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-amber-400/60 text-amber-200 text-xs font-extrabold shadow-lg flex items-center gap-1.5 transition active:scale-95 cursor-pointer';
        }
    }
    if (floatBtn) {
        floatBtn.classList.toggle('hidden', state.currentStepIdx !== 0);
    }
}

function isForcedRotatedLandscape() {
    const playerScreen = document.getElementById('fullscreenPlayerScreen');
    return !!(
        state.isStageFullscreen &&
        playerScreen &&
        playerScreen.classList.contains('force-landscape-fallback') &&
        window.innerHeight > window.innerWidth
    );
}

function updateOrientationNotice() {
    const notice = document.getElementById('rotateDeviceBanner');
    const playerScreen = document.getElementById('fullscreenPlayerScreen');
    if (!playerScreen) return;
    const isPortrait = window.innerHeight > window.innerWidth;
    if (state.isStageFullscreen && isPortrait) {
        playerScreen.classList.add('force-landscape-fallback');
        if (notice) notice.classList.add('hidden');
    } else {
        playerScreen.classList.remove('force-landscape-fallback');
        if (notice) notice.classList.add('hidden');
    }
}

function toggleSideDrawer(side) {
    const leftDrawer = document.getElementById('drawerLeftParams');
    const rightDrawer = document.getElementById('drawerRightExplain');
    const backdrop = document.getElementById('drawerBackdrop');

    if (side === 'left') {
        const isOpen = !leftDrawer.classList.contains('-translate-x-full');
        closeAllDrawers();
        if (!isOpen) {
            leftDrawer.classList.remove('-translate-x-full');
            backdrop.classList.remove('hidden');
        }
    } else if (side === 'right') {
        const isOpen = !rightDrawer.classList.contains('translate-x-full');
        closeAllDrawers();
        if (!isOpen) {
            rightDrawer.classList.remove('translate-x-full');
            backdrop.classList.remove('hidden');
        }
    }
}

function closeAllDrawers() {
    const leftDrawer = document.getElementById('drawerLeftParams');
    const rightDrawer = document.getElementById('drawerRightExplain');
    const backdrop = document.getElementById('drawerBackdrop');
    if (leftDrawer) leftDrawer.classList.add('-translate-x-full');
    if (rightDrawer) rightDrawer.classList.add('translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
}

async function requestMandatoryFullscreenAndLandscape(targetEl) {
    const docEl = document.documentElement;
    for (const el of [targetEl, docEl]) {
        if (!el) continue;
        try {
            if (el.requestFullscreen && !document.fullscreenElement) {
                await el.requestFullscreen({ navigationUI: 'hide' });
                break;
            } else if (el.webkitRequestFullscreen && !document.webkitFullscreenElement) {
                await el.webkitRequestFullscreen();
                break;
            } else if (el.msRequestFullscreen && !document.msFullscreenElement) {
                await el.msRequestFullscreen();
                break;
            }
        } catch (e) {}
    }

    try {
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape');
        }
    } catch (e) {}
}

async function openFullscreenPlayer() {
    state.wizardStage = 5;
    state.isStageFullscreen = true;
    closeAllDrawers();

    const wizScreen = document.getElementById('wizardScreen');
    const playerScreen = document.getElementById('fullscreenPlayerScreen');
    if (wizScreen) wizScreen.classList.add('hidden');
    if (playerScreen) {
        playerScreen.classList.remove('hidden');
        playerScreen.classList.add('force-landscape-fallback');
    }
    document.body.style.overflow = 'hidden';

    await requestMandatoryFullscreenAndLandscape(playerScreen);

    updateOrientationNotice();
    renderFullLab(true);
}

async function exitFullscreenPlayerToWizard(targetStage = 4) {
    stopAutoPlay();
    closeAllDrawers();
    state.isStageFullscreen = false;

    const wizScreen = document.getElementById('wizardScreen');
    const playerScreen = document.getElementById('fullscreenPlayerScreen');
    if (playerScreen) {
        playerScreen.classList.add('hidden');
        playerScreen.classList.remove('force-landscape-fallback');
    }
    if (wizScreen) wizScreen.classList.remove('hidden');
    document.body.style.overflow = '';

    try {
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    } catch (e) {}

    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else if (document.webkitFullscreenElement) {
            await document.webkitExitFullscreen();
        }
    } catch (e) {}

    showWizardStage(targetStage);
}

function returnToReactionExamples() {
    exitFullscreenPlayerToWizard(4);
}

function returnToWizardHome() {
    state.currentFunction = '';
    state.currentCategory = '';
    state.currentKey = '';
    exitFullscreenPlayerToWizard(0);
}

function applyJsonPayload(payload) {
    if (!payload || typeof payload !== 'object') return;

    if (payload.appConfig && typeof payload.appConfig === 'object') {
        if (payload.appConfig.title) {
            const titleEl = document.getElementById('appMainTitle');
            if (titleEl) titleEl.innerText = payload.appConfig.title;
            document.title = payload.appConfig.title;
        }
        if (payload.appConfig.footerText || payload.appConfig.footerAuthor) {
            const footerEl = document.getElementById('appFooterText');
            if (footerEl) {
                const cleanBase = String(payload.appConfig.footerText || 'Laboratorio Virtual Interactivo de Química Orgánica')
                    .replace(/\s*•?\s*Compendio Definitivo Unidades 13 a 17\s*/gi, '')
                    .trim();
                const authorTxt = payload.appConfig.footerAuthor || 'Univ. Juan Pablo Stumpfs Díaz';
                footerEl.innerHTML = `${cleanBase} • <strong class="text-slate-300">${authorTxt}</strong>`;
            }
        } else if (payload.appConfig.footerHtml) {
            const footerEl = document.getElementById('appFooterText');
            if (footerEl) footerEl.innerHTML = String(payload.appConfig.footerHtml).replace(/\s*•?\s*Compendio Definitivo Unidades 13 a 17\s*/gi, '');
        }
        if (payload.appConfig.defaultFunction) state.currentFunction = payload.appConfig.defaultFunction;
        if (payload.appConfig.defaultReaction) state.currentKey = payload.appConfig.defaultReaction;
        if (payload.appConfig.reactionsPath) {
            const baseRepo = GITHUB_RAW_URL.substring(0, GITHUB_RAW_URL.lastIndexOf('/') + 1);
            const relPath = payload.appConfig.reactionsPath.replace(/^\/+/, '');
            state.reactionsBaseUrl = relPath.startsWith('http') ? relPath : (baseRepo + relPath);
            if (!state.reactionsBaseUrl.endsWith('/')) state.reactionsBaseUrl += '/';
        }
    }

    if (payload.atomColors && typeof payload.atomColors === 'object') {
        state.atomColors = { ...state.atomColors, ...payload.atomColors };
    }

    if (Array.isArray(payload.functionCatalog) && payload.functionCatalog.length > 0) {
        state.functionCatalog = payload.functionCatalog;
    }

    if (payload.functionMenus && typeof payload.functionMenus === 'object') {
        state.functionMenus = { ...state.functionMenus, ...payload.functionMenus };
    }

    if (payload.unitFiles && typeof payload.unitFiles === 'object') {
        state.unitFiles = { ...state.unitFiles, ...payload.unitFiles };
    }

    if (payload.reactions && typeof payload.reactions === 'object') {
        Object.entries(payload.reactions).forEach(([rxnKey, rxnData]) => {
            hydrateReactionFromJson(rxnKey, rxnData);
            state.loadedReactions.add(rxnKey);
        });
    }

    if (payload.questions && typeof payload.questions === 'object') {
        Object.assign(EXAM_QUESTIONS_DB, payload.questions);
    }

    if (payload.unitExamsMenus && typeof payload.unitExamsMenus === 'object') {
        mergeExamMenusIntoUnits(payload.unitExamsMenus);
    }
}

function setAnimSpeed(ms) {
    state.animDuration = Number(ms) || 4200;
    const sel = document.getElementById('selectAnimSpeed');
    if (sel && String(sel.value) !== String(state.animDuration)) {
        sel.value = String(state.animDuration);
    }
    if (state.autoPlayTimer) {
        stopAutoPlay();
        toggleAutoPlay();
    }
}

function updateGlobalScrubberUI(stepProgressT) {
    const scrubber = document.getElementById('transitionScrubber');
    const pctText = document.getElementById('scrubberPercentText');
    if (!scrubber || !pctText) return;
    const steps = getActiveSteps();
    const totalSteps = steps.length;
    if (totalSteps <= 1) {
        const pct = Math.round(stepProgressT * 100);
        scrubber.value = pct;
        pctText.innerText = pct + '%';
        return;
    }
    let globalProgress = 0;
    if (steps[0].initialScene) {
        globalProgress = ((state.currentStepIdx + stepProgressT) / totalSteps) * 100;
    } else if (state.currentStepIdx === 0) {
        globalProgress = 0;
    } else {
        const totalTransitions = totalSteps - 1;
        const completedBefore = state.currentStepIdx - 1;
        globalProgress = ((completedBefore + stepProgressT) / totalTransitions) * 100;
    }
    const pct = Math.min(100, Math.max(0, Math.round(globalProgress)));
    scrubber.value = pct;
    pctText.innerText = pct + '%';
}

function animateToScene(prevScene, targetScene, instant = false) {
    if (state.animFrameId) {
        cancelAnimationFrame(state.animFrameId);
        state.animFrameId = null;
    }
    state.currentPrevSceneForScrub = prevScene || targetScene;
    state.currentTargetSceneForScrub = targetScene;

    if (instant || !prevScene) {
        renderInterpolatedFrame(targetScene, targetScene, 1);
        state.lastSceneState = targetScene;
        updateGlobalScrubberUI(1);
        return;
    }
    const startTime = performance.now();
    function tick(now) {
        const elapsed = now - startTime;
        const rawT = Math.min(1, elapsed / state.animDuration);
        renderInterpolatedFrame(prevScene, targetScene, rawT);
        updateGlobalScrubberUI(rawT);
        if (rawT < 1) {
            state.animFrameId = requestAnimationFrame(tick);
        } else {
            state.lastSceneState = targetScene;
            state.animFrameId = null;
        }
    }
    state.animFrameId = requestAnimationFrame(tick);
}

function scrubTransitionManually(val) {
    stopAutoPlay();
    if (state.animFrameId) {
        cancelAnimationFrame(state.animFrameId);
        state.animFrameId = null;
    }
    const globalT = Number(val) / 100;
    const pctText = document.getElementById('scrubberPercentText');
    if (pctText) pctText.innerText = Math.round(globalT * 100) + '%';

    const steps = getActiveSteps();
    const n = steps.length;
    const hasInit0 = !!steps[0].initialScene;
    const totalTransitions = hasInit0 ? n : Math.max(1, n - 1);

    const scaled = globalT * totalTransitions;
    let transIdx = Math.floor(scaled);
    let localT = scaled - transIdx;
    if (transIdx >= totalTransitions) {
        transIdx = totalTransitions - 1;
        localT = 1;
    }

    let targetIdx = hasInit0 ? transIdx : (transIdx + 1);
    if (n === 1) targetIdx = 0;

    state.currentStepIdx = targetIdx;
    const step = steps[state.currentStepIdx];

    const pillsHtml = steps.map((st, idx) => `
        <button onclick="goToStep(${idx})" class="px-3 py-1 rounded-lg text-xs font-extrabold transition border ${
            idx === state.currentStepIdx
                ? 'bg-violet-600 text-white border-violet-400 shadow-sm'
                : (idx < state.currentStepIdx ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/40' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700')
        }">
            ${idx < state.currentStepIdx ? '✓ ' : ''}Paso ${idx + 1}
        </button>
    `).join('');
    document.getElementById('stepPillsContainer').innerHTML = pillsHtml;
    document.getElementById('stepCounterText').innerText = `${state.currentStepIdx + 1}/${steps.length}`;
    document.getElementById('stepNumberBadge').innerText = `PASO ${state.currentStepIdx + 1} DE ${steps.length}`;
    document.getElementById('stepTitleText').innerText = step.title;
    applyStageThemeUI();
    if (step.legend) {
        document.getElementById('legendBreakingText').innerText = step.legend.breaking;
        document.getElementById('legendFormingText').innerText = step.legend.forming;
        document.getElementById('legendMovementText').innerText = step.legend.movement;
    }
    document.getElementById('semiStepBox').innerText = step.semiStep;
    document.getElementById('semiGlobalBox').innerText = step.semiGlobal;
    document.getElementById('stepExplanationText').innerText = step.desc;
    document.getElementById('btnPrev').disabled = (state.currentStepIdx === 0);
    document.getElementById('btnNext').disabled = (state.currentStepIdx === steps.length - 1);

    const targetScene = step.scene();
    const prevScene = state.currentStepIdx > 0
        ? steps[state.currentStepIdx - 1].scene()
        : (step.initialScene ? step.initialScene() : targetScene);

    renderInterpolatedFrame(prevScene, targetScene, localT);
    state.lastSceneState = targetScene;
}

function replayCurrentTransition() {
    stopAutoPlay();
    const steps = getActiveSteps();
    const stepObj = steps[state.currentStepIdx];
    const currentScene = stepObj.scene();
    if (state.currentStepIdx > 0) {
        const prevScene = steps[state.currentStepIdx - 1].scene();
        animateToScene(prevScene, currentScene, false);
    } else if (stepObj.initialScene) {
        animateToScene(stepObj.initialScene(), currentScene, false);
    } else {
        animateToScene({ atoms: [], bonds: [] }, currentScene, false);
    }
}

function hydrateReactionFromJson(rxnKey, rawRxn) {
    state.labData[rxnKey] = {
        category: rawRxn.category || 'reacciones',
        title: rawRxn.title || rxnKey,
        natureBadge: rawRxn.natureBadge || 'Mecanismo Interactivo Paso a Paso',
        description: rawRxn.description || (rawRxn.meta && rawRxn.meta.detalleMecanismo) || '',
        meta: rawRxn.meta || {},
        deltaH: rawRxn.deltaH || '',
        substrates: Array.isArray(rawRxn.substrates) && rawRxn.substrates.length > 0
            ? rawRxn.substrates
            : [{ id: 'default', name: rawRxn.title || rxnKey }],
        catalysts: Array.isArray(rawRxn.catalysts) && rawRxn.catalysts.length > 0
            ? rawRxn.catalysts
            : ['Condiciones Estándar'],
        getSteps: (subId, catName) => {
            if (rawRxn.delegateTo && state.labData[rawRxn.delegateTo]) {
                return state.labData[rawRxn.delegateTo].getSteps(rawRxn.delegateSubId || subId, catName);
            }
            const mapBySub = rawRxn.stepsBySubstrate || {};
            const chosenSteps = mapBySub[subId] || mapBySub['default'] || Object.values(mapBySub)[0] || rawRxn.steps || [];
            const activeSubObj = (Array.isArray(rawRxn.substrates) ? rawRxn.substrates.find(s => s.id === subId) : null) || {};
            const effectiveCat = activeSubObj.catalyst || catName || (Array.isArray(rawRxn.catalysts) ? rawRxn.catalysts[0] : '') || '';
            return expandStepsToVisualMicroSteps(chosenSteps, effectiveCat);
        }
    };
}

function setJsonStatus(status, pillText, diagnosticHtml = '') {
    const banner = document.getElementById('jsonDiagnosticBanner');
    const detail = document.getElementById('jsonDiagnosticDetail');
    if (banner && detail) {
        if (diagnosticHtml) {
            detail.innerHTML = diagnosticHtml;
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }
}

async function loadDatabaseFromJson() {
    const candidateUrls = buildCandidateRawUrls(GITHUB_RAW_URL);
    let lastError = null;

    for (const url of candidateUrls) {
        try {
            const response = await fetch(url, { cache: 'default' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} al consultar ${url}`);
            }
            const rawText = await response.text();
            const payload = parseFlexibleJson(rawText);
            applyJsonPayload(payload);

            const unitsCount = state.functionCatalog.length || Object.keys(state.functionMenus).length;
            setJsonStatus('ok', `🟢 Índice Activo (${unitsCount} unidades)`);
            return true;
        } catch (err) {
            lastError = err;
        }
    }

    const errMsg = lastError ? String(lastError.message || lastError) : 'Error desconocido';
    setJsonStatus(
        'error',
        '🔴 Error al leer labquim.json',
        `<strong>Detalle técnico:</strong> <code class="font-mono text-rose-200">${errMsg}</code><br/>
         • Verifica que el repositorio <code class="font-mono">JPSDPOV/LabQuim</code> sea <strong>Public</strong> y que el archivo maestro <code class="font-mono">labquim.json</code> tenga formato JSON válido.`
    );
    return false;
}

async function ensureReactionLoaded(rxnKey) {
    if (!rxnKey) return false;
    if (state.labData[rxnKey] || state.loadedReactions.has(rxnKey)) {
        state.loadedReactions.add(rxnKey);
        setJsonStatus('ok', `🟢 ${rxnKey} listo en memoria (${state.loadedReactions.size} cargadas)`);
        return true;
    }

    setJsonStatus('loading', `🔄 Cargando reactions/${rxnKey}.json...`);
    const candidateUrls = buildCandidateReactionUrls(rxnKey);

    for (const url of candidateUrls) {
        try {
            const response = await fetch(url, { cache: 'default' });
            if (!response.ok) continue;

            const rawText = await response.text();
            let payload = parseFlexibleJson(rawText);

            if (payload && typeof payload === 'object') {
                if (payload.reactions && payload.reactions[rxnKey]) {
                    payload = payload.reactions[rxnKey];
                } else if (!payload.stepsBySubstrate && !payload.steps && !payload.title && payload[rxnKey]) {
                    payload = payload[rxnKey];
                }
            }

            if (payload && typeof payload === 'object' && (payload.stepsBySubstrate || payload.steps || payload.title || payload.delegateTo)) {
                hydrateReactionFromJson(rxnKey, payload);
                state.loadedReactions.add(rxnKey);

                if (payload.delegateTo && !state.loadedReactions.has(payload.delegateTo)) {
                    await ensureReactionLoaded(payload.delegateTo);
                }

                setJsonStatus('ok', `🟢 reactions/${rxnKey}.json (${state.loadedReactions.size} cargadas)`);
                return true;
            }
        } catch (err) {
            console.warn(`Error leyendo ${url}:`, err);
        }
    }

    setJsonStatus('warn', `🟡 Pendiente: reactions/${rxnKey}.json (vista previa)`);
    return false;
}

async function ensureUnitLoaded(funcKey) {
    const unitUrl = (state.unitFiles[funcKey] || '').trim();
    if (!unitUrl || state.loadedUnitUrls.has(unitUrl)) return;
    try {
        const response = await fetch(unitUrl, { cache: 'default' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rawText = await response.text();
        const unitPayload = parseFlexibleJson(rawText);
        applyJsonPayload(unitPayload);
        state.loadedUnitUrls.add(unitUrl);
    } catch (err) {
        console.warn(`No se pudo cargar el módulo JSON de la unidad ${funcKey}:`, err);
    }
}

function getFunctionLabel(funcKey) {
    const found = state.functionCatalog.find(f => f.value === funcKey);
    return found ? found.label : (funcKey || '').toUpperCase();
}

function renderFunctionCards() {
    const grid = document.getElementById('functionCardsGrid');
    if (!grid) return;
    const list = state.functionCatalog.length > 0
        ? state.functionCatalog
        : Object.keys(state.functionMenus).map(k => ({ value: k, label: k.toUpperCase() }));

    if (list.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-6 text-sm text-rose-300">No se encontraron unidades en labquim.json.</div>`;
        return;
    }

    grid.innerHTML = list.map(f => `
        <button type="button" onclick="wizardSelectFunction('${f.value}')" class="group text-left p-4 rounded-2xl bg-slate-950/85 hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-400 transition-all shadow-md flex items-center justify-between gap-3 active:scale-[0.99] cursor-pointer">
            <span class="text-sm sm:text-base font-extrabold text-slate-100 group-hover:text-emerald-200 transition">${f.label}</span>
            <span class="text-slate-500 group-hover:text-emerald-300 text-sm font-bold shrink-0">➡</span>
        </button>
    `).join('');
}

function openFunctionsMenuFromHub() {
    renderFunctionCards();
    showWizardStage(1);
}

async function openExamSearchHub() {
    showWizardStage('exam-search');
    clearHomeExamSearch();
    const inputEl = document.getElementById('homeExamSearchInput');
    if (inputEl) inputEl.focus();
    await loadExternalExamsBank();
}

function showWizardStage(stageNum) {
    state.wizardStage = stageNum;
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const sHub = document.getElementById('wizardHomeHub');
    const sExamHub = document.getElementById('wizardExamSearchHub');
    const s1 = document.getElementById('wizardStep1');
    const s2 = document.getElementById('wizardStep2');
    const s3 = document.getElementById('wizardStep3');
    const s4 = document.getElementById('wizardStep4');
    const sEx = document.getElementById('wizardExamStage');
    const nomSetup = document.getElementById('nomenclatureSetupSection');
    const nomPrac = document.getElementById('nomenclaturePracticeSection');
    const btnBack = document.getElementById('btnWizardBack');
    const breadcrumb = document.getElementById('wizardBreadcrumb');
    const navBar = breadcrumb?.parentElement;

    [sHub, sExamHub, s1, s2, s3, s4, sEx, nomSetup, nomPrac].forEach(el => { if (el) el.classList.add('hidden'); });
    if (navBar) {
        navBar.classList.toggle('hidden', stageNum === 0);
    }

    if (stageNum === 0 && sHub) sHub.classList.remove('hidden');
    if (stageNum === 'exam-search' && sExamHub) sExamHub.classList.remove('hidden');
    if (stageNum === 1 && s1) s1.classList.remove('hidden');
    if (stageNum === 2 && s2) s2.classList.remove('hidden');
    if (stageNum === 3 && s3) s3.classList.remove('hidden');
    if (stageNum === 4) {
        if ((state.currentCategory === 'examenes' || state.currentCategory === 'test') && sEx) sEx.classList.remove('hidden');
        else if (s4) s4.classList.remove('hidden');
    }

    if (btnBack) {
        btnBack.classList.toggle('hidden', stageNum === 0);
    }

    if (breadcrumb) {
        const fnLabel = state.currentFunction ? getFunctionLabel(state.currentFunction) : '';
        const catLabel = state.currentCategory === 'obtencion'
            ? '📥 Métodos de Obtención'
            : (state.currentCategory === 'reacciones'
                ? '⚡ Reacciones Químicas'
                : (state.currentCategory === 'examenes'
                    ? '📝 Exámenes de Años Anteriores'
                    : (state.currentCategory === 'test' ? '🧪 Test' : '')));
        let parts = [
            `<button type="button" onclick="showWizardStage(0)" class="text-slate-300 hover:text-white hover:underline font-bold cursor-pointer">🏠 Inicio</button>`
        ];

        if (stageNum === 'exam-search') {
            parts.push(`<span class="text-slate-600">›</span> <span class="text-rose-300 font-bold">📝 Buscador de Exámenes</span>`);
        } else if (stageNum === 1) {
            parts.push(`<span class="text-slate-600">›</span> <span class="text-emerald-300 font-bold">⚗️ Funciones Químicas</span>`);
        } else if (typeof stageNum === 'number' && stageNum >= 2) {
            parts.push(`<span class="text-slate-600">›</span> <button type="button" onclick="showWizardStage(1)" class="text-emerald-300 hover:underline font-bold cursor-pointer">Funciones Químicas</button>`);
            parts.push(`<span class="text-slate-600">›</span> <button type="button" onclick="showWizardStage(2)" class="text-violet-300 hover:underline font-bold cursor-pointer">${fnLabel}</button>`);
            if (stageNum >= 3) {
                parts.push(`<span class="text-slate-600">›</span> <button type="button" onclick="showWizardStage(3)" class="text-cyan-300 hover:underline font-bold cursor-pointer">${catLabel}</button>`);
                if (stageNum === 4) {
                    const itemTitle = (state.currentCategory === 'examenes' || state.currentCategory === 'test')
                        ? 'Ejercicio'
                        : ((state.labData[state.currentKey] && state.labData[state.currentKey].title) || state.currentKey);
                    parts.push(`<span class="text-slate-600">›</span> <span class="text-amber-300 font-bold truncate max-w-[180px] sm:max-w-xs inline-block align-bottom">${itemTitle}</span>`);
                }
            }
        }
        breadcrumb.innerHTML = parts.join(' ');
    }
}

function wizardGoBack() {
    if (state.wizardStage === 'exam-search' || state.wizardStage === 1) {
        showWizardStage(0);
    } else if (typeof state.wizardStage === 'number' && state.wizardStage > 1) {
        showWizardStage(state.wizardStage - 1);
    }
}

async function wizardSelectFunction(funcKey) {
    state.currentFunction = funcKey;
    state.currentCategory = '';
    state.currentKey = '';
    await ensureUnitLoaded(funcKey);
    loadExternalExamsBank();

    const cfg = state.functionMenus[funcKey] || { obtencion: [], reacciones: [], examenes: [], test: [] };
    const obtCount = (cfg.obtencion || []).length;
    const rxnCount = (cfg.reacciones || []).length;
    const exCount = (cfg.examenes || []).length;
    const testCount = (cfg.test || []).length;

    document.getElementById('wiz2FuncBadge').innerText = getFunctionLabel(funcKey);
    document.getElementById('wizCountObtencion').innerText = `${obtCount} ${obtCount === 1 ? 'método' : 'métodos'}`;
    document.getElementById('wizCountReacciones').innerText = `${rxnCount} ${rxnCount === 1 ? 'reacción' : 'reacciones'}`;
    const exBadge = document.getElementById('wizCountExamenes');
    if (exBadge) exBadge.innerText = `${exCount} ${exCount === 1 ? 'ejercicio' : 'ejercicios'}`;
    const testBadge = document.getElementById('wizCountTest');
    if (testBadge) testBadge.innerText = `${testCount} ${testCount === 1 ? 'ejercicio' : 'ejercicios'}`;

    showWizardStage(2);
}

function wizardSelectCategory(catType) {
    state.currentCategory = catType;
    const cfg = state.functionMenus[state.currentFunction] || { obtencion: [], reacciones: [], examenes: [], test: [] };
    const items = cfg[catType] || [];
    const isObt = catType === 'obtencion';
    const isExam = catType === 'examenes';
    const isTest = catType === 'test';

    const badge = document.getElementById('wiz3CatBadge');
    const subHeadingEl = document.getElementById('wiz3Subheading');
    if (isExam) {
        badge.className = 'inline-block mx-auto px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-xs font-bold text-rose-200';
        badge.innerText = '📝 Exámenes de Años Anteriores';
        document.getElementById('wiz3Heading').innerText = 'Elige un Examen de Ingreso';
        if (subHeadingEl) subHeadingEl.innerText = 'Selecciona un examen para resolver el ítem de opción múltiple';
    } else if (isTest) {
        badge.className = 'inline-block mx-auto px-3 py-1 rounded-full bg-sky-500/20 border border-sky-500/40 text-xs font-bold text-sky-200';
        badge.innerText = '🧪 Test';
        document.getElementById('wiz3Heading').innerText = 'Elige un Ejercicio de Test';
        if (subHeadingEl) subHeadingEl.innerText = 'Selecciona un ejercicio para resolver el ítem de opción múltiple';
    } else {
        if (subHeadingEl) subHeadingEl.innerText = 'Toca una opción para ver sus reacciones disponibles y catalizadores';
        badge.className = isObt
            ? 'inline-block mx-auto px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-300'
            : 'inline-block mx-auto px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-xs font-bold text-amber-300';
        badge.innerText = isObt ? '📥 Métodos de Obtención' : '⚡ Reacciones Químicas';
        document.getElementById('wiz3Heading').innerText = isObt
            ? 'Elige un Método de Obtención'
            : 'Elige una Reacción Química';
    }

    const filterBarEl = document.getElementById('wiz3ExamFilterBar');
    if (filterBarEl) {
        filterBarEl.classList.toggle('hidden', !isExam);
        if (isExam) {
            const sIn = document.getElementById('wiz3ExamSearchInput');
            const ySel = document.getElementById('wiz3ExamYearSelect');
            if (sIn) sIn.value = '';
            if (ySel) ySel.value = 'all';
        }
    }

    const listEl = document.getElementById('reactionListGrid');
    if (items.length === 0) {
        listEl.innerHTML = `<div class="text-center py-6 text-sm text-slate-400">No hay ejercicios registrados en esta categoría todavía.</div>`;
    } else if (isExam) {
        renderFilteredUnitExams();
    } else if (isTest) {
        listEl.innerHTML = items.map((it, idx) => `
            <button type="button" onclick="wizardSelectExamQuestion('${it.value}')" class="group text-left p-4 rounded-2xl bg-slate-950/90 hover:bg-sky-950/35 border border-slate-800 hover:border-sky-400/75 transition-all flex items-center justify-between gap-3 active:scale-[0.99] cursor-pointer">
                <span class="text-sm sm:text-base font-extrabold text-slate-100 group-hover:text-sky-200">Ejercicio ${idx + 1}</span>
                <span class="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-sky-950/80 border border-sky-500/40 text-sky-200 shrink-0">Resolver ➡</span>
            </button>
        `).join('');
    } else {
        listEl.innerHTML = items.map(it => `
            <button type="button" onclick="wizardSelectReactionItem('${it.value}')" class="group text-left p-4 rounded-2xl bg-slate-950/90 hover:bg-slate-800/90 border border-slate-800 ${isObt ? 'hover:border-emerald-400/70' : 'hover:border-amber-400/70'} transition-all flex items-center justify-between gap-3 active:scale-[0.99]">
                <span class="text-sm sm:text-base font-bold text-slate-100 ${isObt ? 'group-hover:text-emerald-200' : 'group-hover:text-amber-200'}">${it.label}</span>
                <span class="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 shrink-0">Ver ➡</span>
            </button>
        `).join('');
    }

    showWizardStage(3);
}

async function wizardSelectReactionItem(rxnKey) {
    state.currentKey = rxnKey;
    state.currentSubIdx = 0;
    state.currentCatIdx = 0;
    state.currentStepIdx = 0;
    state.lastSceneState = null;
    currentViewBox.initialized = false;

    document.getElementById('wiz4Title').innerText = 'Cargando reacciones y catalizadores...';
    const descEl = document.getElementById('wiz4DescriptionBox');
    if (descEl) descEl.innerText = 'Cargando explicación del método o reacción...';
    document.getElementById('wiz4SubstratesList').innerHTML = `<div class="text-center py-6 text-xs text-slate-400 animate-pulse">Descargando datos de la reacción...</div>`;
    showWizardStage(4);

    await ensureReactionLoaded(rxnKey);
    const item = ensureReactionExists(rxnKey, state.currentFunction || 'alcanos');

    document.getElementById('wiz4Title').innerText = item.title;
    if (descEl) {
        const explanationText = item.description
            || (item.meta && (item.meta.detalleMecanismo || item.meta.reaccionMecanismo))
            || 'Selecciona una reacción de la lista inferior para iniciar la visualización interactiva.';
        descEl.innerText = explanationText;
    }

    const subBox = document.getElementById('wiz4SubstratesList');
    const defaultCatText = item.catalysts[0] || 'Condiciones Estándar';

    subBox.innerHTML = item.substrates.map((s, idx) => {
        const subCat = s.catalyst || (item.catalysts.length === item.substrates.length ? item.catalysts[idx] : defaultCatText);
        return `
        <button type="button" onclick="wizardLaunchReaction(${idx})" class="group text-left p-4 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 hover:from-violet-950/60 hover:to-slate-900 border border-slate-800 hover:border-violet-400 transition-all shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 active:scale-[0.99]">
            <div class="flex flex-col gap-1">
                <span class="text-sm sm:text-base font-extrabold text-white group-hover:text-violet-200 transition">${s.name}</span>
                <span class="text-xs font-semibold text-cyan-300/90">⚙️ Catalizador: ${subCat}</span>
            </div>
            <span class="self-start sm:self-center px-3.5 py-2 rounded-xl bg-violet-600 group-hover:bg-violet-500 text-white text-xs font-extrabold shadow-md shadow-violet-600/25 shrink-0 flex items-center gap-1.5">
                <span>▶</span> <span>Animar Reacción</span>
            </span>
        </button>
    `;
    }).join('');
}

function wizardSelectCatalyst(catIdx) {
    state.currentCatIdx = catIdx;
    wizardSelectReactionItem(state.currentKey);
}

function wizardLaunchReaction(subIdx) {
    state.currentSubIdx = subIdx;
    const item = ensureReactionExists(state.currentKey || 'cracking', state.currentFunction || 'alcanos');
    state.currentCatIdx = (item.catalysts && item.catalysts.length === item.substrates.length) ? subIdx : 0;
    state.currentStepIdx = 0;
    state.lastSceneState = null;
    currentViewBox.initialized = false;
    openFullscreenPlayer();
}

function ensureReactionExists(key, funcKey) {
    if (state.labData[key]) return state.labData[key];
    const cfg = state.functionMenus[funcKey] || state.functionMenus.alcanos || { obtencion: [], reacciones: [] };
    let foundLabel = key;
    let catType = 'obtencion';
    const inObt = (cfg.obtencion || []).find(o => o.value === key);
    if (inObt) {
        foundLabel = inObt.label;
        catType = 'obtencion';
    } else {
        const inRxn = (cfg.reacciones || []).find(r => r.value === key);
        if (inRxn) {
            foundLabel = inRxn.label;
            catType = 'reacciones';
        }
    }
    const parts = foundLabel.split(/→|⇄/);
    const leftSide = (parts[0] || foundLabel).replace(/^[A-Z0-9\.\-\)\s]+/, '').trim();
    const rightSide = (parts[1] || 'Producto Principal Desarrollado').replace(/\)$/, '').trim();

    state.labData[key] = {
        category: catType,
        title: foundLabel,
        natureBadge: 'Vista Previa (Pendiente reactions/' + key + '.json)',
        meta: {
            grupoFuncional: rightSide,
            reaccionMecanismo: foundLabel,
            naturaleza: `Archivo reactions/${key}.json pendiente de subir al repositorio.`,
            rupturaIntermediarios: 'Ruptura del enlace reactivo en el sustrato e incorporación del grupo atacante.',
            detalleMecanismo: `${leftSide} ──► ${rightSide}`,
            reactivosCondiciones: leftSide,
            rolReactivos: `• Sustrato y reactivo: ${leftSide}.\n• Producto principal: ${rightSide}.`,
            reglasObs: `Sube el archivo reactions/${key}.json a GitHub para activar la animación átomo por átomo.`
        },
        deltaH: `${leftSide} → ${rightSide}`,
        substrates: [{ id: `${key}_sub1`, name: foundLabel }],
        catalysts: ['Condiciones Estándar del Programa Oficial'],
        getSteps: () => expandStepsToVisualMicroSteps([
            {
                title: `Paso 1 — Estado Inicial Intacto: ${leftSide}`,
                semiStep: `${leftSide}  (Sustratos iniciales intactos antes de reaccionar)`,
                semiGlobal: `${leftSide}  ──►  ${rightSide}`,
                desc: `Observa en el pizarrón el estado inicial intacto de los reactivos: ${leftSide}.`,
                legend: {
                    breaking: 'Ningún enlace roto todavía; estado inicial intacto.',
                    forming: 'Ningún enlace formado todavía.',
                    movement: 'Aproximación inicial de los reactivos.'
                },
                scene: () => ({
                    atoms: [
                        { id: 'Sub_A', el: leftSide.substring(0, 32), x: 310, y: 180, label: 'Reactivos iniciales' },
                        { id: 'Act_B', el: 'Medio / Catalizador', x: 650, y: 180, label: 'Condiciones del medio' }
                    ],
                    bonds: [{ from: 'Sub_A', to: 'Act_B', order: 1, state: 'normal' }]
                })
            },
            {
                title: `Paso 2 — Producto Mayoritario Desarrollado: ${rightSide}`,
                semiStep: `PRODUCTO OBTENIDO: ${rightSide}`,
                semiGlobal: `${leftSide}  ──►  ${rightSide}`,
                desc: `Se completó la transformación química obteniéndose como producto principal: ${rightSide}.`,
                legend: {
                    breaking: 'Ruptura de los enlaces iniciales completada.',
                    forming: 'Nuevos enlaces consolidados en ' + rightSide + ' (en verde sólido).',
                    movement: 'Producto final estabilizado en el centro del pizarrón.'
                },
                scene: () => ({
                    atoms: [
                        { id: 'Sub_A', el: rightSide.substring(0, 36), x: 460, y: 180, highlight: '#10b981', label: rightSide }
                    ],
                    bonds: []
                })
            }
        ])
    };
    return state.labData[key];
}

function goToStep(idx) {
    stopAutoPlay();
    const steps = getActiveSteps();
    if (idx >= 0 && idx < steps.length) {
        const prevScene = idx === 0 && steps[0].initialScene
            ? steps[0].initialScene()
            : steps[state.currentStepIdx].scene();
        state.currentStepIdx = idx;
        renderStepStage(prevScene, false);
    }
}

function nextStep() {
    const steps = getActiveSteps();
    if (state.currentStepIdx < steps.length - 1) {
        const prevScene = steps[state.currentStepIdx].scene();
        state.currentStepIdx++;
        renderStepStage(prevScene, false);
    } else {
        stopAutoPlay();
    }
}

function prevStep() {
    stopAutoPlay();
    if (state.currentStepIdx > 0) {
        const steps = getActiveSteps();
        state.currentStepIdx--;
        const prevScene = state.currentStepIdx === 0 && steps[0].initialScene
            ? steps[0].initialScene()
            : steps[state.currentStepIdx].scene();
        renderStepStage(prevScene, false);
    }
}

function toggleAutoPlay() {
    if (state.autoPlayTimer) {
        stopAutoPlay();
    } else {
        const steps = getActiveSteps();
        if (state.currentStepIdx >= steps.length - 1) {
            state.currentStepIdx = 0;
            renderStepStage(null, true);
        }
        document.getElementById('playIcon').innerText = '⏸';
        document.getElementById('playText').innerText = 'Pausar';

        const advanceAutoStep = () => {
            const st = getActiveSteps();
            if (state.currentStepIdx < st.length - 1) {
                const prevScene = st[state.currentStepIdx].scene();
                state.currentStepIdx++;
                renderStepStage(prevScene, false);
            } else {
                stopAutoPlay();
            }
        };

        // Arrancar la primera transición suavemente tras 350ms para respuesta visual inmediata
        setTimeout(() => {
            if (state.autoPlayTimer) advanceAutoStep();
        }, 350);

        state.autoPlayTimer = setInterval(advanceAutoStep, state.animDuration + 1600);
    }
}

function stopAutoPlay() {
    if (state.autoPlayTimer) {
        clearInterval(state.autoPlayTimer);
        state.autoPlayTimer = null;
    }
    const icon = document.getElementById('playIcon');
    const txt = document.getElementById('playText');
    if (icon) icon.innerText = '▶';
    if (txt) txt.innerText = 'Auto-Play';
}

function getActiveSteps() {
    const item = ensureReactionExists(state.currentKey || 'cracking', state.currentFunction || 'alcanos');
    const sub = item.substrates[state.currentSubIdx] || item.substrates[0];
    const cat = item.catalysts[state.currentCatIdx] || item.catalysts[0];
    return item.getSteps(sub.id, cat);
}

function renderFullLab(instant = false) {
    const item = ensureReactionExists(state.currentKey || 'cracking', state.currentFunction || 'alcanos');
    const activeSub = item.substrates[state.currentSubIdx] || {};
    const activeCat = activeSub.catalyst || item.catalysts[state.currentCatIdx] || item.catalysts[0] || '';
    const catBadge = document.getElementById('playerCatalystBadge');
    if (catBadge) catBadge.innerText = `⚙️ ${activeCat}`;

    if (item.meta) {
        document.getElementById('metaGrupoFuncional').innerText = item.meta.grupoFuncional || '';
        document.getElementById('metaReaccionMecanismo').innerText = item.meta.reaccionMecanismo || '';
        document.getElementById('metaNaturaleza').innerText = item.meta.naturaleza || '';
        document.getElementById('metaRupturaIntermediarios').innerText = item.meta.rupturaIntermediarios || '';
        document.getElementById('metaDetalleMecanismo').innerText = item.meta.detalleMecanismo || '';
        document.getElementById('metaReactivosCondiciones').innerText = item.meta.reactivosCondiciones || '';
        document.getElementById('metaRolReactivos').innerText = item.meta.rolReactivos || '';
        document.getElementById('metaReglasObs').innerText = item.meta.reglasObs || '';
    }

    renderStepStage(state.lastSceneState, instant);
}

function renderStepStage(prevScene, instant = false) {
    const steps = getActiveSteps();
    const step = steps[state.currentStepIdx];

    document.getElementById('stepCounterText').innerText = `${state.currentStepIdx + 1}/${steps.length}`;
    document.getElementById('stepNumberBadge').innerText = `PASO ${state.currentStepIdx + 1} DE ${steps.length}`;
    document.getElementById('stepTitleText').innerText = step.title;
    applyStageThemeUI();

    if (step.legend) {
        document.getElementById('legendBreakingText').innerText = step.legend.breaking;
        document.getElementById('legendFormingText').innerText = step.legend.forming;
        document.getElementById('legendMovementText').innerText = step.legend.movement;
    }

    const targetScene = step.scene();
    const startSceneForTransition = (state.currentStepIdx === 0 && step.initialScene)
        ? step.initialScene()
        : (prevScene || state.lastSceneState);
    const shouldBeInstant = instant && !(state.currentStepIdx === 0 && step.initialScene);
    animateToScene(startSceneForTransition, targetScene, shouldBeInstant);

    document.getElementById('semiStepBox').innerText = step.semiStep;
    document.getElementById('semiGlobalBox').innerText = step.semiGlobal;
    document.getElementById('stepExplanationText').innerText = step.desc;

    document.getElementById('btnPrev').disabled = (state.currentStepIdx === 0);
    document.getElementById('btnNext').disabled = (state.currentStepIdx === steps.length - 1);
}

let resizeDebounceTimer = null;
window.addEventListener('resize', () => {
    updateOrientationNotice();
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
        if (state.isStageFullscreen && state.currentTargetSceneForScrub && !state.animFrameId) {
            renderInterpolatedFrame(state.currentPrevSceneForScrub || state.currentTargetSceneForScrub, state.currentTargetSceneForScrub, 1);
        }
    }, 120);
});

document.addEventListener('fullscreenchange', () => {
    if (state.isStageFullscreen) {
        updateOrientationNotice();
        if (state.currentTargetSceneForScrub && !state.animFrameId) {
            renderInterpolatedFrame(state.currentPrevSceneForScrub || state.currentTargetSceneForScrub, state.currentTargetSceneForScrub, 1);
        }
    }
});

window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        updateOrientationNotice();
        if (state.isStageFullscreen && state.currentTargetSceneForScrub && !state.animFrameId) {
            renderInterpolatedFrame(state.currentPrevSceneForScrub || state.currentTargetSceneForScrub, state.currentTargetSceneForScrub, 1);
        }
    }, 140);
});

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (state.isStageFullscreen) {
        if (e.key === 'ArrowRight') nextStep();
        if (e.key === 'ArrowLeft') prevStep();
        if (e.key === 'Escape') {
            const leftOpen = !document.getElementById('drawerLeftParams').classList.contains('-translate-x-full');
            const rightOpen = !document.getElementById('drawerRightExplain').classList.contains('translate-x-full');
            if (leftOpen || rightOpen) closeAllDrawers();
            else returnToReactionExamples();
        }
    }
});

// Exponer funciones al ámbito global window para los manejadores onclick/oninput del HTML
Object.assign(window, {
    toggleStageLightMode,
    toggleSideDrawer,
    closeAllDrawers,
    returnToReactionExamples,
    returnToWizardHome,
    setAnimSpeed,
    scrubTransitionManually,
    replayCurrentTransition,
    showWizardStage,
    wizardGoBack,
    openFunctionsMenuFromHub,
    openExamSearchHub,
    wizardSelectFunction,
    wizardSelectCategory,
    wizardSelectReactionItem,
    wizardSelectCatalyst,
    wizardLaunchReaction,
    goToStep,
    nextStep,
    prevStep,
    toggleAutoPlay,
    getFunctionLabel,
    hydrateReactionFromJson,
    openFullscreenPlayer,
    ensureReactionLoaded,
    openNomenclatureSetup,
    closeNomenclatureMode,
    toggleAllNomenclatureGroups,
    updateNomenclatureAvailableCount,
    startNomenclatureSession,
    prevNomenclatureCard,
    nextNomenclatureCard,
    handleNomenclatureDynamicSearch,
    selectSearchedNomenclatureItem,
    clearNomenclatureSearch,
    toggleNomDirectSearchPanel,
    proceedToNomenclatureCountStep,
    backToNomenclatureGroupsStep,
    handleNomenclaturePracticeBack,
    finishNomenclatureSession,
    openCardFromSummary,
    flipNomenclatureCard,
    gradeNomenclatureCard,
    retryMissedNomenclature,
    renderFilteredUnitExams,
    handleHomeExamSearchAndFilter,
    clearHomeExamSearch,
    openSearchedExamQuestion,
    wizardSelectExamQuestion,
    selectExamOption,
    launchExamAnimatedExplanation,
    goToNextExamItem
});

window.addEventListener('DOMContentLoaded', async () => {
    initNomenclatureCardGestures();
    await Promise.all([
        loadDatabaseFromJson(),
        loadFormulaDictionary()
    ]);
    // Precarga no bloqueante del banco de exámenes en segundo plano
    loadExternalExamsBank();
    renderFunctionCards();
    showWizardStage(0);
});
