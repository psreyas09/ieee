import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Activity, TrendingUp, Users, AlertCircle } from 'lucide-react';
import { getStats, getOpportunities } from '../services/api';
import OpportunityCard from '../components/OpportunityCard';
import HeroGlobe from '../components/HeroGlobe';

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [urgent, setUrgent] = useState([]);
    const [statsLoading, setStatsLoading] = useState(true);
    const [urgentLoading, setUrgentLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [statsData, urgentData] = await Promise.all([
                    getStats(),
                    getOpportunities({ status: 'Live', limit: 4 }) // Simplifying urgent fetch for now
                ]);
                setStats(statsData);
                // Filter locally for closing within 7 days if API didn't perfectly handle
                const filteredUrgent = urgentData.data.filter(opp => {
                    if (!opp.deadline) return false;
                    const days = (new Date(opp.deadline) - new Date()) / (1000 * 60 * 60 * 24);
                    return days >= 0 && days <= 7;
                });

                // If not enough urgent, just show soonest
                setUrgent(filteredUrgent.length > 0 ? filteredUrgent : urgentData.data);
            } catch (err) {
                console.error(err);
            } finally {
                setStatsLoading(false);
                setUrgentLoading(false);
            }
        };
        fetchData();
    }, []);

    const showClosingSoon = urgentLoading || urgent.length > 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <section className="bg-gradient-to-r from-ieee-navy to-[#0f2342] rounded-2xl p-8 md:p-12 text-white shadow-lg relative overflow-hidden w-full flex flex-col md:flex-row items-center justify-between min-h-[400px]">
                <div className="relative z-10 max-w-2xl">
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold mb-4 tracking-tight leading-tight min-h-[88px] md:min-h-[110px]">Discover Your Next <br className="hidden md:block" /> Big Opportunity</h2>
                    <p className="text-lg md:text-xl text-slate-300 mb-8 leading-relaxed max-w-xl">
                        Welcome to the global centralized hub for IEEE student members. Find hackathons, paper contests, and grants curated specifically for you.
                    </p>
                    <Link to="/opportunities" className="inline-flex items-center gap-2 bg-ieee-blue hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-md">
                        Browse All Opportunities <ArrowRight size={20} />
                    </Link>
                </div>

                <div className="hidden md:flex relative z-10 w-[400px] h-[400px] flex-shrink-0 items-center justify-center">
                    <HeroGlobe />
                </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Tracked" value={statsLoading ? '...' : (stats?.totalOpportunities || 0)} icon={<Activity />} color="bg-blue-50 text-blue-600" />
                <StatCard title="Active Now" value={statsLoading ? '...' : (stats?.activeOpportunities || 0)} icon={<TrendingUp />} color="bg-green-50 text-green-600" />
                <StatCard title="Closing This Week" value={statsLoading ? '...' : (stats?.closingSoon || 0)} icon={<AlertCircle />} color="bg-orange-50 text-orange-600" />
                <StatCard title="Organizations" value={statsLoading ? '...' : (stats?.societiesCovered || 0)} icon={<Users />} color="bg-purple-50 text-purple-600" />
            </section>

            {showClosingSoon && (
                <section>
                    <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-2">
                        <h3 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
                            <AlertCircle className="text-orange-500" />
                            Closing Soon
                        </h3>
                        <Link to="/opportunities" className="text-ieee-blue font-medium hover:underline text-sm md:text-base">View all</Link>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {urgentLoading ? (
                            [1, 2, 3].map((key) => (
                                <div key={key} className="bg-white border border-slate-200 rounded-xl h-56 animate-pulse" />
                            ))
                        ) : (
                            urgent.map(opp => (
                                <OpportunityCard key={opp.id} opportunity={opp} />
                            ))
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}

function StatCard({ title, value, icon, color }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4">
            <div className={`p-4 rounded-lg ${color}`}>
                {icon}
            </div>
            <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
                <p className="text-3xl font-black text-slate-900">{value}</p>
            </div>
        </div>
    );
}
