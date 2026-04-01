import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const getStats = () => api.get('/stats').then(res => res.data);
export const getOrganizations = () => api.get('/organizations').then(res => res.data);
export const getOpportunities = (params) => api.get('/opportunities', { params }).then(res => res.data);
export const getOpportunity = (id) => api.get(`/opportunities/${id}`).then(res => res.data);

// Admin
export const login = (credentials) => api.post('/admin/login', credentials).then(res => res.data);
export const triggerScrape = (orgId) => api.post(`/admin/scrape/${orgId}`).then(res => res.data);
export const createOpportunity = (data) => api.post('/admin/opportunities', data).then(res => res.data);
export const updateOpportunity = (id, data) => api.put(`/admin/opportunities/${id}`, data).then(res => res.data);
export const deleteOpportunity = (id) => api.delete(`/admin/opportunities/${id}`).then(res => res.data);
export const verifyOpportunity = (id, verified) => api.post(`/admin/opportunities/${id}/verify`, { verified }).then(res => res.data);
export const createOrganization = (data) => api.post('/admin/organizations', data).then(res => res.data);
export const updateOrganization = (id, data) => api.put(`/admin/organizations/${id}`, data).then(res => res.data);
export const addOrganizationScrapeUrl = (id, url) => api.post(`/admin/organizations/${id}/scrape-urls`, { url }).then(res => res.data);
export const deleteOrganizationScrapeUrl = (id, url) => api.delete(`/admin/organizations/${id}/scrape-urls`, { data: { url } }).then(res => res.data);
export const getScrapeHealth = () => api.get('/admin/scrape-health').then(res => res.data);
export const getDuplicateGroups = () => api.get('/admin/duplicates').then(res => res.data);
export const mergeDuplicates = (payload) => api.post('/admin/duplicates/merge', payload).then(res => res.data);

export default api;
