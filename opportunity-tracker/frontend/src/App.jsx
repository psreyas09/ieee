import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';

// Page Imports
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Opportunities = lazy(() => import('./pages/Opportunities'));
const Directory = lazy(() => import('./pages/Directory'));
const Saved = lazy(() => import('./pages/Saved'));
const OpportunityDetail = lazy(() => import('./pages/OpportunityDetail'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

function RouteLoadingFallback() {
    return (
        <div className="py-12">
            <div className="h-10 w-72 bg-slate-100 rounded-lg animate-pulse mb-4"></div>
            <div className="h-5 w-96 max-w-full bg-slate-100 rounded animate-pulse"></div>
        </div>
    );
}

function App() {
    return (
        <Layout>
            <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/opportunities" element={<Opportunities />} />
                    <Route path="/opportunities/:id" element={<OpportunityDetail />} />
                    <Route path="/directory" element={<Directory />} />
                    <Route path="/saved" element={<Saved />} />
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/admin/login" element={<AdminLogin />} />
                </Routes>
            </Suspense>
        </Layout>
    );
}

export default App;
