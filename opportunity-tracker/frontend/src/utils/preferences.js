const PREFERENCES_STORAGE_KEY = 'ieee.preferences.v1';

const INTEREST_TO_TYPE = {
    competition: 'Competition',
    grant: 'Grant',
    scholarship: 'Scholarship',
    mentorship: 'Fellowship',
    award: 'Other',
    projectfunding: 'Grant',
    other: 'Other'
};

const normalizeArray = (value) => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => String(item || '').trim())
        .filter(Boolean);
};

export const getStoredPreferences = () => {
    try {
        const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            persona: parsed.persona ? String(parsed.persona) : '',
            region: parsed.region ? String(parsed.region) : '',
            interests: normalizeArray(parsed.interests),
            updatedAt: parsed.updatedAt || null
        };
    } catch {
        return null;
    }
};

export const savePreferences = (preferences) => {
    const payload = {
        persona: preferences?.persona ? String(preferences.persona) : '',
        region: preferences?.region ? String(preferences.region) : '',
        interests: normalizeArray(preferences?.interests),
        updatedAt: new Date().toISOString()
    };

    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('preferences-updated', { detail: payload }));
    return payload;
};

export const hasStoredPreferences = () => {
    const prefs = getStoredPreferences();
    return Boolean(prefs && prefs.persona && prefs.region && prefs.interests.length > 0);
};

export const clearStoredPreferences = () => {
    localStorage.removeItem(PREFERENCES_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('preferences-updated', { detail: null }));
};

export const deriveOpportunityDefaults = (preferences) => {
    const prefs = preferences || getStoredPreferences();
    if (!prefs) {
        return { type: '', status: 'Live' };
    }

    let mappedType = '';
    for (const interest of prefs.interests || []) {
        const candidate = INTEREST_TO_TYPE[String(interest).toLowerCase()];
        if (candidate) {
            mappedType = candidate;
            break;
        }
    }

    return {
        type: mappedType,
        status: 'Live'
    };
};

export const derivePreferredTypes = (preferences) => {
    const prefs = preferences || getStoredPreferences();
    if (!prefs) return [];

    const mapped = (prefs.interests || [])
        .map((interest) => INTEREST_TO_TYPE[String(interest).toLowerCase()])
        .filter(Boolean);

    return [...new Set(mapped)];
};
