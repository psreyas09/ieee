import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getOpportunity } from '../services/api';
import { ArrowLeft, Calendar, Building, Globe, CheckCircle } from 'lucide-react';
import { getRegionRestriction } from '../utils/regionRestriction';
import { getCostInfo } from '../utils/costClassification';

export default function OpportunityDetail() {
    const { id } = useParams();
    const [opp, setOpp] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        getOpportunity(id)
            .then(setOpp)
            .catch(err => setError('Opportunity not found or API error.'))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return <div className="py-20 text-center animate-pulse text-slate-500">Loading details...</div>;
    if (error || !opp) return <div className="py-20 text-center text-red-500">{error}</div>;

    const regionRestriction = getRegionRestriction(opp);
    const costInfo = getCostInfo(opp);

    const getCostTone = (tone) => {
        if (tone === 'free') {
            return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700';
        }
        if (tone === 'paid') {
            return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700';
        }
        if (tone === 'reimbursement') {
            return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700';
        }
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600';
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <Link to="/opportunities" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-ieee-blue mb-4">
                <ArrowLeft size={16} /> Back to feed
            </Link>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b border-slate-200 dark:border-slate-700 p-8 md:p-10">
                    <div className="flex flex-wrap gap-2 mb-4">
                        <span className="text-sm font-semibold px-3 py-1 rounded-full bg-ieee-blue/10 dark:bg-ieee-blue/20 text-ieee-blue dark:text-blue-300 border border-ieee-blue/20 dark:border-blue-700/40">
                            {opp.type}
                        </span>
                        {costInfo.label !== 'Unspecified' && (
                            <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${getCostTone(costInfo.tone)}`} title={costInfo.label}>
                                {costInfo.label.length > 25 ? costInfo.label.substring(0, 22) + '...' : costInfo.label}
                            </span>
                        )}
                        <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${opp.status === 'Live' ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-700' : 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'}`}>
                            {opp.status.toUpperCase()}
                        </span>
                        {opp.verified && (
                            <span className="flex items-center gap-1 text-sm font-medium px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                                <CheckCircle size={14} className="text-blue-500 dark:text-blue-300" /> Verified
                            </span>
                        )}
                        {regionRestriction.isRestricted && (
                            <span className="text-sm font-semibold px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700" title={regionRestriction.label}>
                                {regionRestriction.label}
                            </span>
                        )}
                    </div>

                    <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-slate-100 leading-tight mb-6">
                        {opp.title}
                    </h1>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-3">
                            <div className="bg-white dark:bg-slate-800 p-2 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700"><Building size={20} className="text-ieee-blue" /></div>
                            <div>
                                <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Organization</p>
                                <p className="font-medium text-slate-900 dark:text-slate-100">{opp.organization?.name}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="bg-white dark:bg-slate-800 p-2 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700"><Calendar size={20} className="text-orange-500" /></div>
                            <div>
                                <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Deadline</p>
                                <p className="font-medium text-slate-900 dark:text-slate-100">
                                    {opp.deadline ? new Date(opp.deadline).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Not specified or Open'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-8 md:p-10 space-y-8">
                    <section>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                            <span className="w-8 h-1 bg-ieee-blue rounded-full absolute -ml-12 hidden md:block"></span>
                            Description
                        </h2>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed">
                            <p className="whitespace-pre-wrap">{opp.description || "No detailed description was parsed. Please visit the official link for more info."}</p>
                        </div>
                    </section>

                    {opp.eligibility && (
                        <section className="bg-slate-50 dark:bg-slate-900 rounded-xl p-6 border border-slate-100 dark:border-slate-700">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">Eligibility Criteria</h2>
                            <p className="text-slate-700 dark:text-slate-300">{opp.eligibility}</p>
                        </section>
                    )}

                    <div className="pt-8 flex flex-col sm:flex-row gap-4">
                        {opp.url ? (
                            <a
                                href={opp.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex justify-center items-center gap-2 bg-ieee-blue hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-md hover:shadow-lg"
                            >
                                Apply / Visit Official Page <Globe size={20} />
                            </a>
                        ) : (
                            <button disabled className="flex-1 flex justify-center items-center gap-2 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-bold py-4 px-6 rounded-xl cursor-not-allowed">
                                No Link Provided
                            </button>
                        )}
                    </div>

                    <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8 pt-6 border-t border-slate-100 dark:border-slate-700">
                        Source: {opp.source === 'auto' ? 'AI Fetched' : 'Manually Added'} •
                        Last Updated: {new Date(opp.updatedAt).toLocaleDateString()}
                    </div>
                </div>
            </div>
        </div>
    );
}
