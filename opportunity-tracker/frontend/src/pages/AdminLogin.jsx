import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';
import { Lock } from 'lucide-react';

export default function AdminLogin() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await login({ username, password });
            localStorage.setItem('token', res.token);
            navigate('/admin');
        } catch (err) {
            setError('Invalid username or password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[80vh] flex items-center justify-center bg-slate-50 dark:bg-slate-900">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 w-full max-w-md">
                <div className="w-16 h-16 bg-ieee-blue/10 dark:bg-ieee-blue/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Lock className="text-ieee-blue w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black text-center text-slate-900 dark:text-slate-100 mb-2">Admin Access</h2>
                <p className="text-center text-slate-500 dark:text-slate-400 mb-8">Sign in to manage opportunities</p>

                {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm mb-6 text-center border border-red-200 dark:border-red-800">{error}</div>}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label htmlFor="admin-username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Username</label>
                        <input
                            id="admin-username"
                            name="username"
                            type="text"
                            required
                            autoComplete="username"
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-ieee-blue focus:border-ieee-blue dark:focus:ring-blue-400 dark:focus:border-blue-400 outline-none transition-all"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter your username"
                        />
                    </div>
                    <div>
                        <label htmlFor="admin-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
                        <input
                            id="admin-password"
                            name="password"
                            type="password"
                            required
                            autoComplete="current-password"
                            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-ieee-blue focus:border-ieee-blue dark:focus:ring-blue-400 dark:focus:border-blue-400 outline-none transition-all"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-ieee-blue hover:bg-blue-600 dark:hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mt-4 shadow-md flex justify-center items-center disabled:opacity-60"
                    >
                        {loading ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span> : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}
