import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Bookmark, Building, ChevronRight, CheckCircle } from 'lucide-react';
import { getRegionRestriction } from '../utils/regionRestriction';
import { getCostInfo } from '../utils/costClassification';

export default function OpportunityCard({ opportunity, onSaveToggle }) {
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const savedItems = JSON.parse(localStorage.getItem('savedOpportunities') || '[]');
        setSaved(savedItems.some(item => item.id === opportunity.id));
    }, [opportunity.id]);

    const handleSave = (e) => {
        e.preventDefault();
        const savedItems = JSON.parse(localStorage.getItem('savedOpportunities') || '[]');
        if (saved) {
            const filtered = savedItems.filter(item => item.id !== opportunity.id);
            localStorage.setItem('savedOpportunities', JSON.stringify(filtered));
            setSaved(false);
        } else {
            savedItems.push(opportunity);
            localStorage.setItem('savedOpportunities', JSON.stringify(savedItems));
            setSaved(true);
        }
        if (onSaveToggle) onSaveToggle();
    };

    const getDaysLeft = (deadline) => {
        if (!deadline) return null;
        const diff = new Date(deadline) - new Date();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return days;
    };

    const daysLeft = getDaysLeft(opportunity.deadline);
    const regionRestriction = getRegionRestriction(opportunity);
    const costInfo = getCostInfo(opportunity);

    const getCostTone = (tone) => {
        if (tone === 'free') {
            return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700';
        }
        if (tone === 'paid') {
            return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700';
        }
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600';
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Live': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-700';
            case 'Upcoming': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700';
            case 'Closed': return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600';
            case 'Closing Soon': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-300 dark:border-orange-700';
            default: return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600';
        }
    };

    // Override status if deadline is very close
    const displayStatus = (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7) ? 'Closing Soon' : opportunity.status;

    return (
        <Link to={`/opportunities/${opportunity.id}`} className="block group">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:shadow-md transition-all h-full flex flex-col relative overflow-hidden">
                {displayStatus === 'Closing Soon' && (
                    <div className="absolute top-0 right-0 left-0 h-1 bg-orange-400"></div>
                )}

                <div className="flex justify-between items-start mb-3 gap-2">
                    <div className="flex flex-wrap gap-2">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusColor(displayStatus)}`}>
                            {displayStatus.toUpperCase()}
                        </span>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                            {opportunity.type}
                        </span>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${getCostTone(costInfo.tone)}`}>
                            {costInfo.label}
                        </span>
                        {opportunity.verified && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                                <CheckCircle size={12} /> Verified
                            </span>
                        )}
                        {regionRestriction.isRestricted && (
                            <span
                                className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700"
                                title={regionRestriction.label}
                            >
                                {regionRestriction.label.toUpperCase()}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={handleSave}
                        className={`p-1.5 rounded-full transition-colors ${saved ? 'bg-ieee-blue/10 dark:bg-ieee-blue/20 text-ieee-blue dark:text-blue-300' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200'}`}
                    >
                        <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} />
                    </button>
                </div>

                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2 group-hover:text-ieee-blue transition-colors line-clamp-2">
                    {opportunity.title}
                </h3>

                <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 mb-4 font-medium">
                    <Building size={16} className="text-slate-400 dark:text-slate-500" />
                    <span className="truncate">{opportunity.organization?.name || 'Unknown Organization'}</span>
                </div>

                <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 line-clamp-3 flex-grow">
                    {opportunity.description || 'No description available for this opportunity.'}
                </p>

                <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                        {opportunity.deadline ? (
                            <div className={`flex items-center gap-1.5 ${daysLeft !== null && daysLeft <= 7 && daysLeft >= 0 ? 'text-orange-600 dark:text-orange-300 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                                <Calendar size={16} />
                                <span>
                                    {new Date(opportunity.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                <Clock size={16} />
                                <span>No Deadline</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center text-ieee-blue font-semibold text-sm group-hover:translate-x-1 transition-transform">
                        View <ChevronRight size={16} />
                    </div>
                </div>
            </div>
        </Link>
    );
}
