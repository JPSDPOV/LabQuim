import { state, parseFlexibleJson, normalizeSearchText, escHtml } from './state.js';
import { expandStepsToVisualMicroSteps, buildSemidevelopedBannerScene } from './chem-parser.js';
import { currentViewBox } from './svg-renderer.js';

export const EXAM_QUESTIONS_DB = {};
let currentExamId = '';
let examAnswered = false;
let EXTERNAL_EXAMS_LOADED = false;

export function mergeExamMenusIntoUnits(unitExamsMenus) {
    if (!unitExamsMenus || typeof unitExamsMenus !== 'object') return;
    Object.entries(unitExamsMenus).forEach(([unitKey, catObj]) => {
        const matchedKeys = new Set([unitKey]);
        const rx = new RegExp(unitKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        state.functionCatalog.forEach(item => {
            if (rx.test(item.value) || rx.test(item.label)) matchedKeys.add(item.value);
        });
        Object.keys(state.functionMenus).forEach(k => {
            if (rx.test(k)) matchedKeys.add(k);
        });
        matchedKeys.forEach(k => {
            if (!state.functionMenus[k]) state.functionMenus[k] = { obtencion: [], reacciones: [], examenes: [], test: [] };
            if (Array.isArray(catObj.examenes)) state.functionMenus[k].examenes = [...catObj.examenes];
            if (Array.isArray(catObj.test)) state.functionMenus[k].test = [...catObj.test];
        });
    });
}

export async function loadExternalExamsBank() {
    if (EXTERNAL_EXAMS_LOADED) return;
    const urls = [
        `${state.reactionsBaseUrl}examenes_banco.json`,
        './reactions/examenes_banco.json',
        './examenes_banco.json'
    ];
    for (const url of urls) {
        try {
            const res = await fetch(url, { cache: 'default' });
            if (!res.ok) continue;
            const payload = parseFlexibleJson(await res.text());
            if (payload && typeof payload === 'object') {
                if (payload.questions && typeof payload.questions === 'object') {
                    Object.assign(EXAM_QUESTIONS_DB, payload.questions);
                }
                if (payload.reactions && typeof payload.reactions === 'object') {
                    Object.entries(payload.reactions).forEach(([rxnKey, rxnData]) => {
                        hydrateReactionFromJson(rxnKey, rxnData);
                        state.loadedReactions.add(rxnKey);
                    });
                }
                if (payload.unitExamsMenus) {
                    mergeExamMenusIntoUnits(payload.unitExamsMenus);
                }
                EXTERNAL_EXAMS_LOADED = true;
                break;
            }
        } catch (e) {}
    }
}

export function matchesExamYearFilter(label, selectedYear) {
    if (!selectedYear || selectedYear === 'all') return true;
    const lbl = String(label || '');
    if (selectedYear === 'Recopilatorio CPAM') {
        return lbl.includes('Recopilatorio CPAM');
    }
    return lbl.includes(selectedYear);
}

export function renderFilteredUnitExams() {
    const cfg = state.functionMenus[state.currentFunction] || { examenes: [] };
    const items = cfg.examenes || [];
    const query = normalizeSearchText(document.getElementById('wiz3ExamSearchInput')?.value || '');
    const yearVal = document.getElementById('wiz3ExamYearSelect')?.value || 'all';
    const listEl = document.getElementById('reactionListGrid');
    if (!listEl) return;

    const filtered = items.filter(it => {
        if (!matchesExamYearFilter(it.label, yearVal)) return false;
        if (!query) return true;
        const qObj = EXAM_QUESTIONS_DB[it.value] || {};
        const hay = normalizeSearchText(`${it.label} ${qObj.statement || ''} ${qObj.topic || ''}`);
        return query.split(/\s+/).every(tok => hay.includes(tok));
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="text-center py-6 text-sm text-slate-400">No se encontraron ejercicios con ese filtro de año o búsqueda.</div>`;
        return;
    }

    listEl.innerHTML = filtered.map(it => `
        <button type="button" onclick="wizardSelectExamQuestion('${it.value}')" class="group text-left p-4 rounded-2xl bg-slate-950/90 hover:bg-rose-950/35 border border-slate-800 hover:border-rose-400/75 transition-all flex items-center justify-between gap-3 active:scale-[0.99] cursor-pointer">
            <span class="text-sm sm:text-base font-extrabold text-slate-100 group-hover:text-rose-200">${it.label}</span>
            <span class="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/40 text-rose-200 shrink-0">Resolver ➡</span>
        </button>
    `).join('');
}

export async function handleHomeExamSearchAndFilter() {
    const inputEl = document.getElementById('homeExamSearchInput');
    const yearEl = document.getElementById('homeExamYearFilter');
    const clearBtn = document.getElementById('homeExamClearBtn');
    const resultsEl = document.getElementById('homeExamResultsList');
    const badgeEl = document.getElementById('homeExamFilterCountBadge');
    if (!resultsEl) return;

    const rawQuery = inputEl ? inputEl.value : '';
    const query = normalizeSearchText(rawQuery);
    const selectedYear = yearEl ? yearEl.value : 'all';

    if (clearBtn) {
        clearBtn.classList.toggle('hidden', rawQuery.trim().length === 0);
    }

    if (query.length === 0 && selectedYear === 'all') {
        resultsEl.classList.add('hidden');
        resultsEl.innerHTML = '';
        if (badgeEl) badgeEl.innerText = '🔍 Buscar o filtrar por año';
        return;
    }

    if (!EXTERNAL_EXAMS_LOADED) {
        resultsEl.classList.remove('hidden');
        resultsEl.innerHTML = `<div class="p-4 text-center text-xs text-rose-200 animate-pulse">Cargando banco completo de exámenes...</div>`;
        await loadExternalExamsBank();
    }

    const seenIds = new Set();
    const allEntries = [];
    Object.entries(state.functionMenus).forEach(([unitKey, menuObj]) => {
        const unitLabel = getFunctionLabel(unitKey);
        (menuObj.examenes || []).forEach(it => {
            if (!seenIds.has(it.value)) {
                seenIds.add(it.value);
                allEntries.push({
                    value: it.value,
                    label: it.label,
                    unitKey,
                    unitLabel
                });
            }
        });
    });

    Object.entries(EXAM_QUESTIONS_DB).forEach(([qid, qObj]) => {
        if (!seenIds.has(qid) && qObj.category !== 'test' && !qid.startsWith('test_')) {
            seenIds.add(qid);
            const uKey = qObj.unit || 'alcanos';
            allEntries.push({
                value: qid,
                label: qObj.badgeLabel || qObj.shortTitle || qid,
                unitKey: uKey,
                unitLabel: getFunctionLabel(uKey)
            });
        }
    });

    const terms = query.split(/\s+/).filter(Boolean);
    const matches = allEntries.filter(entry => {
        if (!matchesExamYearFilter(entry.label, selectedYear)) return false;
        if (terms.length === 0) return true;
        const qObj = EXAM_QUESTIONS_DB[entry.value] || {};
        const optsTxt = (qObj.options || []).map(o => o.text).join(' ');
        const haystack = normalizeSearchText(`${entry.label} ${entry.unitLabel} ${qObj.statement || ''} ${qObj.topic || ''} ${optsTxt}`);
        return terms.every(t => haystack.includes(t));
    });

    if (badgeEl) {
        badgeEl.innerText = `${matches.length} ejercicio${matches.length === 1 ? '' : 's'} encontrado${matches.length === 1 ? '' : 's'}`;
    }

    if (matches.length === 0) {
        resultsEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">No se encontraron ejercicios que coincidan con la búsqueda o el año seleccionado.</div>`;
        resultsEl.classList.remove('hidden');
        return;
    }

    resultsEl.innerHTML = matches.slice(0, 60).map(m => `
        <button
            type="button"
            onclick="openSearchedExamQuestion('${m.unitKey}', '${m.value}')"
            class="w-full text-left px-4 py-3 hover:bg-rose-950/45 transition flex items-center justify-between gap-3 cursor-pointer"
        >
            <div class="min-w-0">
                <span class="text-xs sm:text-sm font-extrabold text-slate-100 block truncate">${m.label}</span>
                <span class="text-[11px] font-semibold text-violet-300 block truncate">${m.unitLabel}</span>
            </div>
            <span class="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[11px] font-extrabold shrink-0">
                Resolver ➡
            </span>
        </button>
    `).join('');
    resultsEl.classList.remove('hidden');
}

export function clearHomeExamSearch() {
    const inputEl = document.getElementById('homeExamSearchInput');
    const yearEl = document.getElementById('homeExamYearFilter');
    if (inputEl) inputEl.value = '';
    if (yearEl) yearEl.value = 'all';
    handleHomeExamSearchAndFilter();
}

export async function openSearchedExamQuestion(unitKey, examId) {
    await loadExternalExamsBank();
    state.currentFunction = unitKey || (EXAM_QUESTIONS_DB[examId] && EXAM_QUESTIONS_DB[examId].unit) || 'alcanos';
    state.currentCategory = 'examenes';
    await wizardSelectExamQuestion(examId);
}

export async function wizardSelectExamQuestion(examId) {
    await loadExternalExamsBank();
    currentExamId = examId;
    examAnswered = false;

    const q = EXAM_QUESTIONS_DB[examId];
    if (!q) {
        alert('No se encontró el ejercicio seleccionado en el banco de exámenes.');
        return;
    }

    if (!state.currentFunction && q.unit) {
        state.currentFunction = q.unit;
    }
    if (!state.currentCategory) {
        state.currentCategory = q.category || 'examenes';
    }

    const cfg = state.functionMenus[state.currentFunction] || { examenes: [], test: [] };
    const list = cfg[state.currentCategory] || [];
    const idxInList = list.findIndex(x => x.value === examId);

    const badgeEl = document.getElementById('examSourceBadge');
    const counterEl = document.getElementById('examCounterBadge');
    const stmtEl = document.getElementById('examStatementText');
    const optsEl = document.getElementById('examOptionsGrid');
    const fbEl = document.getElementById('examFeedbackBanner');
    const nextBtn = document.getElementById('btnNextExamItem');

    if (badgeEl) badgeEl.innerText = `📝 ${q.badgeLabel || q.shortTitle || examId}`;
    if (counterEl) counterEl.innerText = idxInList >= 0 ? `Ejercicio ${idxInList + 1} de ${list.length}` : getFunctionLabel(state.currentFunction);
    if (stmtEl) stmtEl.innerText = q.statement || '';

    if (fbEl) {
        fbEl.classList.add('hidden');
        fbEl.innerText = '';
    }
    if (nextBtn) {
        nextBtn.classList.toggle('hidden', !(idxInList >= 0 && idxInList < list.length - 1));
    }

    if (optsEl) {
        optsEl.innerHTML = (q.options || []).map(opt => `
            <button
                type="button"
                id="examOptBtn_${opt.letter}"
                onclick="selectExamOption('${opt.letter}')"
                class="w-full text-left p-3.5 sm:p-4 rounded-2xl bg-slate-950/90 hover:bg-slate-800/90 border-2 border-slate-800 hover:border-rose-400/60 transition-all flex items-start gap-3 cursor-pointer"
            >
                <span class="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-extrabold text-slate-200 shrink-0 uppercase">
                    ${opt.letter}
                </span>
                <span class="text-xs sm:text-base font-semibold text-slate-100 leading-snug pt-0.5">${opt.text}</span>
            </button>
        `).join('');
    }

    showWizardStage(4);
}

export function selectExamOption(chosenLetter) {
    const q = EXAM_QUESTIONS_DB[currentExamId];
    if (!q) return;
    examAnswered = true;
    const correctLetter = String(q.correct || '').toLowerCase();
    const isRight = String(chosenLetter).toLowerCase() === correctLetter;

    (q.options || []).forEach(opt => {
        const btn = document.getElementById(`examOptBtn_${opt.letter}`);
        if (!btn) return;
        const l = String(opt.letter).toLowerCase();
        if (l === correctLetter) {
            btn.className = 'w-full text-left p-3.5 sm:p-4 rounded-2xl bg-emerald-950/70 border-2 border-emerald-400 text-emerald-100 flex items-start gap-3';
        } else if (l === String(chosenLetter).toLowerCase() && !isRight) {
            btn.className = 'w-full text-left p-3.5 sm:p-4 rounded-2xl bg-rose-950/70 border-2 border-rose-500 text-rose-100 flex items-start gap-3';
        } else {
            btn.className = 'w-full text-left p-3.5 sm:p-4 rounded-2xl bg-slate-950/60 border-2 border-slate-800/70 opacity-65 flex items-start gap-3';
        }
    });

    const fbEl = document.getElementById('examFeedbackBanner');
    if (fbEl) {
        fbEl.classList.remove('hidden');
        if (isRight) {
            fbEl.className = 'rounded-2xl p-4 border border-emerald-500/60 bg-emerald-950/60 text-emerald-200 text-xs sm:text-sm font-bold leading-relaxed';
            fbEl.innerText = q.feedbackCorrect || '¡Correcto!';
        } else {
            fbEl.className = 'rounded-2xl p-4 border border-rose-500/60 bg-rose-950/60 text-rose-200 text-xs sm:text-sm font-bold leading-relaxed';
            fbEl.innerText = q.feedbackWrong || `Incorrecto. La opción correcta es ${correctLetter}).`;
        }
    }
}

export async function launchExamAnimatedExplanation() {
    const q = EXAM_QUESTIONS_DB[currentExamId];
    if (!q) return;

    if (q.rxnKey) {
        state.currentKey = q.rxnKey;
        state.currentSubIdx = Number(q.subIdx) || 0;
        state.currentCatIdx = 0;
        state.currentStepIdx = 0;
        state.lastSceneState = null;
        currentViewBox.initialized = false;
        await ensureReactionLoaded(q.rxnKey);
        openFullscreenPlayer();
        return;
    }

    // Crear escena visual dinámica a partir de la fórmula/explicación del ítem
    const synthKey = `exam_explain_${currentExamId}`;
    const titleTxt = q.badgeLabel || q.shortTitle || 'Explicación del Ítem';
    const correctOpt = (q.options || []).find(o => String(o.letter).toLowerCase() === String(q.correct).toLowerCase());
    const answerTxt = correctOpt ? `${correctOpt.letter}) ${correctOpt.text}` : '';
    const formulaTxt = q.semiFormula || answerTxt || titleTxt;

    state.labData[synthKey] = {
        category: 'reacciones',
        title: titleTxt,
        natureBadge: 'Resolución Visual de Examen',
        description: `${q.statement}

Respuesta correcta: ${answerTxt}
${q.feedbackCorrect || ''}`,
        meta: {
            grupoFuncional: getFunctionLabel(state.currentFunction || q.unit || 'alcanos'),
            reaccionMecanismo: q.topic || titleTxt,
            naturaleza: 'Ítem oficial de examen de ingreso.',
            rupturaIntermediarios: q.feedbackCorrect || '',
            detalleMecanismo: `${q.statement} → ${answerTxt}`,
            reactivosCondiciones: titleTxt,
            rolReactivos: `Respuesta correcta: ${answerTxt}`,
            reglasObs: q.feedbackCorrect || ''
        },
        deltaH: answerTxt,
        substrates: [{ id: `${synthKey}_sub`, name: `${titleTxt} — Respuesta: ${answerTxt}`, catalyst: titleTxt }],
        catalysts: [titleTxt],
        getSteps: () => expandStepsToVisualMicroSteps([
            {
                title: `Paso 1 — Enunciado: ${titleTxt}`,
                semiStep: q.statement,
                semiGlobal: `${q.statement}  ──►  ${answerTxt}`,
                desc: q.statement,
                legend: {
                    breaking: 'Análisis del enunciado del examen.',
                    forming: 'Identificación de la regla o reacción aplicable.',
                    movement: 'Evaluación de las 5 opciones (a–e).'
                },
                scene: () => ({
                    atoms: [
                        { id: 'Q_NODE', el: (q.topic || titleTxt).substring(0, 38), x: 460, y: 185, highlight: '#38bdf8', label: titleTxt }
                    ],
                    bonds: []
                })
            },
            {
                title: `Paso 2 — Respuesta Correcta: ${answerTxt}`,
                semiStep: `RESPUESTA CORRECTA: ${answerTxt}`,
                semiGlobal: `${q.statement}  ──►  ${answerTxt}`,
                desc: q.feedbackCorrect || answerTxt,
                legend: {
                    breaking: 'Opciones distractoras descartadas.',
                    forming: `Opción correcta verificada: ${answerTxt}`,
                    movement: 'Solución consolidada.'
                },
                scene: () => buildSemidevelopedBannerScene(formulaTxt, '#10b981', [titleTxt, answerTxt])
            }
        ])
    };

    state.currentKey = synthKey;
    state.currentSubIdx = 0;
    state.currentCatIdx = 0;
    state.currentStepIdx = 0;
    state.lastSceneState = null;
    currentViewBox.initialized = false;
    openFullscreenPlayer();
}

export function goToNextExamItem() {
    const cfg = state.functionMenus[state.currentFunction] || { examenes: [], test: [] };
    const list = cfg[state.currentCategory] || [];
    const idx = list.findIndex(x => x.value === currentExamId);
    if (idx >= 0 && idx + 1 < list.length) {
        wizardSelectExamQuestion(list[idx + 1].value);
    }
}