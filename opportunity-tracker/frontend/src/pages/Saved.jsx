import React, { useState, useEffect } from 'react';
import { BookmarkMinus } from 'lucide-react';
import OpportunityCard from '../components/OpportunityCard';

export default function Saved() {
    const [saved, setSaved] = useState([]);

    useEffect(() => {
        const loadSaved = () => {
            const savedItems = JSON.parse(localStorage.getItem('savedOpportunities') || '[]');
            setSaved(savedItems);
        };

        loadSaved();

        // Listen for custom event or storage changes if we want real-time across tabs
        window.addEventListener('storage', loadSaved);
        return () => window.removeEventListener('storage', loadSaved);
    }, []);

    const handleUnsaveAll = () => {
        if (confirm('Are you sure you want to clear all your saved opportunities?')) {
            localStorage.setItem('savedOpportunities', '[]');
            setSaved([]);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6 mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Saved For Later</h1>
                    <p className="text-slate-500 mt-1">Opportunities you've bookmarked.</p>
                </div>
                {saved.length > 0 && (
                    <button
                        onClick={handleUnsaveAll}
                        className="flex items-center gap-2 text-sm text-red-600 hover:text-red-800 font-medium px-4 py-2 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                    >
                        <BookmarkMinus size={18} /> Clear All
                    </button>
                )}
            </div>

            {saved.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {saved.map(opp => (
                        <OpportunityCard
                            key={opp.id}
                            opportunity={opp}
                            onSaveToggle={() => {
                                // Refresh list instantly when card toggles it off
                                setSaved(JSON.parse(localStorage.getItem('savedOpportunities') || '[]'));
                            }}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BookmarkMinus className="h-8 w-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">No saved opportunities</h3>
                    <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                        When you see something interesting on the feed, click the bookmark icon to save it here for quick access later.
                    </p>
                </div>
            )}
        </div>
    );
}
