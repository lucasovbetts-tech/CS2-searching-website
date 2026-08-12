
export class TradeUpValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TradeUpValidationError';
    }
}

export const STANDARD_INPUT_COUNT = 10;
export const GOLD_INPUT_COUNT = 5;

//all three Chroma cases share the same skewed Doppler finish weight AND the same skewed phase table (below)
export const CHROMA_1_CASE_ID = 'crate-4061';
export const CHROMA_2_CASE_ID = 'crate-4089';
export const CHROMA_3_CASE_ID = 'crate-4233';
const CHROMA_CASE_IDS = new Set([CHROMA_1_CASE_ID, CHROMA_2_CASE_ID, CHROMA_3_CASE_ID]);

const CHROMA_FINISH_WEIGHTS = { Doppler: 17 };
const CHROMA_DEFAULT_FINISH_WEIGHT = 5;


const PHASE_WEIGHTS = {
    chroma: { 'Phase 1': 80, 'Phase 2': 80, 'Phase 3': 80, 'Phase 4': 80, 'Ruby': 9, 'Sapphire': 9, 'Black Pearl': 2 },
    standard: { 'Phase 1': 20, 'Phase 2': 20, 'Phase 3': 20, 'Phase 4': 20, 'Ruby': 9, 'Sapphire': 9, 'Black Pearl': 2 },
    gamma: { 'Phase 1': 23, 'Phase 2': 23, 'Phase 3': 23, 'Phase 4': 23, 'Emerald': 8 },
};

//Frozen (outer object and each array) because this is exported someone
//mutating the arrays would corrupt the key set for every other importer.
export const PHASE_KEYS = Object.freeze({
    chroma: Object.freeze(Object.keys(PHASE_WEIGHTS.chroma)),
    standard: Object.freeze(Object.keys(PHASE_WEIGHTS.standard)),
    gamma: Object.freeze(Object.keys(PHASE_WEIGHTS.gamma)),
});

const KNOWN_PHASED_FINISHES = new Set(['Doppler', 'Gamma Doppler']);
const UNVERIFIED_PHASED_FINISHES = new Set();

export function isPhasedFinish(finish) {
    return KNOWN_PHASED_FINISHES.has(finish);
}

//adds the weights together to get the denominator
function sumWeights(table) {
    return Object.values(table).reduce((sum, w) => sum + w, 0);
}

function phaseTableFor(caseId, finish) {
    if (finish === 'Gamma Doppler') return PHASE_WEIGHTS.gamma;
    return CHROMA_CASE_IDS.has(caseId) ? PHASE_WEIGHTS.chroma : PHASE_WEIGHTS.standard;
}

//makes sure the finish has a weight and returns it
function requireWeight(table, key, context) {
    const weight = table[key];
    if (weight === undefined) {
        throw new TradeUpValidationError(`No weight defined for "${key}" (${context}).`);
    }
    return weight;
}

//gives each finnish a uniform weight unless its in one of the chroma cases (1, 2 or 3)
function finishWeightsFor(caseId, finishes) {
    if (!CHROMA_CASE_IDS.has(caseId)) return Object.fromEntries(finishes.map(f => [f, 1])); //uniform 1/N
    return Object.fromEntries(finishes.map(f => [f, CHROMA_FINISH_WEIGHTS[f] ?? CHROMA_DEFAULT_FINISH_WEIGHT]));
}

//removes stattrak/souvenir and the star from gloves/knives
export function parseRareItemName(rawName) {
    const cleaned = rawName
        .replace(/^★\s*/, '')
        .replace(/^(StatTrak™|Souvenir)\s*/, '')
        .replace(/^★\s*/, ''); //star can appear either side of the StatTrak prefix depending on source
    const [model, finish] = cleaned.split('|').map(s => s?.trim());
    return { model, finish: finish ?? null };
}

//removes duplicate names - instead of naming doppler 7 times it just names it once
export function dedupeRarePool(rawNames) {
    const byModel = new Map();
    for (const raw of rawNames) {
        const { model, finish } = parseRareItemName(raw);
        if (!byModel.has(model)) byModel.set(model, new Set());
        byModel.get(model).add(finish);
    }
    return byModel;
}

export function computeCaseGroupOutcomes(caseId, rawContainsRare, groupCount, totalInputs) {
    const byModel = dedupeRarePool(rawContainsRare);
    const models = [...byModel.keys()];
    const modelCount = models.length;
    if (modelCount === 0) {
        throw new TradeUpValidationError(`Case "${caseId}" has no rare items to resolve model odds from.`);
    }

    const outcomes = [];
    for (const model of models) {
        const finishes = [...byModel.get(model)];

        const fWeights = finishWeightsFor(caseId, finishes); //doppler weight = 17 regular = 5. Non chroma is uniform weight = 1
        const finishTotal = sumWeights(fWeights); //42 for chroma 6 for anything else

        for (const finish of finishes) {
            if (UNVERIFIED_PHASED_FINISHES.has(finish)) {
                throw new TradeUpValidationError(`${finish} phase weights are unverified - refusing to guess odds for "${model} | ${finish}".`);
            }

            const finishWeight = requireWeight(fWeights, finish, `finish weight for model "${model}"`); 

            if (KNOWN_PHASED_FINISHES.has(finish)) {
                const phaseTable = phaseTableFor(caseId, finish); //gets the right odds for doppler/gamma doppler
                const phaseTotal = sumWeights(phaseTable);
                for (const phase of Object.keys(phaseTable)) {
                    const phaseWeight = requireWeight(phaseTable, phase, `phase weight for finish "${finish}"`);
                    const numerator = groupCount * finishWeight * phaseWeight;
                    const denominator = totalInputs * modelCount * finishTotal * phaseTotal;
                    outcomes.push({ caseId, model, finish, phase, probability: numerator / denominator });
                }
            } else {
                const numerator = groupCount * finishWeight;
                const denominator = totalInputs * modelCount * finishTotal;
                outcomes.push({ caseId, model, finish, phase: null, probability: numerator / denominator });
            }
        }
    }
    return outcomes;
}

export function computeStandardOutcomeProbability(groupCount, totalInputs, outputsInGroup) {
    if (outputsInGroup === 0) {
        throw new TradeUpValidationError('Cannot compute a standard outcome probability across 0 reachable outputs.');
    }
    return groupCount / (totalInputs * outputsInGroup);
}

export function validateInputs(inputs, { isGoldTier }) {
    const expected = isGoldTier ? GOLD_INPUT_COUNT : STANDARD_INPUT_COUNT;
    if (inputs.length !== expected) {
        throw new TradeUpValidationError(`${isGoldTier ? 'Covert → Rare Special' : 'Standard'} contracts need exactly ${expected} inputs, got ${inputs.length}.`);
    }

    if (new Set(inputs.map(i => !!i.stattrak)).size > 1) {
        throw new TradeUpValidationError('Cannot mix StatTrak and non-StatTrak inputs in the same contract.');
    }

    if (isGoldTier) {
        for (const input of inputs) {
            if (input.caseIds.length === 0) {
                throw new TradeUpValidationError(
                    `"${input.collection}" has no associated case, so it has no Rare Special pool to draw from.`
                );
            }
            if (input.caseIds.length > 1) {
                throw new TradeUpValidationError(
                    `"${input.collection}" maps to more than one case (${input.caseIds.join(', ')}) - can't pick one unambiguously.`
                );
            }
        }
    }
}

export function computeGoldOutcomes(groups, totalInputs) {
    const outcomes = [];
    for (const [caseId, { count, rawContainsRare }] of groups) {
        outcomes.push(...computeCaseGroupOutcomes(caseId, rawContainsRare, count, totalInputs));
    }
    return outcomes;
}

export function computeStandardOutcomes(groups, outputNamesByCollection, totalInputs) {
    const outcomes = [];
    for (const [collection, count] of groups) {
        const outputNames = outputNamesByCollection.get(collection) ?? [];
        if (outputNames.length === 0) {
            throw new TradeUpValidationError(`"${collection}" has no reachable outputs at the target rarity, so it can't contribute to this contract.`);
        }
        const probability = computeStandardOutcomeProbability(count, totalInputs, outputNames.length);
        for (const outputName of outputNames) {
            outcomes.push({ collection, outputName, probability });
        }
    }
    return outcomes;
}

export function assertOutcomesSumToOne(outcomes, tolerance = 1e-9) {
    const total = outcomes.reduce((sum, o) => sum + (o.probability ?? 0), 0);
    if (Math.abs(total - 1) > tolerance) {
        throw new Error(`Outcome probabilities sum to ${total}, expected 1. Likely a duplicated or dropped outcome.`);
    }
    return total;
}