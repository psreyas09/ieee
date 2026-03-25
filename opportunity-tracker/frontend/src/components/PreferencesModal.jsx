import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

const PERSONAS = [
    'Undergraduate Student',
    'Graduate Student',
    'Young Professional',
    'Non-IEEE Member'
];

const REGIONS = [
    'Global (All Regions)',
    'R1 - Northeastern USA',
    'R2 - Eastern USA',
    'R3 - Southeastern USA',
    'R4 - Central USA',
    'R5 - Southwestern USA',
    'R6 - Western USA',
    'R7 - Canada',
    'R8 - Europe, Middle East, Africa',
    'R9 - Latin America',
    'R10 - Asia & Pacific'
];

const INTERESTS = [
    'Competition',
    'Mentorship',
    'Grant',
    'Award',
    'Scholarship',
    'ProjectFunding',
    'Other'
];

export default function PreferencesModal({ isOpen, onClose, onSave, initialPreferences }) {
    const [persona, setPersona] = useState('');
    const [region, setRegion] = useState('Global (All Regions)');
    const [interests, setInterests] = useState([]);

    useEffect(() => {
        if (!isOpen) return;
        setPersona(initialPreferences?.persona || '');
        setRegion(initialPreferences?.region || 'Global (All Regions)');
        setInterests(Array.isArray(initialPreferences?.interests) ? initialPreferences.interests : []);
    }, [initialPreferences, isOpen]);

    const canSave = useMemo(() => {
        return Boolean(persona && region && interests.length > 0);
    }, [persona, region, interests]);

    const toggleInterest = (interest) => {
        setInterests((prev) => {
            if (prev.includes(interest)) {
                return prev.filter((item) => item !== interest);
            }
            return [...prev, interest];
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!canSave) return;
        onSave({ persona, region, interests });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Welcome to IEEE Benefits</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Set your base interests. You can change these anytime.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
                    <fieldset className="space-y-3">
                        <legend className="text-base font-semibold text-slate-800 dark:text-slate-200">I&apos;m a...</legend>
                        <div className="flex flex-wrap gap-2">
                            {PERSONAS.map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => setPersona(item)}
                                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                                        persona === item
                                            ? 'bg-ieee-blue text-white border-ieee-blue'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                                    }`}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset className="space-y-3">
                        <legend className="text-base font-semibold text-slate-800 dark:text-slate-200">I&apos;m from...</legend>
                        <div className="flex flex-wrap gap-2">
                            {REGIONS.map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => setRegion(item)}
                                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                                        region === item
                                            ? 'bg-ieee-blue text-white border-ieee-blue'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                                    }`}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset className="space-y-3">
                        <legend className="text-base font-semibold text-slate-800 dark:text-slate-200">I&apos;m interested in...</legend>
                        <div className="flex flex-wrap gap-2">
                            {INTERESTS.map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => toggleInterest(item)}
                                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                                        interests.includes(item)
                                            ? 'bg-ieee-blue text-white border-ieee-blue'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                                    }`}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                            Maybe Later
                        </button>
                        <button
                            type="submit"
                            disabled={!canSave}
                            className="px-5 py-2 rounded-lg bg-ieee-blue text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Let&apos;s Explore
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
