import { api } from './client.js';

const data = (p) => p.then((r) => r.data);

export const authApi = {
  config: () => data(api.get('/auth/config')),
  login: (body) => data(api.post('/auth/login', body)),
  register: (body) => data(api.post('/auth/register', body)),
  me: () => data(api.get('/auth/me')),
  updateProfile: (body) => data(api.put('/auth/me', body)),
  changePassword: (body) => data(api.put('/auth/password', body)),
};

export const applicationsApi = {
  list: (params) => data(api.get('/applications', { params })),
  get: (id) => data(api.get(`/applications/${id}`)),
  create: (body, { force } = {}) => data(api.post('/applications', body, { params: force ? { force: true } : undefined })),
  update: (id, body) => data(api.put(`/applications/${id}`, body)),
  remove: (id) => data(api.delete(`/applications/${id}`)),
  setStatus: (id, status, note) => data(api.patch(`/applications/${id}/status`, { status, note })),
  duplicate: (id) => data(api.post(`/applications/${id}/duplicate`)),
  addNote: (id, message) => data(api.post(`/applications/${id}/notes`, { message })),
  tags: () => data(api.get('/applications/tags')),
};

export const resumesApi = {
  list: (params) => data(api.get('/resumes', { params })),
  get: (id) => data(api.get(`/resumes/${id}`)),
  upload: (formData, onUploadProgress) => data(api.post('/resumes', formData, { onUploadProgress })),
  update: (id, body) => data(api.put(`/resumes/${id}`, body)),
  remove: (id) => data(api.delete(`/resumes/${id}`)),
  fileBlob: (id) => api.get(`/resumes/${id}/file`, { responseType: 'blob' }).then((r) => r.data),
};

export const emailAccountsApi = {
  list: (params) => data(api.get('/email-accounts', { params })),
  create: (body) => data(api.post('/email-accounts', body)),
  update: (id, body) => data(api.put(`/email-accounts/${id}`, body)),
  remove: (id) => data(api.delete(`/email-accounts/${id}`)),
};

export const interviewsApi = {
  list: (params) => data(api.get('/interviews', { params })),
  create: (body) => data(api.post('/interviews', body)),
  update: (id, body) => data(api.put(`/interviews/${id}`, body)),
  remove: (id) => data(api.delete(`/interviews/${id}`)),
};

export const remindersApi = {
  list: (params) => data(api.get('/reminders', { params })),
  create: (body) => data(api.post('/reminders', body)),
  update: (id, body) => data(api.put(`/reminders/${id}`, body)),
  remove: (id) => data(api.delete(`/reminders/${id}`)),
};

export const analyticsApi = {
  overview: () => data(api.get('/analytics/overview')),
  applications: (params) => data(api.get('/analytics/applications', { params })),
  resumes: (params) => data(api.get('/analytics/resumes', { params })),
  sources: (params) => data(api.get('/analytics/sources', { params })),
};

export const notificationsApi = {
  test: () => data(api.post('/notifications/test')),
  run: () => data(api.post('/notifications/run')),
};
