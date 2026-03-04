import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getOpportunity } from '../services/api';
import { ArrowLeft, Calendar, Building, Globe, CheckCircle } from 'lucide-react';

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

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <Link to="/opportunities" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-ieee-blue mb-4">
                <ArrowLeft size={16} /> Back to feed
            </Link>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 p-8 md:p-10">
                    <div className="flex flex-wrap gap-2 mb-4">
                        <span className="text-sm font-semibold px-3 py-1 rounded-full bg-ieee-blue/10 text-ieee-blue border border-ieee-blue/20">
                            {opp.type}
                        </span>
                        <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${opp.status === 'Live' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                            {opp.status.toUpperCase()}
                        </span>
                        {opp.verified && (
                            <span className="flex items-center gap-1 text-sm font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                <CheckCircle size={14} className="text-blue-500" /> Verified
                            </span>
                        )}
                    </div>

                    <h1 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight mb-6">
                        {opp.title}
                    </h1>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-100"><Building size={20} className="text-ieee-blue" /></div>
                            <div>
                                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Organization</p>
                                <p className="font-medium text-slate-900">{opp.organization?.name}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-100"><Calendar size={20} className="text-orange-500" /></div>
                            <div>
                                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Deadline</p>
                                <p className="font-medium text-slate-900">
                                    {opp.deadline ? new Date(opp.deadline).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Not specified or Open'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-8 md:p-10 space-y-8">
                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <span className="w-8 h-1 bg-ieee-blue rounded-full absolute -ml-12 hidden md:block"></span>
                            Description
                        </h2>
                        <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed">
                            <p className="whitespace-pre-wrap">{opp.description || "No detailed description was parsed. Please visit the official link for more info."}</p>
                        </div>
                    </section>

                    {opp.eligibility && (
                        <section className="bg-slate-50 rounded-xl p-6 border border-slate-100">
                            <h2 className="text-lg font-bold text-slate-900 mb-3">Eligibility Criteria</h2>
                            <p className="text-slate-700">{opp.eligibility}</p>
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
                            <button disabled className="flex-1 flex justify-center items-center gap-2 bg-slate-200 text-slate-500 font-bold py-4 px-6 rounded-xl cursor-not-allowed">
                                No Link Provided
                            </button>
                        )}
                    </div>

                    <div className="text-center text-xs text-slate-400 mt-8 pt-6 border-t border-slate-100">
                        Source: {opp.source === 'auto' ? 'AI Fetched' : 'Manually Added'} •
                        Last Updated: {new Date(opp.updatedAt).toLocaleDateString()}
                    </div>
                </div>
            </div>
        </div>
    );
}
