import { useState, useEffect, useRef } from 'react';
import { Search, Filter } from 'lucide-react';
import { getOpportunities, getOrganizations } from '../services/api';
import OpportunityCard from '../components/OpportunityCard';
import { deriveOpportunityDefaults, derivePreferredTypes, getStoredPreferences } from '../utils/preferences';

export default function Opportunities() {
    const initialPreferences = getStoredPreferences();
    const initialDefaultsRef = useRef(deriveOpportunityDefaults(initialPreferences));
    const initialPreferredTypesRef = useRef(derivePreferredTypes(initialPreferences));
    const [opportunities, setOpportunities] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const firstLoadRef = useRef(true);

    // Filters
    const [search, setSearch] = useState('');
    const [orgId, setOrgId] = useState('');
    const [selectedTypes, setSelectedTypes] = useState(initialPreferredTypesRef.current);
    const [status, setStatus] = useState(initialDefaultsRef.current.status);

    const fetchOpps = async (pageNum = 1, isLoadMore = false) => {
        if (!isLoadMore) setLoading(true);
        else setLoadingMore(true);

        try {
            const data = await getOpportunities({
                search,
                organizationId: orgId,
                types: selectedTypes.length > 0 ? selectedTypes.join(',') : '',
                status,
                limit: 50,
                page: pageNum
            });

            if (isLoadMore) {
                setOpportunities(prev => {
                    const existingIds = new Set(prev.map(p => p.id));
                    const newItems = data.data.filter(d => !existingIds.has(d.id));
                    return [...prev, ...newItems];
                });
            } else {
                setOpportunities(data.data);
            }

            setHasMore(pageNum < (data.pagination?.totalPages || 1));
            setPage(pageNum);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        getOrganizations().then(setOrgs).catch(console.error);
    }, []);

    useEffect(() => {
        if (firstLoadRef.current) {
            firstLoadRef.current = false;
            fetchOpps(1, false);
            return;
        }

        // Debounce only subsequent filter/search edits.
        const delay = setTimeout(() => {
            fetchOpps(1, false);
        }, 350);
        return () => clearTimeout(delay);
    }, [search, orgId, selectedTypes, status]);

    useEffect(() => {
        const applyUpdatedPreferences = () => {
            const stored = getStoredPreferences();
            const defaults = deriveOpportunityDefaults(stored);
            const preferredTypes = derivePreferredTypes(stored);
            setSelectedTypes(preferredTypes);
            setStatus(defaults.status);
            setSearch('');
            setOrgId('');
        };

        window.addEventListener('preferences-updated', applyUpdatedPreferences);
        return () => {
            window.removeEventListener('preferences-updated', applyUpdatedPreferences);
        };
    }, []);

    const handleLoadMore = () => {
        if (!loadingMore && hasMore) {
            fetchOpps(page + 1, true);
        }
    };

    const clearAllFilters = () => {
        setSearch('');
        setOrgId('');
        setSelectedTypes([]);
        setStatus('');
    };

    const toggleType = (nextType) => {
        setSelectedTypes((prev) => {
            if (prev.includes(nextType)) {
                return prev.filter((item) => item !== nextType);
            }
            return [...prev, nextType];
        });
    };

    const types = ["Competition", "Paper Contest", "Grant", "Hackathon", "Fellowship", "Workshop", "Webinar", "Other"];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-700 pb-6 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Explore Benefits</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Showing {opportunities.length} opportunities based on current filters.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6 items-start">
                <aside className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 lg:sticky lg:top-24">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
                        <h2 className="font-bold text-slate-800 dark:text-slate-100">Filters</h2>
                        <button
                            type="button"
                            onClick={clearAllFilters}
                            className="text-sm text-ieee-blue hover:underline"
                        >
                            Clear All
                        </button>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label htmlFor="opportunity-search" className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide mb-2 block">Search</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                                </div>
                                <input
                                    id="opportunity-search"
                                    name="search"
                                    type="text"
                                    className="block w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md leading-5 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-ieee-blue focus:border-ieee-blue text-sm"
                                    placeholder="Keywords..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="opportunity-organization" className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide mb-2 block">Organization</label>
                            <select
                                id="opportunity-organization"
                                name="organizationId"
                                className="block w-full pl-3 pr-10 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-ieee-blue focus:border-ieee-blue text-sm"
                                value={orgId}
                                onChange={(e) => setOrgId(e.target.value)}
                            >
                                <option value="">All Organizations</option>
                                {orgs.map(org => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide mb-2">Type</p>
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {types.map((item) => (
                                    <label key={item} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={selectedTypes.includes(item)}
                                            onChange={() => toggleType(item)}
                                            className="rounded border-slate-300 dark:border-slate-500 text-ieee-blue focus:ring-ieee-blue"
                                        />
                                        {item}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="opportunity-status" className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide mb-2 block">Status</label>
                            <select
                                id="opportunity-status"
                                name="status"
                                className="block w-full pl-3 pr-10 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-ieee-blue focus:border-ieee-blue text-sm"
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                            >
                                <option value="">All Statuses</option>
                                <option value="Live">Live / Active</option>
                                <option value="Upcoming">Upcoming</option>
                                <option value="Closed">Closed</option>
                            </select>
                        </div>
                    </div>
                </aside>

                <section>
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse"></div>
                            ))}
                        </div>
                    ) : opportunities.length > 0 ? (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {opportunities.map(opp => <OpportunityCard key={opp.id} opportunity={opp} />)}
                            </div>

                            {hasMore && (
                                <div className="flex justify-center pt-8 pb-4">
                                    <button
                                        onClick={handleLoadMore}
                                        disabled={loadingMore}
                                        className="px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {loadingMore ? (
                                            <><div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-500 border-t-ieee-blue rounded-full animate-spin"></div> Loading...</>
                                        ) : (
                                            'Load More Opportunities'
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                            <Filter className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-500 mb-3" />
                            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">No opportunities found</h3>
                            <p className="text-slate-500 dark:text-slate-400 mt-1">Try adjusting your filters or search terms.</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
