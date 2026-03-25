import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrganizations, getOpportunities } from '../services/api';
import { Sparkles, LayoutGrid, Users, Map } from 'lucide-react';
import { getStoredPreferences } from '../utils/preferences';

const MEMBERSHIP_TYPES = [
    'Undergraduate Student',
    'Graduate Student',
    'Young Professional',
    'Non-IEEE Member'
];

const REGION_OPTIONS = [
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

export default function Directory() {
    const navigate = useNavigate();
    const [orgs, setOrgs] = useState([]);
    const [opportunities, setOpportunities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [regionSelection, setRegionSelection] = useState(getStoredPreferences()?.region || 'Global (All Regions)');

    useEffect(() => {
        Promise.all([
            getOrganizations(),
            getOpportunities({ status: 'Live', limit: 1000, sort: 'recent' })
        ])
            .then(([orgData, oppData]) => {
                setOrgs(orgData || []);
                setOpportunities(oppData?.data || []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const toQuickFilters = (payload) => {
        localStorage.setItem('ieee.quickFilters.v1', JSON.stringify(payload));
        window.dispatchEvent(new CustomEvent('quick-filters-updated', { detail: payload }));
    };

    const navigateWithFilters = (payload) => {
        toQuickFilters(payload);
        navigate('/opportunities');
    };

    const matchesRegion = (opp, regionLabel) => {
        if (!regionLabel || regionLabel.startsWith('Global')) return true;
        const match = regionLabel.match(/^R(\d+)/i);
        if (!match) return true;
        const regionNo = match[1];
        const text = `${opp.title || ''} ${opp.description || ''} ${opp.eligibility || ''}`.toLowerCase();
        return new RegExp(`\\b(region\\s*${regionNo}|r${regionNo})\\b`, 'i').test(text);
    };

    const regionScopedOpps = useMemo(() => {
        return opportunities.filter((opp) => matchesRegion(opp, regionSelection));
    }, [opportunities, regionSelection]);

    const categoryCounts = useMemo(() => {
        const categories = {
            Competition: 0,
            Mentorship: 0,
            ProjectFunding: 0,
            Award: 0,
            Scholarship: 0,
            Grant: 0,
            Other: 0,
            Workshop: 0,
            Webinar: 0,
            Conference: 0,
            'Paper Contest': 0,
            Fellowship: 0,
            Seminar: 0,
            Congress: 0
        };

        for (const opp of regionScopedOpps) {
            const type = (opp.type || '').trim();
            const text = `${opp.title || ''} ${opp.description || ''}`.toLowerCase();

            if (type in categories) categories[type] += 1;
            if (type === 'Grant') categories.ProjectFunding += 1;
            if (type === 'Fellowship' || /mentor/i.test(text)) categories.Mentorship += 1;
            if (/award/i.test(text)) categories.Award += 1;
            if (/conference/i.test(text)) categories.Conference += 1;
            if (/seminar/i.test(text)) categories.Seminar += 1;
            if (/congress/i.test(text)) categories.Congress += 1;
        }

        return categories;
    }, [regionScopedOpps]);

    const membershipCounts = useMemo(() => {
        const result = {
            'Undergraduate Student': 0,
            'Graduate Student': 0,
            'Young Professional': 0,
            'Non-IEEE Member': 0
        };

        for (const opp of regionScopedOpps) {
            const text = `${opp.title || ''} ${opp.description || ''} ${opp.eligibility || ''}`.toLowerCase();
            if (/undergraduate|bachelor/.test(text)) result['Undergraduate Student'] += 1;
            if (/graduate|master|phd|doctoral/.test(text)) result['Graduate Student'] += 1;
            if (/young professional|early career/.test(text)) result['Young Professional'] += 1;
            if (/non-?ieee|public|open to all/.test(text)) result['Non-IEEE Member'] += 1;
        }

        return result;
    }, [regionScopedOpps]);

    const regionCounts = useMemo(() => {
        return REGION_OPTIONS.reduce((acc, label) => {
            acc[label] = opportunities.filter((opp) => matchesRegion(opp, label)).length;
            return acc;
        }, {});
    }, [opportunities]);

    const totalSelected = regionScopedOpps.length;

    const categoryToType = {
        Competition: ['Competition'],
        Mentorship: ['Fellowship'],
        ProjectFunding: ['Grant'],
        Award: ['Other'],
        Scholarship: ['Scholarship'],
        Grant: ['Grant'],
        Other: ['Other'],
        Workshop: ['Workshop'],
        Webinar: ['Webinar'],
        Conference: ['Other'],
        'Paper Contest': ['Paper Contest'],
        Fellowship: ['Fellowship'],
        Seminar: ['Other'],
        Congress: ['Other']
    };

    const categoryKeys = Object.keys(categoryCounts);

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Explore Benefits</h1>
                    <p className="text-slate-500 mt-1">Find opportunities by category, membership profile, and region.</p>
                </div>
            </div>

            <section className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Sparkles className="text-purple-500" size={22} />
                    <div>
                        <p className="font-bold text-slate-900">{totalSelected} Benefits Selected For You</p>
                        <p className="text-sm text-slate-500">Based on your profile, we&apos;ve found these opportunities.</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => navigateWithFilters({ status: 'Live', selectedTypes: [] })}
                    className="px-4 py-2 rounded-full bg-ieee-blue text-white text-sm font-semibold hover:bg-blue-700"
                >
                    Check them out
                </button>
            </section>

            <section className="space-y-3">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <LayoutGrid size={22} className="text-ieee-blue" /> Browse by Category
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {categoryKeys.map((label) => (
                        <CategoryCard
                            key={label}
                            title={label}
                            count={categoryCounts[label]}
                            onClick={() => navigateWithFilters({ status: 'Live', selectedTypes: categoryToType[label] || [] })}
                        />
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Users size={22} className="text-ieee-blue" /> Membership Types
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {MEMBERSHIP_TYPES.map((label) => (
                        <button
                            key={label}
                            type="button"
                            onClick={() => window.dispatchEvent(new Event('open-preferences-modal'))}
                            className="text-left bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:border-ieee-blue transition-colors"
                            title="Update this in Preferences"
                        >
                            <p className="font-semibold text-slate-800">{label}</p>
                            <p className="text-sm text-slate-500 mt-1">{membershipCounts[label]} matching</p>
                        </button>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Map size={22} className="text-ieee-blue" /> Explore Regions
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {REGION_OPTIONS.map((label) => (
                        <button
                            key={label}
                            type="button"
                            onClick={() => setRegionSelection(label)}
                            className={`text-left bg-white rounded-xl shadow-sm border p-4 transition-colors ${regionSelection === label ? 'border-ieee-blue ring-2 ring-ieee-blue/20' : 'border-slate-200 hover:border-ieee-blue'}`}
                        >
                            <p className="font-semibold text-slate-800 leading-snug">{label}</p>
                            <p className="text-sm text-slate-500 mt-1">{regionCounts[label] || 0} available</p>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}

function CategoryCard({ title, count, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="text-left bg-white rounded-xl shadow-sm border border-slate-200 p-4 transition-colors hover:border-ieee-blue"
        >
            <p className="font-semibold text-slate-800">{title}</p>
            <p className="text-sm text-slate-500 mt-1">{count} available</p>
        </button>
    );
}
