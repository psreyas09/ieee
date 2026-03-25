import React, { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, List, Users, Bookmark, Settings, SlidersHorizontal, Moon, Sun } from 'lucide-react';
import PreferencesModal from './PreferencesModal';
import { getStoredPreferences, hasStoredPreferences, savePreferences } from '../utils/preferences';

export default function Layout({ children }) {
    const [theme, setTheme] = useState('light');
    const [showPreferencesModal, setShowPreferencesModal] = useState(false);
    const [preferences, setPreferences] = useState(getStoredPreferences());

    useEffect(() => {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme === 'dark' || storedTheme === 'light') {
            setTheme(storedTheme);
            return;
        }

        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        if (!hasStoredPreferences()) {
            setShowPreferencesModal(true);
        }
    }, []);

    useEffect(() => {
        const openPreferences = () => setShowPreferencesModal(true);
        window.addEventListener('open-preferences-modal', openPreferences);
        return () => window.removeEventListener('open-preferences-modal', openPreferences);
    }, []);

    const handleSavePreferences = (nextPreferences) => {
        const saved = savePreferences(nextPreferences);
        setPreferences(saved);
        setShowPreferencesModal(false);
    };

    const toggleTheme = () => {
        setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans transition-colors duration-200">
            <header className="bg-ieee-navy text-white shadow-md sticky top-0 z-50 px-4 py-3 transition-colors duration-200">
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

                    <div className="flex items-center gap-2 md:gap-4 overflow-x-auto pb-1 md:pb-0">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors"
                            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                            <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowPreferencesModal(true)}
                            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors"
                            title="Change your preferences"
                            aria-label="Change your preferences"
                        >
                            <SlidersHorizontal size={16} />
                            <span className="hidden sm:inline">Preferences</span>
                        </button>

                        <nav className="flex items-center gap-1 md:gap-4">
                        <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" />
                        <NavItem to="/opportunities" icon={<List size={20} />} label="Feed" />
                        <NavItem to="/directory" icon={<Users size={20} />} label="Directory" />
                        <NavItem to="/saved" icon={<Bookmark size={20} />} label="Saved" />
                        <NavItem to="/admin" icon={<Settings size={20} />} label="Admin" />
                        </nav>
                    </div>
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

            <PreferencesModal
                isOpen={showPreferencesModal}
                initialPreferences={preferences}
                onSave={handleSavePreferences}
                onClose={() => setShowPreferencesModal(false)}
            />
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
