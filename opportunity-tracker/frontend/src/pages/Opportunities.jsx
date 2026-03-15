import { useState, useEffect, useRef } from 'react';
import { Search, Filter } from 'lucide-react';
import { getOpportunities, getOrganizations } from '../services/api';
import OpportunityCard from '../components/OpportunityCard';

export default function Opportunities() {
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
    const [type, setType] = useState('');
    const [status, setStatus] = useState('Live');

    const fetchOpps = async (pageNum = 1, isLoadMore = false) => {
        if (!isLoadMore) setLoading(true);
        else setLoadingMore(true);

        try {
            const data = await getOpportunities({ search, organizationId: orgId, type, status, limit: 50, page: pageNum });

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
    }, [search, orgId, type, status]);

    const handleLoadMore = () => {
        if (!loadingMore && hasMore) {
            fetchOpps(page + 1, true);
        }
    };

    const types = ["Competition", "Paper Contest", "Grant", "Hackathon", "Fellowship", "Workshop", "Webinar", "Other"];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Opportunities Feed</h1>
                    <p className="text-slate-500 mt-1">Discover the latest events computationally vetted for you.</p>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative col-span-1 md:col-span-4 lg:col-span-1">
                    <label htmlFor="opportunity-search" className="sr-only">Search opportunities</label>
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                        id="opportunity-search"
                        name="search"
                        type="text"
                        className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-500 focus:outline-none focus:ring-ieee-blue focus:border-ieee-blue sm:text-sm"
                        placeholder="Search keywords..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <label htmlFor="opportunity-organization" className="sr-only">Filter by organization</label>
                <select
                    id="opportunity-organization"
                    name="organizationId"
                    className="block w-full pl-3 pr-10 py-2 border border-slate-300 bg-white rounded-md focus:outline-none focus:ring-ieee-blue focus:border-ieee-blue sm:text-sm"
                    value={orgId}
                    onChange={(e) => setOrgId(e.target.value)}
                >
                    <option value="">All Organizations</option>
                    {orgs.map(org => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                </select>

                <label htmlFor="opportunity-type" className="sr-only">Filter by type</label>
                <select
                    id="opportunity-type"
                    name="type"
                    className="block w-full pl-3 pr-10 py-2 border border-slate-300 bg-white rounded-md focus:outline-none focus:ring-ieee-blue focus:border-ieee-blue sm:text-sm"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                >
                    <option value="">All Types</option>
                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                <label htmlFor="opportunity-status" className="sr-only">Filter by status</label>
                <select
                    id="opportunity-status"
                    name="status"
                    className="block w-full pl-3 pr-10 py-2 border border-slate-300 bg-white rounded-md focus:outline-none focus:ring-ieee-blue focus:border-ieee-blue sm:text-sm"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                >
                    <option value="">All Statuses</option>
                    <option value="Live">Live / Active</option>
                    <option value="Upcoming">Upcoming</option>
                    <option value="Closed">Closed</option>
                </select>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-64 bg-slate-100 rounded-xl animate-pulse"></div>
                    ))}
                </div>
            ) : opportunities.length > 0 ? (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {opportunities.map(opp => <OpportunityCard key={opp.id} opportunity={opp} />)}
                    </div>

                    {hasMore && (
                        <div className="flex justify-center pt-8 pb-4">
                            <button
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {loadingMore ? (
                                    <><div className="w-5 h-5 border-2 border-slate-300 border-t-ieee-blue rounded-full animate-spin"></div> Loading...</>
                                ) : (
                                    'Load More Opportunities'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
                    <Filter className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                    <h3 className="text-lg font-medium text-slate-900">No opportunities found</h3>
                    <p className="text-slate-500 mt-1">Try adjusting your filters or search terms.</p>
                </div>
            )}
        </div>
    );
}
