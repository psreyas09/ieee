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
        <div className="min-h-[80vh] flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 w-full max-w-md">
                <div className="w-16 h-16 bg-ieee-blue/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Lock className="text-ieee-blue w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black text-center text-slate-900 mb-2">Admin Access</h2>
                <p className="text-center text-slate-500 mb-8">Sign in to manage opportunities</p>

                {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-6 text-center">{error}</div>}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                        <input
                            type="text"
                            required
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-ieee-blue focus:border-ieee-blue outline-none transition-all"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                        <input
                            type="password"
                            required
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-ieee-blue focus:border-ieee-blue outline-none transition-all"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-ieee-blue hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-colors mt-4 shadow-md flex justify-center items-center"
                    >
                        {loading ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span> : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}
