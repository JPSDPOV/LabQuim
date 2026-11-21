import { state, parseFlexibleJson, isCompactMobile, normalizeSearchText, escHtml } from './state.js';
import { buildAutoNomenclatureScene, loadFormulaDictionary } from './chem-parser.js';
import { mapStageX, mapStageY, renderAnimatedBond, renderSingleAtomNode } from './svg-renderer.js';

let NOMENCLATURE_GROUPS = [
    { id: 'alcanos', label: '1. Alcanos', tier: 'primary' },
    { id: 'cicloalcanos', label: '2. Cicloalcanos', tier: 'primary' },
    { id: 'alquenos', label: '3. Alquenos', tier: 'primary' },
    { id: 'alquinos', label: '4. Alquinos', tier: 'primary' },
    { id: 'aromaticos', label: '5. Hidrocarburos aromáticos y derivados', tier: 'primary' },
    { id: 'haluros', label: '6. Halogenuros de alquilo', tier: 'primary' },
    { id: 'alcoholes', label: '7. Alcoholes', tier: 'primary' },
    { id: 'fenoles', label: '8. Fenoles', tier: 'primary' },
    { id: 'eteres', label: '9. Éteres', tier: 'primary' },
    { id: 'aminas', label: '10. Aminas', tier: 'primary' },
    { id: 'tioles', label: '11. Tioles', tier: 'primary' },
    { id: 'tioeteres', label: '12. Tioéteres', tier: 'primary' },
    { id: 'heterociclos_no_arom', label: '13. Compuestos heterociclos no aromáticos (O, N y S)', tier: 'primary' },
    { id: 'aldehidos', label: '14. Aldehídos', tier: 'primary' },
    { id: 'cetonas', label: '15. Cetonas', tier: 'primary' },
    { id: 'acidos', label: '16. Ácidos carboxílicos (hidroxiácidos y cetoácidos)', tier: 'primary' },
    { id: 'sales_acidos', label: '17. Sales de ácidos orgánicos', tier: 'primary' },
    { id: 'esteres', label: '18. Ésteres', tier: 'primary' },
    { id: 'amidas', label: '19. Amidas', tier: 'primary' },
    { id: 'anhidridos', label: '20. Anhídridos', tier: 'primary' },
    { id: 'haluros_acilo', label: '21. Halogenuros de ácidos', tier: 'primary' },
    { id: 'aminoacidos', label: '22. Aminoácidos', tier: 'primary' },
    { id: 'carbohidratos', label: '23. Hidratos de carbono (mono-, di- y polisacáridos)', tier: 'primary' },
    { id: 'lipidos', label: '24. Lípidos (ácidos grasos, acilgliceroles, ceras y fosfolípidos)', tier: 'primary' },
    { id: 'nitrilos', label: '25. Nitrilos', tier: 'extra' },
    { id: 'imina', label: '26. Iminas', tier: 'extra' },
    { id: 'tioesteres', label: '27. Tioésteres', tier: 'extra' },
    { id: 'nitrocompuestos', label: '28. Nitrocompuestos', tier: 'extra' },
    { id: 'azoderivados', label: '29. Azoderivados', tier: 'extra' }
];

let NOMENCLATURE_BANK = [];
let nomDeck = [];
let nomCurrentIndex = 0;
let nomIsFlipped = false;
let nomCorrectCount = 0;
let nomWrongCount = 0;
let nomMissedItems = [];
let nomJsonLoaded = false;

export async function loadExternalNomenclatureBank() {
    if (nomJsonLoaded) return;
    const urls = [
        `${state.reactionsBaseUrl}nomenclatura.json`,
        './reactions/nomenclatura.json',
        './nomenclatura.json'
    ];
    for (const url of urls) {
        try {
            const res = await fetch(url, { cache: 'default' });
            if (!res.ok) continue;
            const data = parseFlexibleJson(await res.text());
            if (Array.isArray(data.groups) && data.groups.length > 0) {
                NOMENCLATURE_GROUPS = data.groups;
            }
            if (Array.isArray(data.items) && data.items.length > 0) {
                NOMENCLATURE_BANK = data.items;
                nomJsonLoaded = true;
                break;
            }
        } catch (e) {}
    }
}

export async function openNomenclatureSetup() {
    await loadExternalNomenclatureBank();
    const wizSections = ['wizardHomeHub', 'wizardExamSearchHub', 'wizardStep1', 'wizardStep2', 'wizardStep3', 'wizardStep4', 'wizardExamStage', 'nomenclaturePracticeSection'];
    wizSections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const bar = document.getElementById('wizardBreadcrumb')?.parentElement;
    if (bar) bar.classList.add('hidden');

    const setupSec = document.getElementById('nomenclatureSetupSection');
    if (setupSec) setupSec.classList.remove('hidden');

    renderNomenclatureChecklist();
}

export function closeNomenclatureMode() {
    const setupSec = document.getElementById('nomenclatureSetupSection');
    const pracSec = document.getElementById('nomenclaturePracticeSection');
    if (setupSec) setupSec.classList.add('hidden');
    if (pracSec) pracSec.classList.add('hidden');

    const bar = document.getElementById('wizardBreadcrumb')?.parentElement;
    if (bar) bar.classList.remove('hidden');
    if (window.showWizardStage) window.showWizardStage(0);
}

export function renderNomenclatureChecklist() {
    const box = document.getElementById('nomGroupsChecklist');
    if (!box) return;
    const EXTRA_IDS = new Set(['nitrilos', 'imina', 'tioesteres', 'nitrocompuestos', 'azoderivados']);
    box.innerHTML = NOMENCLATURE_GROUPS.map(g => {
        const count = NOMENCLATURE_BANK.filter(it => it.group === g.id).length;
        const isExtra = g.tier === 'extra' || EXTRA_IDS.has(g.id);
        const cardStyle = isExtra
            ? 'bg-blue-950/65 hover:bg-blue-900/70 border-blue-500/45'
            : 'bg-emerald-950/65 hover:bg-emerald-900/70 border-emerald-500/45';
        const cbAccent = isExtra ? 'accent-blue-400' : 'accent-emerald-400';
        const badgeStyle = isExtra
            ? 'bg-blue-950 border-blue-400/50 text-blue-200'
            : 'bg-emerald-950 border-emerald-400/50 text-emerald-200';
        return `
            <label class="flex items-center justify-between gap-2.5 p-3 rounded-xl ${cardStyle} border cursor-pointer transition select-none">
                <div class="flex items-center gap-2.5 min-w-0">
                    <input type="checkbox" value="${g.id}" onchange="updateNomenclatureAvailableCount()" class="nom-group-cb w-4 h-4 ${cbAccent} rounded cursor-pointer shrink-0">
                    <span class="text-xs sm:text-sm font-bold text-slate-100 truncate">${g.label}</span>
                </div>
                <span class="px-2 py-0.5 rounded-md ${badgeStyle} border text-[11px] font-extrabold shrink-0">${count}</span>
            </label>
        `;
    }).join('');
    updateNomenclatureAvailableCount();
}

export function toggleAllNomenclatureGroups(checkedState) {
    document.querySelectorAll('.nom-group-cb').forEach(cb => { cb.checked = checkedState; });
    updateNomenclatureAvailableCount();
}

export function getSelectedNomenclatureGroups() {
    return Array.from(document.querySelectorAll('.nom-group-cb:checked')).map(cb => cb.value);
}

export function updateNomenclatureAvailableCount() {
    const selected = new Set(getSelectedNomenclatureGroups());
    const total = NOMENCLATURE_BANK.filter(it => selected.has(it.group)).length;
    const hint = document.getElementById('nomAvailableCountHint');
    if (hint) hint.innerText = `${total} compuesto${total === 1 ? '' : 's'} disponible${total === 1 ? '' : 's'}`;
}

export function startNomenclatureSession(customItems = null) {
    let pool = customItems;
    if (!pool) {
        const selectedGroups = new Set(getSelectedNomenclatureGroups());
        if (selectedGroups.size === 0) {
            alert('Selecciona al menos un grupo funcional en el checklist.');
            return;
        }
        pool = NOMENCLATURE_BANK.filter(it => selectedGroups.has(it.group));
    }
    if (pool.length === 0) {
        alert('No hay compuestos disponibles en los grupos seleccionados.');
        return;
    }

    // Barajar aleatoriamente (Fisher-Yates)
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const countVal = document.getElementById('nomQuestionCountSelect')?.value || '10';
    nomDeck = (countVal === 'all' || customItems) ? shuffled : shuffled.slice(0, Number(countVal));
    nomCurrentIndex = 0;
    nomCorrectCount = 0;
    nomWrongCount = 0;
    nomMissedItems = [];

    document.getElementById('nomenclatureSetupSection')?.classList.add('hidden');
    document.getElementById('nomSummaryBox')?.classList.add('hidden');
    document.getElementById('nomCardOuter')?.classList.remove('hidden');
    document.getElementById('nomCardWrapper')?.classList.remove('hidden');
    document.getElementById('nomenclaturePracticeSection')?.classList.remove('hidden');

    renderCurrentNomenclatureCard();
}

export function renderNomenclatureSceneToSvg(item) {
    const stage = document.getElementById('nomSvgStage');
    const svgEl = document.getElementById('nomSvgCanvas');
    if (!stage || !svgEl) return;

    let sc = item.scene || buildAutoNomenclatureScene(item.semiFormula);
    if (!sc) sc = { atoms: [], bonds: [] };

    // Compactar distancias de enlace (factor 0.64 alrededor del centro 460, 190) para enlaces cortos y limpios
    const COMPACT_K = 0.44;
    const compactX = (rawX) => mapStageX(460 + (rawX - 460) * COMPACT_K);
    const compactY = (rawY) => mapStageY(190 + (rawY - 190) * COMPACT_K);

    let html = '';
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const expand = (x1, y1, x2, y2) => {
        if (x1 < minX) minX = x1;
        if (x2 > maxX) maxX = x2;
        if (y1 < minY) minY = y1;
        if (y2 > maxY) maxY = y2;
    };

    const getNakedTextBox = (a) => {
        if (a.isVertex) return { hw: 0, hh: 0 };
        if (a.ring === 'phenyl') return { hw: 30, hh: 30 };
        const txt = String(a.el || '');
        const charHalf = isCompactMobile() ? 9.2 : 7.8;
        const hw = Math.max(15, txt.length * charHalf + 8);
        const hh = isCompactMobile() ? 21 : 17;
        return { hw, hh };
    };

    const atomMap = {};
    (sc.atoms || []).forEach(a => {
        atomMap[a.id] = {
            ...a,
            x: compactX(a.x),
            y: compactY(a.y),
            noShape: (a.ring !== 'phenyl'),
            noValenceDots: true,
            lightTheme: true
        };
    });

    (sc.bonds || []).forEach(b => {
        const a1 = atomMap[b.from];
        const a2 = atomMap[b.to];
        if (!a1 || !a2) return;
        const p1x = (a1.bondTargetX !== undefined) ? compactX(a1.bondTargetX) : a1.x;
        const p2x = (a2.bondTargetX !== undefined) ? compactX(a2.bondTargetX) : a2.x;
        const ang = Math.atan2(a2.y - a1.y, p2x - p1x);
        const cosA = Math.abs(Math.cos(ang));
        const sinA = Math.abs(Math.sin(ang));
        const box1 = a1.bondTargetX !== undefined ? { hw: 14, hh: getNakedTextBox(a1).hh } : getNakedTextBox(a1);
        const box2 = a2.bondTargetX !== undefined ? { hw: 14, hh: getNakedTextBox(a2).hh } : getNakedTextBox(a2);
        const trim1 = a1.isVertex ? 0 : (Math.min(box1.hw / (cosA || 0.01), box1.hh / (sinA || 0.01), Math.max(box1.hw, box1.hh)) + 4);
        const trim2 = a2.isVertex ? 0 : (Math.min(box2.hw / (cosA || 0.01), box2.hh / (sinA || 0.01), Math.max(box2.hw, box2.hh)) + 4);
        const mappedCenter = b.inwardCenter ? { x: compactX(b.inwardCenter.x), y: compactY(b.inwardCenter.y) } : null;
        html += renderAnimatedBond(p1x, a1.y, p2x, a2.y, b.order || 1, b.state || 'normal', true, b.order || 1, 1, 1, b.stereo || null, mappedCenter, true, trim1, trim2);
    });

    Object.values(atomMap).forEach(a => {
        if (a.isVertex) {
            expand(a.x - 8, a.y - 8, a.x + 8, a.y + 8);
            return;
        }
        const box = getNakedTextBox(a);
        expand(a.x - box.hw - 8, a.y - box.hh - 8, a.x + box.hw + 8, a.y + box.hh + 8);
        html += renderSingleAtomNode(a, null, { pairs: [], singleDot: null });
    });

    stage.innerHTML = html;
    if (isFinite(minX) && isFinite(maxX)) {
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const rawW = (maxX - minX) + 36;
        const rawH = (maxY - minY) + 32;
        // Mantener la proporción del contenedor de la tarjeta (~2.6:1 en escritorio, ~1.5:1 en móvil) para maximizar el tamaño sin recortes
        const cardEl = document.getElementById('nomSvgCanvas');
        const rect = cardEl ? cardEl.getBoundingClientRect() : null;
        const aspect = (rect && rect.width > 50 && rect.height > 50) ? (rect.width / rect.height) : 2.3;
        let spanW = Math.max(220, rawW);
        let spanH = Math.max(130, rawH);
        if (spanW / spanH < aspect) {
            spanW = spanH * aspect;
        } else {
            spanH = spanW / aspect;
        }
        const vbX = centerX - spanW / 2;
        const vbY = centerY - spanH / 2;
        svgEl.setAttribute('viewBox', `${vbX.toFixed(1)} ${vbY.toFixed(1)} ${spanW.toFixed(1)} ${spanH.toFixed(1)}`);
    }
}

export function renderCurrentNomenclatureCard() {
    const item = nomDeck[nomCurrentIndex];
    if (!item) return;

    nomIsFlipped = false;
    document.getElementById('nomCardInner')?.classList.remove('is-flipped');
    document.getElementById('nomControlsFlipHint')?.classList.remove('hidden');
    document.getElementById('nomControlsGradeRow')?.classList.add('hidden');

    document.getElementById('nomProgressBadge').innerText = `${nomCurrentIndex + 1} / ${nomDeck.length}`;
    const grpObj = NOMENCLATURE_GROUPS.find(g => g.id === item.group);
    document.getElementById('nomGroupTag').innerText = grpObj ? grpObj.label : item.group;
    document.getElementById('nomStereoHintBadge').innerText = item.badge || 'Compuesto Orgánico';
    document.getElementById('nomScoreCorrect').innerText = nomCorrectCount;
    document.getElementById('nomScoreWrong').innerText = nomWrongCount;

    const primaryEl = document.getElementById('nomAnswerPrimary');
    const nameStr = String(item.name || '');
    primaryEl.innerText = nameStr;
    const maxWordLen = Math.max(...nameStr.split(/[\s\-]/).map(w => w.length));
    primaryEl.className = 'font-extrabold text-white leading-snug max-w-full text-center';
    const cardBox = document.getElementById('nomCardWrapper');
    const cardW = (cardBox && cardBox.clientWidth > 100) ? cardBox.clientWidth : Math.min(480, window.innerWidth - 64);
    const innerAvailW = Math.max(180, cardW - 56);
    const maxStartPx = window.innerWidth < 640 ? 23 : 30;
    let fitPx = Math.min(maxStartPx, Math.max(11, Math.floor(innerAvailW / Math.max(8, maxWordLen * 0.68))));
    primaryEl.style.fontSize = fitPx + 'px';
    while (fitPx > 10.5 && primaryEl.scrollWidth > innerAvailW) {
        fitPx -= 0.5;
        primaryEl.style.fontSize = fitPx + 'px';
    }
    const synBox = document.getElementById('nomAnswerSynonymsBox');
    if (item.synonyms) {
        document.getElementById('nomAnswerSynonyms').innerText = item.synonyms;
        synBox.classList.remove('hidden');
    } else {
        synBox.classList.add('hidden');
    }

    // Limpiar cualquier mención residual a "Ejercicio Unidad 13:"
    const cleanExp = String(item.explanation || '')
        .replace(/^Ejercicio\s+Unidad\s+\d+\s*:\s*/i, '')
        .trim();
    document.getElementById('nomAnswerExplanation').innerText = cleanExp
        ? cleanExp.charAt(0).toUpperCase() + cleanExp.slice(1)
        : '';

    const prevBtn = document.getElementById('btnNomPrevCard');
    const nextBtn = document.getElementById('btnNomNextCard');
    if (prevBtn) prevBtn.disabled = (nomCurrentIndex <= 0);
    if (nextBtn) nextBtn.disabled = (nomCurrentIndex >= nomDeck.length - 1);

    renderNomenclatureSceneToSvg(item);
}

export function prevNomenclatureCard(ev) {
    if (ev) ev.stopPropagation();
    if (nomCurrentIndex > 0) {
        nomCurrentIndex--;
        renderCurrentNomenclatureCard();
    }
}

export function nextNomenclatureCard(ev) {
    if (ev) ev.stopPropagation();
    if (nomCurrentIndex < nomDeck.length - 1) {
        nomCurrentIndex++;
        renderCurrentNomenclatureCard();
    }
}

export function initNomenclatureCardGestures() {
    const cardEl = document.getElementById('nomCardWrapper');
    if (!cardEl || cardEl.dataset.gesturesBound) return;
    cardEl.dataset.gesturesBound = '1';

    let startX = 0;
    let startY = 0;
    let isPointerDown = false;

    cardEl.addEventListener('pointerdown', (e) => {
        startX = e.clientX;
        startY = e.clientY;
        isPointerDown = true;
    });

    cardEl.addEventListener('pointerup', (e) => {
        if (!isPointerDown) return;
        isPointerDown = false;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        // Deslizamiento horizontal (>= 35px) o toque simple (< 12px) voltea la tarjeta
        if (Math.abs(dx) >= 35 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            flipNomenclatureCard();
        } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
            flipNomenclatureCard();
        }
    });

    cardEl.addEventListener('pointercancel', () => {
        isPointerDown = false;
    });
}

export function handleNomenclatureDynamicSearch(rawQuery) {
    const dropdown = document.getElementById('nomSearchResultsDropdown');
    const clearBtn = document.getElementById('nomClearSearchBtn');
    if (!dropdown) return;

    const q = normalizeSearchText(rawQuery);
    if (clearBtn) {
        clearBtn.classList.toggle('hidden', q.length === 0);
    }

    if (q.length === 0) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        return;
    }

    const terms = q.split(/\s+/).filter(Boolean);
    const matches = NOMENCLATURE_BANK.filter(item => {
        const haystack = normalizeSearchText(
            `${item.name || ''} ${item.synonyms || ''} ${item.semiFormula || ''}`
        );
        return terms.every(t => haystack.includes(t));
    }).slice(0, 15);

    if (matches.length === 0) {
        dropdown.innerHTML = `
            <div class="px-4 py-3 text-xs text-slate-400 text-center">
                No se encontraron compuestos que coincidan con "<span class="text-slate-200 font-semibold">${rawQuery}</span>".
            </div>
        `;
        dropdown.classList.remove('hidden');
        return;
    }

    dropdown.innerHTML = matches.map((item, idx) => {
        const grpObj = NOMENCLATURE_GROUPS.find(g => g.id === item.group);
        const grpLabel = grpObj ? grpObj.label : (item.group || '');
        const synHtml = item.synonyms
            ? `<span class="text-[11px] text-amber-300/90 block truncate">También: ${item.synonyms}</span>`
            : '';

        return `
            <button
                type="button"
                onclick="selectSearchedNomenclatureItem(${idx})"
                class="w-full text-left px-4 py-2.5 hover:bg-cyan-950/50 transition flex items-center justify-between gap-3 cursor-pointer"
            >
                <div class="min-w-0">
                    <span class="text-sm font-bold text-slate-100 block truncate">${item.name}</span>
                    ${synHtml}
                    <span class="text-[11px] text-slate-400 block truncate">${grpLabel}</span>
                </div>
                <span class="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold shrink-0">
                    Ver figura ➡
                </span>
            </button>
        `;
    }).join('');

    window._nomLastSearchMatches = matches;
    dropdown.classList.remove('hidden');
}

export function selectSearchedNomenclatureItem(matchIdx) {
    const matches = window._nomLastSearchMatches || [];
    const selected = matches[matchIdx];
    if (!selected) return;

    const dropdown = document.getElementById('nomSearchResultsDropdown');
    if (dropdown) dropdown.classList.add('hidden');

    document.getElementById('nomenclatureSetupSection')?.classList.add('hidden');
    document.getElementById('nomSummaryBox')?.classList.add('hidden');
    document.getElementById('nomCardOuter')?.classList.remove('hidden');
    document.getElementById('nomCardWrapper')?.classList.remove('hidden');
    document.getElementById('nomenclaturePracticeSection')?.classList.remove('hidden');

    nomDeck = [selected];
    nomCurrentIndex = 0;
    nomCorrectCount = 0;
    nomWrongCount = 0;
    nomIsFlipped = false;

    renderCurrentNomenclatureCard();
}

export function clearNomenclatureSearch() {
    const input = document.getElementById('nomFormulaSearchInput');
    const dropdown = document.getElementById('nomSearchResultsDropdown');
    const clearBtn = document.getElementById('nomClearSearchBtn');
    if (input) input.value = '';
    if (dropdown) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
    }
    if (clearBtn) clearBtn.classList.add('hidden');
}

export function flipNomenclatureCard() {
    nomIsFlipped = !nomIsFlipped;
    const inner = document.getElementById('nomCardInner');
    if (inner) inner.classList.toggle('is-flipped', nomIsFlipped);
    if (nomIsFlipped) {
        document.getElementById('nomControlsFlipHint')?.classList.add('hidden');
        document.getElementById('nomControlsGradeRow')?.classList.remove('hidden');
        const primaryEl = document.getElementById('nomAnswerPrimary');
        const cardBox = document.getElementById('nomCardWrapper');
        if (primaryEl && cardBox && cardBox.clientWidth > 100) {
            const innerAvailW = cardBox.clientWidth - 56;
            let curPx = parseFloat(primaryEl.style.fontSize) || 20;
            while (curPx > 10.5 && primaryEl.scrollWidth > innerAvailW) {
                curPx -= 0.5;
                primaryEl.style.fontSize = curPx + 'px';
            }
        }
    }
}

export function gradeNomenclatureCard(isCorrect) {
    const currentItem = nomDeck[nomCurrentIndex];
    if (isCorrect) {
        nomCorrectCount++;
    } else {
        nomWrongCount++;
        nomMissedItems.push(currentItem);
    }

    document.getElementById('nomScoreCorrect').innerText = nomCorrectCount;
    document.getElementById('nomScoreWrong').innerText = nomWrongCount;

    if (nomCurrentIndex < nomDeck.length - 1) {
        nomCurrentIndex++;
        renderCurrentNomenclatureCard();
    } else {
        document.getElementById('nomCardOuter')?.classList.add('hidden');
        document.getElementById('nomCardWrapper')?.classList.add('hidden');
        document.getElementById('nomControlsFlipHint')?.classList.add('hidden');
        document.getElementById('nomControlsGradeRow')?.classList.add('hidden');
        document.getElementById('nomSummaryBox')?.classList.remove('hidden');
        document.getElementById('nomFinalCorrect').innerText = nomCorrectCount;
        document.getElementById('nomFinalWrong').innerText = nomWrongCount;

        const retryBtn = document.getElementById('btnRetryMissed');
        if (retryBtn) retryBtn.classList.toggle('hidden', nomMissedItems.length === 0);
    }
}

export function retryMissedNomenclature() {
    if (nomMissedItems.length > 0) {
        startNomenclatureSession([...nomMissedItems]);
    }
}