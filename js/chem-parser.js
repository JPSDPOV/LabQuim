import { parseFlexibleJson } from './state.js';

export let FORMULA_TO_NAME_MAP = {};
let formulaMapLoaded = false;

export async function loadFormulaDictionary() {
    if (formulaMapLoaded) return;
    const urls = ['./data/formula-names.json', 'data/formula-names.json'];
    for (const url of urls) {
        try {
            const res = await fetch(url, { cache: 'default' });
            if (!res.ok) continue;
            const parsed = parseFlexibleJson(await res.text());
            if (parsed && typeof parsed === 'object') {
                FORMULA_TO_NAME_MAP = parsed;
                formulaMapLoaded = true;
                break;
            }
        } catch (e) {}
    }
}

export function sanitizeInitialScene(rawScene) {
    if (!rawScene || typeof rawScene !== 'object') return { atoms: [], bonds: [] };
    const scene = JSON.parse(JSON.stringify(rawScene));

    if (Array.isArray(scene.bonds)) {
        scene.bonds = scene.bonds
            .filter(b => b.state !== 'forming' && b.state !== 'forming-pi')
            .map(b => ({ ...b, state: 'normal' }));
    }

    delete scene.arrows;

    if (Array.isArray(scene.atoms)) {
        scene.atoms = scene.atoms.map(a => {
            const cleanAtom = { ...a };
            delete cleanAtom.radical;
            if (cleanAtom.border === '#ef4444') delete cleanAtom.border;
            if (cleanAtom.highlight === '#ef4444') delete cleanAtom.highlight;
            if (cleanAtom.label && /^(sale|saldrá|se rompe|se parte|ataca|pasa a|pasará|reemplazado|desplazado|eliminado|cortar)/i.test(cleanAtom.label.trim())) {
                delete cleanAtom.label;
            }
            return cleanAtom;
        });
    }

    return scene;
}

export function normalizeFormulaLookupKey(f) {
    const subToDigit = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '⁰': '0', '⁺': '+' };
    return String(f || '')
        .replace(/[₀-₉⁰⁺]/g, ch => subToDigit[ch] || ch)
        .replace(/[\u2013\u2014—–]/g, '-')
        .replace(/\s+/g, '')
        .trim();
}

export function autoNameOrganicFormula(normKey) {
    const ROOTS = ['', 'met', 'et', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'];
    const clean = normKey.replace(/^\((?:R|S|E|Z|cis|trans)\)-/i, '');

    // Contar carbonos totales si es cadena acíclica simple
    if (/^[CH0-9\(\)\-=≡]+$/.test(clean) && !clean.includes('(')) {
        const cMatches = clean.match(/C(\d*)/g) || [];
        let totalC = 0;
        cMatches.forEach(tok => { totalC += tok.length > 1 ? parseInt(tok.slice(1), 10) : 1; });
        if (totalC >= 1 && totalC <= 10) {
            const root = ROOTS[totalC];
            const cap = root.charAt(0).toUpperCase() + root.slice(1);
            if (clean.includes('≡')) return `${cap}ino`;
            if (clean.includes('=')) return `${cap}eno`;
            return `${cap}ano`;
        }
    }

    // Alcoholes simples lineales: CH3-(CH2)n-OH
    const mAlcLin = clean.match(/^CH3(?:-CH2)*-OH$/);
    if (mAlcLin) {
        const totalC = (clean.match(/C/g) || []).length;
        if (totalC >= 1 && totalC <= 10) {
            const root = ROOTS[totalC];
            const cap = root.charAt(0).toUpperCase() + root.slice(1);
            return totalC <= 2 ? `${cap}anol` : `1-${cap}anol`;
        }
    }

    // Aldehídos lineales: CH3-(CH2)n-CHO
    if (/^CH3(?:-CH2)*-CHO$/.test(clean)) {
        const totalC = (clean.match(/C/g) || []).length;
        if (totalC >= 2 && totalC <= 10) {
            const root = ROOTS[totalC];
            return `${root.charAt(0).toUpperCase() + root.slice(1)}anal`;
        }
    }

    // Ácidos carboxílicos lineales: CH3-(CH2)n-COOH
    if (/^CH3(?:-CH2)*-COOH$/.test(clean)) {
        const totalC = (clean.match(/C/g) || []).length;
        if (totalC >= 2 && totalC <= 10) {
            const root = ROOTS[totalC];
            return `Ácido ${root}anoico`;
        }
    }

    return '';
}

export function inferNameFromContext(formulaStr, contextHints = []) {
    const normKey = normalizeFormulaLookupKey(formulaStr);
    if (FORMULA_TO_NAME_MAP[normKey]) return FORMULA_TO_NAME_MAP[normKey];

    // Si tiene prefijo estereoquímico (R)-, (S)-, (E)-, (Z)-, cis-, trans-
    const stereoMatch = normKey.match(/^(\([RSEZ]\)|cis|trans)-(.+)$/i);
    if (stereoMatch) {
        const baseName = FORMULA_TO_NAME_MAP[stereoMatch[2]] || autoNameOrganicFormula(stereoMatch[2]);
        if (baseName) return `${stereoMatch[1]}-${baseName}`;
    }

    const compactFormula = normKey.replace(/-/g, '');
    for (const hint of contextHints) {
        const h = String(hint || '').trim();
        if (!h) continue;
        const rxNameParen = /([A-ZÁÉÍÓÚÑa-záéíóúñ0-9,\-\(\)\s]{3,42})\s*\(([^()]+)\)/g;
        let m;
        while ((m = rxNameParen.exec(h)) !== null) {
            const candidateName = m[1].replace(/^(?:2\s+|Paso\s+\d+\s*[—\-:]\s*)/i, '').trim();
            const candidateForm = normalizeFormulaLookupKey(m[2]).replace(/-/g, '');
            if (candidateForm === compactFormula && candidateName && !/^(H2O|H3O|THF|Eter|Éter|Alcohol|Medio|Acuoso)/i.test(candidateName)) {
                return candidateName.charAt(0).toUpperCase() + candidateName.slice(1);
            }
        }
    }

    return autoNameOrganicFormula(normKey);
}

export function parseFormulaAndCompoundName(rawItem, contextHints = []) {
    let txt = String(rawItem || '').trim();
    txt = txt.replace(/^PRODUCTO OBTENIDO:\s*/i, '').trim();

    let formula = txt;
    let compoundName = '';

    const directLookup = inferNameFromContext(txt, contextHints);
    if (directLookup) {
        compoundName = directLookup;
    } else {
        const firstParenIdx = txt.search(/\s+\(/);
        if (firstParenIdx > 0 && txt.endsWith(')')) {
            const candidateFormula = txt.slice(0, firstParenIdx).trim();
            const inside = txt.slice(firstParenIdx).trim().replace(/^\(|\)$/g, '').trim();
            if (candidateFormula && !/^(OH|CH3|CH2CH3|NH2|NO2|H2O|H\+|Cl|Br|I)$/i.test(normalizeFormulaLookupKey(inside))) {
                formula = candidateFormula;
                let cleanInside = inside.split(',')[0].split('(')[0].trim();
                cleanInside = cleanInside.replace(/\s+(?:desarrollado|intacto|en ausencia|en presencia|como|con|sin|mayor|minoritario|mayoritario|principal|secundario|terciario|primario|puro|anhidro|diluido)\b.*$/i, '').trim();
                if (cleanInside && !/^(arriba|abajo|exceso|calor|luz|hv|hν)$/i.test(cleanInside)) {
                    compoundName = cleanInside.charAt(0).toUpperCase() + cleanInside.slice(1);
                }
            }
        }
    }

    // Normalizar aldehídos semidesarrollados (-CH=O, -C(=O)H, H-CH=O) a formato estándar -CHO / H-CHO
    formula = formula
        .replace(/^H[-—]CH=O$/i, 'H—CHO')
        .replace(/([-—])CH=O(?=$|[^A-Za-z0-9₀-₉])/g, '$1CHO')
        .replace(/([-—])C\(=O\)H(?=$|[^A-Za-z0-9₀-₉])/g, '$1CHO')
        .replace(/^O=CH([-—])/g, 'OHC$1');

    if (!compoundName) {
        compoundName = inferNameFromContext(formula, contextHints);
    }

    formula = formula.replace(/([A-Za-z\)])(\d+)/g, (_, p1, digits) => {
        const subMap = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
        return p1 + digits.split('').map(d => subMap[d] || d).join('');
    });

    return { formula, compoundName };
}

export function expandBranchedSemidevelopedNodes(parsedItem, centerX, centerY, accentColor, prefixId) {
    const f = String(parsedItem.formula || '').trim();
    const norm = normalizeFormulaLookupKey(f);
    const atoms = [];
    const bonds = [];
    const lbl = parsedItem.compoundName || undefined;

    // Caso 0: Compuestos quirales R-CH(X)-CH3 o R-CH(OH)-CH3 con prefijo (R)- o (S)-
    // Dibuja la cadena R en nodos semidesarrollados (CH3 - CH2 - ...), C quiral central, H arriba (dash), CH3 abajo (wedge)
    // Caso 0: Compuestos quirales R-CH(X)-CH3 o R-CH(OH)-CH3 con prefijo (R)- o (S)-
    // Respeta estrictamente la configuración R / S según reglas Cahn-Ingold-Prelog y coloca el nombre debajo de toda la molécula
    const mChiral = norm.match(/^\(([RS])\)-(.+?)-CH\((Cl|Br|I|OH)\)-CH3$/i);
    if (mChiral) {
        const config = mChiral[1].toUpperCase(); // 'R' o 'S'
        const subGroup = mChiral[3]; // Cl, Br, I, OH
        const chainRaw = mChiral[2]; // ej: CH3-CH2-CH2, CH3-CH2, C6H5, (CH3)2CH
        const isProductOH = subGroup.toUpperCase() === 'OH';

        const segs = chainRaw.split('-').map(s =>
            s.replace(/CH3/g, 'CH₃').replace(/CH2/g, 'CH₂').replace(/C6H5/g, 'C₆H₅')
        );
        const segStep = 122;

        // Para que CIP coincida exactamente:
        // En reactivo (X a derecha, R a izquierda): (R) lleva H arriba (dash) y CH3 abajo (wedge); (S) lleva CH3 arriba (wedge) y H abajo (dash)
        // En producto (OH a izquierda, R a derecha): (S) lleva H arriba (dash) y CH3 abajo (wedge); (R) lleva CH3 arriba (wedge) y H abajo (dash)
        const hOnTop = (!isProductOH && config === 'S') || (isProductOH && config === 'R');
        const topY = centerY - 154;
        const botY = centerY + 154;

        if (!isProductOH) {
            const cX = centerX + 35;
            atoms.push(
                { id: `${prefixId}_C`, el: 'C', x: cX, y: centerY, highlight: accentColor, border: accentColor },
                { id: `${prefixId}_H`, el: 'H', x: cX, y: hOnTop ? topY : botY, label: !hOnTop ? lbl : undefined },
                { id: `${prefixId}_Me`, el: 'CH₃', x: cX + 19, bondTargetX: cX, y: hOnTop ? botY : topY, label: hOnTop ? lbl : undefined },
                { id: `${prefixId}_X`, el: subGroup, x: cX + 108, y: centerY, highlight: accentColor, border: accentColor }
            );
            bonds.push(
                { from: `${prefixId}_C`, to: `${prefixId}_H`, order: 1, state: 'normal', stereo: 'dash' },
                { from: `${prefixId}_C`, to: `${prefixId}_Me`, order: 1, state: 'normal', stereo: 'wedge' },
                { from: `${prefixId}_C`, to: `${prefixId}_X`, order: 1, state: 'normal' }
            );

            let prevId = `${prefixId}_C`;
            for (let idx = segs.length - 1; idx >= 0; idx--) {
                const distIdx = segs.length - idx;
                const sx = cX - distIdx * segStep;
                const sId = `${prefixId}_S${idx}`;
                const isRing = segs[idx] === 'C₆H₅';
                if (isRing) {
                    const rRad = 44;
                    const rcx = sx - 24;
                    const rcy = centerY;
                    for (let k = 0; k < 6; k++) {
                        const ang = (Math.PI / 3) * k; // k=0 apunta directo a la derecha (0 rad) hacia el carbono quiral
                        const vx = Math.round(rcx + Math.cos(ang) * (rRad * 0.92));
                        const vy = Math.round(rcy + Math.sin(ang) * rRad);
                        atoms.push({ id: `${sId}_V${k}`, el: '', isVertex: true, x: vx, y: vy, noValenceDots: true });
                    }
                    for (let k = 0; k < 6; k++) {
                        const nxt = (k + 1) % 6;
                        bonds.push({
                            from: `${sId}_V${k}`,
                            to: `${sId}_V${nxt}`,
                            order: (k % 2 === 0) ? 2 : 1,
                            inwardCenter: { x: rcx, y: rcy }
                        });
                    }
                    bonds.push({ from: `${sId}_V0`, to: prevId, order: 1, state: 'normal' });
                    prevId = `${sId}_V0`;
                } else if (normalizeFormulaLookupKey(segs[idx]) === '(CH3)2CH' || normalizeFormulaLookupKey(segs[idx]) === 'CH(CH3)2') {
                    atoms.push(
                        { id: sId, el: 'CH', x: sx, y: centerY },
                        { id: `${sId}_L`, el: 'CH₃', x: sx - 128, y: centerY },
                        { id: `${sId}_B`, el: 'CH₃', x: sx, y: centerY + 82 }
                    );
                    bonds.push(
                        { from: sId, to: `${sId}_L`, order: 1, state: 'normal' },
                        { from: sId, to: `${sId}_B`, order: 1, state: 'normal' },
                        { from: sId, to: prevId, order: 1, state: 'normal' }
                    );
                    prevId = sId;
                } else {
                    atoms.push({
                        id: sId,
                        el: segs[idx],
                        x: sx,
                        y: centerY
                    });
                    bonds.push({ from: sId, to: prevId, order: 1, state: 'normal' });
                    prevId = sId;
                }
            }
            return { atoms, bonds, spanHalfW: Math.max(130, segs.length * segStep + 40) };
        } else {
            const cX = centerX - 45;
            atoms.push(
                { id: `${prefixId}_OH`, el: 'OH', x: cX - 108, y: centerY, highlight: accentColor, border: accentColor },
                { id: `${prefixId}_C`, el: 'C', x: cX, y: centerY, highlight: accentColor, border: accentColor },
                { id: `${prefixId}_H`, el: 'H', x: cX, y: hOnTop ? topY : botY, label: !hOnTop ? lbl : undefined },
                { id: `${prefixId}_Me`, el: 'CH₃', x: cX + 19, bondTargetX: cX, y: hOnTop ? botY : topY, label: hOnTop ? lbl : undefined }
            );
            bonds.push(
                { from: `${prefixId}_OH`, to: `${prefixId}_C`, order: 1, state: 'normal' },
                { from: `${prefixId}_C`, to: `${prefixId}_H`, order: 1, state: 'normal', stereo: 'dash' },
                { from: `${prefixId}_C`, to: `${prefixId}_Me`, order: 1, state: 'normal', stereo: 'wedge' }
            );

            let prevId = `${prefixId}_C`;
            const revSegs = [...segs].reverse();
            for (let idx = 0; idx < revSegs.length; idx++) {
                const sx = cX + (idx + 1) * segStep;
                const sId = `${prefixId}_S${idx}`;
                const isRing = revSegs[idx] === 'C₆H₅';
                if (isRing) {
                    const rRad = 44;
                    const rcx = sx + 24;
                    const rcy = centerY;
                    for (let k = 0; k < 6; k++) {
                        const ang = Math.PI + (Math.PI / 3) * k; // k=0 apunta directo a la izquierda (PI rad) hacia el carbono quiral
                        const vx = Math.round(rcx + Math.cos(ang) * (rRad * 0.92));
                        const vy = Math.round(rcy + Math.sin(ang) * rRad);
                        atoms.push({ id: `${sId}_V${k}`, el: '', isVertex: true, x: vx, y: vy, noValenceDots: true });
                    }
                    for (let k = 0; k < 6; k++) {
                        const nxt = (k + 1) % 6;
                        bonds.push({
                            from: `${sId}_V${k}`,
                            to: `${sId}_V${nxt}`,
                            order: (k % 2 === 0) ? 2 : 1,
                            inwardCenter: { x: rcx, y: rcy }
                        });
                    }
                    bonds.push({ from: prevId, to: `${sId}_V0`, order: 1, state: 'normal' });
                    prevId = `${sId}_V0`;
                } else if (normalizeFormulaLookupKey(revSegs[idx]) === '(CH3)2CH' || normalizeFormulaLookupKey(revSegs[idx]) === 'CH(CH3)2') {
                    atoms.push(
                        { id: sId, el: 'CH', x: sx, y: centerY },
                        { id: `${sId}_R`, el: 'CH₃', x: sx + 128, y: centerY },
                        { id: `${sId}_B`, el: 'CH₃', x: sx, y: centerY + 82 }
                    );
                    bonds.push(
                        { from: prevId, to: sId, order: 1, state: 'normal' },
                        { from: sId, to: `${sId}_R`, order: 1, state: 'normal' },
                        { from: sId, to: `${sId}_B`, order: 1, state: 'normal' }
                    );
                    prevId = sId;
                } else {
                    atoms.push({
                        id: sId,
                        el: revSegs[idx],
                        x: sx,
                        y: centerY
                    });
                    bonds.push({ from: prevId, to: sId, order: 1, state: 'normal' });
                    prevId = sId;
                }
            }
            return { atoms, bonds, spanHalfW: Math.max(130, revSegs.length * segStep + 45) };
        }
    }

    // Caso 1: (CH3)3C-X  (ej. (CH₃)₃C—OH, (CH₃)₃C—Br, (CH₃)₃C—H) -> CH3 izquierda, CH3 arriba, CH3 abajo, X derecha
    const mTert = norm.match(/^\(CH3\)3C-?(.+)$/);
    if (mTert) {
        const rightGrp = mTert[1]
            .replace(/CH3/g, 'CH₃')
            .replace(/CH2/g, 'CH₂');
        atoms.push(
            { id: `${prefixId}_C`, el: 'C', x: centerX, y: centerY, highlight: accentColor, border: accentColor, label: lbl },
            { id: `${prefixId}_L`, el: 'CH₃', x: centerX - 95, y: centerY },
            { id: `${prefixId}_T`, el: 'CH₃', x: centerX, y: centerY - 82 },
            { id: `${prefixId}_B`, el: 'CH₃', x: centerX, y: centerY + 82 },
            { id: `${prefixId}_R`, el: rightGrp, x: centerX + 95, y: centerY, highlight: accentColor, border: accentColor }
        );
        bonds.push(
            { from: `${prefixId}_L`, to: `${prefixId}_C`, order: 1, state: 'normal' },
            { from: `${prefixId}_T`, to: `${prefixId}_C`, order: 1, state: 'normal' },
            { from: `${prefixId}_B`, to: `${prefixId}_C`, order: 1, state: 'normal' },
            { from: `${prefixId}_C`, to: `${prefixId}_R`, order: 1, state: 'normal' }
        );
        return { atoms, bonds, spanHalfW: 135 };
    }

    // Caso 2: (CH3)2C=CH2 o (CH3)2C=CH-CH3 (alquenos ramificados) -> CH3 izquierda, CH3 abajo, =CH2 o =CH-CH3 derecha
    const mAlkeneBranch = norm.match(/^\(CH3\)2C=(.+)$/);
    if (mAlkeneBranch) {
        const rightGrp = mAlkeneBranch[1]
            .replace(/CH3/g, 'CH₃')
            .replace(/CH2/g, 'CH₂')
            .replace(/-/g, '—');
        atoms.push(
            { id: `${prefixId}_C`, el: 'C', x: centerX - 25, y: centerY, highlight: accentColor, border: accentColor, label: lbl },
            { id: `${prefixId}_L`, el: 'CH₃', x: centerX - 115, y: centerY },
            { id: `${prefixId}_B`, el: 'CH₃', x: centerX - 25, y: centerY + 82 },
            { id: `${prefixId}_R`, el: rightGrp, x: centerX + 85, y: centerY, highlight: accentColor, border: accentColor }
        );
        bonds.push(
            { from: `${prefixId}_L`, to: `${prefixId}_C`, order: 1, state: 'normal' },
            { from: `${prefixId}_B`, to: `${prefixId}_C`, order: 1, state: 'normal' },
            { from: `${prefixId}_C`, to: `${prefixId}_R`, order: 2, state: 'normal' }
        );
        return { atoms, bonds, spanHalfW: 155 };
    }

    // Caso 3: (CH3)2C(OH)-R (ej. (CH₃)₂C(OH)—CH₂—CH₃) -> CH3 izquierda, OH arriba, CH3 abajo, R derecha
    const mTertAlc = norm.match(/^\(CH3\)2C\(OH\)-?(.+)$/);
    if (mTertAlc) {
        const rightGrp = mTertAlc[1]
            .replace(/CH3/g, 'CH₃')
            .replace(/CH2/g, 'CH₂')
            .replace(/-/g, '—');
        atoms.push(
            { id: `${prefixId}_C`, el: 'C', x: centerX - 25, y: centerY, highlight: accentColor, border: accentColor, label: lbl },
            { id: `${prefixId}_L`, el: 'CH₃', x: centerX - 115, y: centerY },
            { id: `${prefixId}_T`, el: 'OH', x: centerX - 25, y: centerY - 82, highlight: accentColor, border: accentColor },
            { id: `${prefixId}_B`, el: 'CH₃', x: centerX - 25, y: centerY + 82 },
            { id: `${prefixId}_R`, el: rightGrp, x: centerX + 95, y: centerY }
        );
        bonds.push(
            { from: `${prefixId}_L`, to: `${prefixId}_C`, order: 1, state: 'normal' },
            { from: `${prefixId}_T`, to: `${prefixId}_C`, order: 1, state: 'normal' },
            { from: `${prefixId}_B`, to: `${prefixId}_C`, order: 1, state: 'normal' },
            { from: `${prefixId}_C`, to: `${prefixId}_R`, order: 1, state: 'normal' }
        );
        return { atoms, bonds, spanHalfW: 165 };
    }

    // Caso 4: (CH3)2CH-X (ej. (CH₃)₂CH—Cl, (CH₃)₂CH—CH₂—C≡CH) -> CH3 izquierda, CH3 abajo, cadena derecha separada nodo por nodo
    const mIso = norm.match(/^\(CH3\)2CH-?(.+)$/);
    if (mIso) {
        const rightRaw = mIso[1]
            .replace(/CH3/g, 'CH₃')
            .replace(/CH2/g, 'CH₂');
        const segTokens = [];
        let buf = '';
        let pendingOrd = 1;
        for (let i = 0; i < rightRaw.length; i++) {
            const ch = rightRaw[i];
            if (ch === '-' || ch === '–' || ch === '—' || ch === '=' || ch === '≡') {
                if (buf) segTokens.push({ el: buf, order: pendingOrd });
                pendingOrd = (ch === '≡') ? 3 : ((ch === '=') ? 2 : 1);
                buf = '';
            } else {
                buf += ch;
            }
        }
        if (buf) segTokens.push({ el: buf, order: pendingOrd });

        const stepSeg = 88;
        const totalRightSpan = segTokens.length * stepSeg;
        const baseShiftX = segTokens.length > 1 ? Math.round((totalRightSpan - stepSeg) * 0.42) : 0;
        const cX = centerX - baseShiftX;

        atoms.push(
            { id: `${prefixId}_C`, el: 'CH', x: cX, y: centerY, highlight: accentColor, border: accentColor, label: lbl },
            { id: `${prefixId}_L`, el: 'CH₃', x: cX - 88, y: centerY },
            { id: `${prefixId}_B`, el: 'CH₃', x: cX, y: centerY + 82 }
        );
        bonds.push(
            { from: `${prefixId}_L`, to: `${prefixId}_C`, order: 1, state: 'normal' },
            { from: `${prefixId}_B`, to: `${prefixId}_C`, order: 1, state: 'normal' }
        );

        let prevNodeId = `${prefixId}_C`;
        segTokens.forEach((seg, sIdx) => {
            const sx = cX + (sIdx + 1) * stepSeg;
            const sId = `${prefixId}_R${sIdx}`;
            const isLast = (sIdx === segTokens.length - 1);
            atoms.push({
                id: sId,
                el: seg.el,
                x: sx,
                y: centerY,
                highlight: isLast ? accentColor : undefined,
                border: isLast ? accentColor : undefined
            });
            bonds.push({ from: prevNodeId, to: sId, order: seg.order, state: 'normal' });
            prevNodeId = sId;
        });

        return { atoms, bonds, spanHalfW: Math.max(125, totalRightSpan - baseShiftX + 28) };
    }

    // Caso 5: R-CH(OH)-R' (alcoholes secundarios aquirales, ej. CH₃—CH(OH)—CH₃ o CH₃—CH₂—CH(OH)—CH₃)
    const mSecAlc = norm.match(/^(.+?)-?CH\(OH\)-?(.+)$/);
    if (mSecAlc) {
        const leftGrp = mSecAlc[1].replace(/CH3/g, 'CH₃').replace(/CH2/g, 'CH₂').replace(/-/g, '—');
        const rightGrp = mSecAlc[2].replace(/CH3/g, 'CH₃').replace(/CH2/g, 'CH₂').replace(/-/g, '—');
        atoms.push(
            { id: `${prefixId}_C`, el: 'CH', x: centerX, y: centerY, highlight: accentColor, border: accentColor, label: lbl },
            { id: `${prefixId}_L`, el: leftGrp, x: centerX - 105, y: centerY },
            { id: `${prefixId}_T`, el: 'OH', x: centerX, y: centerY - 82, highlight: accentColor, border: accentColor },
            { id: `${prefixId}_R`, el: rightGrp, x: centerX + 95, y: centerY }
        );
        bonds.push(
            { from: `${prefixId}_L`, to: `${prefixId}_C`, order: 1, state: 'normal' },
            { from: `${prefixId}_T`, to: `${prefixId}_C`, order: 1, state: 'normal' },
            { from: `${prefixId}_C`, to: `${prefixId}_R`, order: 1, state: 'normal' }
        );
        return { atoms, bonds, spanHalfW: 155 };
    }

    // Caso anillo bencénico C₆H₅—... en fórmulas semidesarrolladas (ej. Etinilbenceno, Acetofenona, Fenóxido de sodio, Anisol) -> nodos separados
    const mPhLeft = norm.match(/^C6H5-(.+)$/);
    if (mPhLeft) {
        const rightRaw = mPhLeft[1]
            .replace(/CH3/g, 'CH₃')
            .replace(/CH2/g, 'CH₂');
        const segTokens = [];
        let buf = '';
        let pendingOrd = 1;
        for (let i = 0; i < rightRaw.length; i++) {
            const ch = rightRaw[i];
            if (ch === '-' || ch === '–' || ch === '—' || ch === '=' || ch === '≡') {
                if (buf) segTokens.push({ el: buf, order: pendingOrd });
                pendingOrd = (ch === '≡') ? 3 : ((ch === '=') ? 2 : 1);
                buf = '';
            } else {
                buf += ch;
            }
        }
        if (buf) segTokens.push({ el: buf, order: pendingOrd });

        const stepSeg = 84;
        const totalSpan = segTokens.length * stepSeg;
        const phX = centerX - Math.round(totalSpan / 2) - 18;
        atoms.push({ id: `${prefixId}_Ph`, el: 'Ph', ring: 'phenyl', x: phX, y: centerY, highlight: accentColor, label: lbl });

        let prevNodeId = `${prefixId}_Ph`;
        segTokens.forEach((seg, sIdx) => {
            const sx = phX + 24 + (sIdx + 1) * stepSeg;
            const sId = `${prefixId}_R${sIdx}`;
            const isLast = (sIdx === segTokens.length - 1 || /CO|CHO|OH|NH/.test(seg.el));
            atoms.push({
                id: sId,
                el: seg.el,
                x: sx,
                y: centerY,
                highlight: isLast ? accentColor : undefined,
                border: isLast ? accentColor : undefined
            });
            bonds.push({ from: prevNodeId, to: sId, order: seg.order, state: 'normal' });
            prevNodeId = sId;
        });
        return { atoms, bonds, spanHalfW: Math.max(115, Math.round(totalSpan / 2) + 52) };
    }

    // Caso lineal con múltiples grupos unidos por enlaces (ej. CH₃—CH₂—C≡CH, CH₃—CH₂—CO—CH₃) -> nodos separados
    if (!/[()]/.test(f) && /[-–—=≡]/.test(f) && !/^(H-OH|H-O-H|H-Cl|H-Br|H-I|H-CN|H-NH2)$/i.test(norm)) {
        const segs = [];
        let buf = '';
        let pendingOrd = 1;
        for (let i = 0; i < f.length; i++) {
            const ch = f[i];
            if (ch === '-' || ch === '–' || ch === '—' || ch === '=' || ch === '≡') {
                if (buf) segs.push({ el: buf, order: pendingOrd });
                pendingOrd = (ch === '≡') ? 3 : ((ch === '=') ? 2 : 1);
                buf = '';
            } else {
                buf += ch;
            }
        }
        if (buf) segs.push({ el: buf, order: pendingOrd });

        if (segs.length >= 2) {
            const stepSeg = 84;
            const totalSpan = (segs.length - 1) * stepSeg;
            const startX = centerX - Math.round(totalSpan / 2);
            const midIdx = Math.floor(segs.length / 2);
            segs.forEach((seg, idx) => {
                const sx = startX + idx * stepSeg;
                const sId = `${prefixId}_${idx}`;
                const isFuncNode = (idx === segs.length - 1 || /CO|CHO|OH|NH/.test(seg.el));
                atoms.push({
                    id: sId,
                    el: seg.el,
                    x: sx,
                    y: centerY,
                    highlight: isFuncNode ? accentColor : undefined,
                    border: isFuncNode ? accentColor : undefined,
                    label: (idx === midIdx) ? lbl : undefined
                });
                if (idx > 0) {
                    bonds.push({ from: `${prefixId}_${idx - 1}`, to: sId, order: seg.order, state: 'normal' });
                }
            });
            return { atoms, bonds, spanHalfW: Math.max(65, Math.round(totalSpan / 2) + 34) };
        }
    }

    // Caso general con ramificaciones entre paréntesis: ej. CH₃—CH(CH₃)—CH₂—CH₃, CH₃—C(CH₃)₂—CH₃, CH₃—CH(Cl)—CH₂—CH₃
    if (/[()]/.test(f) && /[-–—=≡]/.test(f)) {
        const topTokens = [];
        let buf = '';
        let depth = 0;
        let pendingOrd = 1;
        for (let i = 0; i < f.length; i++) {
            const ch = f[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth = Math.max(0, depth - 1);
            if (depth === 0 && (ch === '-' || ch === '–' || ch === '—' || ch === '=' || ch === '≡')) {
                if (buf) topTokens.push({ raw: buf, order: pendingOrd });
                pendingOrd = (ch === '≡') ? 3 : ((ch === '=') ? 2 : 1);
                buf = '';
            } else {
                buf += ch;
            }
        }
        if (buf) topTokens.push({ raw: buf, order: pendingOrd });

        if (topTokens.length >= 2) {
            const stepSeg = 88;
            const totalSpan = (topTokens.length - 1) * stepSeg;
            const startX = centerX - Math.round(totalSpan / 2);
            const midIdx = Math.floor(topTokens.length / 2);
            topTokens.forEach((tok, idx) => {
                const sx = startX + idx * stepSeg;
                const sId = `${prefixId}_B${idx}`;
                const mSub = tok.raw.match(/^([A-Za-z₀-₉]+)\(([^()]+)\)(2)?$/);
                if (mSub) {
                    const mainEl = mSub[1];
                    const subEl = mSub[2];
                    const isDoubleSub = Boolean(mSub[3]);
                    const isFuncNode = /CO|CHO|OH|NH|Cl|Br|I/.test(mainEl) || /CO|CHO|OH|NH|Cl|Br|I/.test(subEl);
                    atoms.push({
                        id: sId,
                        el: mainEl,
                        x: sx,
                        y: centerY,
                        highlight: isFuncNode ? accentColor : undefined,
                        border: isFuncNode ? accentColor : undefined,
                        label: (idx === midIdx) ? lbl : undefined
                    });
                    const subTopId = `${sId}_T`;
                    atoms.push({
                        id: subTopId,
                        el: subEl,
                        x: sx,
                        y: centerY - 82,
                        highlight: /OH|NH|Cl|Br|I|O/.test(subEl) ? accentColor : undefined,
                        border: /OH|NH|Cl|Br|I|O/.test(subEl) ? accentColor : undefined
                    });
                    bonds.push({ from: sId, to: subTopId, order: subEl === 'O' ? 2 : 1, state: 'normal' });
                    if (isDoubleSub) {
                        const subBotId = `${sId}_B`;
                        atoms.push({ id: subBotId, el: subEl, x: sx, y: centerY + 82 });
                        bonds.push({ from: sId, to: subBotId, order: 1, state: 'normal' });
                    }
                } else {
                    const isFuncNode = (idx === topTokens.length - 1 || /CO|CHO|OH|NH/.test(tok.raw));
                    atoms.push({
                        id: sId,
                        el: tok.raw,
                        x: sx,
                        y: centerY,
                        highlight: isFuncNode ? accentColor : undefined,
                        border: isFuncNode ? accentColor : undefined,
                        label: (idx === midIdx) ? lbl : undefined
                    });
                }
                if (idx > 0) {
                    bonds.push({ from: `${prefixId}_B${idx - 1}`, to: sId, order: tok.order, state: 'normal' });
                }
            });
            return { atoms, bonds, spanHalfW: Math.max(70, Math.round(totalSpan / 2) + 36) };
        }
    }

    // Caso lineal / estándar sin ramificaciones: cápsula única centrada
    atoms.push({
        id: `${prefixId}_0`,
        el: f,
        x: centerX,
        y: centerY,
        highlight: accentColor,
        border: accentColor,
        label: lbl
    });
    return { atoms, bonds, spanHalfW: Math.max(55, f.length * 6.5) };
}

export function buildSemidevelopedBannerScene(semiText, accentColor, contextHints = [], catalystLabel = '') {
    const raw = String(semiText || '').trim();
    const clean = raw
        .replace(/^PRODUCTO OBTENIDO:\s*/i, '')
        .replace(/\s*──\([^)]+\)──►.*$/, '')
        .replace(/\s*──►\s*$/, '')
        .replace(/\s+\([^+]+\)\s*$/, '')
        .trim();

    const sides = clean.split(/──►|→|⇄/);
    const expr = (sides.length > 1 && sides[1].trim()) ? sides[1].trim() : sides[0].trim();
    const rawParts = expr.split(/\s+\+\s+/).map(s => s.trim()).filter(Boolean);
    const parsedParts = rawParts.map(p => parseFormulaAndCompoundName(p, contextHints));

    const atoms = [];
    const bonds = [];
    const texts = [];
    const arrows = [];
    const n = parsedParts.length;
    const hasCatArrow = Boolean(catalystLabel && String(catalystLabel).trim());
    let rightEdgeX = 520;

    if (n === 1) {
        const cx = hasCatArrow ? 340 : 460;
        const built = expandBranchedSemidevelopedNodes(parsedParts[0], cx, 185, accentColor, 'Semi_0');
        atoms.push(...built.atoms);
        bonds.push(...built.bonds);
        rightEdgeX = cx + built.spanHalfW;
    } else if (n === 2) {
        const cx0 = hasCatArrow ? 195 : 240;
        const cx1 = hasCatArrow ? 515 : 695;
        const built0 = expandBranchedSemidevelopedNodes(parsedParts[0], cx0, 185, accentColor, 'Semi_0');
        const built1 = expandBranchedSemidevelopedNodes(parsedParts[1], cx1, 185, accentColor, 'Semi_1');
        const overlap = (cx0 + built0.spanHalfW + 56) - (cx1 - built1.spanHalfW);
        if (overlap > 0 && !hasCatArrow) {
            const shift = Math.round(overlap / 2);
            built0.atoms.forEach(a => { a.x -= shift; });
            built1.atoms.forEach(a => { a.x += shift; });
            const plusX = Math.round(((cx0 - shift + built0.spanHalfW) + (cx1 + shift - built1.spanHalfW)) / 2);
            atoms.push(...built0.atoms, ...built1.atoms);
            bonds.push(...built0.bonds, ...built1.bonds);
            texts.push({ x: plusX, y: 193, text: '+', size: 24, color: accentColor });
            rightEdgeX = cx1 + shift + built1.spanHalfW;
        } else {
            atoms.push(...built0.atoms, ...built1.atoms);
            bonds.push(...built0.bonds, ...built1.bonds);
            const plusX = Math.round(((cx0 + built0.spanHalfW) + (cx1 - built1.spanHalfW)) / 2);
            texts.push({ x: plusX, y: 193, text: '+', size: 24, color: accentColor });
            rightEdgeX = cx1 + built1.spanHalfW;
        }
    } else if (n >= 3) {
        const startX = hasCatArrow ? 130 : 175;
        const spanTotal = hasCatArrow ? 440 : 570;
        const stepX = Math.floor(spanTotal / (n - 1));
        parsedParts.forEach((item, idx) => {
            const cx = startX + idx * stepX;
            const built = expandBranchedSemidevelopedNodes(item, cx, 185, accentColor, `Semi_${idx}`);
            atoms.push(...built.atoms);
            bonds.push(...built.bonds);
            if (idx < n - 1) {
                texts.push({ x: cx + Math.round(stepX / 2), y: 193, text: '+', size: 22, color: accentColor });
            } else {
                rightEdgeX = cx + built.spanHalfW;
            }
        });
    }

    if (hasCatArrow) {
        const cleanCat = String(catalystLabel).trim();
        const arrowX1 = Math.min(720, Math.max(rightEdgeX + 26, 595));
        const arrowX2 = Math.min(895, arrowX1 + Math.max(135, cleanCat.length * 7.5 + 24));
        const arrowCx = Math.round((arrowX1 + arrowX2) / 2);
        arrows.push({
            type: 'full',
            color: '#f97316',
            x1: arrowX1,
            y1: 185,
            cx: arrowCx,
            cy: 185,
            x2: arrowX2,
            y2: 185,
            label: cleanCat
        });
    }

    atoms.forEach(a => {
        delete a.highlight;
        delete a.border;
        a.noValenceDots = true;
        if (a.ring !== 'phenyl') {
            a.noShape = true;
        }
    });

    return { atoms, bonds, texts, arrows, forceCentered: true };
}

export function wrapWithSemidevelopedEndpoints(stepsArray, catalystLabel = '') {
    if (!Array.isArray(stepsArray) || stepsArray.length === 0) return stepsArray;

    const firstStep = stepsArray[0];
    const lastStep = stepsArray[stepsArray.length - 1];

    const contextHints = [];
    stepsArray.forEach(st => {
        if (st.title) contextHints.push(st.title);
        if (st.semiGlobal) contextHints.push(st.semiGlobal);
        try {
            const sc = typeof st.scene === 'function' ? st.scene() : st.scene;
            if (sc && Array.isArray(sc.atoms)) {
                sc.atoms.forEach(a => { if (a.label) contextHints.push(a.label); });
            }
        } catch (e) {}
    });

    const cleanOldNumbering = (t) => String(t || '').replace(/^Paso \d+\s*[—\-:]\s*/i, '').trim();

    const introSemiText = firstStep.semiStep || firstStep.semiGlobal || '';
    const introParts = introSemiText
        .replace(/\s*──\([^)]+\)──►.*$/, '')
        .replace(/\s*──►\s*$/, '')
        .replace(/\s*\((?:Reactivos intactos|Ruptura[^)]*|Enol[^)]*|Tautomería[^)]*)\)\s*$/i, '')
        .split(/\s+\+\s+/)
        .map(s => parseFormulaAndCompoundName(s, contextHints).formula)
        .filter(Boolean)
        .join(' + ');

    const introStep = {
        title: `Paso 1 — Fórmula Semidesarrollada Inicial: ${introParts}`,
        semiStep: firstStep.semiStep || '',
        semiGlobal: firstStep.semiGlobal || '',
        desc: 'Fórmula semidesarrollada de los reactivos iniciales antes de desplegar sus enlaces desarrollados.',
        legend: {
            breaking: 'Ningún enlace roto todavía; representación semidesarrollada inicial.',
            forming: 'Ningún enlace formado todavía.',
            movement: 'En el siguiente paso se despliegan los enlaces desarrollados.'
        },
        scene: () => firstStep.introScene
            ? JSON.parse(JSON.stringify(firstStep.introScene))
            : buildSemidevelopedBannerScene(introSemiText, '#38bdf8', contextHints, catalystLabel)
    };

    const buildCondensedCarbonHydrogensScene = (rawScene) => {
        if (!rawScene || !Array.isArray(rawScene.atoms) || !Array.isArray(rawScene.bonds)) return null;
        const sc = JSON.parse(JSON.stringify(rawScene));
        const atomById = {};
        sc.atoms.forEach(a => { atomById[a.id] = a; });

        // Detectar carbonos carbonílicos (C=O) para no condensar el H aldehídico (se mantiene en 120° separado)
        const carbonylCarbonIds = new Set();
        sc.bonds.forEach(b => {
            if ((b.order || 1) === 2) {
                const a1 = atomById[b.from];
                const a2 = atomById[b.to];
                if (a1 && a2) {
                    const el1 = String(a1.el || '').trim();
                    const el2 = String(a2.el || '').trim();
                    if (el1 === 'C' && el2 === 'O') carbonylCarbonIds.add(a1.id);
                    if (el2 === 'C' && el1 === 'O') carbonylCarbonIds.add(a2.id);
                }
            }
        });

        const hToRemove = new Set();
        let condensedAny = false;

        sc.atoms.forEach(cAtom => {
            if (carbonylCarbonIds.has(cAtom.id)) return;
            const elClean = String(cAtom.el || '').trim();
            const baseHCount = elClean === 'C' ? 0 : (elClean === 'CH' ? 1 : (elClean === 'CH₂' ? 2 : -1));
            if (baseHCount < 0) return;

            const attachedHs = [];
            sc.bonds.forEach(b => {
                if ((b.order || 1) !== 1 || b.stereo) return;
                let otherId = null;
                if (b.from === cAtom.id) otherId = b.to;
                else if (b.to === cAtom.id) otherId = b.from;
                if (!otherId) return;
                const otherAtom = atomById[otherId];
                if (otherAtom && String(otherAtom.el || '').trim() === 'H') {
                    attachedHs.push(otherAtom.id);
                }
            });

            if (attachedHs.length > 0) {
                const totalH = baseHCount + attachedHs.length;
                if (totalH === 1) cAtom.el = 'CH';
                else if (totalH === 2) cAtom.el = 'CH₂';
                else if (totalH === 3) cAtom.el = 'CH₃';
                else if (totalH >= 4) cAtom.el = 'CH₄';
                attachedHs.forEach(hid => hToRemove.add(hid));
                condensedAny = true;
            }
        });

        if (!condensedAny) return null;

        sc.atoms = sc.atoms.filter(a => !hToRemove.has(a.id));
        sc.bonds = sc.bonds.filter(b => !hToRemove.has(b.from) && !hToRemove.has(b.to));
        return sc;
    };

    const expandedDevelopedSteps = [...stepsArray];
    try {
        const lastDevScene = typeof lastStep.scene === 'function' ? lastStep.scene() : lastStep.scene;
        const condensedScene = buildCondensedCarbonHydrogensScene(lastDevScene);
        if (condensedScene) {
            expandedDevelopedSteps.push({
                title: 'Agrupación de Hidrógenos en los Carbonos (CH / CH₂ / CH₃)',
                semiStep: lastStep.semiStep || '',
                semiGlobal: lastStep.semiGlobal || '',
                desc: 'Los hidrógenos unidos a cada carbono se agrupan de forma condensada (CH, CH₂ o CH₃) antes de la fórmula semidesarrollada final.',
                legend: {
                    breaking: 'Hidrógenos condensados sobre sus respectivos átomos de carbono.',
                    forming: 'Grupos CH, CH₂ y CH₃ consolidados en la estructura.',
                    movement: 'Simplificación estructural hacia la representación semidesarrollada.'
                },
                scene: () => JSON.parse(JSON.stringify(condensedScene))
            });
        }
    } catch (e) {}

    const middleSteps = expandedDevelopedSteps.map((st, idx) => ({
        ...st,
        title: `Paso ${idx + 2} — ${cleanOldNumbering(st.title)}`
    }));

    const outroSemiText = lastStep.semiStep || lastStep.semiGlobal || '';
    const outroClean = outroSemiText.replace(/^PRODUCTO OBTENIDO:\s*/i, '').trim();
    const outroSides = outroClean.split(/──►|→|⇄/);
    const outroExpr = (outroSides.length > 1 && outroSides[1].trim()) ? outroSides[1].trim() : outroSides[0].trim();
    const outroParts = outroExpr
        .split(/\s+\+\s+/)
        .map(s => parseFormulaAndCompoundName(s, contextHints).formula)
        .filter(Boolean)
        .join(' + ');

    const outroNum = middleSteps.length + 2;
    const outroStep = {
        title: `Paso ${outroNum} — Fórmula Semidesarrollada Final: ${outroParts}`,
        semiStep: lastStep.semiStep || '',
        semiGlobal: lastStep.semiGlobal || '',
        desc: 'Fórmula semidesarrollada de los productos obtenidos al finalizar la reacción.',
        legend: {
            breaking: 'Ruptura de enlaces reactivos completada.',
            forming: 'Productos finales expresados en fórmula semidesarrollada.',
            movement: 'Reacción finalizada.'
        },
        scene: () => lastStep.outroScene
            ? JSON.parse(JSON.stringify(lastStep.outroScene))
            : buildSemidevelopedBannerScene(outroSemiText, '#10b981', contextHints)
    };

    return [introStep, ...middleSteps, outroStep];
}

export function expandStepsToVisualMicroSteps(rawSteps, catalystLabel = '') {
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) return [];
    if (rawSteps.length >= 5) {
        const baseSteps = rawSteps.map((st, idx) => ({
            title: st.title || '',
            semiStep: st.semiStep || '',
            semiGlobal: st.semiGlobal || '',
            desc: st.desc || '',
            legend: st.legend || {
                breaking: 'Ruptura de enlaces reactivos.',
                forming: 'Formación de nuevos enlaces en el producto.',
                movement: 'Reorganización molecular.'
            },
            initialScene: st.initialScene ? () => sanitizeInitialScene(st.initialScene) : undefined,
            scene: () => {
                const sc = st.scene || { atoms: [], bonds: [] };
                return (idx === 0 && !st.initialScene)
                    ? sanitizeInitialScene(sc)
                    : JSON.parse(JSON.stringify(sc));
            }
        }));
        return wrapWithSemidevelopedEndpoints(baseSteps, catalystLabel);
    }

    const expanded = [];
    const first = rawSteps[0];
    const last = rawSteps[rawSteps.length - 1];
    const rawScene0 = first.initialScene || first.scene || { atoms: [], bonds: [] };
    const cleanInitScene = sanitizeInitialScene(rawScene0);
    const finalScene = JSON.parse(JSON.stringify(last.scene || { atoms: [], bonds: [] }));

    expanded.push({
        title: first.title.replace(/^Paso \d+[^:]*:\s*/i, 'Paso 1 (Estado Inicial Intacto): '),
        semiStep: first.semiStep || '',
        semiGlobal: first.semiGlobal || '',
        desc: 'Observa los reactivos en su estado inicial intacto antes de que comience la ruptura de enlaces.',
        legend: {
            breaking: 'Ningún enlace roto todavía; sustratos intactos.',
            forming: 'Ningún enlace formado todavía.',
            movement: 'Reactivos listos antes de iniciar la reacción.'
        },
        scene: () => JSON.parse(JSON.stringify(cleanInitScene))
    });

    const finalBondKeys = new Set((finalScene.bonds || []).map(b => [b.from, b.to].sort().join('--')));
    const breakingScene = JSON.parse(JSON.stringify(first.scene || rawScene0));
    if (Array.isArray(breakingScene.bonds)) {
        breakingScene.bonds = breakingScene.bonds
            .filter(b => b.state !== 'forming' && b.state !== 'forming-pi')
            .map(b => {
                const k = [b.from, b.to].sort().join('--');
                const willBreak = b.state === 'breaking' || b.state === 'breaking-pi' || !finalBondKeys.has(k);
                return {
                    ...b,
                    state: willBreak ? (b.order >= 2 ? 'breaking-pi' : 'breaking') : 'normal'
                };
            });
    }
    expanded.push({
        title: 'Paso 2 (Ruptura en Rojo): Se resaltan en ROJO los enlaces que se van a romper',
        semiStep: first.semiStep || '',
        semiGlobal: first.semiGlobal || '',
        desc: first.desc || 'Observa en rojo punteado los enlaces específicos que comienzan a debilitarse y romperse en los reactivos.',
        legend: {
            breaking: (first.legend && first.legend.breaking) || 'En rojo punteado: enlaces que se van a romper.',
            forming: 'Los enlaces rompibles se debilitan antes de separarse los fragmentos.',
            movement: (first.legend && first.legend.movement) || 'Activación electrónica de los enlaces reactivos.'
        },
        scene: () => JSON.parse(JSON.stringify(breakingScene))
    });

    if (rawSteps.length === 3) {
        const mid = rawSteps[1];
        expanded.push({
            title: mid.title.replace(/^Paso \d+[^:]*:\s*/i, 'Paso 3 (Intermediario Reactivo): '),
            semiStep: mid.semiStep || '',
            semiGlobal: mid.semiGlobal || '',
            desc: mid.desc || '',
            legend: mid.legend || {
                breaking: 'Enlaces iniciales rotos; especie intermedia formada.',
                forming: 'Preparación para el ataque hacia el producto.',
                movement: 'Formación del intermediario de reacción.'
            },
            scene: () => JSON.parse(JSON.stringify(mid.scene || { atoms: [], bonds: [] }))
        });
    } else {
        const severedScene = JSON.parse(JSON.stringify(breakingScene));
        severedScene.bonds = (severedScene.bonds || []).filter(b => b.state !== 'breaking');
        delete severedScene.arrows;
        severedScene.atoms = (severedScene.atoms || []).map(a => ({
            ...a,
            highlight: a.highlight || '#fbbf24'
        }));
        expanded.push({
            title: 'Paso 3 (Ruptura Consumada): Los enlaces se han roto dejando los fragmentos reactivos listos',
            semiStep: first.semiStep || '',
            semiGlobal: first.semiGlobal || '',
            desc: 'Los enlaces marcados en rojo se han roto por completo, dejando los fragmentos reactivos listos para reorganizarse y formar los nuevos enlaces.',
            legend: {
                breaking: 'Ruptura completada de los enlaces marcados en rojo.',
                forming: 'Fragmentos reactivos listos para enlazarse.',
                movement: 'Separación de los grupos salientes y aproximación de los fragmentos.'
            },
            scene: () => JSON.parse(JSON.stringify(severedScene))
        });
    }

    const formingScene = JSON.parse(JSON.stringify(finalScene));
    formingScene.bonds = (formingScene.bonds || []).map(b => ({
        ...b,
        state: (b.state === 'new' || b.state === 'forming') ? 'forming' : (b.state === 'new-pi' ? 'forming-pi' : b.state)
    }));
    const stepFormNum = expanded.length + 1;
    expanded.push({
        title: `Paso ${stepFormNum} (Formación en Verde): Se trazan en VERDE punteado los nuevos enlaces`,
        semiStep: last.semiStep || '',
        semiGlobal: last.semiGlobal || '',
        desc: 'Observa en verde punteado cómo se están formando los nuevos enlaces covalentes en el producto.',
        legend: {
            breaking: 'Enlaces antiguos ya separados.',
            forming: (last.legend && last.legend.forming) || 'En verde punteado: nuevos enlaces en formación.',
            movement: 'Acercamiento final a la distancia de enlace covalente.'
        },
        scene: () => JSON.parse(JSON.stringify(formingScene))
    });

    const stepFinalNum = expanded.length + 1;
    expanded.push({
        title: last.title.replace(/^Paso \d+[^:]*:\s*/i, `Paso ${stepFinalNum} (Producto Consolidado): `),
        semiStep: last.semiStep || '',
        semiGlobal: last.semiGlobal || '',
        desc: last.desc || 'Queda consolidado en verde sólido el producto final de la reacción.',
        legend: {
            breaking: 'Ruptura completada.',
            forming: 'Nuevos enlaces consolidados en verde sólido.',
            movement: 'Producto estable obtenido.'
        },
        scene: () => JSON.parse(JSON.stringify(finalScene))
    });

    return wrapWithSemidevelopedEndpoints(expanded, catalystLabel);
}

export function buildAutoNomenclatureScene(semi) {
    const s = String(semi || '').trim();
    const atoms = [];
    const bonds = [];

    // 1. Isómeros geométricos CIS- / TRANS- / E- / Z-
    const mGeo = s.match(/^(CIS|TRANS|E|Z)-(.+?)-C(?:\(([^)]+)\)|H)=C(?:\(([^)]+)\)|H)-(.+)$/i);
    if (mGeo) {
        const mode = mGeo[1].toUpperCase();
        const leftMain = mGeo[2].replace(/CH3/g, 'CH₃').replace(/CH2/g, 'CH₂');
        const leftSub = (mGeo[3] || 'H').replace(/CH3/g, 'CH₃').replace(/CH2/g, 'CH₂');
        const rightSub = (mGeo[4] || 'H').replace(/CH3/g, 'CH₃').replace(/CH2/g, 'CH₂');
        const rightMain = mGeo[5].replace(/CH3/g, 'CH₃').replace(/CH2/g, 'CH₂');

        const sameSide = (mode === 'CIS' || mode === 'Z');
        atoms.push(
            { id: 'CL', el: 'C', x: 400, y: 185 },
            { id: 'CR', el: 'C', x: 520, y: 185 },
            { id: 'LT', el: leftMain, x: 300, y: 95 },
            { id: 'LB', el: leftSub, x: 300, y: 275 },
            { id: 'RT', el: sameSide ? rightMain : rightSub, x: 620, y: 95 },
            { id: 'RB', el: sameSide ? rightSub : rightMain, x: 620, y: 275 }
        );
        bonds.push(
            { from: 'CL', to: 'CR', order: 2 },
            { from: 'CL', to: 'LT', order: 1 },
            { from: 'CL', to: 'LB', order: 1 },
            { from: 'CR', to: 'RT', order: 1 },
            { from: 'CR', to: 'RB', order: 1 }
        );
        return { atoms, bonds };
    }

    // 2. Anillos Aromáticos (AROM-...) en representación topológica limpia (hexágono con 3 dobles enlaces internos y sustituyentes en los vértices)
    if (s.startsWith('AROM-')) {
        const rest = s.replace(/^AROM-(?:BENCENO)?/, '').replace(/^-+/, '');

        // Helper interno para dibujar un anillo de benceno topológico limpio
        const addBenzeneRing = (ringTag, rcx, rcy, rRad, rotOffset = -Math.PI / 2) => {
            const ringVerts = [];
            for (let k = 0; k < 6; k++) {
                const pos = k + 1;
                const ang = rotOffset + (Math.PI / 3) * k;
                const vx = Math.round(rcx + Math.cos(ang) * (rRad * 0.92));
                const vy = Math.round(rcy + Math.sin(ang) * rRad);
                ringVerts.push({ vx, vy, ang, id: `${ringTag}_V${pos}` });
                atoms.push({ id: `${ringTag}_V${pos}`, el: '', isVertex: true, x: vx, y: vy, noValenceDots: true });
            }
            for (let k = 0; k < 6; k++) {
                const next = (k + 1) % 6;
                bonds.push({
                    from: `${ringTag}_V${k + 1}`,
                    to: `${ringTag}_V${next + 1}`,
                    order: (k % 2 === 0) ? 2 : 1,
                    inwardCenter: { x: rcx, y: rcy }
                });
            }
            return ringVerts;
        };

        // Casos especiales bi-aromáticos horizontales (Fenoxibenceno, Bencilfeniléter, Difenilmetanona)
        const normRest = normalizeFormulaLookupKey(rest);
        if (normRest === '1-O-C6H5') {
            // Fenoxibenceno (Difeniléter) en horizontal: Benceno izq — O — Benceno der
            const leftVerts = addBenzeneRing('R1', 285, 190, 62, 0);   // V1 apunta a la derecha (0 rad)
            const rightVerts = addBenzeneRing('R2', 635, 190, 62, Math.PI); // V1 apunta a la izquierda (PI rad)
            atoms.push({ id: 'O_BRIDGE', el: 'O', x: 460, y: 190, noValenceDots: true });
            bonds.push(
                { from: leftVerts[0].id, to: 'O_BRIDGE', order: 1 },
                { from: 'O_BRIDGE', to: rightVerts[0].id, order: 1 }
            );
            return { atoms, bonds };
        }

        if (normRest === '1-OCH2C6H5') {
            // Bencilfeniléter en horizontal: Benceno izq — O — CH₂ — Benceno der
            const leftVerts = addBenzeneRing('R1', 240, 190, 58, 0);
            const rightVerts = addBenzeneRing('R2', 680, 190, 58, Math.PI);
            atoms.push(
                { id: 'O_BRIDGE', el: 'O', x: 400, y: 190, noValenceDots: true },
                { id: 'CH2_BRIDGE', el: 'CH₂', x: 520, y: 190, noValenceDots: true }
            );
            bonds.push(
                { from: leftVerts[0].id, to: 'O_BRIDGE', order: 1 },
                { from: 'O_BRIDGE', to: 'CH2_BRIDGE', order: 1 },
                { from: 'CH2_BRIDGE', to: rightVerts[0].id, order: 1 }
            );
            return { atoms, bonds };
        }

        if (normRest === '1-COC6H5') {
            // Difenilmetanona (Benzofenona) en horizontal: Benceno izq — C(=O) — Benceno der
            const leftVerts = addBenzeneRing('R1', 285, 205, 60, 0);
            const rightVerts = addBenzeneRing('R2', 635, 205, 60, Math.PI);
            atoms.push(
                { id: 'C_CARB', el: 'C', x: 460, y: 205, noValenceDots: true },
                { id: 'O_CARB', el: 'O', x: 460, y: 105, noValenceDots: true }
            );
            bonds.push(
                { from: leftVerts[0].id, to: 'C_CARB', order: 1 },
                { from: 'C_CARB', to: 'O_CARB', order: 2 },
                { from: 'C_CARB', to: rightVerts[0].id, order: 1 }
            );
            return { atoms, bonds };
        }

        if (normRest === '1-NHC6H5') {
            // Difenilamina (N-Fenilanilina) en horizontal: Benceno izq — NH — Benceno der
            const leftVerts = addBenzeneRing('R1', 285, 190, 62, 0);
            const rightVerts = addBenzeneRing('R2', 635, 190, 62, Math.PI);
            atoms.push({ id: 'NH_BRIDGE', el: 'NH', x: 460, y: 190, noValenceDots: true });
            bonds.push(
                { from: leftVerts[0].id, to: 'NH_BRIDGE', order: 1 },
                { from: 'NH_BRIDGE', to: rightVerts[0].id, order: 1 }
            );
            return { atoms, bonds };
        }

        if (normRest === '1-N=NC6H5') {
            // Azobenceno en horizontal: Benceno izq — N = N — Benceno der
            const leftVerts = addBenzeneRing('R1', 240, 190, 58, 0);
            const rightVerts = addBenzeneRing('R2', 680, 190, 58, Math.PI);
            atoms.push(
                { id: 'N1_BRIDGE', el: 'N', x: 400, y: 190, noValenceDots: true },
                { id: 'N2_BRIDGE', el: 'N', x: 520, y: 190, noValenceDots: true }
            );
            bonds.push(
                { from: leftVerts[0].id, to: 'N1_BRIDGE', order: 1 },
                { from: 'N1_BRIDGE', to: 'N2_BRIDGE', order: 2 },
                { from: 'N2_BRIDGE', to: rightVerts[0].id, order: 1 }
            );
            return { atoms, bonds };
        }

        const cx = 460, cy = 195, R = 64;
        const subCountsByPos = {};
        const parsedSubs = [];
        if (rest && rest !== 'QUINONA') {
            const parts = rest.split(/-(?=[0-9]+(?:,[0-9]+)*-)/);
            parts.forEach(part => {
                const dashIdx = part.indexOf('-');
                const posStr = dashIdx === -1 ? '1' : part.slice(0, dashIdx);
                const rawGrp = dashIdx === -1 ? part : part.slice(dashIdx + 1);
                posStr.split(',').map(Number).forEach(pos => {
                    subCountsByPos[pos] = (subCountsByPos[pos] || 0) + 1;
                    parsedSubs.push({ pos, rawGrp });
                });
            });
        }

        if (s === 'AROM-QUINONA') {
            const verts = [];
            for (let k = 0; k < 6; k++) {
                const pos = k + 1;
                const ang = -Math.PI / 2 + (Math.PI / 3) * k;
                const vx = Math.round(cx + Math.cos(ang) * (R * 0.90));
                const vy = Math.round(cy + Math.sin(ang) * R);
                verts.push({ vx, vy, ang });
                atoms.push({ id: `V${pos}`, el: '', isVertex: true, x: vx, y: vy, noValenceDots: true });
            }
            bonds.push(
                { from: 'V1', to: 'V2', order: 1 }, { from: 'V2', to: 'V3', order: 2, inwardCenter: { x: cx, y: cy } },
                { from: 'V3', to: 'V4', order: 1 }, { from: 'V4', to: 'V5', order: 1 },
                { from: 'V5', to: 'V6', order: 2, inwardCenter: { x: cx, y: cy } }, { from: 'V6', to: 'V1', order: 1 }
            );
            atoms.push(
                { id: 'O1', el: 'O', x: cx, y: cy - R - 64, noValenceDots: true },
                { id: 'O4', el: 'O', x: cx, y: cy + R + 64, noValenceDots: true }
            );
            bonds.push({ from: 'V1', to: 'O1', order: 2 }, { from: 'V4', to: 'O4', order: 2 });
            return { atoms, bonds };
        }

        const verts = addBenzeneRing('R0', cx, cy, R, -Math.PI / 2);

        const placedAtPos = {};
        parsedSubs.forEach((itemSub, sIdx) => {
            const { pos, rawGrp } = itemSub;
            const v = verts[(pos - 1) % 6];
            if (!v) return;
            const totalHere = subCountsByPos[pos] || 1;
            const idxHere = placedAtPos[pos] || 0;
            placedAtPos[pos] = idxHere + 1;

            let grp = rawGrp
                .replace(/CH3/g, 'CH₃')
                .replace(/CH2/g, 'CH₂')
                .replace(/NO2/g, 'NO₂')
                .replace(/NH2/g, 'NH₂')
                .replace(/C6H5/g, 'C₆H₅');
            if (pos === 5 || pos === 6) {
                if (grp === 'NO₂') grp = 'O₂N';
                if (grp === 'NH₂') grp = 'H₂N';
                if (grp === 'OH') grp = 'HO';
                if (grp === 'CH₃') grp = 'H₃C';
            }

            const spread = totalHere > 1 ? (idxHere === 0 ? -0.36 : 0.36) : 0;
            const extraReach = grp.length > 2 ? Math.min(34, (grp.length - 2) * 11) : 0;
            const baseDist = R + 88 + extraReach;
            const sx = Math.round(cx + Math.cos(v.ang + spread) * (baseDist * 0.92));
            const sy = Math.round(cy + Math.sin(v.ang + spread) * baseDist);
            const sid = `S_${sIdx}`;

            // Si el sustituyente es grupo isopropilo CH(CH3)2, colocar un CH₃ siguiendo el eje radial y el otro CH₃ hacia un costado
            if (normalizeFormulaLookupKey(grp) === 'CH(CH3)2' && totalHere === 1) {
                atoms.push({ id: sid, el: 'CH', x: sx, y: sy, noValenceDots: true });
                bonds.push({ from: v.id, to: sid, order: 1 });

                const outX = Math.round(cx + Math.cos(v.ang) * ((baseDist + 74) * 0.92));
                const outY = Math.round(cy + Math.sin(v.ang) * (baseDist + 74));
                const perpAng = v.ang + Math.PI / 2;
                const sideX = Math.round(sx + Math.cos(perpAng) * 98);
                const sideY = Math.round(sy + Math.sin(perpAng) * 98);
                atoms.push(
                    { id: `S_ISO_V_${sIdx}`, el: 'CH₃', x: outX, y: outY, noValenceDots: true },
                    { id: `S_ISO_S_${sIdx}`, el: 'CH₃', x: sideX, y: sideY, noValenceDots: true }
                );
                bonds.push(
                    { from: sid, to: `S_ISO_V_${sIdx}`, order: 1 },
                    { from: sid, to: `S_ISO_S_${sIdx}`, order: 1 }
                );
            } else {
                // Si el sustituyente es -OCH3 (anisol), -OCH2CH3 (fenetol), -SCH3, -NHCH3, etc., desplegar el enlace O—R verticalmente/radialmente alineado al carbono
                const mEtherSub = grp.match(/^(O|S|NH)(CH₃|CH₂CH₃|CH₂CH₂CH₃|C₆H₅)$/);
                if (mEtherSub && totalHere === 1) {
                    const heteroEl = mEtherSub[1];
                    let alkylEl = mEtherSub[2];
                    const isVert = Math.abs(Math.cos(v.ang)) < 0.35;
                    if (!isVert && Math.cos(v.ang) < -0.25) {
                        if (alkylEl === 'CH₃') alkylEl = 'H₃C';
                        else if (alkylEl === 'CH₂CH₃') alkylEl = 'H₃CH₂C';
                    }
                    const nearDist = R + 76;
                    const farDist = R + 148;
                    const nearX = Math.round(cx + Math.cos(v.ang) * (nearDist * 0.92));
                    const nearY = Math.round(cy + Math.sin(v.ang) * nearDist);
                    atoms.push({ id: sid, el: heteroEl, x: nearX, y: nearY, noValenceDots: true });
                    bonds.push({ from: v.id, to: sid, order: 1 });

                    const sx2 = Math.round(cx + Math.cos(v.ang) * (farDist * 0.92));
                    const sy2 = Math.round(cy + Math.sin(v.ang) * farDist);
                    const sid2 = `S2_${sIdx}`;
                    const shiftC2 = (isVert && alkylEl.length > 1 && !alkylEl.startsWith('H')) ? Math.round((alkylEl.length - 1) * 9.5) : 0;
                    atoms.push({ id: sid2, el: alkylEl, x: sx2 + shiftC2, y: sy2, noValenceDots: true, bondTargetX: isVert ? sx2 : undefined });
                    bonds.push({ from: sid, to: sid2, order: 1 });
                } else {
                    const isVert = Math.abs(Math.cos(v.ang)) < 0.35;
                    const shiftC = (isVert && grp.length > 1 && !grp.startsWith('H')) ? Math.round((grp.length - 1) * 9.5) : 0;
                    atoms.push({ id: sid, el: grp, x: sx + shiftC, y: sy, noValenceDots: true, bondTargetX: isVert ? sx : undefined });
                    bonds.push({ from: v.id, to: sid, order: 1 });
                }
            }
        });
        return { atoms, bonds };
    }

    // 2a. Hidrocarburos Aromáticos Policíclicos Condensados (NAFTALENO-... y ANTRACENO-...)
    if (s.startsWith('NAFTALENO')) {
        const rest = s.replace(/^NAFTALENO-?/, '');
        const R = 58;
        const dx = Math.round(R * Math.cos(Math.PI / 6)); // ~50
        const dy = Math.round(R * Math.sin(Math.PI / 6)); // ~29
        const c1x = 460 - dx, c2x = 460 + dx, cy = 195;

        // Numeración IUPAC oficial del naftaleno (1..8 + 4a, 8a)
        const pts = {
            1:  { x: c1x,      y: cy - R,      ang: -Math.PI / 2 },
            2:  { x: c1x - dx, y: cy - dy,     ang: -(5 * Math.PI) / 6 },
            3:  { x: c1x - dx, y: cy + dy,     ang: (5 * Math.PI) / 6 },
            4:  { x: c1x,      y: cy + R,      ang: Math.PI / 2 },
            '4a': { x: 460,    y: cy + dy,     ang: Math.PI / 2 },
            5:  { x: c2x,      y: cy + R,      ang: Math.PI / 2 },
            6:  { x: c2x + dx, y: cy + dy,     ang: Math.PI / 6 },
            7:  { x: c2x + dx, y: cy - dy,     ang: -Math.PI / 6 },
            8:  { x: c2x,      y: cy - R,      ang: -Math.PI / 2 },
            '8a': { x: 460,    y: cy - dy,     ang: -Math.PI / 2 }
        };
        // Nota: invertimos izq/der para que C1 quede arriba-derecha según convención clásica de Isasi (1 arriba-der, 2 der-sup, 3 der-inf, 4 abajo-der, 5 abajo-izq, 6 izq-inf, 7 izq-sup, 8 arriba-izq)
        const ptsIsasi = {
            1:  { x: c2x,      y: cy - R,      ang: -Math.PI / 2 },
            2:  { x: c2x + dx, y: cy - dy,     ang: -Math.PI / 6 },
            3:  { x: c2x + dx, y: cy + dy,     ang: Math.PI / 6 },
            4:  { x: c2x,      y: cy + R,      ang: Math.PI / 2 },
            '4a': { x: 460,    y: cy + dy,     ang: Math.PI / 2 },
            5:  { x: c1x,      y: cy + R,      ang: Math.PI / 2 },
            6:  { x: c1x - dx, y: cy + dy,     ang: (5 * Math.PI) / 6 },
            7:  { x: c1x - dx, y: cy - dy,     ang: -(5 * Math.PI) / 6 },
            8:  { x: c1x,      y: cy - R,      ang: -Math.PI / 2 },
            '8a': { x: 460,    y: cy - dy,     ang: -Math.PI / 2 }
        };

        Object.entries(ptsIsasi).forEach(([k, p]) => {
            atoms.push({ id: `N_${k}`, el: '', isVertex: true, x: p.x, y: p.y, noValenceDots: true });
        });
        const ringEdges = [
            ['1', '2', 2, c2x], ['2', '3', 1, c2x], ['3', '4', 2, c2x], ['4', '4a', 1, c2x], ['4a', '8a', 2, c2x], ['8a', '1', 1, c2x],
            ['8a', '8', 1, c1x], ['8', '7', 2, c1x], ['7', '6', 1, c1x], ['6', '5', 2, c1x], ['5', '4a', 1, c1x]
        ];
        ringEdges.forEach(([u, v, ord, rcx]) => {
            bonds.push({ from: `N_${u}`, to: `N_${v}`, order: ord, inwardCenter: { x: rcx, y: cy } });
        });

        if (rest) {
            const parts = rest.split(/-(?=[0-9]+(?:,[0-9]+)*-)/);
            parts.forEach((part, pIdx) => {
                const dashIdx = part.indexOf('-');
                const posStr = dashIdx === -1 ? '1' : part.slice(0, dashIdx);
                const rawGrp = dashIdx === -1 ? part : part.slice(dashIdx + 1);
                posStr.split(',').map(Number).forEach((pos, subIdx) => {
                    const v = ptsIsasi[pos];
                    if (!v) return;
                    let grp = rawGrp.replace(/CH3/g, 'CH₃').replace(/CH2/g, 'CH₂').replace(/NO2/g, 'NO₂');
                    if (pos >= 5 && pos <= 8) {
                        if (grp === 'CH₃') grp = 'H₃C';
                        if (grp === 'NO₂') grp = 'O₂N';
                    }
                    const sx = Math.round(v.x + Math.cos(v.ang) * 62);
                    const sy = Math.round(v.y + Math.sin(v.ang) * 62);
                    const sid = `NS_${pIdx}_${subIdx}`;
                    atoms.push({ id: sid, el: grp, x: sx, y: sy, noValenceDots: true });
                    bonds.push({ from: `N_${pos}`, to: sid, order: 1 });
                });
            });
        }
        return { atoms, bonds };
    }

    if (s.startsWith('ANTRACENO')) {
        const rest = s.replace(/^ANTRACENO-?/, '');
        const R = 52;
        const dx = Math.round(R * Math.cos(Math.PI / 6)); // ~45
        const dy = Math.round(R * Math.sin(Math.PI / 6)); // ~26
        const cLeft = 460 - 2 * dx;
        const cMid = 460;
        const cRight = 460 + 2 * dx;
        const cy = 195;

        // Numeración IUPAC del antraceno (1..4 derecha, 9 arriba-centro, 10 abajo-centro, 5..8 izquierda)
        const ptsAnt = {
            1:  { x: cRight,      y: cy - R,  ang: -Math.PI / 2 },
            2:  { x: cRight + dx, y: cy - dy, ang: -Math.PI / 6 },
            3:  { x: cRight + dx, y: cy + dy, ang: Math.PI / 6 },
            4:  { x: cRight,      y: cy + R,  ang: Math.PI / 2 },
            '4a': { x: cMid + dx, y: cy + dy, ang: Math.PI / 2 },
            10: { x: cMid,        y: cy + R,  ang: Math.PI / 2 },
            '10a': { x: cMid - dx, y: cy + dy, ang: Math.PI / 2 },
            5:  { x: cLeft,       y: cy + R,  ang: Math.PI / 2 },
            6:  { x: cLeft - dx,  y: cy + dy, ang: (5 * Math.PI) / 6 },
            7:  { x: cLeft - dx,  y: cy - dy, ang: -(5 * Math.PI) / 6 },
            8:  { x: cLeft,       y: cy - R,  ang: -Math.PI / 2 },
            '8a': { x: cMid - dx, y: cy - dy, ang: -Math.PI / 2 },
            9:  { x: cMid,        y: cy - R,  ang: -Math.PI / 2 },
            '9a': { x: cMid + dx, y: cy - dy, ang: -Math.PI / 2 }
        };

        Object.entries(ptsAnt).forEach(([k, p]) => {
            atoms.push({ id: `A_${k}`, el: '', isVertex: true, x: p.x, y: p.y, noValenceDots: true });
        });

        const antEdges = [
            ['1', '2', 2, cRight], ['2', '3', 1, cRight], ['3', '4', 2, cRight], ['4', '4a', 1, cRight], ['4a', '9a', 2, cRight], ['9a', '1', 1, cRight],
            ['9a', '9', 1, cMid], ['9', '8a', 2, cMid], ['8a', '10a', 1, cMid], ['10a', '10', 2, cMid], ['10', '4a', 1, cMid],
            ['8a', '8', 1, cLeft], ['8', '7', 2, cLeft], ['7', '6', 1, cLeft], ['6', '5', 2, cLeft], ['5', '10a', 1, cLeft]
        ];
        antEdges.forEach(([u, v, ord, rcx]) => {
            bonds.push({ from: `A_${u}`, to: `A_${v}`, order: ord, inwardCenter: { x: rcx, y: cy } });
        });

        if (rest) {
            const parts = rest.split(/-(?=[0-9]+(?:,[0-9]+)*-)/);
            parts.forEach((part, pIdx) => {
                const dashIdx = part.indexOf('-');
                const posStr = dashIdx === -1 ? '9' : part.slice(0, dashIdx);
                const rawGrp = dashIdx === -1 ? part : part.slice(dashIdx + 1);
                posStr.split(',').map(Number).forEach((pos, subIdx) => {
                    const v = ptsAnt[pos];
                    if (!v) return;
                    let grp = rawGrp.replace(/CH3/g, 'CH₃').replace(/NO2/g, 'NO₂');
                    if (pos >= 5 && pos <= 8 && grp === 'NO₂') grp = 'O₂N';
                    const sx = Math.round(v.x + Math.cos(v.ang) * 58);
                    const sy = Math.round(v.y + Math.sin(v.ang) * 58);
                    const sid = `AS_${pIdx}_${subIdx}`;
                    atoms.push({ id: sid, el: grp, x: sx, y: sy, noValenceDots: true });
                    bonds.push({ from: `A_${pos}`, to: sid, order: 1 });
                });
            });
        }
        return { atoms, bonds };
    }

    // 2a-bis. Heterociclos Aromáticos, Biciclos Condensados, Anulenos, Lactonas, Prolina, Carbohidratos y Lípidos
    // Helper de red hexagonal perfecta (hexágonos con lados verticales, ancho 2*dx, paso vertical R+dy = 1.5*R)
    const buildHexLattice = (ringSpecs) => {
        const R = 48;
        const dx = Math.round(R * Math.cos(Math.PI / 6)); // ~42
        const dy = Math.round(R * Math.sin(Math.PI / 6)); // 24
        const rowStep = R + dy; // 72
        const vertMap = new Map();
        const edgeMap = new Map();

        const vKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;
        const getOrAddVert = (x, y) => {
            const k = vKey(x, y);
            if (!vertMap.has(k)) {
                const id = `HV_${vertMap.size}`;
                vertMap.set(k, { id, x: Math.round(x), y: Math.round(y) });
                atoms.push({ id, el: '', isVertex: true, x: Math.round(x), y: Math.round(y), noValenceDots: true });
            }
            return vertMap.get(k);
        };

        ringSpecs.forEach(rg => {
            const cx = rg.cx;
            const cy = rg.cy;
            const pts = [];
            for (let k = 0; k < 6; k++) {
                const ang = -Math.PI / 2 + (Math.PI / 3) * k;
                pts.push(getOrAddVert(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R));
            }
            for (let k = 0; k < 6; k++) {
                const vA = pts[k];
                const vB = pts[(k + 1) % 6];
                const eKey = [vA.id, vB.id].sort().join('--');
                const ord = (rg.dbl || []).includes(k) ? 2 : 1;
                if (!edgeMap.has(eKey) || ord === 2) {
                    edgeMap.set(eKey, { from: vA.id, to: vB.id, order: ord, inwardCenter: { x: cx, y: cy } });
                }
            }
        });

        edgeMap.forEach(e => bonds.push(e));
        return { atoms, bonds };
    };

    if (s === 'FENANTRENO') {
        // Fenantreno clásico (lados horizontales arriba/abajo: 2 anillos arriba izq/der + 1 anillo abajo al centro, 7 dobles enlaces = 14 e- pi)
        const R = 50;
        const dy = Math.round(R * Math.sin(Math.PI / 3)); // ~43
        const colStep = Math.round(R * 1.5); // 75
        const cx = 460, cy = 195;
        const vertMap = new Map();
        const edgeMap = new Map();
        const getOrAddVert = (x, y) => {
            const rx = Math.round(x), ry = Math.round(y);
            const k = `${rx},${ry}`;
            if (!vertMap.has(k)) {
                const id = `FV_${vertMap.size}`;
                vertMap.set(k, { id, x: rx, y: ry });
                atoms.push({ id, el: '', isVertex: true, x: rx, y: ry, noValenceDots: true });
            }
            return vertMap.get(k);
        };
        // Flat-top hexagon vertices: k=0 (0° der), k=1 (60° inf-der), k=2 (120° inf-izq), k=3 (180° izq), k=4 (240° sup-izq), k=5 (300° sup-der)
        // Aristas: 0 (inf-der), 1 (inferior horiz), 2 (inf-izq), 3 (sup-izq), 4 (superior horiz), 5 (sup-der)
        const rings = [
            { cx: cx - colStep, cy: cy - dy / 2, dbl: [2, 4] },    // anillo superior izquierdo: inf-izq (2) y sup-horiz (4)
            { cx: cx + colStep, cy: cy - dy / 2, dbl: [0, 4] },    // anillo superior derecho: inf-der (0) y sup-horiz (4)
            { cx: cx,           cy: cy + dy / 2, dbl: [0, 2, 4] }  // anillo inferior central: inf-der (0), inf-izq (2) y sup-horiz (4)
        ];
        rings.forEach(rg => {
            const pts = [];
            for (let k = 0; k < 6; k++) {
                const ang = (Math.PI / 3) * k;
                pts.push(getOrAddVert(rg.cx + Math.cos(ang) * R, rg.cy + Math.sin(ang) * R));
            }
            for (let k = 0; k < 6; k++) {
                const vA = pts[k];
                const vB = pts[(k + 1) % 6];
                const eKey = [vA.id, vB.id].sort().join('--');
                const ord = rg.dbl.includes(k) ? 2 : 1;
                if (!edgeMap.has(eKey) || ord === 2) {
                    edgeMap.set(eKey, { from: vA.id, to: vB.id, order: ord, inwardCenter: { x: rg.cx, y: rg.cy } });
                }
            }
        });
        edgeMap.forEach(e => bonds.push(e));
        return { atoms, bonds };
    }

    if (s === 'PIRENO') {
        // Pireno: 2 anillos arriba + 2 anillos abajo desplazados +dx (4 anillos pericondensados, 16 electrones pi = 8 dobles enlaces)
        const R = 48, dx = Math.round(R * Math.cos(Math.PI / 6)), rowStep = Math.round(R * 1.5);
        const cx = 440, cy = 195;
        return buildHexLattice([
            { cx: cx - dx,     cy: cy - rowStep / 2, dbl: [0, 2, 4] },
            { cx: cx + dx,     cy: cy - rowStep / 2, dbl: [0, 2] },
            { cx: cx,          cy: cy + rowStep / 2, dbl: [1, 3] },
            { cx: cx + 2 * dx, cy: cy + rowStep / 2, dbl: [1] }
        ]);
    }

    if (s === 'BENZOPIRENO') {
        // Benzo[a]pireno: núcleo de pireno (4 anillos) + 1 anillo bencénico fusionado en la arista superior derecha (20 e- pi = 10 dobles enlaces)
        const R = 48, dx = Math.round(R * Math.cos(Math.PI / 6)), rowStep = Math.round(R * 1.5);
        const cx = 415, cy = 195;
        return buildHexLattice([
            { cx: cx - dx,     cy: cy - rowStep / 2, dbl: [0, 2, 4] },
            { cx: cx + dx,     cy: cy - rowStep / 2, dbl: [0, 2] },
            { cx: cx + 3 * dx, cy: cy - rowStep / 2, dbl: [0, 2] },
            { cx: cx,          cy: cy + rowStep / 2, dbl: [1, 3] },
            { cx: cx + 2 * dx, cy: cy + rowStep / 2, dbl: [1] }
        ]);
    }

    if (s === 'CICLO-6-1-=CH2') {
        // Metilenciclohexano: hexágono geométrico limpio con =CH2 exocíclico en C1
        const cx = 460, cy = 205, R = 68;
        for (let k = 0; k < 6; k++) {
            const ang = -Math.PI / 2 + (Math.PI / 3) * k;
            atoms.push({ id: `MC_${k + 1}`, el: '', isVertex: true, x: Math.round(cx + Math.cos(ang) * (R * 0.92)), y: Math.round(cy + Math.sin(ang) * R), noValenceDots: true });
        }
        for (let k = 0; k < 6; k++) {
            bonds.push({ from: `MC_${k + 1}`, to: `MC_${((k + 1) % 6) + 1}`, order: 1 });
        }
        atoms.push({ id: 'MC_CH2', el: 'CH₂', x: cx, y: cy - R - 64, noValenceDots: true });
        bonds.push({ from: 'MC_1', to: 'MC_CH2', order: 2 });
        return { atoms, bonds };
    }

    if (s === 'QUINOLINA') {
        // Quinolina (1-azanaftaleno): biciclo aromático condensado con N en vértice inferior derecho (posición 1)
        const R = 58, dx = Math.round(R * Math.cos(Math.PI / 6)), dy = Math.round(R * Math.sin(Math.PI / 6));
        const c1x = 460 - dx, c2x = 460 + dx, cy = 195;
        const pts = {
            1:  { x: c2x,      y: cy + R,  el: 'N', isVertex: false },
            2:  { x: c2x + dx, y: cy + dy, el: '',  isVertex: true },
            3:  { x: c2x + dx, y: cy - dy, el: '',  isVertex: true },
            4:  { x: c2x,      y: cy - R,  el: '',  isVertex: true },
            '4a': { x: 460,    y: cy - dy, el: '',  isVertex: true },
            5:  { x: c1x,      y: cy - R,  el: '',  isVertex: true },
            6:  { x: c1x - dx, y: cy - dy, el: '',  isVertex: true },
            7:  { x: c1x - dx, y: cy + dy, el: '',  isVertex: true },
            8:  { x: c1x,      y: cy + R,  el: '',  isVertex: true },
            '8a': { x: 460,    y: cy + dy, el: '',  isVertex: true }
        };
        Object.entries(pts).forEach(([k, p]) => {
            atoms.push({ id: `Q_${k}`, el: p.el, isVertex: p.isVertex, x: p.x, y: p.y, noValenceDots: true });
        });
        const qEdges = [
            ['1', '2', 2, c2x], ['2', '3', 1, c2x], ['3', '4', 2, c2x], ['4', '4a', 1, c2x], ['4a', '8a', 2, c2x], ['8a', '1', 1, c2x],
            ['8a', '8', 1, c1x], ['8', '7', 2, c1x], ['7', '6', 1, c1x], ['6', '5', 2, c1x], ['5', '4a', 1, c1x]
        ];
        qEdges.forEach(([u, v, ord, rcx]) => {
            bonds.push({ from: `Q_${u}`, to: `Q_${v}`, order: ord, inwardCenter: { x: rcx, y: cy } });
        });
        return { atoms, bonds };
    }

    if (s === 'HETERO-AROM-6-1,2-N') {
        // Piridazina: anillo hexagonal aromático con N en pos 1 y N en pos 2
        const cx = 460, cy = 195, R = 64;
        for (let k = 0; k < 6; k++) {
            const pos = k + 1;
            const ang = -Math.PI / 2 + (Math.PI / 3) * k;
            const vx = Math.round(cx + Math.cos(ang) * (R * 0.92));
            const vy = Math.round(cy + Math.sin(ang) * R);
            const isN = (pos === 1 || pos === 2);
            atoms.push({ id: `PZ_${pos}`, el: isN ? 'N' : '', isVertex: !isN, x: vx, y: vy, noValenceDots: true });
        }
        for (let k = 0; k < 6; k++) {
            const next = (k + 1) % 6;
            bonds.push({
                from: `PZ_${k + 1}`,
                to: `PZ_${next + 1}`,
                order: (k % 2 === 0) ? 2 : 1,
                inwardCenter: { x: cx, y: cy }
            });
        }
        return { atoms, bonds };
    }

    if (s === 'PIRIDINA-3-COOH') {
        // Ácido nicotínico (3-piridinocarboxílico): N en pos 1 (arriba) y COOH en pos 3
        const cx = 460, cy = 195, R = 64;
        const verts = [];
        for (let k = 0; k < 6; k++) {
            const pos = k + 1;
            const ang = -Math.PI / 2 + (Math.PI / 3) * k;
            const vx = Math.round(cx + Math.cos(ang) * (R * 0.92));
            const vy = Math.round(cy + Math.sin(ang) * R);
            verts.push({ vx, vy, ang });
            atoms.push({ id: `PY_${pos}`, el: pos === 1 ? 'N' : '', isVertex: pos !== 1, x: vx, y: vy, noValenceDots: true });
        }
        for (let k = 0; k < 6; k++) {
            const next = (k + 1) % 6;
            bonds.push({
                from: `PY_${k + 1}`,
                to: `PY_${next + 1}`,
                order: (k % 2 === 0) ? 2 : 1,
                inwardCenter: { x: cx, y: cy }
            });
        }
        const v3 = verts[2];
        const sx = Math.round(cx + Math.cos(v3.ang) * ((R + 106) * 0.92));
        const sy = Math.round(cy + Math.sin(v3.ang) * (R + 106));
        atoms.push({ id: 'PY_COOH', el: 'COOH', x: sx, y: sy, noValenceDots: true });
        bonds.push({ from: 'PY_3', to: 'PY_COOH', order: 1 });
        return { atoms, bonds };
    }

    if (s === 'PURINA') {
        // Purina: pirimidina (hexágono izq con N1 y N3) fusionada a imidazol (pentágono der con N7 y NH9)
        const cx = 430, cy = 195, R = 56;
        const hexNodes = [
            { id: 'PU_6', el: '', isVertex: true },
            { id: 'PU_5', el: '', isVertex: true },
            { id: 'PU_4', el: '', isVertex: true },
            { id: 'PU_3', el: 'N', isVertex: false },
            { id: 'PU_2', el: '', isVertex: true },
            { id: 'PU_1', el: 'N', isVertex: false }
        ];
        const hexCoords = [];
        hexNodes.forEach((nd, k) => {
            const ang = -Math.PI / 2 + (Math.PI / 3) * k;
            const vx = Math.round(cx + Math.cos(ang) * (R * 0.92));
            const vy = Math.round(cy + Math.sin(ang) * R);
            hexCoords.push({ vx, vy });
            atoms.push({ id: nd.id, el: nd.el, isVertex: nd.isVertex, x: vx, y: vy, noValenceDots: true });
        });
        // Pentágono fusionado a PU_5 (k=1) y PU_4 (k=2)
        const p5 = hexCoords[1], p4 = hexCoords[2];
        const n7x = p5.vx + 56, n7y = p5.vy - 12;
        const c8x = p5.vx + 90, c8y = cy;
        const n9x = p4.vx + 56, n9y = p4.vy + 12;
        atoms.push(
            { id: 'PU_7', el: 'N', isVertex: false, x: n7x, y: n7y, noValenceDots: true },
            { id: 'PU_8', el: '', isVertex: true, x: c8x, y: c8y, noValenceDots: true },
            { id: 'PU_9', el: 'NH', isVertex: false, x: n9x, y: n9y, noValenceDots: true }
        );
        bonds.push(
            { from: 'PU_6', to: 'PU_5', order: 2, inwardCenter: { x: cx, y: cy } },
            { from: 'PU_5', to: 'PU_4', order: 1 },
            { from: 'PU_4', to: 'PU_3', order: 2, inwardCenter: { x: cx, y: cy } },
            { from: 'PU_3', to: 'PU_2', order: 1 },
            { from: 'PU_2', to: 'PU_1', order: 2, inwardCenter: { x: cx, y: cy } },
            { from: 'PU_1', to: 'PU_6', order: 1 },
            { from: 'PU_5', to: 'PU_7', order: 1 },
            { from: 'PU_7', to: 'PU_8', order: 2, inwardCenter: { x: cx + 75, y: cy } },
            { from: 'PU_8', to: 'PU_9', order: 1 },
            { from: 'PU_9', to: 'PU_4', order: 1 }
        );
        return { atoms, bonds };
    }

    if (s === 'PTERIDINA') {
        // Pteridina: pirimidina (N1, N3 izq) fusionada a pirazina (N5, N8 der)
        const R = 58, dx = Math.round(R * Math.cos(Math.PI / 6)), dy = Math.round(R * Math.sin(Math.PI / 6));
        const c1x = 460 - dx, c2x = 460 + dx, cy = 195;
        const pts = {
            5:  { x: c2x,      y: cy - R,  el: 'N', isVertex: false },
            6:  { x: c2x + dx, y: cy - dy, el: '',  isVertex: true },
            7:  { x: c2x + dx, y: cy + dy, el: '',  isVertex: true },
            8:  { x: c2x,      y: cy + R,  el: 'N', isVertex: false },
            '8a': { x: 460,    y: cy + dy, el: '',  isVertex: true },
            1:  { x: c1x,      y: cy + R,  el: 'N', isVertex: false },
            2:  { x: c1x - dx, y: cy + dy, el: '',  isVertex: true },
            3:  { x: c1x - dx, y: cy - dy, el: 'N', isVertex: false },
            4:  { x: c1x,      y: cy - R,  el: '',  isVertex: true },
            '4a': { x: 460,    y: cy - dy, el: '',  isVertex: true }
        };
        Object.entries(pts).forEach(([k, p]) => {
            atoms.push({ id: `PT_${k}`, el: p.el, isVertex: p.isVertex, x: p.x, y: p.y, noValenceDots: true });
        });
        const ptEdges = [
            ['5', '6', 2, c2x], ['6', '7', 1, c2x], ['7', '8', 2, c2x], ['8', '8a', 1, c2x], ['8a', '4a', 2, c2x], ['4a', '5', 1, c2x],
            ['8a', '1', 1, c1x], ['1', '2', 2, c1x], ['2', '3', 1, c1x], ['3', '4', 2, c1x], ['4', '4a', 1, c1x]
        ];
        ptEdges.forEach(([u, v, ord, rcx]) => {
            bonds.push({ from: `PT_${u}`, to: `PT_${v}`, order: ord, inwardCenter: { x: rcx, y: cy } });
        });
        return { atoms, bonds };
    }

    if (s === 'ANULENO-16') {
        // [16]-Anuleno: polieno cíclico conjugado de 16 carbonos (8 dobles enlaces alternados)
        const cx = 460, cy = 190, R = 105;
        for (let k = 0; k < 16; k++) {
            const ang = -Math.PI / 2 + ((2 * Math.PI) / 16) * k;
            const vx = Math.round(cx + Math.cos(ang) * R);
            const vy = Math.round(cy + Math.sin(ang) * R);
            atoms.push({ id: `AN_${k}`, el: '', isVertex: true, x: vx, y: vy, noValenceDots: true });
        }
        for (let k = 0; k < 16; k++) {
            const next = (k + 1) % 16;
            bonds.push({
                from: `AN_${k}`,
                to: `AN_${next}`,
                order: (k % 2 === 0) ? 2 : 1,
                inwardCenter: { x: cx, y: cy }
            });
        }
        return { atoms, bonds };
    }

    if (s === 'LACTONA-5') {
        // γ-Butirolactona: pentágono geométrico con O en pos 1 y =O en pos 2
        const cx = 460, cy = 195, R = 74;
        const verts = [];
        for (let k = 0; k < 5; k++) {
            const pos = k + 1;
            const ang = -Math.PI / 2 + ((2 * Math.PI) / 5) * k;
            const vx = Math.round(cx + Math.cos(ang) * (R * 0.92));
            const vy = Math.round(cy + Math.sin(ang) * R);
            verts.push({ vx, vy, ang });
            atoms.push({ id: `LC_${pos}`, el: pos === 1 ? 'O' : '', isVertex: pos !== 1, x: vx, y: vy, noValenceDots: true });
        }
        for (let k = 0; k < 5; k++) {
            bonds.push({ from: `LC_${k + 1}`, to: `LC_${((k + 1) % 5) + 1}`, order: 1 });
        }
        const v2 = verts[1];
        atoms.push({ id: 'LC_O2', el: 'O', x: Math.round(cx + Math.cos(v2.ang) * (R + 62)), y: Math.round(cy + Math.sin(v2.ang) * (R + 62)), noValenceDots: true });
        bonds.push({ from: 'LC_2', to: 'LC_O2', order: 2 });
        return { atoms, bonds };
    }

    if (s === 'PIRROLIDINA-2-COOH') {
        // Prolina: pentágono geométrico con NH en pos 1 y COOH en pos 2
        const cx = 460, cy = 195, R = 74;
        const verts = [];
        for (let k = 0; k < 5; k++) {
            const pos = k + 1;
            const ang = -Math.PI / 2 + ((2 * Math.PI) / 5) * k;
            const vx = Math.round(cx + Math.cos(ang) * (R * 0.92));
            const vy = Math.round(cy + Math.sin(ang) * R);
            verts.push({ vx, vy, ang });
            atoms.push({ id: `PR_${pos}`, el: pos === 1 ? 'NH' : '', isVertex: pos !== 1, x: vx, y: vy, noValenceDots: true });
        }
        for (let k = 0; k < 5; k++) {
            bonds.push({ from: `PR_${k + 1}`, to: `PR_${((k + 1) % 5) + 1}`, order: 1 });
        }
        const v2 = verts[1];
        atoms.push({ id: 'PR_COOH', el: 'COOH', x: Math.round(cx + Math.cos(v2.ang) * (R + 68)), y: Math.round(cy + Math.sin(v2.ang) * (R + 68)), noValenceDots: true });
        bonds.push({ from: 'PR_2', to: 'PR_COOH', order: 1 });
        return { atoms, bonds };
    }

    if (s.startsWith('HAWORTH-PIRANOSA-')) {
        // Proyección de Haworth completa con C, H y OH explícitos (estilo referencia académica)
        const kind = s.replace('HAWORTH-PIRANOSA-', '');
        const isBeta = kind.startsWith('BETA-');
        const baseSugar = kind.replace(/^(?:ALFA|BETA)-/, '');
        const isPentose = (baseSugar === 'XILOSA' || baseSugar === 'ARABINOSA' || baseSugar === 'RIBOSA-PIRANOSA');

        const pts = {
            O:  { x: 545, y: 92,  el: 'O' },
            C1: { x: 635, y: 190, el: 'C' },
            C2: { x: 545, y: 288, el: 'C' },
            C3: { x: 375, y: 288, el: 'C' },
            C4: { x: 285, y: 190, el: 'C' },
            C5: { x: 375, y: 92,  el: 'C' }
        };
        Object.entries(pts).forEach(([k, p]) => {
            atoms.push({ id: `HW_${k}`, el: p.el, x: p.x, y: p.y, noValenceDots: true });
        });
        bonds.push(
            { from: 'HW_O', to: 'HW_C1', order: 1 },
            { from: 'HW_C1', to: 'HW_C2', order: 1 },
            { from: 'HW_C2', to: 'HW_C3', order: 1 },
            { from: 'HW_C3', to: 'HW_C4', order: 1 },
            { from: 'HW_C4', to: 'HW_C5', order: 1 },
            { from: 'HW_C5', to: 'HW_O', order: 1 }
        );

        const addSubstituentsAtC = (cId, cx, cy, topEl, botEl) => {
            const topShift = (topEl.length > 2 && !topEl.startsWith('H')) ? Math.round((topEl.length - 1) * 9.5) : 0;
            const botShift = (botEl.length > 2 && !botEl.startsWith('H')) ? Math.round((botEl.length - 1) * 9.5) : 0;
            atoms.push(
                { id: `${cId}_T`, el: topEl, x: cx + topShift, y: cy - 62, noValenceDots: true, bondTargetX: topShift ? cx : undefined },
                { id: `${cId}_B`, el: botEl, x: cx + botShift, y: cy + 62, noValenceDots: true, bondTargetX: botShift ? cx : undefined }
            );
            bonds.push(
                { from: cId, to: `${cId}_T`, order: 1 },
                { from: cId, to: `${cId}_B`, order: 1 }
            );
        };

        // C5: CH2OH arriba y H abajo (excepto L-arabinosa / pentosas sin C6)
        if (isPentose) {
            addSubstituentsAtC('HW_C5', 375, 92, 'H', 'H');
        } else {
            addSubstituentsAtC('HW_C5', 375, 92, 'CH₂OH', 'H');
        }

        // C1: alpha (OH abajo, H arriba) vs beta (OH arriba, H abajo)
        addSubstituentsAtC('HW_C1', 635, 190, isBeta ? 'OH' : 'H', isBeta ? 'H' : 'OH');

        // C2: Manosa / Arabinosa tienen OH arriba; Glucosa / Galactosa / Xilosa tienen OH abajo
        const c2OhUp = (baseSugar === 'MANOSA' || baseSugar === 'ARABINOSA');
        addSubstituentsAtC('HW_C2', 545, 288, c2OhUp ? 'OH' : 'H', c2OhUp ? 'H' : 'OH');

        // C3: Glucosa / Galactosa / Manosa / Xilosa / Arabinosa tienen OH arriba; Ribosa tiene OH abajo
        const c3OhUp = (baseSugar !== 'RIBOSA-PIRANOSA');
        addSubstituentsAtC('HW_C3', 375, 288, c3OhUp ? 'OH' : 'H', c3OhUp ? 'H' : 'OH');

        // C4: Galactosa / Arabinosa tienen OH arriba; Glucosa / Manosa / Xilosa tienen OH abajo
        const c4OhUp = (baseSugar === 'GALACTOSA' || baseSugar === 'ARABINOSA');
        addSubstituentsAtC('HW_C4', 285, 190, c4OhUp ? 'OH' : 'H', c4OhUp ? 'H' : 'OH');

        return { atoms, bonds };
    }

    if (s.startsWith('FISCHER-')) {
        // Proyección de Fischer vertical (cadena abierta con C=O arriba, carbonos quirales H—C—OH / HO—C—H, y CH2OH abajo)
        // Formato: FISCHER-ALDOSA-R-L-R-R  o  FISCHER-CETOSA-L-R-R
        const isDeoxy = s.endsWith('-DEOXY');
        const cleanFischer = isDeoxy ? s.slice(0, -6) : s;
        const parts = cleanFischer.split('-');
        const type = parts[1]; // ALDOSA o CETOSA
        const dirs = parts.slice(2); // ['R','L','R','R']
        const stepY = 66;
        const totalRows = dirs.length + 2;
        const startY = Math.round(190 - ((totalRows - 1) * stepY) / 2);
        const cx = 460;

        if (type === 'ALDOSA') {
            // C1: O doble enlace arriba bien separado, C al centro, H a la derecha
            atoms.push(
                { id: 'FS_O1', el: 'O', x: cx, y: startY - 76, noValenceDots: true },
                { id: 'FS_C1', el: 'C', x: cx, y: startY, noValenceDots: true },
                { id: 'FS_H1', el: 'H', x: cx + 80, y: startY, noValenceDots: true }
            );
            bonds.push(
                { from: 'FS_C1', to: 'FS_O1', order: 2 },
                { from: 'FS_C1', to: 'FS_H1', order: 1 }
            );
        } else {
            // Cetosa: C1 es CH2OH arriba, C2 es C=O
            atoms.push(
                { id: 'FS_C1', el: 'CH₂OH', x: cx + 34, y: startY - 68, noValenceDots: true, bondTargetX: cx },
                { id: 'FS_C2', el: 'C', x: cx, y: startY, noValenceDots: true },
                { id: 'FS_O2', el: 'O', x: cx + 84, y: startY, noValenceDots: true }
            );
            bonds.push(
                { from: 'FS_C1', to: 'FS_C2', order: 1 },
                { from: 'FS_C2', to: 'FS_O2', order: 2 }
            );
        }

        let prevCId = type === 'ALDOSA' ? 'FS_C1' : 'FS_C2';
        dirs.forEach((d, idx) => {
            const cy = startY + (idx + 1) * stepY;
            const cid = `FS_K${idx}`;
            const isRight = (d.toUpperCase() === 'R');
            atoms.push(
                { id: cid, el: 'C', x: cx, y: cy, noValenceDots: true },
                { id: `${cid}_L`, el: isRight ? 'H' : 'HO', x: cx - 80, y: cy, noValenceDots: true },
                { id: `${cid}_R`, el: isRight ? 'OH' : 'H', x: cx + 80, y: cy, noValenceDots: true }
            );
            bonds.push(
                { from: prevCId, to: cid, order: 1 },
                { from: cid, to: `${cid}_L`, order: 1 },
                { from: cid, to: `${cid}_R`, order: 1 }
            );
            prevCId = cid;
        });

        const botY = startY + (dirs.length + 1) * stepY;
        const botEl = isDeoxy ? 'CH₃' : 'CH₂OH';
        const botShift = isDeoxy ? 19 : 34;
        atoms.push({ id: 'FS_BOT', el: botEl, x: cx + botShift, y: botY, noValenceDots: true, bondTargetX: cx });
        bonds.push({ from: prevCId, to: 'FS_BOT', order: 1 });

        return { atoms, bonds };
    }

    if (s === 'HAWORTH-FURANOSA-FRUCTOSA') {
        // Proyección de Haworth de β-D-Fructofuranosa (pentágono amplio con sustituyentes exteriores sin tocar los lados del anillo)
        atoms.push(
            { id: 'FR_O',   el: 'O',     x: 460, y: 78,  noValenceDots: true },
            { id: 'FR_C2',  el: 'C',     x: 645, y: 185, noValenceDots: true },
            { id: 'FR_C3',  el: 'C',     x: 565, y: 305, noValenceDots: true },
            { id: 'FR_C4',  el: 'C',     x: 355, y: 305, noValenceDots: true },
            { id: 'FR_C5',  el: 'C',     x: 275, y: 185, noValenceDots: true },
            { id: 'FR_OH2', el: 'OH',    x: 645, y: 108, noValenceDots: true },
            { id: 'FR_C1',  el: 'CH₂OH', x: 679, y: 262, noValenceDots: true, bondTargetX: 645 },
            { id: 'FR_OH3', el: 'OH',    x: 565, y: 228, noValenceDots: true },
            { id: 'FR_H3',  el: 'H',     x: 565, y: 375, noValenceDots: true },
            { id: 'FR_H4',  el: 'H',     x: 355, y: 228, noValenceDots: true },
            { id: 'FR_OH4', el: 'OH',    x: 355, y: 375, noValenceDots: true },
            { id: 'FR_C6',  el: 'HOH₂C', x: 241, y: 108, noValenceDots: true, bondTargetX: 275 },
            { id: 'FR_H5',  el: 'H',     x: 275, y: 262, noValenceDots: true }
        );
        bonds.push(
            { from: 'FR_O',  to: 'FR_C2',  order: 1 },
            { from: 'FR_C2', to: 'FR_C3',  order: 1 },
            { from: 'FR_C3', to: 'FR_C4',  order: 1 },
            { from: 'FR_C4', to: 'FR_C5',  order: 1 },
            { from: 'FR_C5', to: 'FR_O',   order: 1 },
            { from: 'FR_C2', to: 'FR_OH2', order: 1 },
            { from: 'FR_C2', to: 'FR_C1',  order: 1 },
            { from: 'FR_C3', to: 'FR_OH3', order: 1 },
            { from: 'FR_C3', to: 'FR_H3',  order: 1 },
            { from: 'FR_C4', to: 'FR_H4',  order: 1 },
            { from: 'FR_C4', to: 'FR_OH4', order: 1 },
            { from: 'FR_C5', to: 'FR_C6',  order: 1 },
            { from: 'FR_C5', to: 'FR_H5',  order: 1 }
        );
        return { atoms, bonds };
    }

    if (s.startsWith('DISACARIDO-')) {
        const kind = s.replace('DISACARIDO-', '');
        if (kind === 'SACAROSA') {
            // α-D-Glucopiranosa — O(α1↔2β) — β-D-Fructofuranosa
            atoms.push(
                { id: 'G_O', el: 'O', x: 300, y: 135, noValenceDots: true },
                { id: 'G_C1', el: 'C1', x: 355, y: 190, noValenceDots: true },
                { id: 'G_C2', el: 'C2', x: 300, y: 245, noValenceDots: true },
                { id: 'G_C3', el: 'C3', x: 215, y: 245, noValenceDots: true },
                { id: 'G_C4', el: 'C4', x: 165, y: 190, noValenceDots: true },
                { id: 'G_C5', el: 'C5', x: 215, y: 135, noValenceDots: true },
                { id: 'G_C6', el: 'CH₂OH', x: 215, y: 70, noValenceDots: true },
                { id: 'O_GLIC', el: 'O', x: 460, y: 190, noValenceDots: true },
                { id: 'F_C2', el: 'C2', x: 565, y: 190, noValenceDots: true },
                { id: 'F_O', el: 'O', x: 635, y: 135, noValenceDots: true },
                { id: 'F_C5', el: 'C5', x: 705, y: 190, noValenceDots: true },
                { id: 'F_C4', el: 'C4', x: 675, y: 255, noValenceDots: true },
                { id: 'F_C3', el: 'C3', x: 595, y: 255, noValenceDots: true },
                { id: 'F_C1', el: 'CH₂OH', x: 565, y: 115, noValenceDots: true },
                { id: 'F_C6', el: 'CH₂OH', x: 705, y: 115, noValenceDots: true }
            );
            bonds.push(
                { from: 'G_O', to: 'G_C1', order: 1 }, { from: 'G_C1', to: 'G_C2', order: 1 },
                { from: 'G_C2', to: 'G_C3', order: 1 }, { from: 'G_C3', to: 'G_C4', order: 1 },
                { from: 'G_C4', to: 'G_C5', order: 1 }, { from: 'G_C5', to: 'G_O', order: 1 },
                { from: 'G_C5', to: 'G_C6', order: 1 },
                { from: 'G_C1', to: 'O_GLIC', order: 1 }, { from: 'O_GLIC', to: 'F_C2', order: 1 },
                { from: 'F_C2', to: 'F_O', order: 1 }, { from: 'F_O', to: 'F_C5', order: 1 },
                { from: 'F_C5', to: 'F_C4', order: 1 }, { from: 'F_C4', to: 'F_C3', order: 1 },
                { from: 'F_C3', to: 'F_C2', order: 1 }, { from: 'F_C2', to: 'F_C1', order: 1 },
                { from: 'F_C5', to: 'F_C6', order: 1 }
            );
            return { atoms, bonds };
        } else {
            // Maltosa (α1→4), Lactosa (β1→4), Celobiosa (β1→4)
            atoms.push(
                { id: 'L_O', el: 'O', x: 295, y: 135, noValenceDots: true },
                { id: 'L_C1', el: 'C1', x: 350, y: 190, noValenceDots: true },
                { id: 'L_C2', el: 'C2', x: 295, y: 245, noValenceDots: true },
                { id: 'L_C3', el: 'C3', x: 210, y: 245, noValenceDots: true },
                { id: 'L_C4', el: 'C4', x: 160, y: 190, noValenceDots: true },
                { id: 'L_C5', el: 'C5', x: 210, y: 135, noValenceDots: true },
                { id: 'L_C6', el: 'CH₂OH', x: 210, y: 70, noValenceDots: true },
                { id: 'O_GLIC', el: 'O', x: 455, y: 190, noValenceDots: true },
                { id: 'R_C4', el: 'C4', x: 560, y: 190, noValenceDots: true },
                { id: 'R_C5', el: 'C5', x: 615, y: 135, noValenceDots: true },
                { id: 'R_O', el: 'O', x: 700, y: 135, noValenceDots: true },
                { id: 'R_C1', el: 'C1', x: 750, y: 190, noValenceDots: true },
                { id: 'R_C2', el: 'C2', x: 700, y: 245, noValenceDots: true },
                { id: 'R_C3', el: 'C3', x: 615, y: 245, noValenceDots: true },
                { id: 'R_C6', el: 'CH₂OH', x: 615, y: 70, noValenceDots: true },
                { id: 'R_OH1', el: 'OH', x: 830, y: 190, noValenceDots: true }
            );
            if (kind === 'LACTOSA') {
                atoms.push({ id: 'L_OH4', el: 'OH', x: 160, y: 120, noValenceDots: true });
                bonds.push({ from: 'L_C4', to: 'L_OH4', order: 1 });
            }
            bonds.push(
                { from: 'L_O', to: 'L_C1', order: 1 }, { from: 'L_C1', to: 'L_C2', order: 1 },
                { from: 'L_C2', to: 'L_C3', order: 1 }, { from: 'L_C3', to: 'L_C4', order: 1 },
                { from: 'L_C4', to: 'L_C5', order: 1 }, { from: 'L_C5', to: 'L_O', order: 1 },
                { from: 'L_C5', to: 'L_C6', order: 1 },
                { from: 'L_C1', to: 'O_GLIC', order: 1 }, { from: 'O_GLIC', to: 'R_C4', order: 1 },
                { from: 'R_C4', to: 'R_C5', order: 1 }, { from: 'R_C5', to: 'R_O', order: 1 },
                { from: 'R_O', to: 'R_C1', order: 1 }, { from: 'R_C1', to: 'R_C2', order: 1 },
                { from: 'R_C2', to: 'R_C3', order: 1 }, { from: 'R_C3', to: 'R_C4', order: 1 },
                { from: 'R_C5', to: 'R_C6', order: 1 }, { from: 'R_C1', to: 'R_OH1', order: 1 }
            );
            return { atoms, bonds };
        }
    }

    if (s.startsWith('POLISACARIDO-')) {
        const kind = s.replace('POLISACARIDO-', '');
        const poliMap = {
            'ALMIDON':     { u1: 'α-D-Glucosa',       b: 'α(1→4)', u2: 'α-D-Glucosa',       branch: 'Ramificación α(1→6) (Amilopectina)' },
            'GLUCOGENO':   { u1: 'α-D-Glucosa',       b: 'α(1→4)', u2: 'α-D-Glucosa',       branch: 'Ramificación α(1→6) cada 8–12 residuos' },
            'CELULOSA':    { u1: 'β-D-Glucosa',       b: 'β(1→4)', u2: 'β-D-Glucosa',       branch: '' },
            'QUITINA':     { u1: 'N-Acetil-D-glucosamina', b: 'β(1→4)', u2: 'N-Acetil-D-glucosamina', branch: '' },
            'INULINA':     { u1: 'β-D-Fructofuranosa', b: 'β(2→1)', u2: 'β-D-Fructofuranosa', branch: '' },
            'PECTINA':     { u1: 'Ác. D-Galacturónico', b: 'α(1→4)', u2: 'Ác. D-Galacturónico', branch: '' },
            'HIALURONICO': { u1: 'Ác. D-Glucurónico', b: 'β(1→3)', u2: 'GlcNAc',            branch: '' },
            'HEPARINA':    { u1: 'Ác. Idurónico-2S',  b: 'α(1→4)', u2: 'Glucosamina-N,6-diS', branch: '' }
        };
        const cfgP = poliMap[kind] || poliMap['ALMIDON'];
        const nodesPoli = [
            { id: 'P_L', el: '[ — O' },
            { id: 'P_U1', el: cfgP.u1 },
            { id: 'P_B', el: cfgP.b },
            { id: 'P_U2', el: cfgP.u2 },
            { id: 'P_R', el: 'O — ]ₙ' }
        ];
        // Ancho real en coordenadas de escenario (compensando COMPACT_K = 0.44 en tarjetas)
        const halfWidths = nodesPoli.map(nd => Math.max(36, nd.el.length * 16.5 + 18));
        const xs = [0];
        for (let i = 1; i < nodesPoli.length; i++) {
            xs.push(xs[i - 1] + halfWidths[i - 1] + halfWidths[i] + 46);
        }
        const shiftP = Math.round(460 - xs[xs.length - 1] / 2);
        nodesPoli.forEach((nd, i) => {
            atoms.push({ id: nd.id, el: nd.el, x: xs[i] + shiftP, y: 195, noValenceDots: true });
            if (i > 0) {
                bonds.push({ from: nodesPoli[i - 1].id, to: nd.id, order: 1 });
            }
        });
        if (cfgP.branch) {
            const u2X = xs[3] + shiftP;
            atoms.push({ id: 'P_BR', el: cfgP.branch, x: u2X, y: 80, noValenceDots: true });
            bonds.push({ from: 'P_U2', to: 'P_BR', order: 1 });
        }
        return { atoms, bonds };
    }

    if (s.startsWith('LIPIDO-')) {
        const kind = s.replace('LIPIDO-', '');
        if (kind.startsWith('TAG-')) {
            const chains = {
                'TAG-ESTEARICO': ['O—CO—(CH₂)₁₆—CH₃', 'O—CO—(CH₂)₁₆—CH₃', 'O—CO—(CH₂)₁₆—CH₃'],
                'TAG-PALMITICO': ['O—CO—(CH₂)₁₄—CH₃', 'O—CO—(CH₂)₁₄—CH₃', 'O—CO—(CH₂)₁₄—CH₃'],
                'TAG-OLEICO': ['O—CO—(CH₂)₇CH=CH(CH₂)₇CH₃', 'O—CO—(CH₂)₇CH=CH(CH₂)₇CH₃', 'O—CO—(CH₂)₇CH=CH(CH₂)₇CH₃'],
                'TAG-MIXTO-INSAT': ['O—CO—C₁₇H₃₃ (Oleoil)', 'O—CO—C₁₉H₃₁ (Araquidonoil)', 'O—CO—C₁₇H₃₁ (Linoleoil)'],
                'TAG-MIXTO-SAT': ['O—CO—(CH₂)₁₄CH₃ (Palmitoil)', 'O—CO—(CH₂)₁₆CH₃ (Estearoil)', 'O—CO—(CH₂)₁₄CH₃ (Palmitoil)']
            }[kind];
            atoms.push(
                { id: 'G1', el: 'CH₂', x: 155, y: 80, noValenceDots: true },
                { id: 'G2', el: 'CH', x: 155, y: 190, noValenceDots: true },
                { id: 'G3', el: 'CH₂', x: 155, y: 300, noValenceDots: true },
                { id: 'A1', el: chains[0], x: 640, y: 80, noValenceDots: true },
                { id: 'A2', el: chains[1], x: 640, y: 190, noValenceDots: true },
                { id: 'A3', el: chains[2], x: 640, y: 300, noValenceDots: true }
            );
            bonds.push(
                { from: 'G1', to: 'G2', order: 1 }, { from: 'G2', to: 'G3', order: 1 },
                { from: 'G1', to: 'A1', order: 1 }, { from: 'G2', to: 'A2', order: 1 }, { from: 'G3', to: 'A3', order: 1 }
            );
            return { atoms, bonds };
        }
        if (kind.startsWith('FOSFOLIPIDO-') || kind === 'CARDIOLIPINA') {
            const headMap = {
                'FOSFOLIPIDO-H': 'O—PO₂⁻—H',
                'FOSFOLIPIDO-COLINA': 'O—PO₂⁻—O—CH₂CH₂N⁺(CH₃)₃',
                'FOSFOLIPIDO-ETANOLAMINA': 'O—PO₂⁻—O—CH₂CH₂NH₃⁺',
                'FOSFOLIPIDO-SERINA': 'O—PO₂⁻—O—CH₂CH(NH₃⁺)COO⁻',
                'CARDIOLIPINA': 'O—PO₂⁻—O—CH₂CH(OH)CH₂—O—PO₂⁻—Fosfatidilo'
            };
            atoms.push(
                { id: 'G1', el: 'CH₂', x: 145, y: 80, noValenceDots: true },
                { id: 'G2', el: 'CH', x: 145, y: 190, noValenceDots: true },
                { id: 'G3', el: 'CH₂', x: 145, y: 300, noValenceDots: true },
                { id: 'A1', el: 'O—CO—R₁ (Ác. Graso Sat.)', x: 650, y: 80, noValenceDots: true },
                { id: 'A2', el: 'O—CO—R₂ (Ác. Graso Insat.)', x: 650, y: 190, noValenceDots: true },
                { id: 'HD', el: headMap[kind], x: 650, y: 300, noValenceDots: true }
            );
            bonds.push(
                { from: 'G1', to: 'G2', order: 1 }, { from: 'G2', to: 'G3', order: 1 },
                { from: 'G1', to: 'A1', order: 1 }, { from: 'G2', to: 'A2', order: 1 }, { from: 'G3', to: 'HD', order: 1 }
            );
            return { atoms, bonds };
        }
        if (kind === 'CERAMIDA' || kind === 'ESFINGOMIELINA') {
            atoms.push(
                { id: 'E3', el: 'CH₃—(CH₂)₁₂—CH=CH—CH(OH)', x: 210, y: 80, noValenceDots: true },
                { id: 'E2', el: 'CH', x: 210, y: 190, noValenceDots: true },
                { id: 'E1', el: 'CH₂', x: 210, y: 300, noValenceDots: true },
                { id: 'AM', el: 'NH—CO—R (Ácido Graso)', x: 690, y: 190, noValenceDots: true },
                { id: 'C1G', el: kind === 'ESFINGOMIELINA' ? 'O—PO₂⁻—O—CH₂CH₂N⁺(CH₃)₃' : 'OH', x: 690, y: 300, noValenceDots: true }
            );
            bonds.push(
                { from: 'E3', to: 'E2', order: 1 }, { from: 'E2', to: 'E1', order: 1 },
                { from: 'E2', to: 'AM', order: 1 }, { from: 'E1', to: 'C1G', order: 1 }
            );
            return { atoms, bonds };
        }
    }

    // 2b. Heterociclos (HETERO-3-O, HETERO-5-O, HETERO-6-N, etc.) dibujados como polígonos reales con el heteroátomo en el vértice superior
    const mHet = s.match(/^HETERO-(\d+)-([A-Za-z0-9]+)(.*)$/i);
    if (mHet) {
        const sides = Math.min(8, Math.max(3, parseInt(mHet[1], 10)));
        const heteroEl = mHet[2]
            .replace(/NH2/g, 'NH₂')
            .replace(/CH3/g, 'CH₃');
        const rest = (mHet[3] || '').replace(/^-+/, '');
        const cx = 460, cy = 190, R = sides <= 4 ? 72 : 82;
        const verts = [];

        const parsedSubs = [];
        const subCountsByPos = {};
        if (rest) {
            const parts = rest.split(/-(?=[0-9]+(?:,[0-9]+)*-)/);
            parts.forEach(part => {
                const dashIdx = part.indexOf('-');
                const posStr = dashIdx === -1 ? '2' : part.slice(0, dashIdx);
                const rawGrp = dashIdx === -1 ? part : part.slice(dashIdx + 1);
                posStr.split(',').map(Number).forEach(pos => {
                    subCountsByPos[pos] = (subCountsByPos[pos] || 0) + 1;
                    parsedSubs.push({ pos, rawGrp });
                });
            });
        }

        for (let k = 0; k < sides; k++) {
            const pos = k + 1; // pos 1 es el heteroátomo (arriba), pos 2..sides son los carbonos
            const ang = -Math.PI / 2 + ((2 * Math.PI) / sides) * k;
            const vx = Math.round(cx + Math.cos(ang) * (R * 0.90));
            const vy = Math.round(cy + Math.sin(ang) * R);
            verts.push({ vx, vy, ang });

            const heteroAtPos = parsedSubs.find(sb => sb.pos === pos && ['O', 'N', 'NH', 'S'].includes(sb.rawGrp.toUpperCase()));
            if (pos === 1) {
                atoms.push({ id: `H_V1`, el: heteroEl, x: vx, y: vy, noValenceDots: true });
            } else if (heteroAtPos) {
                atoms.push({ id: `H_V${pos}`, el: heteroAtPos.rawGrp, x: vx, y: vy, noValenceDots: true });
            } else {
                atoms.push({ id: `H_V${pos}`, el: '', isVertex: true, x: vx, y: vy, noValenceDots: true });
            }
        }

        for (let k = 0; k < sides; k++) {
            const next = (k + 1) % sides;
            bonds.push({ from: `H_V${k + 1}`, to: `H_V${next + 1}`, order: 1 });
        }

        const placedAtPos = {};
        parsedSubs.forEach((sub, idx) => {
            const { pos, rawGrp } = sub;
            if (['O', 'N', 'NH', 'S'].includes(rawGrp.toUpperCase())) return;
            const v = verts[(pos - 1) % sides];
            if (!v) return;
            const totalHere = subCountsByPos[pos] || 1;
            const idxHere = placedAtPos[pos] || 0;
            placedAtPos[pos] = idxHere + 1;

            const grp = rawGrp
                .replace(/CH3/g, 'CH₃')
                .replace(/CH2/g, 'CH₂')
                .replace(/C3H7/g, 'C₃H₇')
                .replace(/NH2/g, 'NH₂');

            const spread = totalHere > 1 ? (idxHere === 0 ? -0.42 : 0.42) : 0;
            const distOut = R + 82;
            const sx = Math.round(cx + Math.cos(v.ang + spread) * (distOut * 0.92));
            const sy = Math.round(cy + Math.sin(v.ang + spread) * distOut);
            const sid = `HS_${idx}`;
            atoms.push({ id: sid, el: grp, x: sx, y: sy, noValenceDots: true });
            bonds.push({ from: `H_V${pos}`, to: sid, order: 1 });
        });

        return { atoms, bonds };
    }

    // 3. Ciclos saturados e insaturados en forma geométrica esquelética limpia (polígono puro sin CH₂/CH en los vértices)
    const mCyc = s.match(/^(?:(CIS|TRANS)-)?(CICLO|CICLOENO|CICLODIENO|CICLOTRIENO|CICLOINO|CICLOENINO)-(\d+)(.*)$/);
    if (mCyc) {
        const stereoMode = mCyc[1] || '';
        const cycType = mCyc[2];
        const sides = Math.min(12, Math.max(3, parseInt(mCyc[3], 10)));
        const rest = (mCyc[4] || '').replace(/^-+/, '');
        const cx = 460, cy = 190, R = sides <= 4 ? 72 : (sides >= 9 ? 94 : 80);
        const verts = [];

        const parsedSubs = [];
        const subCountsByPos = {};
        if (rest) {
            const parts = rest.split(/-(?=[0-9]+(?:,[0-9]+)*-)/);
            parts.forEach(part => {
                const dashIdx = part.indexOf('-');
                const posStr = dashIdx === -1 ? '1' : part.slice(0, dashIdx);
                const rawGrp = dashIdx === -1 ? part : part.slice(dashIdx + 1);
                const bOrd = (rawGrp === 'O') ? 2 : 1;
                posStr.split(',').map(Number).forEach(pos => {
                    subCountsByPos[pos] = (subCountsByPos[pos] || 0) + 1;
                    parsedSubs.push({ pos, rawGrp, bOrd });
                });
            });
        }

        for (let k = 0; k < sides; k++) {
            const pos = k + 1;
            const ang = -Math.PI / 2 + ((2 * Math.PI) / sides) * k;
            const vx = Math.round(cx + Math.cos(ang) * (R * 0.94));
            const vy = Math.round(cy + Math.sin(ang) * R);
            verts.push({ vx, vy, ang });
            atoms.push({ id: `C${pos}`, el: '', isVertex: true, x: vx, y: vy, noValenceDots: true });
        }

        for (let k = 0; k < sides; k++) {
            const next = (k + 1) % sides;
            let ord = 1;
            if (cycType === 'CICLOENO' && k === 0) ord = 2;
            if (cycType === 'CICLODIENO' && (k === 0 || k === 2)) ord = 2;
            if (cycType === 'CICLOTRIENO' && (k === 0 || k === 2 || k === 4)) ord = 2;
            if (cycType === 'CICLOINO' && k === 0) ord = 3;
            if (cycType === 'CICLOENINO') {
                if (k === 0) ord = 2;
                if (k === 2) ord = 3;
            }
            bonds.push({
                from: `C${k + 1}`,
                to: `C${next + 1}`,
                order: ord,
                inwardCenter: ord === 2 ? { x: cx, y: cy } : null
            });
        }

        const placedAtPos = {};
        parsedSubs.forEach((sub, idx) => {
            const { pos, rawGrp, bOrd } = sub;
            const v = verts[(pos - 1) % sides];
            if (!v) return;

            const totalHere = subCountsByPos[pos] || 1;
            const idxHere = placedAtPos[pos] || 0;
            placedAtPos[pos] = idxHere + 1;

            let grp = rawGrp
                .replace(/CH3/g, 'CH₃')
                .replace(/CH2/g, 'CH₂')
                .replace(/C3H7/g, 'C₃H₇')
                .replace(/C4H9/g, 'C₄H₉')
                .replace(/NH2/g, 'NH₂');

            // Invertir escritura cuando apunta a la izquierda para que el carbono enlazado quede junto al vértice
            if (Math.cos(v.ang) < -0.25) {
                if (grp === 'CH₃') grp = 'H₃C';
                else if (grp === 'CH₂CH₃') grp = 'H₃CH₂C';
                else if (grp === 'OH') grp = 'HO';
                else if (grp === 'NH₂') grp = 'H₂N';
            }

            const spread = totalHere > 1 ? (idxHere === 0 ? -0.38 : 0.38) : 0;
            const extraCycReach = grp.length > 2 ? Math.min(32, (grp.length - 2) * 10) : 0;
            const distOut = (totalHere > 1 ? (R + 108) : (R + 92)) + extraCycReach;
            const sx = Math.round(cx + Math.cos(v.ang + spread) * (distOut * 0.94));
            const sy = Math.round(cy + Math.sin(v.ang + spread) * distOut);
            const sid = `CS_${idx}`;

            let st = null;
            if (stereoMode === 'CIS') st = 'wedge';
            if (stereoMode === 'TRANS') st = (idx % 2 === 0) ? 'wedge' : 'dash';

            const isVertCyc = Math.abs(Math.cos(v.ang)) < 0.35 && totalHere === 1;
            const shiftCyc = (isVertCyc && grp.length > 1 && !grp.startsWith('H')) ? Math.round((grp.length - 1) * 9.5) : 0;
            atoms.push({ id: sid, el: grp, x: sx + shiftCyc, y: sy, noValenceDots: true, bondTargetX: isVertCyc ? sx : undefined });
            bonds.push({ from: `C${pos}`, to: sid, order: bOrd, stereo: st });
        });

        return { atoms, bonds };
    }

    // 4. Compuestos quirales (R)- / (S)- con cuñas
    if (/^\([RS]\)-/i.test(s)) {
        const builtQuiral = expandBranchedSemidevelopedNodes({ formula: s, compoundName: '' }, 460, 185, '#38bdf8', 'NomQuiral');
        if (builtQuiral.atoms.length > 1) {
            return { atoms: builtQuiral.atoms, bonds: builtQuiral.bonds };
        }
    }

    // 5. Expansión completa de TODOS los grupos condensados (incluidos C(CH₃)₂, C(CH₃)₃, CH(CH₃)₂, C(CH₂CH₃)₂, etc.)
    const expandCondensedGroups = (rawStr) => {
        let out = rawStr.replace(/—/g, '-');
        // Separar paréntesis de sustituyentes pegados directamente al siguiente carbono de la cadena, ej: C(OH)CH₂ -> C(OH)-CH₂
        out = out.replace(/\)(?=(?:CH₃|CH₂|CH|C|OH|NH₂|COOH|CHO|CN|NO₂|Cl|Br|I|F)\b)/g, ')-');
        // Multiplicadores de grupos idénticos unidos a un carbono o extremo (con o sin guion intermedio):
        out = out.replace(/^\(CH₃\)₃C-?/, 'CH₃-C(CH₃)(CH₃)-');
        out = out.replace(/^\(CH₃\)₂CH-?/, 'CH₃-CH(CH₃)-');
        out = out.replace(/^\(CH₃\)₂C\(([^()]+)\)-?/, 'CH₃-C(CH₃)($1)-');
        out = out.replace(/-\(CH₃\)₃$/, '-C(CH₃)(CH₃)-CH₃');
        out = out.replace(/-\(CH₃\)₂$/, '-CH(CH₃)-CH₃');
        out = out.replace(/C\(CH₃\)₃/g, 'C(CH₃)(CH₃)(CH₃)');
        out = out.replace(/C\(CH₃\)₂/g, 'C(CH₃)(CH₃)');
        out = out.replace(/C\(CH₂CH₃\)₂/g, 'C(CH₂CH₃)(CH₂CH₃)');
        out = out.replace(/C\(CH₂CH₂CH₃\)₂/g, 'C(CH₂CH₂CH₃)(CH₂CH₂CH₃)');
        out = out.replace(/-\(CH₂\)([0-9₀-₉]+)-/g, (_, nStr) => {
            const asciiN = nStr.replace(/[₀-₉]/g, d => '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(d)]);
            const n = Math.min(16, Math.max(1, parseInt(asciiN, 10)));
            return '-' + Array(n).fill('CH₂').join('-') + '-';
        });
        out = out.replace(/^OHC-/, 'CHO-');
        out = out.replace(/-COOH$/, '-C(=O)(OH)');
        out = out.replace(/^HOOC-/, 'C(HO)(=O)-');
        out = out.replace(/-CHO$/, '-C(=O)(H)');
        out = out.replace(/^CHO-/, 'C(H)(=O)-');
        out = out.replace(/-COCl$/, '-C(=O)(Cl)');
        out = out.replace(/-CONH₂$/, '-C(=O)(NH₂)');
        out = out.replace(/-CO-/, '-C(=O)-');
        return out;
    };

    const expandedStr = expandCondensedGroups(s);

    const splitTopLevelBonds = (str) => {
        const out = [];
        let buf = '';
        let depth = 0;
        for (let i = 0; i < str.length; i++) {
            const ch = str[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth = Math.max(0, depth - 1);

            if (depth === 0 && (ch === '—' || ch === '-' || ch === '=' || ch === '≡')) {
                if (buf.trim()) out.push(buf.trim());
                out.push(ch === '-' ? '—' : ch);
                buf = '';
            } else {
                buf += ch;
            }
        }
        if (buf.trim()) out.push(buf.trim());
        return out;
    };

    const tokens = splitTopLevelBonds(expandedStr);
    if (tokens.length >= 2) {
        const chainNodes = [];
        const chainBonds = [];
        let pendingOrder = 1;
        tokens.forEach(tok => {
            if (tok === '—') pendingOrder = 1;
            else if (tok === '=') pendingOrder = 2;
            else if (tok === '≡') pendingOrder = 3;
            else {
                chainNodes.push({ text: tok, orderFromPrev: pendingOrder });
                pendingOrder = 1;
            }
        });

        const parseNodeWithNestedBranches = (rawTok) => {
            const mBase = rawTok.match(/^(C|CH|N)\(/);
            if (!mBase || !rawTok.endsWith(')')) return null;
            const baseEl = mBase[1];
            const branches = [];
            let i = baseEl.length;
            while (i < rawTok.length) {
                if (rawTok[i] !== '(') return null;
                let depth = 0;
                let start = i + 1;
                let foundEnd = -1;
                for (let j = i; j < rawTok.length; j++) {
                    if (rawTok[j] === '(') depth++;
                    else if (rawTok[j] === ')') {
                        depth--;
                        if (depth === 0) {
                            foundEnd = j;
                            break;
                        }
                    }
                }
                if (foundEnd === -1) return null;
                branches.push(rawTok.slice(start, foundEnd));
                i = foundEnd + 1;
            }
            return branches.length > 0 ? { baseEl, branches } : null;
        };

        const parseBranchSpec = (rawGrp) => {
            if (rawGrp.startsWith('=')) return { el: rawGrp.slice(1), order: 2 };
            return { el: rawGrp, order: 1 };
        };

        const attachSubstituentNode = (parentId, px, py, rawEl, goUp, uniqueTag) => {
            const cleanEl = rawEl.replace(/[₀-₉]/g, d => '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(d)]);
            const ringSpecs = {
                'C3H5': { sides: 3, aromatic: false, doubleSide: -1 },
                'C4H7': { sides: 4, aromatic: false, doubleSide: -1 },
                'C5H9': { sides: 5, aromatic: false, doubleSide: -1 },
                'C5H7': { sides: 5, aromatic: false, doubleSide: 0 },
                'C6H11': { sides: 6, aromatic: false, doubleSide: -1 },
                'C6H5': { sides: 6, aromatic: true, doubleSide: -1 }
            };

            if (cleanEl === 'CH(CH3)2' || cleanEl === '(CH3)2CH') {
                const bid = `BR_${uniqueTag}`;
                const vStep = 96;
                const by1 = goUp ? (py - vStep) : (py + vStep);
                const by2 = goUp ? (by1 - vStep) : (by1 + vStep);
                const sideOffset = uniqueTag.includes('_L') ? -108 : 108;
                atoms.push(
                    { id: bid, el: 'CH', x: px, y: by1 },
                    { id: `${bid}_V`, el: 'CH₃', x: px, y: by2 },
                    { id: `${bid}_S`, el: 'CH₃', x: px + sideOffset, y: by1 }
                );
                bonds.push(
                    { from: parentId, to: bid, order: 1 },
                    { from: bid, to: `${bid}_V`, order: 1 },
                    { from: bid, to: `${bid}_S`, order: 1 }
                );
                return;
            }

            const spec = ringSpecs[cleanEl];
            if (!spec) {
                const bid = `BR_${uniqueTag}`;
                const bOrder = rawEl.startsWith('=') ? 2 : 1;
                const bLabel = rawEl.startsWith('=') ? rawEl.slice(1) : rawEl;
                const shiftFirstC = (bLabel.length > 1 && !bLabel.startsWith('H')) ? Math.round((bLabel.length - 1) * 9.5) : 0;
                atoms.push({
                    id: bid,
                    el: bLabel,
                    x: px + shiftFirstC,
                    y: goUp ? py - 96 : py + 96,
                    bondTargetX: shiftFirstC > 0 ? px : undefined
                });
                bonds.push({ from: parentId, to: bid, order: bOrder });
                return;
            }

            const sides = spec.sides;
            const R = sides <= 4 ? 38 : 42;
            const distCenter = R + 78;
            const rcx = px;
            const rcy = goUp ? (py - distCenter) : (py + distCenter);
            const startAng = goUp ? (Math.PI / 2) : (-Math.PI / 2);

            for (let k = 0; k < sides; k++) {
                const ang = startAng + ((2 * Math.PI) / sides) * k;
                const vx = Math.round(rcx + Math.cos(ang) * (R * 0.90));
                const vy = Math.round(rcy + Math.sin(ang) * R);
                atoms.push({ id: `SR_${uniqueTag}_${k}`, el: '', isVertex: true, x: vx, y: vy, noValenceDots: true });
            }

            for (let k = 0; k < sides; k++) {
                const next = (k + 1) % sides;
                let ord = 1;
                if (spec.aromatic) ord = (k % 2 === 0) ? 2 : 1;
                else if (spec.doubleSide === k) ord = 2;
                bonds.push({
                    from: `SR_${uniqueTag}_${k}`,
                    to: `SR_${uniqueTag}_${next}`,
                    order: ord,
                    inwardCenter: (spec.aromatic || ord === 2) ? { x: rcx, y: rcy } : null
                });
            }

            bonds.push({ from: parentId, to: `SR_${uniqueTag}_0`, order: 1 });
        };

        // Precalcular orientación vertical (arriba/abajo) de cada rama para evitar colisiones entre sustituyentes vecinos
        const parsedNodes = chainNodes.map((nd, idx) => {
            const txt = nd.text;
            const nested = parseNodeWithNestedBranches(txt);
            const normTxt = normalizeFormulaLookupKey(txt);
            let leftW = 24;
            let rightW = 24;
            let topBranch = null;
            let botBranch = null;
            if (nested) {
                const hasIsoSub = nested.branches.some(b => {
                    const cb = normalizeFormulaLookupKey(b);
                    return cb === 'CH(CH3)2' || cb === '(CH3)2CH';
                });
                const baseHalf = Math.max(22, nested.baseEl.length * 10.5);
                leftW = baseHalf;
                rightW = hasIsoSub ? 76 : baseHalf;
                if (nested.branches.length >= 2) {
                    topBranch = nested.branches[0];
                    botBranch = nested.branches[1];
                }
            } else if ((normTxt === 'CH(CH3)2' || normTxt === '(CH3)2CH') && (idx === 0 || idx === chainNodes.length - 1)) {
                leftW = idx === 0 ? 128 : 24;
                rightW = idx === 0 ? 24 : 128;
            } else if (normTxt === 'C6H5' && (idx === 0 || idx === chainNodes.length - 1)) {
                leftW = 62;
                rightW = 62;
            } else {
                const w = Math.max(20, txt.length * 10.5);
                leftW = w;
                rightW = w;
            }
            return { ...nd, nested, normTxt, leftW, rightW, topBranch, botBranch, singleUp: null };
        });

        // Asignar arriba/abajo inteligente a ramas simples y ampliar separación si dos sustituyentes contiguos comparten lado
        parsedNodes.forEach((pn, idx) => {
            if (pn.nested && pn.nested.branches.length === 1) {
                const bSingle = parseBranchSpec(pn.nested.branches[0]);
                const prev = idx > 0 ? parsedNodes[idx - 1] : null;
                let up = bSingle.order === 2 ? true : (idx % 2 === 1);
                if (bSingle.order !== 2 && prev) {
                    if (prev.botBranch && prev.botBranch.length > 3 && !prev.topBranch) up = true;
                    else if (prev.topBranch && prev.topBranch.length > 3 && !prev.botBranch) up = false;
                    else if (prev.botBranch && !prev.topBranch) up = true;
                    else if (prev.topBranch && !prev.botBranch) up = false;
                }
                pn.singleUp = up;
                if (up) pn.topBranch = pn.nested.branches[0];
                else pn.botBranch = pn.nested.branches[0];
            }
        });

        for (let idx = 0; idx < parsedNodes.length - 1; idx++) {
            const cur = parsedNodes[idx];
            const nxt = parsedNodes[idx + 1];
            if (cur.botBranch && nxt.botBranch && cur.botBranch.length > 3) {
                cur.rightW = Math.max(cur.rightW, (cur.botBranch.length - 1) * 14);
            }
            if (cur.topBranch && nxt.topBranch && cur.topBranch.length > 3) {
                cur.rightW = Math.max(cur.rightW, (cur.topBranch.length - 1) * 14);
            }
        }

        const nodeXList = [];
        parsedNodes.forEach((pn, idx) => {
            if (idx === 0) {
                nodeXList.push(0);
            } else {
                const prev = parsedNodes[idx - 1];
                const gap = prev.rightW + pn.leftW + 46;
                nodeXList.push(nodeXList[idx - 1] + gap);
            }
        });
        const midSpan = nodeXList[nodeXList.length - 1] / 2;
        const shiftX = Math.round(460 - midSpan);

        parsedNodes.forEach((pn, idx) => {
            const nx = nodeXList[idx] + shiftX;
            const nid = `CN_${idx}`;
            const txt = pn.text;

            if (pn.nested && pn.nested.branches.length >= 2) {
                const bTop = parseBranchSpec(pn.nested.branches[0]);
                const bBot = parseBranchSpec(pn.nested.branches[1]);
                const isLeftTerminal = (idx === 0) && (bTop.order === 2 || bBot.order === 2);
                const isRightTerminal = (idx === parsedNodes.length - 1) && (bTop.order === 2 || bBot.order === 2);
                const xOffset = isLeftTerminal ? -66 : (isRightTerminal ? 66 : 0);
                atoms.push({ id: nid, el: pn.nested.baseEl, x: nx, y: 185 });
                if (xOffset !== 0) {
                    atoms.push({ id: `BRT_${idx}`, el: bTop.el, x: nx + xOffset, y: 98 });
                    atoms.push({ id: `BRB_${idx}`, el: bBot.el, x: nx + xOffset, y: 272 });
                    bonds.push(
                        { from: nid, to: `BRT_${idx}`, order: bTop.order },
                        { from: nid, to: `BRB_${idx}`, order: bBot.order }
                    );
                } else {
                    attachSubstituentNode(nid, nx, 185, pn.nested.branches[0], true, `T_${idx}`);
                    attachSubstituentNode(nid, nx, 185, pn.nested.branches[1], false, `B_${idx}`);
                    // Si existe una tercera rama en un carbono cuaternario terminal (ej. C(CH₃)₃)
                    if (pn.nested.branches.length >= 3) {
                        const sideDir = idx === 0 ? -76 : 76;
                        atoms.push({ id: `BRS_${idx}`, el: pn.nested.branches[2], x: nx + sideDir, y: 185 });
                        bonds.push({ from: nid, to: `BRS_${idx}`, order: 1 });
                    }
                }
            } else if (pn.nested && pn.nested.branches.length === 1) {
                atoms.push({ id: nid, el: pn.nested.baseEl, x: nx, y: 185 });
                const up = pn.singleUp !== null ? pn.singleUp : (idx % 2 === 1);
                attachSubstituentNode(nid, nx, 185, pn.nested.branches[0], up, `S_${idx}`);
            } else if ((pn.normTxt === 'CH(CH3)2' || pn.normTxt === '(CH3)2CH') && (idx === 0 || idx === parsedNodes.length - 1)) {
                const isLeftEnd = (idx === 0);
                atoms.push({ id: nid, el: 'CH', x: nx, y: 185 });
                if (isLeftEnd) {
                    atoms.push(
                        { id: `${nid}_L`, el: 'CH₃', x: nx - 124, y: 185 },
                        { id: `${nid}_B`, el: 'CH₃', x: nx, y: 255 }
                    );
                    bonds.push(
                        { from: nid, to: `${nid}_L`, order: 1 },
                        { from: nid, to: `${nid}_B`, order: 1 }
                    );
                } else {
                    atoms.push(
                        { id: `${nid}_R`, el: 'CH₃', x: nx + 124, y: 185 },
                        { id: `${nid}_B`, el: 'CH₃', x: nx, y: 255 }
                    );
                    bonds.push(
                        { from: nid, to: `${nid}_R`, order: 1 },
                        { from: nid, to: `${nid}_B`, order: 1 }
                    );
                }
            } else if (pn.normTxt === 'C6H5' && (idx === 0 || idx === parsedNodes.length - 1)) {
                const isLeftEnd = (idx === 0);
                const rRad = 38;
                const rcx = isLeftEnd ? (nx - 16) : (nx + 16);
                const rcy = 185;
                const rotStart = isLeftEnd ? 0 : Math.PI;
                for (let k = 0; k < 6; k++) {
                    const ang = rotStart + (Math.PI / 3) * k;
                    const vx = Math.round(rcx + Math.cos(ang) * (rRad * 0.92));
                    const vy = Math.round(rcy + Math.sin(ang) * rRad);
                    atoms.push({ id: k === 0 ? nid : `${nid}_V${k}`, el: '', isVertex: true, x: vx, y: vy, noValenceDots: true });
                }
                for (let k = 0; k < 6; k++) {
                    const nxt = (k + 1) % 6;
                    const idA = k === 0 ? nid : `${nid}_V${k}`;
                    const idB = nxt === 0 ? nid : `${nid}_V${nxt}`;
                    bonds.push({
                        from: idA,
                        to: idB,
                        order: (k % 2 === 0) ? 2 : 1,
                        inwardCenter: { x: rcx, y: rcy }
                    });
                }
            } else {
                atoms.push({ id: nid, el: txt, x: nx, y: 185 });
            }

            if (idx > 0) {
                chainBonds.push({ from: `CN_${idx - 1}`, to: nid, order: pn.orderFromPrev });
            }
        });
        bonds.push(...chainBonds);
        return { atoms, bonds };
    }

    const built = expandBranchedSemidevelopedNodes({ formula: s, compoundName: '' }, 460, 185, '#38bdf8', 'NomCard');
    return { atoms: built.atoms, bonds: built.bonds };
}