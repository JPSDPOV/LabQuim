import { state, isCompactMobile, escSvg } from './state.js';

export const currentViewBox = { x: 0, y: 0, w: 1040, h: 360, initialized: false };

export function easeInOutQuint(t) {
    return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

export function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function mapStageX(x) {
    return 34 + (x / 920) * 972;
}

export function mapStageY(y) {
    return 18 + (y / 340) * 324;
}

export function getNodeGeometry(a) {
    const mobile = isCompactMobile();
    if (a.ring === 'phenyl') {
     const rad = mobile ? 52 : 44;
     return { isPill: false, isRing: 'phenyl', r: rad, halfW: rad + 4, halfH: rad + 4, cfg: { bg: '#0f172a', border: '#e2e8f0', text: '#f8fafc', r: rad } };
    }
    const rawText = String(a.el || '');
    const compactLen = rawText.replace(/[₀-₉⁰-⁹⁺⁻°•]/g, '').length;
    const isCompactAtom = (rawText.length <= 3 && compactLen <= 2) || /^(CHO|NH₂|NO₂|CN|SH|CH₃|CH₂|CH|CO|OH)$/i.test(rawText);
    const baseKey = rawText === 'CH₃' ? 'CH3' : (rawText.replace(/[^A-Za-z]/g, '') || 'C');
    const cfg = state.atomColors[baseKey] || state.atomColors['C'] || { bg: '#1e293b', border: '#94a3b8', text: '#f8fafc', r: 19 };
    if (isCompactAtom) {
        const baseR = a.r || cfg.r || 24;
        const scaledBase = a.nomScale ? Math.round(baseR * a.nomScale) : baseR;
        const r = mobile ? Math.round(scaledBase * 1.35) : scaledBase;
        return { isPill: false, r, halfW: r, halfH: r, cfg };
    }
    const scaleM = a.nomScale || 1;
    const charW = (mobile ? 12.5 : 9.6) * scaleM;
    const pillW = Math.max(mobile ? 72 : Math.round(58 * scaleM), Math.min(520, rawText.length * charW + (mobile ? 32 : 26)));
    const pillH = mobile ? 46 : Math.round(38 * scaleM);
    return { isPill: true, r: 16, pillW, pillH, halfW: pillW / 2, halfH: pillH / 2, cfg };
}

export function computeAutomaticValenceDots(atom, connectedBonds) {
    // Si el JSON ya trae lonePairs o radical definidos explícitamente, respetarlos y complementar si falta
    const explicitPairs = Array.isArray(atom.lonePairs) ? [...atom.lonePairs] : null;
    const elRaw = String(atom.el || '').trim();
    const chargeRaw = String(atom.charge || '').trim();

    // Solo aplicar a átomos individuales (no a grupos poliatómicos como CH₃, OH, NH₂)
    const cleanSymbol = elRaw.replace(/[⁰-₉⁺⁻°•]/g, '').trim();
    const isNeutralZero = elRaw.includes('⁰') || elRaw.includes('°');
    const bondOrderSum = (connectedBonds || []).reduce((acc, b) => acc + (b.order || 1), 0);

    const VALENCE_TABLE = {
        'Li': 1, 'Na': 1, 'K': 1,
        'Be': 2, 'Mg': 2, 'Ca': 2, 'Zn': 2,
        'B': 3, 'Al': 3,
        'C': 4, 'Si': 4,
        'N': 5, 'P': 5,
        'O': 6, 'S': 6,
        'F': 7, 'Cl': 7, 'Br': 7, 'I': 7
    };

    if (!(cleanSymbol in VALENCE_TABLE)) {
        return { pairs: explicitPairs || [], singleDot: null };
    }

    let valence = VALENCE_TABLE[cleanSymbol];
    if (!isNeutralZero) {
        if (chargeRaw === '+' || chargeRaw === '+1') valence -= 1;
        else if (chargeRaw === '2+' || chargeRaw === '+2') valence -= 2;
        else if (chargeRaw === '-' || chargeRaw === '-1') valence += 1;
        else if (chargeRaw === '2-' || chargeRaw === '-2') valence += 2;
    }

    // Electrones no enlazantes = electrones de valencia - electrones compartidos en enlaces
    const nonBonding = Math.max(0, valence - bondOrderSum);

    // Direcciones ocupadas por los enlaces actuales para no superponer puntos sobre las líneas de enlace
    const occupiedAngles = (connectedBonds || []).map(b => b.angle);
    const CANDIDATE_DIRS = [
        { name: 'top', ang: -Math.PI / 2 },
        { name: 'bottom', ang: Math.PI / 2 },
        { name: 'right', ang: 0 },
        { name: 'left', ang: Math.PI },
        { name: 'top-left', ang: -(3 * Math.PI) / 4 },
        { name: 'top-right', ang: -Math.PI / 4 },
        { name: 'bottom-left', ang: (3 * Math.PI) / 4 },
        { name: 'bottom-right', ang: Math.PI / 4 }
    ];

    const isDirFree = (ang) => {
        return !occupiedAngles.some(occ => {
            let diff = Math.abs(ang - occ);
            while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
            return diff < 0.42; // ~24 grados de margen alrededor de cada enlace
        });
    };

    const freeDirs = CANDIDATE_DIRS.filter(d => isDirFree(d.ang)).map(d => d.name);

    if (explicitPairs && explicitPairs.length > 0) {
        return { pairs: explicitPairs, singleDot: null };
    }

    const numPairs = Math.floor(nonBonding / 2);
    const hasSingle = (nonBonding % 2) === 1;

    // Metales alcalinotérreos neutros (Mg⁰, Ca⁰, Zn⁰) tienen 2 electrones de valencia (1 par o 2 puntos visibles)
    const chosenPairs = freeDirs.slice(0, numPairs);
    const singleDir = (hasSingle && !atom.radical) ? (freeDirs[numPairs] || 'right') : null;

    return { pairs: chosenPairs, singleDot: singleDir };
}

export function renderInterpolatedFrame(prevScene, targetScene, rawT) {
    const mobile = isCompactMobile();
    const lightMode = Boolean(state.isStageLightMode);
    const clampedRaw = Math.min(1, Math.max(0, rawT));
    const t = easeInOutQuint(clampedRaw);
    const fadeT = easeOutQuart(clampedRaw);
    const stageGroup = document.getElementById('svgDynamicStage');
    const svgEl = document.getElementById('chemSvgCanvas');
    if (!stageGroup || !targetScene) return;

    let svgOut = '';
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const expandBounds = (x1, y1, x2, y2) => {
        if (x1 < minX) minX = x1;
        if (x2 > maxX) maxX = x2;
        if (y1 < minY) minY = y1;
        if (y2 > maxY) maxY = y2;
    };

    if (targetScene.brackets) {
        const brFont = mobile ? 16 : 11.5;
        targetScene.brackets.forEach(br => {
            const op = fadeT;
            const x1 = mapStageX(br.x1);
            const y1 = mapStageY(br.y1);
            const x2 = mapStageX(br.x2);
            const y2 = mapStageY(br.y2);
            const hook = mobile ? 16 : 12;
            const col = br.color || (lightMode ? '#334155' : '#94a3b8');
            expandBounds(x1 - 10, y1 - 10, x2 + 24, y2 + 28);
            svgOut += `
                <g opacity="${op}">
                    <path d="M ${x1 + hook} ${y1} L ${x1} ${y1} L ${x1} ${y2} L ${x1 + hook} ${y2}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M ${x2 - hook} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x2 - hook} ${y2}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                    ${(br.superscript !== undefined ? br.superscript : '‡') ? `<text x="${x2 + 6}" y="${y1 + 10}" fill="${br.supColor || '#fbbf24'}" font-size="${mobile ? 19 : 14}" font-weight="800">${escSvg(br.superscript !== undefined ? br.superscript : '‡')}</text>` : ''}
                    ${br.label ? `<text x="${(x1 + x2) / 2}" y="${y2 + (mobile ? 22 : 16)}" text-anchor="middle" fill="${lightMode ? '#0f172a' : '#e2e8f0'}" font-size="${brFont}" font-weight="800">${escSvg(br.label)}</text>` : ''}
                </g>
            `;
        });
    }

    if (targetScene.plates) {
        const plateFont = mobile ? 17 : 11.8;
        targetScene.plates.forEach(p => {
            const op = p.fadeIn ? t : 1;
            const px = mapStageX(p.x);
            const py = mapStageY(p.y);
            const pw = (p.w / 920) * 972;
            const ph = mobile ? Math.max(p.h, 32) : p.h;
            expandBounds(px, py, px + pw, py + ph);
            svgOut += `
                <g opacity="${op}">
                    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="8" fill="url(#metalGrad)" stroke="${p.stroke || '#94a3b8'}" stroke-width="2.2"/>
                    <text x="${px + pw / 2}" y="${py + ph / 2 + (mobile ? 6 : 4)}" text-anchor="middle" fill="#f8fafc" font-size="${plateFont}" font-weight="800" font-family="JetBrains Mono">${escSvg(p.text)}</text>
                </g>
            `;
        });
    }

    const prevAtomMap = {};
    if (prevScene && prevScene.atoms) {
        prevScene.atoms.forEach(a => { prevAtomMap[a.id] = a; });
    }
    const targetAtomMap = {};
    (targetScene.atoms || []).forEach(a => { targetAtomMap[a.id] = a; });

    const currentAtoms = {};
    const RAD_ANGLE = { right: 0, bottom: Math.PI / 2, left: -Math.PI, top: -Math.PI / 2 };

    (targetScene.atoms || []).forEach(ta => {
        const pa = prevAtomMap[ta.id];
        if (pa) {
            let radicalAngle = undefined;
            let radicalDraw = ta.radical;
            let radicalOpacity = 1;

            if (pa.radical && ta.radical) {
                const a1 = RAD_ANGLE[pa.radical] ?? 0;
                const a2 = RAD_ANGLE[ta.radical] ?? 0;
                let diff = a2 - a1;
                if (diff > Math.PI) diff -= 2 * Math.PI;
                if (diff < -Math.PI) diff += 2 * Math.PI;
                if (Math.abs(Math.abs(diff) - Math.PI) < 0.01) {
                    diff = (pa.radical === 'left' && ta.radical === 'right') ? Math.PI : -Math.PI;
                }
                radicalAngle = a1 + diff * t;
            } else if (pa.radical && !ta.radical && t < 0.85) {
                radicalDraw = pa.radical;
                radicalAngle = RAD_ANGLE[pa.radical] ?? 0;
                radicalOpacity = Math.max(0, 1 - t * 1.35);
            } else if (!pa.radical && ta.radical) {
                radicalAngle = RAD_ANGLE[ta.radical] ?? 0;
                radicalOpacity = Math.min(1, t * 1.4);
            }

            currentAtoms[ta.id] = {
                ...ta,
                x: mapStageX(lerp(pa.x, ta.x, t)),
                y: mapStageY(lerp(pa.y, ta.y, t)),
                opacity: lerp(pa.opacity !== undefined ? pa.opacity : 1, ta.opacity !== undefined ? ta.opacity : 1, t),
                radical: radicalDraw,
                radicalAngle,
                radicalOpacity
            };
        } else {
            const startX = ta.enterFromX !== undefined ? ta.enterFromX : ta.x;
            const startY = ta.enterFromY !== undefined ? ta.enterFromY : ta.y - 35;
            currentAtoms[ta.id] = {
                ...ta,
                x: mapStageX(lerp(startX, ta.x, t)),
                y: mapStageY(lerp(startY, ta.y, t)),
                opacity: t
            };
        }
    });

    if (prevScene && prevScene.atoms) {
        prevScene.atoms.forEach(pa => {
            if (!targetAtomMap[pa.id]) {
                const exitX = pa.exitToX !== undefined ? pa.exitToX : pa.x;
                const exitY = pa.exitToY !== undefined ? pa.exitToY : pa.y + 40;
                currentAtoms[pa.id] = {
                    ...pa,
                    x: mapStageX(lerp(pa.x, exitX, t)),
                    y: mapStageY(lerp(pa.y, exitY, t)),
                    opacity: 1 - t
                };
            }
        });
    }

    const prevBondMap = {};
    if (prevScene && prevScene.bonds) {
        prevScene.bonds.forEach(b => {
            const key = [b.from, b.to].sort().join('--');
            prevBondMap[key] = b;
        });
    }
    const targetBondKeys = new Set();
    const bondsByAtomId = {};

    (targetScene.bonds || []).forEach(b => {
        const key = [b.from, b.to].sort().join('--');
        targetBondKeys.add(key);
        const a1 = currentAtoms[b.from];
        const a2 = currentAtoms[b.to];
        if (!a1 || !a2) return;

        if (!bondsByAtomId[b.from]) bondsByAtomId[b.from] = [];
        if (!bondsByAtomId[b.to]) bondsByAtomId[b.to] = [];
        bondsByAtomId[b.from].push({ order: b.order || 1, angle: Math.atan2(a2.y - a1.y, a2.x - a1.x) });
        bondsByAtomId[b.to].push({ order: b.order || 1, angle: Math.atan2(a1.y - a2.y, a1.x - a2.x) });

        const existedBefore = !!prevBondMap[key];
        const prevOrder = existedBefore ? (prevBondMap[key].order || 1) : 0;
        const targetOrder = b.order || 1;

        let trim1 = 0, trim2 = 0;
        const ang = Math.atan2(a2.y - a1.y, a2.x - a1.x);
        const cosA = Math.abs(Math.cos(ang));
        const sinA = Math.abs(Math.sin(ang));
        const charHalf = mobile ? 9.5 : 8.2;
        if (!a1.isVertex) {
            if (a1.noShape) {
                const hw1 = Math.max(14, String(a1.el || '').length * charHalf + 6);
                const hh1 = mobile ? 19 : 16;
                trim1 = Math.min(hw1 / (cosA || 0.01), hh1 / (sinA || 0.01), Math.max(hw1, hh1)) + 5;
            } else {
                const g1 = getNodeGeometry(a1);
                trim1 = Math.min(g1.halfW / (cosA || 0.01), g1.halfH / (sinA || 0.01), Math.max(g1.halfW, g1.halfH)) + 6;
            }
        }
        if (!a2.isVertex) {
            if (a2.noShape) {
                const hw2 = Math.max(14, String(a2.el || '').length * charHalf + 6);
                const hh2 = mobile ? 19 : 16;
                trim2 = Math.min(hw2 / (cosA || 0.01), hh2 / (sinA || 0.01), Math.max(hw2, hh2)) + 5;
            } else {
                const g2 = getNodeGeometry(a2);
                trim2 = Math.min(g2.halfW / (cosA || 0.01), g2.halfH / (sinA || 0.01), Math.max(g2.halfW, g2.halfH)) + 6;
            }
        }
        svgOut += renderAnimatedBond(a1.x, a1.y, a2.x, a2.y, targetOrder, b.state || 'normal', existedBefore, prevOrder, t, Math.min(a1.opacity, a2.opacity), b.stereo || null, null, lightMode, trim1, trim2);
    });

    if (prevScene && prevScene.bonds) {
        prevScene.bonds.forEach(pb => {
            const key = [pb.from, pb.to].sort().join('--');
            if (!targetBondKeys.has(key)) {
                const a1 = currentAtoms[pb.from];
                const a2 = currentAtoms[pb.to];
                if (a1 && a2 && t < 0.88) {
                    const fadeOp = Math.max(0, 1 - (t / 0.85));
                    const midX = (a1.x + a2.x) / 2;
                    const midY = (a1.y + a2.y) / 2;
                    svgOut += `<line x1="${a1.x}" y1="${a1.y}" x2="${a2.x}" y2="${a2.y}" stroke="#ef4444" stroke-width="${3.8 * fadeOp}" stroke-dasharray="6,6" opacity="${fadeOp}" stroke-linecap="round"/>`;
                    if (t < 0.65) {
                        svgOut += `<circle cx="${midX}" cy="${midY}" r="${6 + t * 22}" fill="none" stroke="#f87171" stroke-width="2" opacity="${1 - t * 1.4}"/>`;
                    }
                }
            }
        });
    }

    if (targetScene.arrows) {
        const arrFont = mobile ? 16.5 : 11;
        const arrBoxH = mobile ? 23 : 16;
        const arrCharW = mobile ? 9.5 : 6.8;
        const op = fadeT;
        const pendingArrowLabels = [];

        targetScene.arrows.forEach(arr => {
            const marker = arr.type === 'fishhook' ? 'url(#arrowFishhook)' : (arr.color === '#f97316' ? 'url(#arrowOrange)' : 'url(#arrowFull)');
            const col = arr.color || (arr.type === 'fishhook' ? '#fbbf24' : '#38bdf8');
            const x1 = mapStageX(arr.x1), y1 = mapStageY(arr.y1);
            const cx = mapStageX(arr.cx), cy = mapStageY(arr.cy);
            const x2 = mapStageX(arr.x2), y2 = mapStageY(arr.y2);
            expandBounds(Math.min(x1, cx, x2) - 10, Math.min(y1, cy, y2) - 10, Math.max(x1, cx, x2) + 10, Math.max(y1, cy, y2) + 10);
            svgOut += `
                <g opacity="${op}">
                    <path d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="${mobile ? 3.2 : 2.5}" marker-end="${marker}" class="arrow-flow"/>
                </g>
            `;
            if (arr.label) {
                const bw = arr.label.length * arrCharW + 14;
                pendingArrowLabels.push({
                    text: arr.label,
                    col,
                    lx: cx,
                    ly: cy - arrBoxH - 5,
                    bw,
                    bh: arrBoxH
                });
            }
        });

        for (let pass = 0; pass < 5; pass++) {
            for (let i = 0; i < pendingArrowLabels.length; i++) {
                for (let j = i + 1; j < pendingArrowLabels.length; j++) {
                    const A = pendingArrowLabels[i];
                    const B = pendingArrowLabels[j];
                    const minSepX = (A.bw + B.bw) / 2 + 10;
                    const overlapX = Math.abs(A.lx - B.lx) < minSepX;
                    const overlapY = Math.abs(A.ly - B.ly) < (A.bh + 4);
                    if (overlapX && overlapY) {
                        const push = (minSepX - Math.abs(A.lx - B.lx)) / 2 + 2;
                        if (A.lx <= B.lx) { A.lx -= push; B.lx += push; }
                        else { A.lx += push; B.lx -= push; }
                    }
                }
                // Apartar el cartel de la flecha si pisa algún círculo de átomo
                const L = pendingArrowLabels[i];
                Object.values(currentAtoms).forEach(at => {
                    if (at.opacity <= 0.1) return;
                    const dx = L.lx - at.x;
                    const dy = (L.ly + L.bh / 2) - at.y;
                    if (Math.abs(dx) < (L.bw / 2 + 26) && Math.abs(dy) < (L.bh / 2 + 24)) {
                        L.lx += dx >= 0 ? 32 : -32;
                    }
                });
                if (L.lx - L.bw / 2 < 6) L.lx = L.bw / 2 + 6;
                if (L.lx + L.bw / 2 > 1034) L.lx = 1034 - L.bw / 2;
            }
        }

        pendingArrowLabels.forEach(L => {
            expandBounds(L.lx - L.bw / 2, L.ly - 2, L.lx + L.bw / 2, L.ly + L.bh + 2);
            const arrBg = lightMode ? 'rgba(255,255,255,0.96)' : 'rgba(15,23,42,0.94)';
            const arrTxtCol = (lightMode && L.col === '#38bdf8') ? '#0369a1' : ((lightMode && L.col === '#f97316') ? '#c2410c' : L.col);
            svgOut += `
                <g opacity="${op}">
                    <rect x="${L.lx - L.bw / 2}" y="${L.ly}" width="${L.bw}" height="${L.bh}" rx="5" fill="${arrBg}" stroke="${arrTxtCol}" stroke-width="1.3"/>
                    <text x="${L.lx}" y="${L.ly + L.bh * 0.72}" text-anchor="middle" fill="${arrTxtCol}" font-size="${arrFont}" font-weight="800">${escSvg(L.text)}</text>
                </g>
            `;
        });
    }

    if (targetScene.texts) {
        targetScene.texts.forEach(tx => {
            const txX = mapStageX(tx.x);
            const txY = mapStageY(tx.y);
            const baseSize = tx.size || 20;
            const finalSize = mobile ? Math.round(baseSize * 1.45) : baseSize;
            expandBounds(txX - 15, txY - finalSize, txX + 15, txY + 8);
            let txCol = tx.color || '#cbd5e1';
            if (lightMode) {
                if (!tx.color || tx.color === '#cbd5e1' || tx.color === '#38bdf8') {
                    txCol = '#0f172a';
                } else if (/^(#fbbf24|#f59e0b|#fde047|#eab308|yellow|amber)$/i.test(tx.color.trim())) {
                    txCol = '#c2410c';
                }
            }
            svgOut += `<text x="${txX}" y="${txY}" text-anchor="middle" fill="${txCol}" font-size="${finalSize}" font-weight="800" opacity="${fadeT}">${escSvg(tx.text)}</text>`;
        });
    }

    const visibleAtoms = Object.values(currentAtoms).filter(a => a.opacity > 0.02);
    const pendingLabels = [];
    const lblFont = mobile ? 17.5 : 11;
    const lblBoxH = mobile ? 24 : 17;
    const lblCharW = mobile ? 9.8 : 6.4;
    const lblStepY = mobile ? 25 : 18;

    visibleAtoms.forEach(a => {
        const geom = getNodeGeometry(a);
        const valenceInfo = computeAutomaticValenceDots(a, bondsByAtomId[a.id] || []);
        const extraRad = (a.radical || valenceInfo.pairs.length > 0 || valenceInfo.singleDot) ? (mobile ? 20 : 15) : 4;
        expandBounds(a.x - geom.halfW - extraRad, a.y - geom.halfH - extraRad, a.x + geom.halfW + extraRad, a.y + geom.halfH + extraRad);
        svgOut += renderSingleAtomNode(lightMode ? { ...a, lightTheme: true } : a, geom, valenceInfo);
        if (a.label) {
            const isTop = a.labelPos === 'top';
            const rawLy = isTop ? (a.y - geom.halfH - (mobile ? 17 : 12)) : (a.y + geom.halfH + (mobile ? 21 : 15));
            const lw = a.label.length * lblCharW + 16;
            pendingLabels.push({
                text: a.label,
                lx: a.x,
                ly: rawLy,
                lw,
                lh: lblBoxH,
                isTop,
                opacity: a.opacity !== undefined ? a.opacity : 1
            });
        }
    });

    for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < pendingLabels.length; i++) {
            for (let j = i + 1; j < pendingLabels.length; j++) {
                const L1 = pendingLabels[i];
                const L2 = pendingLabels[j];
                const overlapX = Math.abs(L1.lx - L2.lx) < (L1.lw + L2.lw) / 2 + 6;
                const overlapY = Math.abs(L1.ly - L2.ly) < lblStepY;
                if (overlapX && overlapY) {
                    if (L2.isTop) L2.ly -= lblStepY;
                    else L2.ly += lblStepY;
                }
            }
            const L = pendingLabels[i];
            if (L.lx - L.lw / 2 < 6) L.lx = L.lw / 2 + 6;
            if (L.lx + L.lw / 2 > 1034) L.lx = 1034 - L.lw / 2;
            if (L.ly < 18) L.ly = 18;
            if (L.ly > 365) L.ly = 365;
        }
    }

    pendingLabels.forEach(L => {
        expandBounds(L.lx - L.lw / 2, L.ly - lblBoxH * 0.68, L.lx + L.lw / 2, L.ly + lblBoxH * 0.35);
        const lblBg = lightMode ? 'rgba(241, 245, 249, 0.96)' : 'rgba(15, 23, 42, 0.94)';
        const lblStroke = lightMode ? 'rgba(15, 23, 42, 0.35)' : 'rgba(148, 163, 184, 0.4)';
        const lblTxtCol = lightMode ? '#0f172a' : '#e2e8f0';
        svgOut += `
            <g opacity="${L.opacity}">
                <rect x="${L.lx - L.lw / 2}" y="${L.ly - lblBoxH * 0.68}" width="${L.lw}" height="${lblBoxH}" rx="5" fill="${lblBg}" stroke="${lblStroke}" stroke-width="1.2"/>
                <text x="${L.lx}" y="${L.ly + (mobile ? 2.5 : 0.5)}" text-anchor="middle" fill="${lblTxtCol}" font-size="${lblFont}" font-weight="700">${escSvg(L.text)}</text>
            </g>
        `;
    });

    stageGroup.innerHTML = svgOut;

    if (svgEl && isFinite(minX) && isFinite(maxX)) {
        if (targetScene.forceCentered) {
            // Centrado geométrico simétrico alrededor del centro del lienzo (520, 185)
            const halfSpanX = Math.max(260, Math.abs(520 - minX) + 40, Math.abs(maxX - 520) + 40);
            const vbW = Math.min(1040, halfSpanX * 2);
            const vbX = Math.max(0, 520 - vbW / 2);
            const vbH = Math.min(360, Math.max(240, (maxY - minY) + 90));
            const vbY = Math.max(0, 185 - vbH / 2);
            currentViewBox = { x: vbX, y: vbY, w: vbW, h: vbH, initialized: true };
            svgEl.setAttribute('viewBox', `${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`);
        } else {
            const padX = mobile ? 14 : 26;
            const padY = mobile ? 14 : 20;
            const targetVbX = Math.max(0, minX - padX);
            const targetVbY = Math.max(0, minY - padY);
            const targetVbW = Math.max(320, Math.min(1040 - targetVbX, (maxX - minX) + padX * 2));
            const targetVbH = Math.max(190, Math.min(380 - targetVbY, (maxY - minY) + padY * 2));

            if (!currentViewBox.initialized || clampedRaw >= 0.99) {
                currentViewBox = { x: targetVbX, y: targetVbY, w: targetVbW, h: targetVbH, initialized: true };
            } else {
                const camEase = 0.22;
                currentViewBox.x = lerp(currentViewBox.x, targetVbX, camEase);
                currentViewBox.y = lerp(currentViewBox.y, targetVbY, camEase);
                currentViewBox.w = lerp(currentViewBox.w, targetVbW, camEase);
                currentViewBox.h = lerp(currentViewBox.h, targetVbH, camEase);
            }
            svgEl.setAttribute('viewBox', `${currentViewBox.x.toFixed(1)} ${currentViewBox.y.toFixed(1)} ${currentViewBox.w.toFixed(1)} ${currentViewBox.h.toFixed(1)}`);
        }
    }
}

export function renderAnimatedBond(x1, y1, x2, y2, order, state, existedBefore, prevOrder, t, baseOpacity, stereo = null, inwardCenter = null, lightTheme = false, trim1 = 0, trim2 = 0) {
    const mobile = isCompactMobile();
    const rawDx = x2 - x1;
    const rawDy = y2 - y1;
    const rawLen = Math.sqrt(rawDx * rawDx + rawDy * rawDy) || 1;
    const ux = rawDx / rawLen;
    const uy = rawDy / rawLen;
    const nx = -uy;
    const ny = ux;
    if (trim1 > 0 || trim2 > 0) {
        const minVisibleBond = lightTheme ? 13 : 12;
        const avail = Math.max(0, rawLen - minVisibleBond);
        const totalReq = trim1 + trim2;
        const scaleTrim = totalReq > avail && totalReq > 0 ? (avail / totalReq) : 1;
        const t1 = trim1 * scaleTrim;
        const t2 = trim2 * scaleTrim;
        x1 = x1 + ux * t1;
        y1 = y1 + uy * t1;
        x2 = x2 - ux * t2;
        y2 = y2 - uy * t2;
    }

    let stroke = lightTheme ? '#0f172a' : '#cbd5e1';
    let width = lightTheme ? 2.4 : (mobile ? 4.2 : 3.2);
    let dash = '';
    let glow = '';

    if (state === 'breaking') {
        stroke = '#ef4444';
        width = mobile ? 5.0 : 4.0;
        dash = 'stroke-dasharray="7,5"';
        glow = 'filter="drop-shadow(0 0 6px rgba(239,68,68,0.8))"';
    } else if (state === 'forming') {
        stroke = '#10b981';
        width = mobile ? 5.0 : 4.0;
        dash = 'stroke-dasharray="6,4"';
        glow = 'filter="drop-shadow(0 0 6px rgba(16,185,129,0.85))"';
    } else if (state === 'new') {
        stroke = '#10b981';
        width = mobile ? 5.4 : 4.4;
        glow = 'filter="drop-shadow(0 0 7px rgba(16,185,129,0.75))"';
    }

    let drawX2 = x2;
    let drawY2 = y2;
    let bondFadeOp = baseOpacity;
    if (!existedBefore && t < 1) {
        const growT = easeOutQuart(Math.min(1, t * 1.1));
        drawX2 = lerp(x1, x2, growT);
        drawY2 = lerp(y1, y2, growT);
        bondFadeOp = baseOpacity * Math.min(1, t * 1.6);
    }

    let html = `<g opacity="${bondFadeOp}" ${glow}>`;

    if (order === 1 && stereo === 'wedge') {
        const startOff = trim1 === 0 ? 0 : Math.min(trim1, lightTheme ? 2 : (mobile ? 10 : 7));
        const endOff = trim2 === 0 ? 0 : Math.min(trim2, lightTheme ? 2 : (mobile ? 10 : 7));
        const sx = x1 + ux * startOff;
        const sy = y1 + uy * startOff;
        const ex = drawX2 - ux * endOff;
        const ey = drawY2 - uy * endOff;
        const halfBase = lightTheme ? 5.2 : (mobile ? 6.8 : 5.4);
        const fillCol = (state === 'new' || state === 'forming') ? '#10b981' : (state === 'breaking' ? '#ef4444' : (lightTheme ? '#0f172a' : '#e2e8f0'));
        html += `<polygon points="${sx.toFixed(1)},${sy.toFixed(1)} ${(ex + nx * halfBase).toFixed(1)},${(ey + ny * halfBase).toFixed(1)} ${(ex - nx * halfBase).toFixed(1)},${(ey - ny * halfBase).toFixed(1)}" fill="${fillCol}" ${state === 'forming' || state === 'breaking' ? 'fill-opacity="0.45" stroke="' + fillCol + '" stroke-width="1.6" ' + dash : ''}/>`;
    } else if (order === 1 && stereo === 'dash') {
        const startOff = trim1 === 0 ? 0 : Math.min(trim1, lightTheme ? 2 : (mobile ? 10 : 7));
        const endOff = trim2 === 0 ? 0 : Math.min(trim2, lightTheme ? 2 : (mobile ? 10 : 7));
        const sx = x1 + ux * startOff;
        const sy = y1 + uy * startOff;
        const ex = drawX2 - ux * endOff;
        const ey = drawY2 - uy * endOff;
        const steps = lightTheme ? 5 : 6;
        const maxHalf = lightTheme ? 5.5 : (mobile ? 6.8 : 5.6);
        const dashCol = (state === 'new' || state === 'forming') ? '#10b981' : (state === 'breaking' ? '#ef4444' : (lightTheme ? '#0f172a' : '#cbd5e1'));
        for (let k = 1; k <= steps; k++) {
            const frac = (k - 0.1) / steps;
            const px = lerp(sx, ex, frac);
            const py = lerp(sy, ey, frac);
            const hw = Math.max(1.5, maxHalf * frac);
            html += `<line x1="${(px + nx * hw).toFixed(1)}" y1="${(py + ny * hw).toFixed(1)}" x2="${(px - nx * hw).toFixed(1)}" y2="${(py - ny * hw).toFixed(1)}" stroke="${dashCol}" stroke-width="${lightTheme ? 1.4 : (mobile ? 1.8 : 1.5)}" stroke-linecap="butt"/>`;
        }
    } else if (order === 1) {
        html += `<line x1="${x1}" y1="${y1}" x2="${drawX2}" y2="${drawY2}" stroke="${stroke}" stroke-width="${width}" ${dash} stroke-linecap="round"/>`;
        if (existedBefore && prevOrder >= 2 && t < 0.85) {
            const piOp = Math.max(0, 1 - t * 1.25);
            const off = mobile ? 6.8 : 5.5;
            html += `<line x1="${x1 - nx * off}" y1="${y1 - ny * off}" x2="${x2 - nx * off}" y2="${y2 - ny * off}" stroke="#ef4444" stroke-width="3.4" stroke-dasharray="5,5" opacity="${piOp}" stroke-linecap="round"/>`;
        }
    } else if (order === 2 && inwardCenter) {
        // Doble enlace aromático/cíclico: línea exterior completa + línea interior paralela proporcional al lado (estilo IUPAC / tolueno)
        const segLen = Math.hypot(drawX2 - x1, drawY2 - y1) || 1;
        const midX = (x1 + drawX2) / 2;
        const midY = (y1 + drawY2) / 2;
        const toCx = inwardCenter.x - midX;
        const toCy = inwardCenter.y - midY;
        const dotSign = (nx * toCx + ny * toCy) >= 0 ? 1 : -1;
        const inNx = nx * dotSign;
        const inNy = ny * dotSign;
        const inOff = Math.min(7.5, Math.max(3.6, segLen * 0.175));
        const trim = Math.max(3.2, segLen * 0.135);
        const ix1 = x1 + ux * trim + inNx * inOff;
        const iy1 = y1 + uy * trim + inNy * inOff;
        const ix2 = drawX2 - ux * trim + inNx * inOff;
        const iy2 = drawY2 - uy * trim + inNy * inOff;
        const aromStroke = lightTheme ? '#0f172a' : '#e2e8f0';
        const outerW = lightTheme ? 2.4 : (mobile ? 3.8 : 2.8);
        const innerW = lightTheme ? 2.1 : (mobile ? 3.2 : 2.4);
        html += `
            <line x1="${x1}" y1="${y1}" x2="${drawX2}" y2="${drawY2}" stroke="${aromStroke}" stroke-width="${outerW}" stroke-linecap="round"/>
            <line x1="${ix1.toFixed(1)}" y1="${iy1.toFixed(1)}" x2="${ix2.toFixed(1)}" y2="${iy2.toFixed(1)}" stroke="${aromStroke}" stroke-width="${innerW}" stroke-linecap="round"/>
        `;
    } else if (order === 2) {
        const off = lightTheme ? 4.2 : (mobile ? 6.6 : 5.4);
        let piStroke = lightTheme ? '#0f172a' : '#a78bfa';
        let piDash = '';
        let piGlow = '';
        if (state === 'breaking-pi' || state === 'breaking') {
            piStroke = '#ef4444';
            piDash = 'stroke-dasharray="6,5"';
        } else if (state === 'forming-pi' || state === 'forming') {
            piStroke = '#10b981';
            piDash = 'stroke-dasharray="6,4"';
            piGlow = 'filter="drop-shadow(0 0 6px rgba(16,185,129,0.85))"';
        } else if (state === 'new-pi' || state === 'new') {
            piStroke = '#10b981';
            piGlow = 'filter="drop-shadow(0 0 7px rgba(16,185,129,0.8))"';
        }
        const w2a = lightTheme ? 2.2 : (mobile ? 4.0 : 3.0);
        const w2b = lightTheme ? 2.2 : (mobile ? 4.2 : 3.2);
        html += `
            <line x1="${x1 + nx * off}" y1="${y1 + ny * off}" x2="${drawX2 + nx * off}" y2="${drawY2 + ny * off}" stroke="${lightTheme ? '#0f172a' : '#cbd5e1'}" stroke-width="${w2a}" stroke-linecap="round"/>
            <line x1="${x1 - nx * off}" y1="${y1 - ny * off}" x2="${drawX2 - nx * off}" y2="${drawY2 - ny * off}" stroke="${piStroke}" stroke-width="${w2b}" ${piDash} ${piGlow} stroke-linecap="round"/>
        `;
    } else if (order === 3) {
        const off = lightTheme ? 5.2 : (mobile ? 8.2 : 6.8);
        const piStroke = (state === 'breaking-pi' || state === 'breaking') ? '#ef4444' : ((state === 'new' || state === 'new-pi') ? '#10b981' : (lightTheme ? '#0f172a' : '#38bdf8'));
        const piDash = (state === 'breaking-pi' || state === 'breaking') ? 'stroke-dasharray="6,5"' : '';
        const w3a = lightTheme ? 2.2 : (mobile ? 3.8 : 3.0);
        const w3b = lightTheme ? 2.1 : (mobile ? 3.5 : 2.8);
        html += `
            <line x1="${x1}" y1="${y1}" x2="${drawX2}" y2="${drawY2}" stroke="${lightTheme ? '#0f172a' : '#cbd5e1'}" stroke-width="${w3a}" stroke-linecap="round"/>
            <line x1="${x1 + nx * off}" y1="${y1 + ny * off}" x2="${drawX2 + nx * off}" y2="${drawY2 + ny * off}" stroke="${piStroke}" stroke-width="${w3b}" ${piDash} stroke-linecap="round"/>
            <line x1="${x1 - nx * off}" y1="${y1 - ny * off}" x2="${drawX2 - nx * off}" y2="${drawY2 - ny * off}" stroke="${piStroke}" stroke-width="${w3b}" ${piDash} stroke-linecap="round"/>
        `;
    }

    html += `</g>`;
    return html;
}

export function renderSingleAtomNode(a, geom, valenceInfo) {
    const mobile = isCompactMobile();
    const g = geom || getNodeGeometry(a);
    const cfg = g.cfg;
    const bg = a.lightTheme ? '#ffffff' : (a.bg || cfg.bg);
    const border = a.lightTheme ? (a.highlight || '#0f172a') : (a.border || cfg.border);
    const textCol = a.lightTheme ? '#0f172a' : (a.text || cfg.text);

    if (a.isVertex) {
        return '';
    }
    let html = `<g transform="translate(${a.x}, ${a.y})" opacity="${a.opacity !== undefined ? a.opacity : 1}">`;
    if (a.noShape) {
        const fontSz = mobile ? 23 : 20;
        html += `<text x="0" y="${mobile ? 8 : 7}" text-anchor="middle" fill="${textCol}" font-size="${fontSz}" font-weight="800" font-family="JetBrains Mono, monospace">${escSvg(a.el)}</text>`;
    } else if (g.isRing === 'phenyl') {
     const R = g.r;
     const rIn = R * 0.76;
     const pts = [];
     for (let k = 0; k < 6; k++) {
         const ang = -Math.PI / 2 + (Math.PI / 3) * k;
         pts.push(`${(Math.cos(ang) * R).toFixed(1)},${(Math.sin(ang) * R).toFixed(1)}`);
     }
     if (a.highlight) {
         html += `<circle cx="0" cy="0" r="${R + 7}" fill="none" stroke="${a.highlight}" stroke-width="2.2" opacity="0.65"/>`;
     }
     const phFill = a.lightTheme ? '#ffffff' : '#0f172a';
     const phStroke = a.lightTheme ? '#0f172a' : '#e2e8f0';
     html += `<polygon points="${pts.join(' ')}" fill="${phFill}" stroke="${phStroke}" stroke-width="2.6" stroke-linejoin="round"/>`;
     for (const k of [0, 2, 4]) {
         const a1 = -Math.PI / 2 + (Math.PI / 3) * k;
         const a2 = -Math.PI / 2 + (Math.PI / 3) * (k + 1);
         const mx1 = Math.cos(a1) * rIn + (Math.cos(a2) - Math.cos(a1)) * 0.12 * rIn;
         const my1 = Math.sin(a1) * rIn + (Math.sin(a2) - Math.sin(a1)) * 0.12 * rIn;
         const mx2 = Math.cos(a2) * rIn - (Math.cos(a2) - Math.cos(a1)) * 0.12 * rIn;
         const my2 = Math.sin(a2) * rIn - (Math.sin(a2) - Math.sin(a1)) * 0.12 * rIn;
         html += `<line x1="${mx1.toFixed(1)}" y1="${my1.toFixed(1)}" x2="${mx2.toFixed(1)}" y2="${my2.toFixed(1)}" stroke="${phStroke}" stroke-width="2.2" stroke-linecap="round"/>`;
     }
    } else if (g.isPill) {
        const w = g.pillW;
        const h = g.pillH;
        const scaleM = a.nomScale || 1;
        const pillFont = mobile ? 19.5 : Math.round(14.5 * scaleM);
        if (a.highlight) {
            html += `<rect x="${-w / 2 - 4}" y="${-h / 2 - 4}" width="${w + 8}" height="${h + 8}" rx="14" fill="none" stroke="${a.highlight}" stroke-width="2.2" opacity="0.65"/>`;
        }
        html += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="11" fill="${bg}" stroke="${border}" stroke-width="2.6"/>`;
        html += `<text x="0" y="${mobile ? 7 : Math.round(5.2 * scaleM)}" text-anchor="middle" fill="${textCol}" font-size="${pillFont}" font-weight="800" font-family="JetBrains Mono, monospace">${escSvg(a.el)}</text>`;
    } else {
        const r = g.r;
        const scaleM = a.nomScale || 1;
        const isChGroup = (a.el === 'CH₃' || a.el === 'CH₂' || a.el === 'CH');
        const atomFont = mobile
            ? (isChGroup ? 19 : (r > 22 ? 23 : 20))
            : Math.round((isChGroup ? 14.5 : (r > 20 ? 16.5 : 15)) * scaleM);
        if (a.highlight) {
            html += `<circle cx="0" cy="0" r="${r + 6}" fill="none" stroke="${a.highlight}" stroke-width="2.4" opacity="0.65"/>`;
        }
        html += `<circle cx="0" cy="0" r="${r}" fill="${bg}" stroke="${border}" stroke-width="2.8" />`;
        html += `<text x="0" y="${mobile ? 7 : Math.round(5.2 * scaleM)}" text-anchor="middle" fill="${textCol}" font-size="${atomFont}" font-weight="800" font-family="JetBrains Mono, monospace">${escSvg(a.el)}</text>`;
    }

    if (a.charge) {
        const chargeCol = a.charge.includes('+') ? '#38bdf8' : '#f87171';
        const cFont = mobile ? 15.5 : 10.5;
        const cw = a.charge.length * (mobile ? 10 : 7) + (mobile ? 14 : 8);
        const ch = mobile ? 23 : 16;
        const cxOff = g.halfW - 4;
        const cyOff = -g.halfH - (mobile ? 15 : 11);
        html += `<rect x="${cxOff}" y="${cyOff}" width="${cw}" height="${ch}" rx="6" fill="#0f172a" stroke="${chargeCol}" stroke-width="1.6"/>`;
        html += `<text x="${cxOff + cw / 2}" y="${cyOff + (mobile ? 16.5 : 11.5)}" text-anchor="middle" fill="${chargeCol}" font-size="${cFont}" font-weight="800">${escSvg(a.charge)}</text>`;
    }

    if (a.radical) {
        const radDist = mobile ? 11 : 8;
        let rx = g.halfW + radDist, ry = 0;
        if (typeof a.radicalAngle === 'number') {
            rx = Math.cos(a.radicalAngle) * (g.halfW + radDist);
            ry = Math.sin(a.radicalAngle) * (g.halfH + radDist);
        } else {
            if (a.radical === 'left') { rx = -g.halfW - radDist; ry = 0; }
            if (a.radical === 'top') { rx = 0; ry = -g.halfH - radDist; }
            if (a.radical === 'bottom') { rx = 0; ry = g.halfH + radDist; }
        }
        const radOp = a.radicalOpacity !== undefined ? a.radicalOpacity : 1;
        html += `<g opacity="${radOp}">`;
        html += `<circle cx="${rx}" cy="${ry}" r="${mobile ? 15 : 11}" fill="rgba(251, 191, 36, 0.3)"/>`;
        html += `<circle class="radical-dot" cx="${rx}" cy="${ry}" r="${mobile ? 8 : 5.5}" fill="#fbbf24" stroke="#fef08a" stroke-width="1.8"/>`;
        html += `</g>`;
    }

    const pairsToDraw = valenceInfo ? valenceInfo.pairs : (Array.isArray(a.lonePairs) ? a.lonePairs : []);
    const singleDotDir = valenceInfo ? valenceInfo.singleDot : null;

    const DIR_ANGLES = {
        'right': 0,
        'bottom-right': Math.PI / 4,
        'bottom': Math.PI / 2,
        'bottom-left': (3 * Math.PI) / 4,
        'left': Math.PI,
        'top-left': -(3 * Math.PI) / 4,
        'top': -Math.PI / 2,
        'top-right': -Math.PI / 4
    };
    const lpDist = mobile ? 10 : 7.5;
    const dotSep = mobile ? 5.2 : 3.8;
    const dotR = mobile ? 3.6 : 2.6;

    if (pairsToDraw.length > 0) {
        pairsToDraw.forEach(lp => {
            const ang = (typeof lp === 'number') ? (lp * Math.PI / 180) : (DIR_ANGLES[lp] !== undefined ? DIR_ANGLES[lp] : -Math.PI / 2);
            const cx = Math.cos(ang) * (g.halfW + lpDist);
            const cy = Math.sin(ang) * (g.halfH + lpDist);
            const tx = -Math.sin(ang) * dotSep;
            const ty = Math.cos(ang) * dotSep;
            html += `
                <g>
                    <circle cx="${(cx + tx).toFixed(1)}" cy="${(cy + ty).toFixed(1)}" r="${dotR}" fill="#38bdf8" stroke="#0f172a" stroke-width="0.9"/>
                    <circle cx="${(cx - tx).toFixed(1)}" cy="${(cy - ty).toFixed(1)}" r="${dotR}" fill="#38bdf8" stroke="#0f172a" stroke-width="0.9"/>
                </g>
            `;
        });
    }

    if (singleDotDir) {
        const ang = DIR_ANGLES[singleDotDir] !== undefined ? DIR_ANGLES[singleDotDir] : 0;
        const cx = Math.cos(ang) * (g.halfW + lpDist);
        const cy = Math.sin(ang) * (g.halfH + lpDist);
        html += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(dotR + 0.4).toFixed(1)}" fill="#38bdf8" stroke="#0f172a" stroke-width="0.9"/>`;
    }

    html += `</g>`;
    return html;
}