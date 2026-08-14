//Zero-dependency test suite for tradeup-probability.js - this project has no test runner installed, so this is
//a plain Node script rather than a Jest/Vitest suite. Run it with: node js/utils/tradeup-probability.test.js
//(needs js/package.json's "type": "module" alongside it so Node resolves the .js imports as ESM.)
import assert from 'node:assert/strict';
import {
    computeCaseGroupOutcomes,
    computeGoldOutcomes,
    computeStandardOutcomeProbability,
    computeStandardOutcomes,
    validateInputs,
    parseRareItemName,
    dedupeRarePool,
    TradeUpValidationError,
    CHROMA_1_CASE_ID,
    CHROMA_2_CASE_ID,
    CHROMA_3_CASE_ID,
} from './tradeup-probability.js';

//Real data, not fabricated - pulled straight from crates.json (ByMykel/CSGO-API) on 2026-08-11 so the tests are
//checking the engine against the actual pools, not a made-up stand-in shape.
const CHROMA_CASE_ID = CHROMA_1_CASE_ID; // 'crate-4061'
const CHROMA_CONTAINS_RARE = [
    '★ Bayonet | Marble Fade', '★ Bayonet | Tiger Tooth', '★ Bayonet | Doppler', '★ Bayonet | Doppler',
    '★ Bayonet | Doppler', '★ Bayonet | Doppler', '★ Bayonet | Doppler', '★ Bayonet | Doppler',
    '★ Bayonet | Doppler', '★ Bayonet | Damascus Steel', '★ Bayonet | Ultraviolet', '★ Bayonet | Rust Coat',
    '★ Flip Knife | Marble Fade', '★ Flip Knife | Tiger Tooth', '★ Flip Knife | Doppler', '★ Flip Knife | Doppler',
    '★ Flip Knife | Doppler', '★ Flip Knife | Doppler', '★ Flip Knife | Doppler', '★ Flip Knife | Doppler',
    '★ Flip Knife | Doppler', '★ Flip Knife | Damascus Steel', '★ Flip Knife | Ultraviolet', '★ Flip Knife | Rust Coat',
    '★ Gut Knife | Marble Fade', '★ Gut Knife | Tiger Tooth', '★ Gut Knife | Doppler', '★ Gut Knife | Doppler',
    '★ Gut Knife | Doppler', '★ Gut Knife | Doppler', '★ Gut Knife | Doppler', '★ Gut Knife | Doppler',
    '★ Gut Knife | Doppler', '★ Gut Knife | Damascus Steel', '★ Gut Knife | Ultraviolet', '★ Gut Knife | Rust Coat',
    '★ Karambit | Marble Fade', '★ Karambit | Tiger Tooth', '★ Karambit | Doppler', '★ Karambit | Doppler',
    '★ Karambit | Doppler', '★ Karambit | Doppler', '★ Karambit | Doppler', '★ Karambit | Doppler',
    '★ Karambit | Doppler', '★ Karambit | Damascus Steel', '★ Karambit | Ultraviolet', '★ Karambit | Rust Coat',
    '★ M9 Bayonet | Marble Fade', '★ M9 Bayonet | Tiger Tooth', '★ M9 Bayonet | Doppler', '★ M9 Bayonet | Doppler',
    '★ M9 Bayonet | Doppler', '★ M9 Bayonet | Doppler', '★ M9 Bayonet | Doppler', '★ M9 Bayonet | Doppler',
    '★ M9 Bayonet | Doppler', '★ M9 Bayonet | Damascus Steel', '★ M9 Bayonet | Ultraviolet', '★ M9 Bayonet | Rust Coat',
];
//Just the M9 Bayonet slice of the pool above - used to isolate the finish/phase layers from the model layer
//(1 model in, 1/1 - so a returned probability here IS the raw finish x phase share, nothing else folded in).
const CHROMA_M9_ONLY = CHROMA_CONTAINS_RARE.filter(n => n.startsWith('★ M9 Bayonet'));

const SPECTRUM_CASE_ID = 'crate-4351';
const SPECTRUM_CONTAINS_RARE = [
    '★ Bowie Knife | Marble Fade', '★ Bowie Knife | Tiger Tooth', '★ Bowie Knife | Doppler', '★ Bowie Knife | Doppler',
    '★ Bowie Knife | Doppler', '★ Bowie Knife | Doppler', '★ Bowie Knife | Doppler', '★ Bowie Knife | Doppler',
    '★ Bowie Knife | Doppler', '★ Bowie Knife | Damascus Steel', '★ Bowie Knife | Ultraviolet', '★ Bowie Knife | Rust Coat',
    '★ Butterfly Knife | Marble Fade', '★ Butterfly Knife | Tiger Tooth', '★ Butterfly Knife | Doppler', '★ Butterfly Knife | Doppler',
    '★ Butterfly Knife | Doppler', '★ Butterfly Knife | Doppler', '★ Butterfly Knife | Doppler', '★ Butterfly Knife | Doppler',
    '★ Butterfly Knife | Doppler', '★ Butterfly Knife | Damascus Steel', '★ Butterfly Knife | Ultraviolet', '★ Butterfly Knife | Rust Coat',
    '★ Falchion Knife | Marble Fade', '★ Falchion Knife | Tiger Tooth', '★ Falchion Knife | Doppler', '★ Falchion Knife | Doppler',
    '★ Falchion Knife | Doppler', '★ Falchion Knife | Doppler', '★ Falchion Knife | Doppler', '★ Falchion Knife | Doppler',
    '★ Falchion Knife | Doppler', '★ Falchion Knife | Damascus Steel', '★ Falchion Knife | Ultraviolet', '★ Falchion Knife | Rust Coat',
    '★ Huntsman Knife | Marble Fade', '★ Huntsman Knife | Tiger Tooth', '★ Huntsman Knife | Doppler', '★ Huntsman Knife | Doppler',
    '★ Huntsman Knife | Doppler', '★ Huntsman Knife | Doppler', '★ Huntsman Knife | Doppler', '★ Huntsman Knife | Doppler',
    '★ Huntsman Knife | Doppler', '★ Huntsman Knife | Damascus Steel', '★ Huntsman Knife | Ultraviolet', '★ Huntsman Knife | Rust Coat',
    '★ Shadow Daggers | Marble Fade', '★ Shadow Daggers | Tiger Tooth', '★ Shadow Daggers | Doppler', '★ Shadow Daggers | Doppler',
    '★ Shadow Daggers | Doppler', '★ Shadow Daggers | Doppler', '★ Shadow Daggers | Doppler', '★ Shadow Daggers | Doppler',
    '★ Shadow Daggers | Doppler', '★ Shadow Daggers | Damascus Steel', '★ Shadow Daggers | Ultraviolet', '★ Shadow Daggers | Rust Coat',
];
const SPECTRUM_HUNTSMAN_ONLY = SPECTRUM_CONTAINS_RARE.filter(n => n.startsWith('★ Huntsman Knife'));

const GAMMA_CASE_ID = 'crate-4236';
//Full real pool (5 models x 10 raw entries: 5 duplicate Gamma Doppler phase-slots + 5 flat finishes = 6 distinct finishes/model)
const GAMMA_CONTAINS_RARE = [
    '★ Bayonet | Gamma Doppler', '★ Bayonet | Gamma Doppler', '★ Bayonet | Gamma Doppler', '★ Bayonet | Gamma Doppler', '★ Bayonet | Gamma Doppler',
    '★ Bayonet | Lore', '★ Bayonet | Autotronic', '★ Bayonet | Black Laminate', '★ Bayonet | Freehand', '★ Bayonet | Bright Water',
    '★ Flip Knife | Gamma Doppler', '★ Flip Knife | Gamma Doppler', '★ Flip Knife | Gamma Doppler', '★ Flip Knife | Gamma Doppler', '★ Flip Knife | Gamma Doppler',
    '★ Flip Knife | Lore', '★ Flip Knife | Autotronic', '★ Flip Knife | Black Laminate', '★ Flip Knife | Freehand', '★ Flip Knife | Bright Water',
    '★ Gut Knife | Gamma Doppler', '★ Gut Knife | Gamma Doppler', '★ Gut Knife | Gamma Doppler', '★ Gut Knife | Gamma Doppler', '★ Gut Knife | Gamma Doppler',
    '★ Gut Knife | Lore', '★ Gut Knife | Autotronic', '★ Gut Knife | Black Laminate', '★ Gut Knife | Bright Water', '★ Gut Knife | Freehand',
    '★ Karambit | Gamma Doppler', '★ Karambit | Gamma Doppler', '★ Karambit | Gamma Doppler', '★ Karambit | Gamma Doppler', '★ Karambit | Gamma Doppler',
    '★ Karambit | Lore', '★ Karambit | Autotronic', '★ Karambit | Black Laminate', '★ Karambit | Freehand', '★ Karambit | Bright Water',
    '★ M9 Bayonet | Gamma Doppler', '★ M9 Bayonet | Gamma Doppler', '★ M9 Bayonet | Gamma Doppler', '★ M9 Bayonet | Gamma Doppler', '★ M9 Bayonet | Gamma Doppler',
    '★ M9 Bayonet | Lore', '★ M9 Bayonet | Autotronic', '★ M9 Bayonet | Black Laminate', '★ M9 Bayonet | Bright Water', '★ M9 Bayonet | Freehand',
];

//--- tiny zero-dependency runner -------------------------------------------------------------------------
let pass = 0, fail = 0;
function test(name, fn) {
    try {
        fn();
        pass++;
        console.log(`  ok  - ${name}`);
    } catch (err) {
        fail++;
        console.log(`FAIL  - ${name}`);
        console.log(`        ${err.message}`);
    }
}
function closeTo(actual, expected, epsilon, message) {
    assert.ok(Math.abs(actual - expected) < epsilon, `${message ?? ''} expected ~${expected}, got ${actual}`);
}
function pct(fraction) { return (fraction * 100).toFixed(4); } //matches the "0.2143%" display precision used below

//--- the four exact tooltip values (Tests section) -------------------------------------------------------
//All four are single-case, all-5-inputs contracts (group share = 1), so what's left is purely
//1/model x finish/finishTotal x phase/phaseTotal.

test('Chroma 1 -> M9 Bayonet, Doppler, Ruby = 0.2143%', () => {
    const outcomes = computeCaseGroupOutcomes(CHROMA_CASE_ID, CHROMA_CONTAINS_RARE, 5, 5);
    const hit = outcomes.find(o => o.model === 'M9 Bayonet' && o.finish === 'Doppler' && o.phase === 'Ruby');
    assert.ok(hit, 'expected a M9 Bayonet | Doppler | Ruby outcome');
    closeTo(hit.probability, 3 / 1400, 1e-12); //spec's own reduced fraction for this exact case
    assert.equal(pct(hit.probability), '0.2143');
});

test('Spectrum -> Huntsman, Doppler, Phase 2 = 0.6667%', () => {
    const outcomes = computeCaseGroupOutcomes(SPECTRUM_CASE_ID, SPECTRUM_CONTAINS_RARE, 5, 5);
    const hit = outcomes.find(o => o.model === 'Huntsman Knife' && o.finish === 'Doppler' && o.phase === 'Phase 2');
    assert.ok(hit);
    closeTo(hit.probability, 1 / 150, 1e-12);
    assert.equal(pct(hit.probability), '0.6667');
});

test('Spectrum -> Falchion, Doppler, Sapphire = 0.3000%', () => {
    const outcomes = computeCaseGroupOutcomes(SPECTRUM_CASE_ID, SPECTRUM_CONTAINS_RARE, 5, 5);
    const hit = outcomes.find(o => o.model === 'Falchion Knife' && o.finish === 'Doppler' && o.phase === 'Sapphire');
    assert.ok(hit);
    closeTo(hit.probability, 3 / 1000, 1e-12);
    assert.equal(pct(hit.probability), '0.3000');
});

test('Spectrum -> Butterfly, Rust Coat = 3.3333%', () => {
    const outcomes = computeCaseGroupOutcomes(SPECTRUM_CASE_ID, SPECTRUM_CONTAINS_RARE, 5, 5);
    const hit = outcomes.find(o => o.model === 'Butterfly Knife' && o.finish === 'Rust Coat');
    assert.ok(hit);
    assert.equal(hit.phase, null, 'Rust Coat is not a phased finish');
    closeTo(hit.probability, 1 / 30, 1e-12);
    assert.equal(pct(hit.probability), '3.3333');
});

//--- intermediate values ------------------------------------------------------------------------------
//Isolated to a single model (modelCount = 1) so what comes out is the finish/phase layers alone, with no
//group- or model-layer scaling mixed in.

test('Chroma 1 Doppler finish share = 40.48%', () => {
    const outcomes = computeCaseGroupOutcomes(CHROMA_CASE_ID, CHROMA_M9_ONLY, 1, 1);
    const dopplerShare = outcomes.filter(o => o.finish === 'Doppler').reduce((s, o) => s + o.probability, 0);
    assert.equal(((dopplerShare) * 100).toFixed(2), '40.48');
});

test('every other Chroma 1 finish = 11.90%', () => {
    const outcomes = computeCaseGroupOutcomes(CHROMA_CASE_ID, CHROMA_M9_ONLY, 1, 1);
    for (const finish of ['Marble Fade', 'Tiger Tooth', 'Damascus Steel', 'Ultraviolet', 'Rust Coat']) {
        const hit = outcomes.find(o => o.finish === finish);
        assert.equal((hit.probability * 100).toFixed(2), '11.90', `finish: ${finish}`);
    }
});

test('Spectrum any finish = 16.67%', () => {
    const outcomes = computeCaseGroupOutcomes(SPECTRUM_CASE_ID, SPECTRUM_HUNTSMAN_ONLY, 1, 1);
    const flatFinish = outcomes.find(o => o.finish === 'Rust Coat');
    assert.equal((flatFinish.probability * 100).toFixed(2), '16.67');
    const dopplerShare = outcomes.filter(o => o.finish === 'Doppler').reduce((s, o) => s + o.probability, 0);
    assert.equal((dopplerShare * 100).toFixed(2), '16.67');
});

test('Chroma 1 Black Pearl, conditional on Doppler = 0.59%', () => {
    //"conditional on Doppler" = phase weight alone, not multiplied by the finish's own share - so this is
    //isolated by taking the ratio against the other Doppler-phase entries rather than reading probability directly.
    const outcomes = computeCaseGroupOutcomes(CHROMA_CASE_ID, CHROMA_M9_ONLY, 1, 1);
    const dopplerOutcomes = outcomes.filter(o => o.finish === 'Doppler');
    const total = dopplerOutcomes.reduce((s, o) => s + o.probability, 0);
    const blackPearl = dopplerOutcomes.find(o => o.phase === 'Black Pearl');
    assert.equal(((blackPearl.probability / total) * 100).toFixed(2), '0.59');
});

test('Spectrum Black Pearl, conditional on Doppler = 2.00%', () => {
    const outcomes = computeCaseGroupOutcomes(SPECTRUM_CASE_ID, SPECTRUM_HUNTSMAN_ONLY, 1, 1);
    const dopplerOutcomes = outcomes.filter(o => o.finish === 'Doppler');
    const total = dopplerOutcomes.reduce((s, o) => s + o.probability, 0);
    const blackPearl = dopplerOutcomes.find(o => o.phase === 'Black Pearl');
    assert.equal(((blackPearl.probability / total) * 100).toFixed(2), '2.00');
});

//--- Chroma 2 / Chroma 3: share Chroma 1's skewed finish weight AND its skewed phase table -------------------
//Chroma 2 (crate-4089) and Chroma 3 (crate-4233) have the identical 5-model/6-finish shape as Chroma 1,
//so the same fixture list is reused with a different caseId for each.

test('Chroma 2 and Chroma 3 Doppler finish share = 40.48% (same skew as Chroma 1)', () => {
    for (const caseId of [CHROMA_2_CASE_ID, CHROMA_3_CASE_ID]) {
        const outcomes = computeCaseGroupOutcomes(caseId, CHROMA_M9_ONLY, 1, 1);
        const dopplerShare = outcomes.filter(o => o.finish === 'Doppler').reduce((s, o) => s + o.probability, 0);
        assert.equal((dopplerShare * 100).toFixed(2), '40.48', `caseId: ${caseId}`);
    }
});

test('Chroma 2 and Chroma 3 every other finish = 11.90% (same skew as Chroma 1)', () => {
    for (const caseId of [CHROMA_2_CASE_ID, CHROMA_3_CASE_ID]) {
        const outcomes = computeCaseGroupOutcomes(caseId, CHROMA_M9_ONLY, 1, 1);
        for (const finish of ['Marble Fade', 'Tiger Tooth', 'Damascus Steel', 'Ultraviolet', 'Rust Coat']) {
            const hit = outcomes.find(o => o.finish === finish);
            assert.equal((hit.probability * 100).toFixed(2), '11.90', `caseId: ${caseId}, finish: ${finish}`);
        }
    }
});

test('Chroma 2 and Chroma 3 use the same skewed phase table as Chroma 1, not the standard one', () => {
    //all three Chroma cases now share PHASE_WEIGHTS.chroma (340 total, numbered phases weighted 80 each) -
    //if this test breaks, phaseTableFor's case check fell out of sync with finishWeightsFor's CHROMA_CASE_IDS.
    for (const caseId of [CHROMA_2_CASE_ID, CHROMA_3_CASE_ID]) {
        const outcomes = computeCaseGroupOutcomes(caseId, CHROMA_M9_ONLY, 1, 1);
        const dopplerOutcomes = outcomes.filter(o => o.finish === 'Doppler');
        const total = dopplerOutcomes.reduce((s, o) => s + o.probability, 0);

        //chroma table: Phase 2 weight 80/340, Black Pearl weight 2/340 - both conditional on Doppler already chosen
        const phase2 = dopplerOutcomes.find(o => o.phase === 'Phase 2');
        assert.equal(((phase2.probability / total) * 100).toFixed(2), (80 / 340 * 100).toFixed(2), `caseId: ${caseId}`);

        const blackPearl = dopplerOutcomes.find(o => o.phase === 'Black Pearl');
        assert.equal(((blackPearl.probability / total) * 100).toFixed(2), (2 / 340 * 100).toFixed(2), `caseId: ${caseId}`);
    }
});

test('a full single-case Chroma 2 (or 3) contract still sums to 1', () => {
    for (const caseId of [CHROMA_2_CASE_ID, CHROMA_3_CASE_ID]) {
        const outcomes = computeCaseGroupOutcomes(caseId, CHROMA_CONTAINS_RARE, 5, 5);
        const total = outcomes.reduce((s, o) => s + o.probability, 0);
        closeTo(total, 1, 1e-9, `caseId: ${caseId}`);
    }
});

//--- invariants ------------------------------------------------------------------------------------------

test('a full single-case contract sums to 1 (100% group share)', () => {
    const outcomes = computeCaseGroupOutcomes(CHROMA_CASE_ID, CHROMA_CONTAINS_RARE, 5, 5);
    const total = outcomes.reduce((s, o) => s + o.probability, 0);
    closeTo(total, 1, 1e-9);
});

test('Spectrum full single-case contract also sums to 1', () => {
    const outcomes = computeCaseGroupOutcomes(SPECTRUM_CASE_ID, SPECTRUM_CONTAINS_RARE, 5, 5);
    const total = outcomes.reduce((s, o) => s + o.probability, 0);
    closeTo(total, 1, 1e-9);
});

test('mixed-case contract (3x Chroma 1 + 2x Spectrum) sums to 1', () => {
    const groups = new Map([
        [CHROMA_CASE_ID, { count: 3, rawContainsRare: CHROMA_CONTAINS_RARE }],
        [SPECTRUM_CASE_ID, { count: 2, rawContainsRare: SPECTRUM_CONTAINS_RARE }],
    ]);
    const outcomes = computeGoldOutcomes(groups, 5);
    const total = outcomes.reduce((s, o) => s + o.probability, 0);
    closeTo(total, 1, 1e-9);

    //each group must independently normalise under its own finish scheme (Chroma 1's skew vs Spectrum's
    //uniform table) before being scaled down by its 3/5 or 2/5 share - a single-case test can't catch a bug
    //where one group's finish weights leak into the other, or where group share is applied twice/never.
    const chromaHit = outcomes.find(o => o.caseId === CHROMA_CASE_ID && o.model === 'M9 Bayonet' && o.finish === 'Doppler' && o.phase === 'Ruby');
    closeTo(chromaHit.probability, (3 * 17 * 9) / (5 * 5 * 42 * 340), 1e-12);

    const spectrumHit = outcomes.find(o => o.caseId === SPECTRUM_CASE_ID && o.model === 'Huntsman Knife' && o.finish === 'Doppler' && o.phase === 'Phase 2');
    closeTo(spectrumHit.probability, (2 * 1 * 20) / (5 * 5 * 6 * 100), 1e-12);
});

//--- standard (non-gold) trade-ups -----------------------------------------------------------------------

test('computeStandardOutcomeProbability is a PER-OUTCOME probability, not a group total', () => {
    //6 of 10 inputs from one collection, which can produce 3 distinct next-rarity skins - each of those 3
    //outcomes individually sits at 0.2; the group's true total share (0.6) only shows up once you sum all 3.
    closeTo(computeStandardOutcomeProbability(6, 10, 3), 0.2, 1e-12); // 6/(10*3) = 0.2
});

test('computeStandardOutcomeProbability throws on 0 reachable outputs rather than returning 0', () => {
    assert.throws(() => computeStandardOutcomeProbability(6, 10, 0), TradeUpValidationError);
});

test('computeStandardOutcomes emits one row per output skin, and each group sums to its true share', () => {
    //differing output counts per collection on purpose - 7/10 inputs from a collection with 4 outputs,
    //3/10 from one with only 2. Group shares must land on 0.7/0.3 regardless of the output count on
    //either side, not get diluted by it.
    const groups = new Map([['Collection A', 7], ['Collection B', 3]]);
    const outputNames = new Map([
        ['Collection A', ['A1', 'A2', 'A3', 'A4']],
        ['Collection B', ['B1', 'B2']],
    ]);
    const outcomes = computeStandardOutcomes(groups, outputNames, 10);

    const aOutcomes = outcomes.filter(o => o.collection === 'Collection A');
    const bOutcomes = outcomes.filter(o => o.collection === 'Collection B');
    assert.equal(aOutcomes.length, 4);
    assert.equal(bOutcomes.length, 2);
    assert.deepEqual(aOutcomes.map(o => o.outputName).sort(), ['A1', 'A2', 'A3', 'A4']);

    const aTotal = aOutcomes.reduce((s, o) => s + o.probability, 0);
    const bTotal = bOutcomes.reduce((s, o) => s + o.probability, 0);
    closeTo(aTotal, 0.7, 1e-12);
    closeTo(bTotal, 0.3, 1e-12);
    closeTo(aTotal + bTotal, 1, 1e-12); //full contract still sums to 1
});

test('computeStandardOutcomes throws naming the collection when a group has 0 reachable outputs', () => {
    const groups = new Map([['Empty Collection', 10]]);
    assert.throws(
        () => computeStandardOutcomes(groups, new Map([['Empty Collection', []]]), 10),
        err => err instanceof TradeUpValidationError && err.message.includes('Empty Collection')
    );
});

//--- validation --------------------------------------------------------------------------------------------

test('rejects the wrong input count', () => {
    assert.throws(() => validateInputs(Array(4).fill({ collection: 'x', caseIds: ['c'] }), { isGoldTier: true }), TradeUpValidationError);
    assert.throws(() => validateInputs(Array(9).fill({ collection: 'x' }), { isGoldTier: false }), TradeUpValidationError);
});

test('rejects mixed StatTrak / non-StatTrak inputs', () => {
    const inputs = [
        ...Array(4).fill({ collection: 'x', caseIds: ['c'], stattrak: true }),
        { collection: 'x', caseIds: ['c'], stattrak: false },
    ];
    assert.throws(() => validateInputs(inputs, { isGoldTier: true }), TradeUpValidationError);
});

test('rejects a collection with no associated case', () => {
    const inputs = Array(5).fill({ collection: 'The Dust 2 Collection', caseIds: [], stattrak: false });
    assert.throws(() => validateInputs(inputs, { isGoldTier: true }), TradeUpValidationError);
});

test('rejects a collection mapping to more than one case', () => {
    const inputs = Array(5).fill({ collection: 'Some Collection', caseIds: ['case-a', 'case-b'], stattrak: false });
    assert.throws(() => validateInputs(inputs, { isGoldTier: true }), TradeUpValidationError);
});

test('a valid 5-input gold contract and a valid 10-input standard contract both pass', () => {
    assert.doesNotThrow(() => validateInputs(Array(5).fill({ collection: 'x', caseIds: ['c'], stattrak: false }), { isGoldTier: true }));
    assert.doesNotThrow(() => validateInputs(Array(10).fill({ collection: 'x', stattrak: false }), { isGoldTier: false }));
});

//--- Gamma Doppler (now verified: Phase 1-4 @ 23, Emerald @ 8, total 100 - uniform 1/6 finish layer) --------

test('Gamma Case -> Gamma Doppler, Emerald = 0.2667%', () => {
    const outcomes = computeCaseGroupOutcomes(GAMMA_CASE_ID, GAMMA_CONTAINS_RARE, 5, 5);
    const hit = outcomes.find(o => o.finish === 'Gamma Doppler' && o.phase === 'Emerald');
    assert.ok(hit);
    closeTo(hit.probability, (1 / 5) * (1 / 6) * (8 / 100), 1e-12);
    assert.equal(pct(hit.probability), '0.2667');
});

test('Gamma Case -> Gamma Doppler, any numbered phase = 0.7667%', () => {
    const outcomes = computeCaseGroupOutcomes(GAMMA_CASE_ID, GAMMA_CONTAINS_RARE, 5, 5);
    for (const phase of ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4']) {
        const hit = outcomes.find(o => o.finish === 'Gamma Doppler' && o.phase === phase);
        assert.ok(hit, `missing ${phase}`);
        closeTo(hit.probability, (1 / 5) * (1 / 6) * (23 / 100), 1e-12);
        assert.equal(pct(hit.probability), '0.7667', `phase: ${phase}`);
    }
});

test('a full Gamma Case contract still sums to 1', () => {
    const outcomes = computeCaseGroupOutcomes(GAMMA_CASE_ID, GAMMA_CONTAINS_RARE, 5, 5);
    const total = outcomes.reduce((s, o) => s + o.probability, 0);
    closeTo(total, 1, 1e-9);
});

test('UNVERIFIED_PHASED_FINISHES still exists as a mechanism and still throws for a genuinely unknown finish', () => {
    //the guard must still work for whatever the next unverified phased finish turns out to be -
    //simulate one via a fixture case that mixes in a made-up phased finish.
    const madeUpPool = ['★ Fake Knife | Doppler', '★ Fake Knife | Made-Up Future Phased Finish'];
    //this doesn't throw on its own (Made-Up... isn't in KNOWN_PHASED_FINISHES, so it's just treated as flat) -
    //the real guard is UNVERIFIED_PHASED_FINISHES, which is asserted empty-but-present rather than deleted
    assert.doesNotThrow(() => computeCaseGroupOutcomes('case-fake', madeUpPool, 1, 1));
});

//--- item 6: StatTrak entries in contains_rare (verified absent - see below) ---------------------------------

test('real contains_rare pools never include a StatTrak-prefixed entry (Chroma 1, Spectrum, Gamma)', () => {
    //asserts this against the fixtures so a future API change that starts including StatTrak entries fails
    //loudly here, instead of silently inflating modelCount (parseRareItemName doesn't strip "StatTrak™",
    //so a StatTrak entry would parse to a distinct, wrong model name).
    for (const raw of [...CHROMA_CONTAINS_RARE, ...SPECTRUM_CONTAINS_RARE, ...GAMMA_CONTAINS_RARE]) {
        const { model } = parseRareItemName(raw);
        assert.ok(!model.includes('StatTrak'), `unexpected StatTrak entry: ${raw}`);
    }
});

//--- item 7: the dedupe assumption (phases are NOT distinguishable by name in contains_rare) -----------------

test('contains_rare really does repeat a phased finish once per phase slot with identical names', () => {
    //Chroma Case lists "★ Karambit | Doppler" seven times over (one per phase), all with the exact same
    //string - there is no way to tell which raw entry is Ruby vs Sapphire etc. by name alone.
    //dedupeRarePool's collapsing behaviour depends on this being true.
    const karambitDoppler = CHROMA_CONTAINS_RARE.filter(n => n === '★ Karambit | Doppler');
    assert.equal(karambitDoppler.length, 7, 'expected 7 identical raw slots, one per Doppler phase');
    assert.equal(new Set(karambitDoppler).size, 1, 'all 7 slots must be string-identical (no phase info in the name)');
});

//--- item 8: CHROMA_1_CASE_ID really is "Chroma Case", not Chroma 2/3 ------------------------------------------

test('CHROMA_1_CASE_ID resolves to "Chroma Case" specifically, not Chroma 2 or 3', () => {
    const realChromaCaseIds = [
        { id: 'crate-4061', name: 'Chroma Case' },
        { id: 'crate-4089', name: 'Chroma 2 Case' },
        { id: 'crate-4233', name: 'Chroma 3 Case' },
    ];
    const match = realChromaCaseIds.find(c => c.id === CHROMA_1_CASE_ID);
    assert.ok(match, `CHROMA_1_CASE_ID ("${CHROMA_1_CASE_ID}") doesn't match any known Chroma case id`);
    assert.equal(match.name, 'Chroma Case');
});

//--- small parsing helpers ------------------------------------------------------------------------------

test('parseRareItemName handles finishes and vanilla knives', () => {
    assert.deepEqual(parseRareItemName('★ M9 Bayonet | Doppler'), { model: 'M9 Bayonet', finish: 'Doppler' });
    assert.deepEqual(parseRareItemName('★ Bayonet'), { model: 'Bayonet', finish: null });
});

test('dedupeRarePool collapses phase-duplicated entries down to one per (model, finish)', () => {
    const byModel = dedupeRarePool(CHROMA_M9_ONLY);
    assert.equal(byModel.size, 1);
    assert.equal(byModel.get('M9 Bayonet').size, 6); // Marble Fade, Tiger Tooth, Doppler, Damascus Steel, Ultraviolet, Rust Coat
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
