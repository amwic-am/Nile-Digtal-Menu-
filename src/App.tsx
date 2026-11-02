import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './lib/auth';
import { apiPublic } from './lib/api';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { TablesPage } from './pages/TablesPage';
import { TableDetailPage } from './pages/TableDetailPage';
import { FloorPlanPage } from './pages/FloorPlanPage';
import { QrCodesPage } from './pages/QrCodesPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { KitchenPage } from './pages/KitchenPage';
import { WaiterPage } from './pages/WaiterPage';
import { CashierPage } from './pages/CashierPage';
import { ReservationsPage } from './pages/ReservationsPage';
import { SessionsPage } from './pages/SessionsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { MenuPage } from './pages/MenuPage';
import { ProductAddPage } from './pages/ProductAddPage';
import { StaffPage } from './pages/StaffPage';
import { StaffAddPage } from './pages/StaffAddPage';
import { ScanMenuPage } from './pages/ScanMenuPage';
import { TrackOrderPage } from './pages/TrackOrderPage';
import { WaveLoader } from './components/WaveLoader';

function Splash({ label }: { label?: string }) {
  return <WaveLoader fullscreen label={label} />;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Splash label="Preparing your pass" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function DemoRedirect() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    apiPublic<{ token: string }>('/public/demo-table')
      .then((res) => navigate(`/menu/scan/${res.token}`, { replace: true }))
      .catch((err: Error) => setError(err.message));
  }, [navigate]);
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-950 px-6 text-center">
        <p className="font-display text-2xl text-cream-50">No table is ready for a demo</p>
        <p className="text-sm text-cream-100/45">{error}</p>
        <a href="/login" className="mt-2 text-xs uppercase tracking-[0.2em] text-gold-300">
          Staff sign in
        </a>
      </div>
    );
  }
  return <Splash label="Finding your table" />;
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-950 px-6 text-center">
      <p className="eyebrow">Nile Restaurant</p>
      <h1 className="font-display text-5xl text-cream-50">Table not found</h1>
      <p className="max-w-md text-sm text-cream-100/45">
        This page or QR link is no longer available. Ask a member of staff for help.
      </p>
      <a href="/login" className="mt-2 rounded-full border border-gold-400/35 px-5 py-2.5 text-xs uppercase tracking-[0.18em] text-gold-200">
        Staff sign in
      </a>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/demo" element={<DemoRedirect />} />
      <Route path="/menu/scan/:token" element={<ScanMenuPage />} />
      <Route path="/menu/scan/:token/track/:orderNumber" element={<TrackOrderPage />} />
      <Route
        path="/admin/restaurant"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="tables" element={<TablesPage />} />
        <Route path="tables/:id" element={<TableDetailPage />} />
        <Route path="floor-plan" element={<FloorPlanPage />} />
        <Route path="qr-codes" element={<QrCodesPage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="menu/new" element={<ProductAddPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="staff/new" element={<StaffAddPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="kitchen" element={<KitchenPage />} />
        <Route path="waiter" element={<WaiterPage />} />
        <Route path="cashier" element={<CashierPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/admin/restaurant/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
