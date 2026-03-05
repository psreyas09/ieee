import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, List, Users, Bookmark, Settings } from 'lucide-react';

export default function Layout({ children }) {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <header className="bg-ieee-navy text-white shadow-md sticky top-0 z-50 px-4 py-3">
                <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
                    <Link to="/" className="flex items-center gap-4 hover:opacity-90 transition-opacity">
                        <div className="text-ieee-blue font-black text-2xl tracking-tight bg-white p-2 rounded shadow-sm">
                            IEEE
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-bold leading-tight">Global</h1>
                            <p className="text-sm md:text-base text-ieee-gold font-medium">Opportunity Tracker</p>
                        </div>
                    </Link>

                    <nav className="flex items-center gap-1 md:gap-4 overflow-x-auto pb-1 md:pb-0">
                        <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" />
                        <NavItem to="/opportunities" icon={<List size={20} />} label="Feed" />
                        <NavItem to="/directory" icon={<Users size={20} />} label="Directory" />
                        <NavItem to="/saved" icon={<Bookmark size={20} />} label="Saved" />
                        <NavItem to="/admin" icon={<Settings size={20} />} label="Admin" />
                    </nav>
                </div>
            </header>

            <main className="flex-grow w-full max-w-7xl mx-auto p-4 md:p-8">
                {children}
            </main>

            <footer className="bg-ieee-navy text-slate-400 py-6 mt-12">
                <div className="max-w-7xl mx-auto px-4 text-center text-sm flex flex-col items-center gap-2">
                    <p>© {new Date().getFullYear()} IEEE. All rights reserved.</p>
                    <p>This platform automatically aggregates public opportunities for students.</p>
                </div>
            </footer>
        </div>
    );
}

function NavItem({ to, icon, label }) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) => `
        flex items-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-colors whitespace-nowrap
        ${isActive ? 'bg-ieee-blue text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}
      `}
        >
            {icon}
            <span className="hidden sm:inline">{label}</span>
        </NavLink>
    );
}
