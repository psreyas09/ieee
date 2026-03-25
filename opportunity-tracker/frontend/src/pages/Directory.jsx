import React, { useState, useEffect, useMemo } from 'react';
import { getOrganizations } from '../services/api';
import { Globe, Clock, LayoutGrid, Users, Map } from 'lucide-react';
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
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeType, setActiveType] = useState('society');
    const [search, setSearch] = useState('');
    const [regionSelection, setRegionSelection] = useState(getStoredPreferences()?.region || 'Global (All Regions)');

    useEffect(() => {
        getOrganizations().then(data => {
            setOrgs(data);
            setLoading(false);
        }).catch(console.error);
    }, []);

    const countsByType = useMemo(() => {
        return {
            society: orgs.filter((o) => o.type === 'society').length,
            council: orgs.filter((o) => o.type === 'council').length,
            region: orgs.filter((o) => o.type === 'region').length,
            other: orgs.filter((o) => o.type === 'other').length
        };
    }, [orgs]);

    const matchRegion = (org) => {
        if (!regionSelection || regionSelection.startsWith('Global')) return true;
        const match = regionSelection.match(/^R(\d+)/i);
        if (!match) return true;
        const regionNumber = match[1];
        const text = `${org.name || ''} ${org.officialWebsite || ''}`;
        const regionRegex = new RegExp(`\\b(region\\s*${regionNumber}|r${regionNumber})\\b`, 'i');
        return regionRegex.test(text);
    };

    const filteredOrgs = orgs
        .filter((o) => (activeType ? o.type === activeType : true))
        .filter((o) => (search ? o.name.toLowerCase().includes(search.toLowerCase()) : true))
        .filter(matchRegion);

    const openPreferencesModal = () => {
        window.dispatchEvent(new Event('open-preferences-modal'));
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Organization Directory</h1>
                    <p className="text-slate-500 mt-1">Navigate by category to find relevant IEEE entities faster.</p>
                </div>
            </div>

            <section className="space-y-3">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <LayoutGrid size={22} className="text-ieee-blue" /> Browse by Category
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <CategoryCard title="Societies" count={countsByType.society} active={activeType === 'society'} onClick={() => setActiveType('society')} />
                    <CategoryCard title="Councils" count={countsByType.council} active={activeType === 'council'} onClick={() => setActiveType('council')} />
                    <CategoryCard title="Regions" count={countsByType.region} active={activeType === 'region'} onClick={() => setActiveType('region')} />
                    <CategoryCard title="Other" count={countsByType.other} active={activeType === 'other'} onClick={() => setActiveType('other')} />
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
                            onClick={openPreferencesModal}
                            className="text-left bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:border-ieee-blue transition-colors"
                            title="Update this in Preferences"
                        >
                            <p className="font-semibold text-slate-800">{label}</p>
                            <p className="text-sm text-slate-500 mt-1">Manage in Preferences</p>
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
                            <p className="text-sm text-slate-500 mt-1">{filteredOrgs.length} available</p>
                        </button>
                    ))}
                </div>
            </section>

            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search organizations..."
                    className="w-full md:w-80 border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20"
                />
                <button
                    type="button"
                    onClick={() => {
                        setSearch('');
                        setRegionSelection('Global (All Regions)');
                    }}
                    className="text-sm font-medium text-ieee-blue hover:underline"
                >
                    Reset filters
                </button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 min-h-[520px]">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-h-[220px] animate-pulse">
                            <div className="h-12 bg-slate-100 rounded mb-4"></div>
                            <div className="h-6 w-28 bg-slate-100 rounded mb-8"></div>
                            <div className="mt-10 h-4 bg-slate-100 rounded"></div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 min-h-[520px]">
                    {filteredOrgs.map(org => (
                        <div key={org.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col hover:border-ieee-blue transition-colors min-h-[220px]">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-lg font-bold text-slate-900 leading-tight pr-4 min-h-[56px]">{org.name}</h3>
                                <div className={`w-3 h-3 rounded-full shrink-0 mt-1 ${org._count.opportunities > 0 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-slate-300'}`} title={org._count.opportunities > 0 ? 'Active opportunities' : 'No active opportunities'}></div>
                            </div>

                            <div className="flex-grow">
                                <div className="flex items-center gap-2 text-sm text-slate-600 mb-2 font-medium">
                                    <span className="bg-slate-100 py-1 px-2.5 rounded-md text-slate-700">
                                        {org._count.opportunities} Live {org._count.opportunities === 1 ? 'Entry' : 'Entries'}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                                <div className="flex items-center gap-1.5">
                                    <Clock size={14} />
                                    <span>
                                        Updated
                                        {org.lastScrapedAt
                                            ? ` ${new Date(org.lastScrapedAt).toLocaleDateString()}`
                                            : ' Never'}
                                    </span>
                                </div>
                                {org.officialWebsite && (
                                    <a href={org.officialWebsite} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-slate-500 hover:text-ieee-blue transition-colors hover:underline">
                                        <Globe size={14} /> Website
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function CategoryCard({ title, count, active, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`text-left bg-white rounded-xl shadow-sm border p-4 transition-colors ${active ? 'border-ieee-blue ring-2 ring-ieee-blue/20' : 'border-slate-200 hover:border-ieee-blue'}`}
        >
            <p className="font-semibold text-slate-800">{title}</p>
            <p className="text-sm text-slate-500 mt-1">{count} available</p>
        </button>
    );
}
