import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrganizations, triggerScrape, getOpportunities, deleteOpportunity, createOpportunity } from '../services/api';
import { Activity, Trash2, ExternalLink, RefreshCw, LogOut, PlusCircle, X } from 'lucide-react';

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
    }, [navigate, page]);

    const fetchData = async () => {
        try {
            const [orgsData, oppsData] = await Promise.all([
                getOrganizations(),
                getOpportunities({ limit: 100, page })
            ]);
            setOrgs(orgsData);
            setOpps(oppsData.data);
            setTotalPages(oppsData.pagination?.totalPages || 1);
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
                        <button
                            onClick={handleScrapeAll}
                            disabled={isScrapingAll || scrapingId !== null}
                            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${isScrapingAll ? 'bg-slate-200 text-slate-500' : 'bg-ieee-blue text-white hover:bg-blue-700 shadow-sm'}`}
                        >
                            {isScrapingAll ? 'Scraping...' : 'Scrape All'}
                        </button>
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
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold text-sm text-slate-800">{org.name}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Last: {org.lastScrapedAt ? new Date(org.lastScrapedAt).toLocaleString() : 'Never'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleScrape(org.id, org.name)}
                                        disabled={scrapingId !== null || isScrapingAll}
                                        className={`p-2 rounded-md ${scrapingId === org.id ? 'bg-slate-100 text-slate-400' : isScrapingAll ? 'bg-slate-50 text-slate-300' : 'bg-ieee-blue/10 text-ieee-blue hover:bg-ieee-blue hover:text-white'} transition-colors`}
                                        title="Fetch & Analyze"
                                    >
                                        <RefreshCw size={16} className={scrapingId === org.id ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Col - Recent / Manage Opportunities */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <div>
                            <h2 className="font-bold text-slate-800">Recent Opportunities</h2>
                            <p className="text-xs text-slate-500 mt-1">Showing up to 100 entries per page.</p>
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
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="py-3 px-4 font-semibold text-slate-700">Title</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700">Type</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700">Status</th>
                                    <th className="py-3 px-4 font-semibold text-slate-700">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {opps.map(opp => (
                                    <tr key={opp.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-3 px-4 max-w-xs block truncate" title={opp.title}>
                                            <span className="font-medium text-slate-800">{opp.title}</span>
                                        </td>
                                        <td className="py-3 px-4 text-slate-600">{opp.type}</td>
                                        <td className="py-3 px-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${opp.status === 'Live' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                                {opp.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex gap-2">
                                                {opp.url && (
                                                    <a href={opp.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-ieee-blue bg-white rounded shadow-sm border border-slate-200">
                                                        <ExternalLink size={14} />
                                                    </a>
                                                )}
                                                <button onClick={() => handleDelete(opp.id)} className="p-1.5 text-slate-400 hover:text-red-600 bg-white rounded shadow-sm border border-slate-200">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {opps.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="text-center py-8 text-slate-500">No opportunities found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination Controls */}
                    <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50 mt-auto">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
                        >
                            Previous
                        </button>
                        <span className="text-sm font-medium text-slate-600">Page {page} of {totalPages}</span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>

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
                                    <label className="text-sm font-semibold text-slate-700">Organization / Society <span className="text-red-500">*</span></label>
                                    <select
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
                                    <label className="text-sm font-semibold text-slate-700">Title <span className="text-red-500">*</span></label>
                                    <input type="text" required className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. IEEE Global Student Hardware Competition" />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-semibold text-slate-700">Type <span className="text-red-500">*</span></label>
                                    <select required className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20 bg-white" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
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
                                    <label className="text-sm font-semibold text-slate-700">Status <span className="text-red-500">*</span></label>
                                    <select required className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20 bg-white" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                        <option value="Live">Live</option>
                                        <option value="Upcoming">Upcoming</option>
                                        <option value="Closed">Closed</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-semibold text-slate-700">Deadline (Optional)</label>
                                    <input type="date" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20" value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })} />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-semibold text-slate-700">Official Link (Optional)</label>
                                    <input type="url" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20" value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })} placeholder="https://..." />
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-sm font-semibold text-slate-700">Description <span className="text-red-500">*</span></label>
                                    <textarea required rows="3" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the opportunity..."></textarea>
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-sm font-semibold text-slate-700">Eligibility (Optional)</label>
                                    <textarea rows="2" className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/20" value={formData.eligibility} onChange={e => setFormData({ ...formData, eligibility: e.target.value })} placeholder="Who can apply?"></textarea>
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
