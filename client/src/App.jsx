import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { LoginPage, RegisterPage, returnPath } from './pages/AuthPages.jsx';

// Page bundles load on demand; once signed in, the rest are prefetched in the background so
// opening any page later doesn't wait for its code to download.
const pageLoaders = {
  Dashboard: () => import('./pages/DashboardPage.jsx'),
  Applications: () => import('./pages/ApplicationsPage.jsx'),
  ApplicationForm: () => import('./pages/ApplicationFormPage.jsx'),
  ApplicationDetail: () => import('./pages/ApplicationDetailPage.jsx'),
  Resumes: () => import('./pages/ResumesPage.jsx'),
  EmailAccounts: () => import('./pages/EmailAccountsPage.jsx'),
  Interviews: () => import('./pages/InterviewsPage.jsx'),
  Reminders: () => import('./pages/RemindersPage.jsx'),
  Analytics: () => import('./pages/AnalyticsPage.jsx'),
  Settings: () => import('./pages/SettingsPage.jsx'),
  SharedJob: () => import('./pages/SharedJobPage.jsx'),
  Friends: () => import('./pages/FriendsPage.jsx'),
};
const DashboardPage = lazy(pageLoaders.Dashboard);
const ApplicationsPage = lazy(pageLoaders.Applications);
const ApplicationFormPage = lazy(pageLoaders.ApplicationForm);
const ApplicationDetailPage = lazy(pageLoaders.ApplicationDetail);
const ResumesPage = lazy(pageLoaders.Resumes);
const EmailAccountsPage = lazy(pageLoaders.EmailAccounts);
const InterviewsPage = lazy(pageLoaders.Interviews);
const RemindersPage = lazy(pageLoaders.Reminders);
const AnalyticsPage = lazy(pageLoaders.Analytics);
const SettingsPage = lazy(pageLoaders.Settings);
const SharedJobPage = lazy(pageLoaders.SharedJob);
const FriendsPage = lazy(pageLoaders.Friends);
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

function usePrefetchPages(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const handle = idle(() => Object.values(pageLoaders).forEach((load) => load().catch(() => {})));
    return () => cancel(handle);
  }, [enabled]);
}

const FullScreenLoader = () => (
  <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
);

function KanbanRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('view', 'kanban');
  return <Navigate to={`/applications?${params}`} replace />;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  usePrefetchPages(Boolean(user));
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  return user ? <Navigate to={returnPath(location)} replace /> : children;
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
          {/* Kanban is a view of the Applications page; keep old /kanban links working. */}
          <Route path="kanban" element={<KanbanRedirect />} />
          <Route path="resumes" element={<ResumesPage />} />
          <Route path="email-accounts" element={<EmailAccountsPage />} />
          <Route path="interviews" element={<InterviewsPage />} />
          <Route path="reminders" element={<RemindersPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="share/:token" element={<SharedJobPage />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
