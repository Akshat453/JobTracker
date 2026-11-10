import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx';

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage.jsx'));
const ApplicationFormPage = lazy(() => import('./pages/ApplicationFormPage.jsx'));
const ApplicationDetailPage = lazy(() => import('./pages/ApplicationDetailPage.jsx'));
const KanbanPage = lazy(() => import('./pages/KanbanPage.jsx'));
const ResumesPage = lazy(() => import('./pages/ResumesPage.jsx'));
const EmailAccountsPage = lazy(() => import('./pages/EmailAccountsPage.jsx'));
const InterviewsPage = lazy(() => import('./pages/InterviewsPage.jsx'));
const RemindersPage = lazy(() => import('./pages/RemindersPage.jsx'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

const FullScreenLoader = () => (
  <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
);

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<DashboardPage />} />
          <Route path="applications" element={<ApplicationsPage />} />
          <Route path="applications/new" element={<ApplicationFormPage />} />
          <Route path="applications/:id" element={<ApplicationDetailPage />} />
          <Route path="applications/:id/edit" element={<ApplicationFormPage />} />
          <Route path="kanban" element={<KanbanPage />} />
          <Route path="resumes" element={<ResumesPage />} />
          <Route path="email-accounts" element={<EmailAccountsPage />} />
          <Route path="interviews" element={<InterviewsPage />} />
          <Route path="reminders" element={<RemindersPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
