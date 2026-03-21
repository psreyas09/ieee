const REGION_HINTS = [
    { pattern: /\bregion\s*[1-9]|region\s*10\b/i, label: 'IEEE Region Specific' },
    { pattern: /\bindia\b/i, label: 'India Only' },
    { pattern: /\bfrance\b/i, label: 'France Only' },
    { pattern: /\bcanada\b/i, label: 'Canada Only' },
    { pattern: /\busa\b|united states|u\.s\./i, label: 'US Only' },
    { pattern: /\beurope\b|emea\b/i, label: 'Europe / EMEA Only' },
    { pattern: /\blatin america\b/i, label: 'Latin America Only' },
    { pattern: /\bmiddle east\b/i, label: 'Middle East Only' },
    { pattern: /\bafrica\b/i, label: 'Africa Only' },
    { pattern: /\basia\b|pacific\b|apac\b/i, label: 'APAC Only' }
];

const RESTRICTION_TRIGGERS = [
    /\bonly\b/i,
    /\brestricted\b/i,
    /\bapplicants? from\b/i,
    /\bopen to\b/i,
    /\bwithin\b/i,
    /\beligible.*(residents?|citizens?|students?)\b/i,
    /\bfor students in\b/i,
    /\blimited to\b/i
];

const REGION_ELIGIBILITY_PHRASES = [
    /\b(open to|limited to|restricted to|for)\b[^.]{0,80}\b(in|from|of|within)\b[^.]{0,80}\b(india|france|canada|usa|united states|u\.s\.|europe|emea|latin america|middle east|africa|asia|pacific|apac|region\s*[1-9]|region\s*10)\b/i,
    /\b(eligible|eligibility)\b[^.]{0,100}\b(india|france|canada|usa|united states|u\.s\.|europe|emea|latin america|middle east|africa|asia|pacific|apac|region\s*[1-9]|region\s*10)\b/i,
    /\b(residents?|citizens?|students?)\b[^.]{0,80}\b(of|from|in)\b[^.]{0,80}\b(india|france|canada|usa|united states|u\.s\.|europe|emea|latin america|middle east|africa|asia|pacific|apac|region\s*[1-9]|region\s*10)\b/i
];

export function getRegionRestriction(opportunity) {
    const titleText = opportunity?.title || '';
    const descriptionText = opportunity?.description || '';
    const eligibilityText = opportunity?.eligibility || '';
    const text = `${titleText} ${descriptionText} ${eligibilityText}`.trim();
    if (!text) return { isRestricted: false, label: '' };

    const hasRestrictionSignal = RESTRICTION_TRIGGERS.some((regex) => regex.test(text));
    const hasRegionEligibilityPhrase = REGION_ELIGIBILITY_PHRASES.some((regex) => regex.test(text));
    if (!hasRestrictionSignal && !hasRegionEligibilityPhrase) return { isRestricted: false, label: '' };

    for (const hint of REGION_HINTS) {
        if (hint.pattern.test(text)) {
            // Mark restricted when geography is explicitly tied to eligibility/restriction language.
            if (hasRestrictionSignal || hasRegionEligibilityPhrase) {
                return { isRestricted: true, label: hint.label };
            }
        }
    }

    const eligibilityGeoMatch = eligibilityText.match(/\b(?:members?|professionals?|students?|residents?|citizens?|applicants?)\b[^.]{0,100}\b(?:in|from|of)\s+([A-Z][A-Za-z]+(?:[\s-][A-Z][A-Za-z]+){0,2})\b/);
    if (eligibilityGeoMatch?.[1]) {
        const place = eligibilityGeoMatch[1].trim();
        return { isRestricted: true, label: `${place} Only` };
    }

    // Avoid false positives from generic eligibility text unless a specific region is detected.
    return { isRestricted: false, label: '' };
}
