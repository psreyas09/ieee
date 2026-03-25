import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrganizations, triggerScrape, getOpportunities, deleteOpportunity, createOpportunity, updateOrganization, createOrganization, addOrganizationScrapeUrl, deleteOrganizationScrapeUrl, getScrapeHealth, getDuplicateGroups, mergeDuplicates, verifyOpportunity } from '../services/api';
import { Activity, Trash2, ExternalLink, RefreshCw, LogOut, PlusCircle, X, Pencil } from 'lucide-react';

export default function AdminDashboard() {
    const navigate = useNavigate();
    const [orgs, setOrgs] = useState([]);
    const [opps, setOpps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [scrapingId, setScrapingId] = useState(null);
    const [toast, setToast] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isScrapingAll, setIsScrapingAll] = useState(false);
    const [scrapeProgress, setScrapeProgress] = useState(null);
    const [scrapeHealthRows, setScrapeHealthRows] = useState([]);
    const [healthSortBy, setHealthSortBy] = useState('org');
    const [healthSortDir, setHealthSortDir] = useState('asc');
    const [failedOnly, setFailedOnly] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState([]);
    const [duplicateSelection, setDuplicateSelection] = useState({});
    const [isMergingGroup, setIsMergingGroup] = useState('');
    const [showScrapeHealth, setShowScrapeHealth] = useState(false);
    const [showDuplicateMerge, setShowDuplicateMerge] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        title: '', description: '', deadline: '', eligibility: '', url: '', type: 'Competition', status: 'Live', organizationId: ''
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/admin/login');
            return;
        }
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [navigate, page]);

    const fetchData = async () => {
        try {
            const [orgsResult, oppsResult, scrapeHealthResult, duplicatesResult] = await Promise.allSettled([
                getOrganizations(),
                getOpportunities({ limit: 100, page, sort: 'recent' }),
                getScrapeHealth(),
                getDuplicateGroups()
            ]);

            if (orgsResult.status === 'fulfilled') {
                setOrgs(orgsResult.value || []);
            }

            if (oppsResult.status === 'fulfilled') {
                setOpps(oppsResult.value?.data || []);
                setTotalPages(oppsResult.value?.pagination?.totalPages || 1);
            }

            if (scrapeHealthResult.status === 'fulfilled') {
                setScrapeHealthRows(scrapeHealthResult.value?.data || []);
            } else {
                setScrapeHealthRows([]);
            }

            const nextDuplicateGroups = duplicatesResult.status === 'fulfilled'
                ? (duplicatesResult.value?.data || [])
                : [];

            setDuplicateGroups(nextDuplicateGroups);
            setDuplicateSelection((prev) => {
                const next = { ...prev };
                for (const group of nextDuplicateGroups) {
                    if (next[group.groupId]) continue;
                    next[group.groupId] = {
                        primaryId: group.recommendedPrimaryId,
                        selectedIds: group.candidates
                            .filter(item => item.id !== group.recommendedPrimaryId)
                            .map(item => item.id)
                    };
                }
                return next;
            });

            const rejected = [orgsResult, oppsResult, scrapeHealthResult, duplicatesResult]
                .filter(result => result.status === 'rejected')
                .map(result => result.reason)
                .filter(Boolean);

            const unauthorized = rejected.some((error) => error?.response?.status === 401);
            if (unauthorized) {
                localStorage.removeItem('token');
                navigate('/admin/login');
                return;
            }

            if (rejected.length > 0) {
                const firstMessage = rejected[0]?.response?.data?.error || rejected[0]?.message || 'Some dashboard sections failed to load.';
                showToast(`Partial load: ${firstMessage}`);
            }
        } catch (err) {
            if (err.response?.status === 401) {
                localStorage.removeItem('token');
                navigate('/admin/login');
            }
        } finally {
            setLoading(false);
        }
    };

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 5000);
    };

    const filteredHealthRows = useMemo(() => {
        const rows = failedOnly
            ? scrapeHealthRows.filter(row => row.lastStatus === 'failed' || row.failed7d > 0)
            : [...scrapeHealthRows];

        const getSortValue = (row) => {
            switch (healthSortBy) {
                case 'lastScrape': return row.lastScrapedAt ? new Date(row.lastScrapedAt).getTime() : 0;
                case 'lastStatus': return row.lastStatus || '';
                case 'success7d': return row.success7d || 0;
                case 'failed7d': return row.failed7d || 0;
                case 'added7d': return row.opportunitiesAdded7d || 0;
                case 'successRate': return row.successRate || 0;
                case 'org':
                default: return (row.organizationName || '').toLowerCase();
            }
        };

        rows.sort((a, b) => {
            const va = getSortValue(a);
            const vb = getSortValue(b);

            if (typeof va === 'number' && typeof vb === 'number') {
                return healthSortDir === 'asc' ? va - vb : vb - va;
            }

            return healthSortDir === 'asc'
                ? String(va).localeCompare(String(vb))
                : String(vb).localeCompare(String(va));
        });

        return rows;
    }, [scrapeHealthRows, failedOnly, healthSortBy, healthSortDir]);

    const setHealthSort = (field) => {
        if (healthSortBy === field) {
            setHealthSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setHealthSortBy(field);
        setHealthSortDir(field === 'org' ? 'asc' : 'desc');
    };

    const updateDuplicatePrimary = (groupId, nextPrimaryId) => {
        setDuplicateSelection((prev) => {
            const current = prev[groupId] || { primaryId: nextPrimaryId, selectedIds: [] };
            const selected = current.selectedIds.filter(id => id !== nextPrimaryId);
            return {
                ...prev,
                [groupId]: {
                    primaryId: nextPrimaryId,
                    selectedIds: selected
                }
            };
        });
    };

    const toggleDuplicateCandidate = (groupId, candidateId) => {
        setDuplicateSelection((prev) => {
            const current = prev[groupId] || { primaryId: '', selectedIds: [] };
            if (candidateId === current.primaryId) return prev;

            const isSelected = current.selectedIds.includes(candidateId);
            const nextSelected = isSelected
                ? current.selectedIds.filter(id => id !== candidateId)
                : [...current.selectedIds, candidateId];

            return {
                ...prev,
                [groupId]: {
                    ...current,
                    selectedIds: nextSelected
                }
            };
        });
    };

    const handleMergeGroup = async (group) => {
        const selection = duplicateSelection[group.groupId] || {
            primaryId: group.recommendedPrimaryId,
            selectedIds: group.candidates
                .filter(item => item.id !== group.recommendedPrimaryId)
                .map(item => item.id)
        };

        if (!selection.primaryId || selection.selectedIds.length === 0) {
            showToast('Select a primary record and at least one duplicate to merge.');
            return;
        }

        if (!confirm(`Merge ${selection.selectedIds.length} duplicate record(s) into selected primary? This cannot be undone.`)) {
            return;
        }

        setIsMergingGroup(group.groupId);
        try {
            const result = await mergeDuplicates({
                primaryId: selection.primaryId,
                duplicateIds: selection.selectedIds
            });
            showToast(`Merged ${result.mergedCount} item(s). Kept ${result.keptId}.`);
            await fetchData();
        } catch (error) {
            showToast(error.response?.data?.error || 'Failed to merge duplicates.');
        } finally {
            setIsMergingGroup('');
        }
    };

    const getExplicitScrapeUrls = (org) => {
        if (Array.isArray(org.scrapeUrls) && org.scrapeUrls.length > 0) {
            return org.scrapeUrls;
        }
        return org.scrapeUrl ? [org.scrapeUrl] : [];
    };

    const getDisplayScrapeUrls = (org) => {
        const explicit = getExplicitScrapeUrls(org);
        const fallback = typeof org.officialWebsite === 'string' ? org.officialWebsite.trim() : '';

        if (!fallback || explicit.includes(fallback)) {
            return explicit.map((url) => ({ url, source: 'explicit' }));
        }

        return [
            ...explicit.map((url) => ({ url, source: 'explicit' })),
            { url: fallback, source: 'fallback' }
        ];
    };

    const isValidHttpUrl = (value) => {
        try {
            const parsed = new URL(value);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    };

    const handleScrape = async (orgId, orgName) => {
        setScrapingId(orgId);
        showToast(`Started scraping ${orgName}...`);
        try {
            const result = await triggerScrape(orgId);
            showToast(`Success! Found ${result.opportunitiesFound} items, added ${result.newAdded} new.`);
            fetchData(); // refresh data
        } catch (error) {
            const msg = error.response?.data?.error || error.message;
            showToast(`Failed: ${msg}`);
            // Log raw output if failed to parse
            if (error.response?.data?.raw) {
                console.error("Raw Gemini Output:", error.response.data.raw);
            }
        } finally {
            setScrapingId(null);
        }
    };

    const handleScrapeAll = async () => {
        if (!confirm('This will sequentially scrape all organizations. It may take several minutes. Ensure your browser stays open. Proceed?')) return;

        setIsScrapingAll(true);
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < orgs.length; i++) {
            const org = orgs[i];
            setScrapeProgress({ current: i + 1, total: orgs.length, name: org.name });

            try {
                setScrapingId(org.id);
                const result = await triggerScrape(org.id);
                successCount++;
                console.log(`Success scraping ${org.name}:`, result);
            } catch (error) {
                failCount++;
                console.error(`Failed scraping ${org.name}:`, error);
            }

            // Wait 2 seconds between scrapes to respect Gemini rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        setScrapingId(null);
        setScrapeProgress(null);
        setIsScrapingAll(false);
        showToast(`Scrape All Complete! Success: ${successCount}, Failed: ${failCount}`);
        fetchData();
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this opportunity?')) return;
        try {
            await deleteOpportunity(id);
            showToast('Opportunity deleted successfully.');
            fetchData();
        } catch (error) {
            showToast('Failed to delete opportunity.');
        }
    };

    const handleVerifyToggle = async (id, currentVerified) => {
        try {
            await verifyOpportunity(id, !currentVerified);
            showToast(!currentVerified ? 'Opportunity marked as verified.' : 'Verification removed.');
            fetchData();
        } catch (error) {
            showToast('Failed to update verification status.');
        }
    };

    const handleManageScrapeUrls = async (org) => {
        const currentUrls = getExplicitScrapeUrls(org);
        const nextValue = prompt(
            `Manage scrape URLs for ${org.name}. Enter one URL per line. Remove a line to delete it.`,
            currentUrls.join('\n')
        );

        if (nextValue === null) return;

        const nextUrls = [...new Set(
            nextValue
                .split(/\r?\n/)
                .map(url => url.trim())
                .filter(Boolean)
        )];

        const invalid = nextUrls.find(url => !isValidHttpUrl(url));
        if (invalid) {
            showToast(`Invalid URL: ${invalid}`);
            return;
        }

        try {
            await updateOrganization(org.id, { scrapeUrls: nextUrls });
            showToast('Scrape URLs updated successfully.');
            fetchData();
        } catch (error) {
            showToast(error.response?.data?.error || 'Failed to update scrape URLs.');
        }
    };

    const handleAddScrapeUrl = async (org) => {
        const nextUrl = prompt(`Add a new scrape URL for ${org.name}`);

        if (nextUrl === null) return;

        const cleaned = nextUrl.trim();
        if (!cleaned) {
            showToast('Scrape URL cannot be empty.');
            return;
        }

        if (!isValidHttpUrl(cleaned)) {
            showToast('Invalid URL format.');
            return;
        }

        try {
            await addOrganizationScrapeUrl(org.id, cleaned);
            showToast('Scrape URL added successfully.');
            fetchData();
        } catch (error) {
            showToast(error.response?.data?.error || 'Failed to add scrape URL.');
        }
    };

    const handleDeleteScrapeUrl = async (org, url) => {
        if (!confirm(`Delete this scrape URL for ${org.name}?\n${url}`)) return;

        try {
            await deleteOrganizationScrapeUrl(org.id, url);
            showToast('Scrape URL removed.');
            fetchData();
        } catch (error) {
            showToast(error.response?.data?.error || 'Failed to remove scrape URL.');
        }
    };

    const handleCreateOrganization = async () => {
        const name = prompt('Organization name');
        if (name === null) return;

        const cleanedName = name.trim();
        if (!cleanedName) {
            showToast('Organization name is required.');
            return;
        }

        const type = prompt('Organization type: society, council, region, or other', 'other');
        if (type === null) return;

        const cleanedType = type.trim().toLowerCase();
        if (!['society', 'council', 'region', 'other'].includes(cleanedType)) {
            showToast('Type must be society, council, region, or other.');
            return;
        }

        const officialWebsiteInput = prompt('Official website URL (optional)', '');
        if (officialWebsiteInput === null) return;
        const officialWebsite = officialWebsiteInput.trim();

        if (officialWebsite && !isValidHttpUrl(officialWebsite)) {
            showToast('Official website must be a valid http(s) URL.');
            return;
        }

        const scrapeUrlsInput = prompt('Scrape URLs (optional). Enter one URL per line.', officialWebsite || '');
        if (scrapeUrlsInput === null) return;

        const scrapeUrls = [...new Set(
            scrapeUrlsInput
                .split(/\r?\n/)
                .map(url => url.trim())
                .filter(Boolean)
        )];

        const invalid = scrapeUrls.find(url => !isValidHttpUrl(url));
        if (invalid) {
            showToast(`Invalid scrape URL: ${invalid}`);
            return;
        }

        try {
            await createOrganization({
                name: cleanedName,
                type: cleanedType,
                officialWebsite: officialWebsite || null,
                scrapeUrls
            });
            showToast('Organization created successfully.');
            fetchData();
        } catch (error) {
            showToast(error.response?.data?.error || 'Failed to create organization.');
        }
    };

    const handleModalSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await createOpportunity(formData);
            showToast('Successfully added manual opportunity.');
            setShowModal(false);
            setFormData({ title: '', description: '', deadline: '', eligibility: '', url: '', type: 'Competition', status: 'Live', organizationId: '' });
            fetchData();
        } catch (err) {
            showToast('Failed to add opportunity: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsSubmitting(false);
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        navigate('/admin/login');
    };

    if (loading) return <div className="py-20 text-center text-slate-500">Loading admin panel...</div>;

    return (
        <div className="space-y-8 animate-in fade-in">
            {/* Toast Notification */}
            {toast && (
                <div className="fixed bottom-4 right-4 bg-slate-900 text-white px-6 py-3 rounded-lg shadow-2xl z-50 flex items-center gap-2 animate-in slide-in-from-bottom-5">
                    <Activity size={18} className="text-ieee-blue" /> {toast}
                </div>
            )}

            <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
                    <p className="text-slate-500">Manage data and trigger synchronization.</p>
                </div>
                <button onClick={logout} className="flex items-center gap-2 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg font-medium transition-colors">
                    <LogOut size={18} /> Logout
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Col - Organizations Scraper */}
                <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <div>
                            <h2 className="font-bold text-slate-800">Trigger Scraping</h2>
                            <p className="text-xs text-slate-500 mt-1">Free-tier safe calls to Gemini API.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCreateOrganization}
                                disabled={isScrapingAll || scrapingId !== null}
                                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${isScrapingAll || scrapingId !== null ? 'bg-slate-200 text-slate-500' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'}`}
                                title="Add New Organization"
                            >
                                <PlusCircle size={14} /> Add Org
                            </button>
                            <button
                                onClick={handleScrapeAll}
                                disabled={isScrapingAll || scrapingId !== null}
                                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${isScrapingAll ? 'bg-slate-200 text-slate-500' : 'bg-ieee-blue text-white hover:bg-blue-700 shadow-sm'}`}
                            >
                                {isScrapingAll ? 'Scraping...' : 'Scrape All'}
                            </button>
                        </div>
                    </div>

                    {isScrapingAll && scrapeProgress && (
                        <div className="bg-blue-50 border-b border-blue-100 p-3 text-sm text-blue-800">
                            <div className="flex justify-between mb-1">
                                <span className="font-semibold">Sequential Scraping</span>
                                <span>{scrapeProgress.current} / {scrapeProgress.total}</span>
                            </div>
                            <div className="w-full bg-blue-200 rounded-full h-1.5 mb-2">
                                <div className="bg-ieee-blue h-1.5 rounded-full transition-all duration-300" style={{ width: `${(scrapeProgress.current / scrapeProgress.total) * 100}%` }}></div>
                            </div>
                            <p className="text-xs truncate">Current: {scrapeProgress.name}</p>
                        </div>
                    )}

                    <div className="overflow-y-auto flex-grow p-4 space-y-3">
                        {orgs.map(org => (
                            <div key={org.id} className="border border-slate-200 rounded-lg p-3 hover:border-ieee-blue/30 transition-colors">
                                {(() => {
                                    const scrapeUrls = getDisplayScrapeUrls(org);
                                    return (
                                <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-sm text-slate-800 truncate" title={org.name}>{org.name}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Last: {org.lastScrapedAt ? new Date(org.lastScrapedAt).toLocaleString() : 'Never'}
                                        </p>
                                        <div className="mt-2 space-y-1">
                                            {scrapeUrls.length > 0 ? scrapeUrls.map((item) => (
                                                <div key={item.url} className="flex items-center gap-1.5 min-w-0">
                                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className={`text-[11px] px-2 py-0.5 rounded-md truncate max-w-[180px] sm:max-w-[210px] ${item.source === 'explicit' ? 'text-slate-600 bg-slate-100' : 'text-blue-700 bg-blue-50'}`} title={item.url}>
                                                        {item.url}
                                                    </a>
                                                    {item.source === 'fallback' ? (
                                                        <span className="text-[10px] text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">fallback</span>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleDeleteScrapeUrl(org, item.url)}
                                                            disabled={scrapingId !== null || isScrapingAll}
                                                            className={`p-1 rounded ${scrapingId !== null || isScrapingAll ? 'text-slate-300' : 'text-red-500 hover:bg-red-50'} transition-colors`}
                                                            title="Delete this scrape URL"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            )) : <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded-md inline-block">No scrape URLs configured</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0 self-start">
                                        <button
                                            onClick={() => handleScrape(org.id, org.name)}
                                            disabled={scrapingId !== null || isScrapingAll}
                                            className={`p-2 rounded-md ${scrapingId === org.id ? 'bg-slate-100 text-slate-400' : isScrapingAll ? 'bg-slate-50 text-slate-300' : 'bg-ieee-blue/10 text-ieee-blue hover:bg-ieee-blue hover:text-white'} transition-colors`}
                                            title="Fetch & Analyze"
                                        >
                                            <RefreshCw size={16} className={scrapingId === org.id ? 'animate-spin' : ''} />
                                        </button>
                                        <button
                                            onClick={() => handleAddScrapeUrl(org)}
                                            disabled={scrapingId !== null || isScrapingAll}
                                            className={`p-2 rounded-md ${scrapingId !== null || isScrapingAll ? 'bg-slate-50 text-slate-300' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'} transition-colors`}
                                            title="Add Scrape URL"
                                        >
                                            <PlusCircle size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleManageScrapeUrls(org)}
                                            disabled={scrapingId !== null || isScrapingAll}
                                            className={`p-2 rounded-md ${scrapingId !== null || isScrapingAll ? 'bg-slate-50 text-slate-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} transition-colors`}
                                            title="Edit All Scrape URLs"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                    </div>
                                </div>
                                    );
                                })()}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Col - Recent / Manage Opportunities */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 flex justify-between items-center">
                        <div>
                            <h2 className="font-bold text-slate-800 dark:text-slate-100">Recent Opportunities</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Showing up to 100 entries per page.</p>
                        </div>
                        <button
                            onClick={() => setShowModal(true)}
                            className="px-3 py-1.5 rounded text-sm font-medium transition-colors bg-ieee-blue text-white hover:bg-blue-700 shadow-sm flex items-center gap-2"
                        >
                            <PlusCircle size={16} /> Add Manual
                        </button>
                    </div>

                    <div className="overflow-x-auto overflow-y-auto flex-grow">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">Title</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">Organization</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">Type</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">Status</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">Verified</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {opps.map(opp => (
                                    <tr key={opp.id} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="py-3 px-4 max-w-xs block truncate" title={opp.title}>
                                            <span className="font-medium text-slate-800 dark:text-slate-100">{opp.title}</span>
                                        </td>
                                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">{opp.organization?.name || 'Unknown'}</td>
                                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{opp.type}</td>
                                        <td className="py-3 px-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${opp.status === 'Live' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                                                {opp.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            {opp.verified ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs font-semibold rounded-full">
                                                    ✓ Verified
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-400 dark:text-slate-500">Unverified</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleVerifyToggle(opp.id, opp.verified)}
                                                    className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                                                        opp.verified
                                                            ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800'
                                                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                                                    }`}
                                                    title={opp.verified ? 'Remove verification' : 'Mark as verified'}
                                                >
                                                    {opp.verified ? '✓Verify' : 'Verify'}
                                                </button>
                                                {opp.url && (
                                                    <a href={opp.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-ieee-blue dark:text-slate-500 dark:hover:text-blue-400 bg-white dark:bg-slate-700 rounded shadow-sm border border-slate-200 dark:border-slate-600">
                                                        <ExternalLink size={14} />
                                                    </a>
                                                )}
                                                <button onClick={() => handleDelete(opp.id)} className="p-1.5 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 bg-white dark:bg-slate-700 rounded shadow-sm border border-slate-200 dark:border-slate-600">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {opps.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="text-center py-8 text-slate-500">No opportunities found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination Controls */}
                    <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/30 mt-auto">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
                        >
                            Previous
                        </button>
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Page {page} of {totalPages}</span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>

            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h2 className="font-bold text-slate-800">Scrape Health</h2>
                        <p className="text-xs text-slate-500 mt-1">7-day reliability snapshot across organizations.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className={`inline-flex items-center gap-2 text-sm text-slate-700 ${!showScrapeHealth ? 'opacity-50 pointer-events-none' : ''}`}>
                            <input
                                type="checkbox"
                                checked={failedOnly}
                                onChange={(e) => setFailedOnly(e.target.checked)}
                                className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                                disabled={!showScrapeHealth}
                            />
                            Failed only
                        </label>
                        <button
                            onClick={() => setShowScrapeHealth((prev) => !prev)}
                            className="px-3 py-1.5 rounded text-sm font-medium transition-colors bg-slate-200 text-slate-700 hover:bg-slate-300"
                        >
                            {showScrapeHealth ? 'Hide' : 'Expand'}
                        </button>
                    </div>
                </div>

                {showScrapeHealth ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="py-3 px-4 font-semibold text-slate-700 cursor-pointer" onClick={() => setHealthSort('org')}>Org</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700 cursor-pointer" onClick={() => setHealthSort('lastScrape')}>Last Scrape</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700 cursor-pointer" onClick={() => setHealthSort('lastStatus')}>Last Status</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700 cursor-pointer" onClick={() => setHealthSort('success7d')}>Success 7d</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700 cursor-pointer" onClick={() => setHealthSort('failed7d')}>Failed 7d</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700 cursor-pointer" onClick={() => setHealthSort('added7d')}>Added 7d</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700 cursor-pointer" onClick={() => setHealthSort('successRate')}>Success Rate</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700">Last Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredHealthRows.map((row) => (
                                    <tr key={row.organizationId} className="border-t border-slate-100 hover:bg-slate-50">
                                        <td className="py-3 px-4 font-medium text-slate-800">{row.organizationName}</td>
                                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{row.lastScrapedAt ? new Date(row.lastScrapedAt).toLocaleString() : 'Never'}</td>
                                        <td className="py-3 px-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${row.lastStatus === 'success' ? 'bg-green-100 text-green-700' : row.lastStatus === 'failed' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                                {row.lastStatus}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-slate-700">{row.success7d}</td>
                                        <td className="py-3 px-4 text-slate-700">{row.failed7d}</td>
                                        <td className="py-3 px-4 text-slate-700">{row.opportunitiesAdded7d}</td>
                                        <td className="py-3 px-4 text-slate-700">{row.successRate}%</td>
                                        <td className="py-3 px-4 text-slate-600 max-w-[280px] truncate" title={row.lastError || ''}>{row.lastError || '-'}</td>
                                    </tr>
                                ))}
                                {filteredHealthRows.length === 0 && (
                                    <tr>
                                        <td colSpan="8" className="py-8 text-center text-slate-500">No scrape health rows available for the current filter.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="px-4 py-3 text-sm text-slate-500">Collapsed. Click Expand to view scrape metrics.</div>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="font-bold text-slate-800">Duplicate Merge</h2>
                        <p className="text-xs text-slate-500 mt-1">Review likely duplicates, choose a primary record, and merge safely.</p>
                    </div>
                    <button
                        onClick={() => setShowDuplicateMerge((prev) => !prev)}
                        className="px-3 py-1.5 rounded text-sm font-medium transition-colors bg-slate-200 text-slate-700 hover:bg-slate-300"
                    >
                        {showDuplicateMerge ? 'Hide' : 'Expand'}
                    </button>
                </div>

                {showDuplicateMerge ? (
                    <div className="p-4 space-y-4">
                        {duplicateGroups.map((group) => {
                            const selection = duplicateSelection[group.groupId] || {
                                primaryId: group.recommendedPrimaryId,
                                selectedIds: group.candidates.filter(item => item.id !== group.recommendedPrimaryId).map(item => item.id)
                            };

                            return (
                                <div key={group.groupId} className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div>
                                            <p className="font-semibold text-slate-800">{group.organizationName}</p>
                                            <p className="text-xs text-slate-500">{group.candidates.length} candidates in this group</p>
                                        </div>
                                        <button
                                            onClick={() => handleMergeGroup(group)}
                                            disabled={isMergingGroup === group.groupId}
                                            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${isMergingGroup === group.groupId ? 'bg-slate-200 text-slate-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                        >
                                            {isMergingGroup === group.groupId ? 'Merging...' : 'Merge Selected'}
                                        </button>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm border-collapse">
                                            <thead className="bg-white">
                                                <tr>
                                                    <th className="py-2.5 px-3 font-semibold text-slate-700">Primary</th>
                                                    <th className="py-2.5 px-3 font-semibold text-slate-700">Merge</th>
                                                    <th className="py-2.5 px-3 font-semibold text-slate-700">Title</th>
                                                    <th className="py-2.5 px-3 font-semibold text-slate-700">Org</th>
                                                    <th className="py-2.5 px-3 font-semibold text-slate-700">Deadline</th>
                                                    <th className="py-2.5 px-3 font-semibold text-slate-700">Status</th>
                                                    <th className="py-2.5 px-3 font-semibold text-slate-700">Updated</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.candidates.map((candidate) => {
                                                    const isPrimary = selection.primaryId === candidate.id;
                                                    const isSelected = selection.selectedIds.includes(candidate.id);
                                                    return (
                                                        <tr key={candidate.id} className="border-t border-slate-100 hover:bg-slate-50">
                                                            <td className="py-2.5 px-3">
                                                                <input
                                                                    type="radio"
                                                                    name={`primary-${group.groupId}`}
                                                                    checked={isPrimary}
                                                                    onChange={() => updateDuplicatePrimary(group.groupId, candidate.id)}
                                                                />
                                                            </td>
                                                            <td className="py-2.5 px-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    disabled={isPrimary}
                                                                    onChange={() => toggleDuplicateCandidate(group.groupId, candidate.id)}
                                                                />
                                                            </td>
                                                            <td className="py-2.5 px-3 max-w-[260px] truncate" title={candidate.title}>{candidate.title}</td>
                                                            <td className="py-2.5 px-3 text-slate-600">{candidate.organizationName}</td>
                                                            <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{candidate.deadline ? new Date(candidate.deadline).toLocaleDateString() : '-'}</td>
                                                            <td className="py-2.5 px-3 text-slate-600">{candidate.status || '-'}</td>
                                                            <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{new Date(candidate.updatedAt).toLocaleString()}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}

                        {duplicateGroups.length === 0 && (
                            <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4">
                                No duplicate groups detected right now.
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="px-4 py-3 text-sm text-slate-500">Collapsed. Click Expand to review duplicate candidate groups.</div>
                )}
            </div>

            {/* Manual Entry Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-xl font-bold text-slate-800">Add Manual Opportunity</h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 bg-white p-1 rounded-full border border-slate-200 shadow-sm transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleModalSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1 md:col-span-2">
                                    <label htmlFor="manual-org" className="text-sm font-semibold text-slate-700">Organization / Society <span className="text-red-500">*</span></label>
                                    <select
                                        id="manual-org"
                                        name="organizationId"
                                        required
                                        className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20 bg-white"
                                        value={formData.organizationId}
                                        onChange={(e) => setFormData({ ...formData, organizationId: e.target.value })}
                                    >
                                        <option value="">Select an organization...</option>
                                        {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                    </select>
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <label htmlFor="manual-title" className="text-sm font-semibold text-slate-700">Title <span className="text-red-500">*</span></label>
                                    <input id="manual-title" name="title" type="text" required className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. IEEE Global Student Hardware Competition" />
                                </div>

                                <div className="space-y-1">
                                    <label htmlFor="manual-type" className="text-sm font-semibold text-slate-700">Type <span className="text-red-500">*</span></label>
                                    <select id="manual-type" name="type" required className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20 bg-white" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                        <option value="Competition">Competition</option>
                                        <option value="Hackathon">Hackathon</option>
                                        <option value="Grant">Grant</option>
                                        <option value="Paper Contest">Paper Contest</option>
                                        <option value="Fellowship">Fellowship</option>
                                        <option value="Scholarship">Scholarship</option>
                                        <option value="Workshop">Workshop</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label htmlFor="manual-status" className="text-sm font-semibold text-slate-700">Status <span className="text-red-500">*</span></label>
                                    <select id="manual-status" name="status" required className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20 bg-white" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                        <option value="Live">Live</option>
                                        <option value="Upcoming">Upcoming</option>
                                        <option value="Closed">Closed</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label htmlFor="manual-deadline" className="text-sm font-semibold text-slate-700">Deadline (Optional)</label>
                                    <input id="manual-deadline" name="deadline" type="date" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20" value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })} />
                                </div>

                                <div className="space-y-1">
                                    <label htmlFor="manual-url" className="text-sm font-semibold text-slate-700">Official Link (Optional)</label>
                                    <input id="manual-url" name="url" type="url" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20" value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })} placeholder="https://..." />
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <label htmlFor="manual-description" className="text-sm font-semibold text-slate-700">Description <span className="text-red-500">*</span></label>
                                    <textarea id="manual-description" name="description" required rows="3" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the opportunity..."></textarea>
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                    <label htmlFor="manual-eligibility" className="text-sm font-semibold text-slate-700">Eligibility (Optional)</label>
                                    <textarea id="manual-eligibility" name="eligibility" rows="2" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20" value={formData.eligibility} onChange={e => setFormData({ ...formData, eligibility: e.target.value })} placeholder="Who can apply?"></textarea>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-ieee-blue text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2">
                                    {isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : <PlusCircle size={18} />}
                                    {isSubmitting ? 'Saving...' : 'Save Opportunity'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
