import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';

// Page Imports
import Dashboard from './pages/Dashboard';
import Opportunities from './pages/Opportunities';
import Directory from './pages/Directory';
import Saved from './pages/Saved';
import OpportunityDetail from './pages/OpportunityDetail';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';

function App() {
    return (
        <Layout>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/opportunities" element={<Opportunities />} />
                <Route path="/opportunities/:id" element={<OpportunityDetail />} />
                <Route path="/directory" element={<Directory />} />
                <Route path="/saved" element={<Saved />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/login" element={<AdminLogin />} />
            </Routes>
        </Layout>
    );
}

export default App;
