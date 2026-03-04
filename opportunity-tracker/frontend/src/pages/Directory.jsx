import React, { useState, useEffect } from 'react';
import { getOrganizations } from '../services/api';
import { Globe, Clock, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Directory() {
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('society'); // 'society' or 'council'

    useEffect(() => {
        getOrganizations().then(data => {
            setOrgs(data);
            setLoading(false);
        }).catch(console.error);
    }, []);

    const filteredOrgs = orgs.filter(o => o.type === activeTab);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Organization Directory</h1>
                    <p className="text-slate-500 mt-1">Browse all 39 IEEE Societies and 8 Technical Councils.</p>
                </div>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-lg w-full max-w-md mx-auto md:mx-0">
                <button
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-shadow ${activeTab === 'society' ? 'bg-white text-ieee-blue shadow' : 'text-slate-600 hover:text-slate-900'}`}
                    onClick={() => setActiveTab('society')}
                >
                    Societies ({orgs.filter(o => o.type === 'society').length})
                </button>
                <button
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-shadow ${activeTab === 'council' ? 'bg-white text-purple-600 shadow' : 'text-slate-600 hover:text-slate-900'}`}
                    onClick={() => setActiveTab('council')}
                >
                    Councils ({orgs.filter(o => o.type === 'council').length})
                </button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-40 bg-slate-100 rounded-xl animate-pulse"></div>)}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredOrgs.map(org => (
                        <div key={org.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col hover:border-ieee-blue transition-colors">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-lg font-bold text-slate-900 leading-tight pr-4">{org.name}</h3>
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
