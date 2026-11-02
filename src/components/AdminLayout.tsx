import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Armchair,
  BarChart3,
  Bell,
  CalendarDays,
  ChefHat,
  ClipboardList,
  ConciergeBell,
  ExternalLink,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Map,
  Menu as MenuIcon,
  QrCode,
  ReceiptText,
  Settings as SettingsIcon,
  Users,
  UsersRound,
  UtensilsCrossed,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useRealtime, useSocket } from '../lib/socket';
import { cn, Avatar, Badge, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator } from './ui';
import { useToast } from './Toast';
import { roleLabels, timeAgo } from '../lib/format';
import type { NotificationItem, Role } from '../lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ to: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Front of house',
    items: [
      { to: 'tables', label: 'Tables', icon: Armchair },
      { to: 'floor-plan', label: 'Floor plan', icon: Map, roles: ['super_admin', 'manager', 'auditor'] },
      { to: 'reservations', label: 'Reservations', icon: CalendarDays, roles: ['super_admin', 'manager', 'receptionist', 'auditor'] },
    ],
  },
  {
    title: 'Service',
    items: [
      { to: 'orders', label: 'Live orders', icon: ClipboardList },
      { to: 'kitchen', label: 'Kitchen display', icon: ChefHat, roles: ['super_admin', 'manager', 'chef'] },
      { to: 'waiter', label: 'Waiter station', icon: ConciergeBell, roles: ['super_admin', 'manager', 'waiter'] },
      { to: 'cashier', label: 'Bills & payments', icon: ReceiptText, roles: ['super_admin', 'manager', 'cashier'] },
      { to: 'sessions', label: 'Table sessions', icon: Users, roles: ['super_admin', 'manager', 'cashier', 'auditor'] },
    ],
  },
  {
    title: 'Manage',
    items: [
      { to: 'menu', label: 'Menu & products', icon: UtensilsCrossed, roles: ['super_admin', 'manager'] },
      { to: 'staff', label: 'Staff team', icon: UsersRound, roles: ['super_admin', 'manager'] },
      { to: 'qr-codes', label: 'QR studio', icon: QrCode, roles: ['super_admin', 'manager'] },
      { to: 'reports', label: 'Reports', icon: BarChart3, roles: ['super_admin', 'manager', 'auditor'] },
      { to: 'settings', label: 'Settings', icon: SettingsIcon, roles: ['super_admin', 'manager'] },
    ],
  },
];

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  tables: 'Tables',
  'floor-plan': 'Floor plan',
  'qr-codes': 'QR studio',
  menu: 'Menu & products',
  staff: 'Staff team',
  orders: 'Live orders',
  kitchen: 'Kitchen display',
  waiter: 'Waiter station',
  cashier: 'Bills & payments',
  reservations: 'Reservations',
  sessions: 'Table sessions',
  reports: 'Reports',
  settings: 'Settings',
};

function notificationTitle(item: NotificationItem) {
  if (item.kind === 'call') return item.callType === 'bill' ? 'Bill requested' : 'Guest needs a waiter';
  if (item.kind === 'new-order') return 'New order received';
  if (item.kind === 'ready') return 'Order ready to serve';
  if (item.kind === 'payment') return 'Payment received';
  if (item.kind === 'seated') return 'Guests seated';
  if (item.kind === 'bill') return 'Bill update';
  if (item.kind === 'cancel') return 'Order cancelled';
  return 'Restaurant update';
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  const isKitchen = location.pathname.includes('/kitchen');
  const segment = location.pathname.split('/')[3] ?? 'dashboard';
  const pageTitle = segment === 'tables' && location.pathname.split('/')[4]
    ? 'Table details'
    : segment === 'menu' && location.pathname.split('/')[4] === 'new'
      ? 'Add product'
      : segment === 'staff' && location.pathname.split('/')[4] === 'new'
        ? 'Add staff'
        : pageTitles[segment] ?? 'Restaurant';

  useEffect(() => {
    if (!socket) return;
    setConnected(socket.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  useRealtime<NotificationItem>('notification', (item) => {
    setNotifications((current) => [item, ...current].slice(0, 24));
    setUnread((count) => count + 1);
    toast.push({
      title: notificationTitle(item),
      description: item.message,
      tone: item.kind === 'call' ? 'warning' : item.kind === 'cancel' ? 'error' : item.kind === 'new-order' ? 'info' : 'success',
    });
  });

  useRealtime('tables:reload', () => undefined);

  const groups = useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !item.roles || (user && item.roles.includes(user.role))),
        }))
        .filter((group) => group.items.length > 0),
    [user],
  );

  if (isKitchen) return <Outlet />;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const openNotification = (item: NotificationItem) => {
    setBellOpen(false);
    if (item.kind === 'call') {
      navigate('/admin/restaurant/waiter');
    } else if (item.orderId) {
      navigate(`/admin/restaurant/orders/${item.orderId}`);
    } else if (item.tableId) {
      navigate(`/admin/restaurant/tables/${item.tableId}`);
    } else if (item.kind === 'payment' || item.kind === 'bill') {
      navigate('/admin/restaurant/cashier');
    }
  };

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-6">
        <Link to="/admin/restaurant/dashboard" onClick={onNavigate} className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#d8b475]/40 bg-gradient-to-br from-[#d8b475]/25 to-transparent">
            <span className="font-display text-xl text-[#f0e2bf]">N</span>
          </span>
          <span>
            <span className="block font-display text-[1.35rem] leading-none tracking-[0.14em] text-[#f8f2e5]">NILE</span>
            <span className="mt-1 block text-[8px] uppercase tracking-[0.32em] text-[#d8b475]/75">Restaurant OS</span>
          </span>
        </Link>

        <div className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[11.5px] text-[#f4ecdd]/80">Nile Restaurant</p>
            <p className="mt-0.5 truncate text-[9.5px] uppercase tracking-[0.16em] text-white/35">Addis Ababa · 4★</p>
          </div>
          <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-400' : 'bg-white/25')} />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-color:rgba(216,180,117,0.35)_transparent]">
        {groups.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="px-3 pb-1.5 text-[9px] uppercase tracking-[0.22em] text-white/30">{group.title}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition',
                      isActive
                        ? 'bg-white/[0.08] text-[#fdf9f0]'
                        : 'text-[#f4ecdd]/55 hover:bg-white/[0.04] hover:text-[#fdf9f0]',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 h-4 w-0.5 rounded-full bg-[#d8b475]" />}
                      <item.icon
                        size={16}
                        className={cn('shrink-0 transition', isActive ? 'text-[#e6cd97]' : 'text-white/35 group-hover:text-white/65')}
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.to === 'orders' && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#d8b475]/90" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.07] p-3">
        <div className="mb-2 hidden rounded-xl border border-[#d8b475]/20 bg-gradient-to-br from-[#d8b475]/12 to-transparent p-3 xl:block">
          <p className="text-[9px] uppercase tracking-[0.2em] text-[#d8b475]/85">One QR per table</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/45">
            Every order carries its table, session and guest — automatically.
          </p>
          <Link
            to="/admin/restaurant/qr-codes"
            onClick={onNavigate}
            className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-[#e6cd97] hover:text-[#fdf9f0]"
          >
            Open QR studio <ExternalLink size={10} />
          </Link>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <Avatar
            name={user?.name ?? 'Nile'}
            className="border-[#d8b475]/35 bg-[#d8b475]/15 text-[#f0e2bf]"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] text-[#f8f2e5]">{user?.name}</p>
            <p className="truncate text-[9.5px] uppercase tracking-[0.12em] text-white/40">
              {user ? roleLabels[user.role] : ''}
            </p>
          </div>
          <IconButton
            label="Sign out"
            onClick={handleLogout}
            className="h-8 w-8 border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/10 hover:text-white"
          >
            <LogOut size={14} />
          </IconButton>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-950">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(1000px_520px_at_8%_-10%,rgba(215,180,108,0.09),transparent_60%),radial-gradient(900px_500px_at_100%_0%,rgba(180,85,46,0.06),transparent_55%)]" />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-[#d8b475]/15 bg-[linear-gradient(180deg,#241b11_0%,#191309_55%,#120d07_100%)] shadow-[0_0_60px_rgba(24,18,10,0.18)] lg:block">
        {sidebar()}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[120] lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[286px] border-r border-[#d8b475]/20 bg-[linear-gradient(180deg,#241b11_0%,#191309_55%,#120d07_100%)] shadow-2xl animate-slide-in">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
            {sidebar(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      <div className="relative z-10 lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-[#d8b475]/15 bg-[linear-gradient(180deg,rgba(36,27,17,0.97),rgba(22,16,9,0.97))] px-4 shadow-[0_10px_34px_rgba(24,18,10,0.14)] backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/65 transition hover:bg-white/10 hover:text-white lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <MenuIcon size={17} />
            </button>
            <div className="min-w-0">
              <p className="hidden text-[9px] uppercase tracking-[0.2em] text-[#d8b475]/70 sm:block">
                Nile Restaurant · operations
              </p>
              <p className="truncate text-[13px] font-medium text-[#fdf9f0]">{pageTitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-[10px] uppercase tracking-[0.14em] text-white/35 md:block">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <Badge
              tone={connected ? 'success' : 'neutral'}
              className={cn(
                'hidden sm:inline-flex',
                connected
                  ? 'border-[#6ee7b7]/30 bg-[#6ee7b7]/10 text-[#d7f5e6]'
                  : 'border-white/10 bg-white/[0.05] text-white/55',
              )}
            >
              {connected ? <Wifi size={10} /> : <WifiOff size={10} />}
              {connected ? 'Live' : 'Offline'}
            </Badge>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setBellOpen((open) => !open);
                  setUnread(0);
                }}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/65 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                aria-label="Notifications"
              >
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d8b475] px-1 text-[9px] font-semibold text-[#1d170e]">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              {bellOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                  <div className="absolute right-0 top-11 z-50 w-[min(92vw,370px)] overflow-hidden rounded-xl border border-white/10 bg-[#1d160d]/98 shadow-2xl backdrop-blur-xl animate-pop">
                    <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                      <p className="text-xs font-medium text-[#fdf9f0]/85">Notifications</p>
                      <span className="text-[9px] uppercase tracking-[0.16em] text-white/35">
                        {notifications.length ? `${notifications.length} recent` : 'Live feed'}
                      </span>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <Bell size={18} className="mx-auto text-white/20" />
                          <p className="mt-2 text-xs text-white/45">New orders and guest requests appear here.</p>
                        </div>
                      ) : (
                        notifications.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openNotification(item)}
                            className="flex w-full items-start gap-2.5 border-b border-white/[0.05] px-4 py-3 text-left transition last:border-0 hover:bg-white/[0.05]"
                          >
                            <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', item.kind === 'call' ? 'bg-orange-300' : 'bg-[#d8b475]')} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[11px] font-medium text-[#fdf9f0]/85">{notificationTitle(item)}</span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-white/50">{item.message}</span>
                              <span className="mt-1 block text-[9px] uppercase tracking-[0.12em] text-white/30">
                                {timeAgo(item.createdAt)}
                              </span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <Menu
              trigger={
                <button type="button" className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1 pr-2 transition hover:border-white/20 hover:bg-white/10">
                  <Avatar name={user?.name ?? 'Nile'} size="sm" className="border-[#d8b475]/35 bg-[#d8b475]/15 text-[#f0e2bf]" />
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-[120px] truncate text-[11px] text-[#fdf9f0]/85">{user?.name}</span>
                    <span className="block text-[8.5px] uppercase tracking-[0.14em] text-white/35">
                      {user ? roleLabels[user.role] : ''}
                    </span>
                  </span>
                </button>
              }
              width="w-64"
            >
              <div className="px-2.5 py-2">
                <p className="text-xs text-cream-50">{user?.name}</p>
                <p className="mt-0.5 text-[10px] text-cream-100/35">{user?.email}</p>
              </div>
              <MenuSeparator />
              <MenuLabel>Restaurant</MenuLabel>
              <MenuItem icon={<LayoutGrid size={14} />} onClick={() => navigate('/admin/restaurant/floor-plan')}>
                Open floor plan
              </MenuItem>
              <MenuItem icon={<ExternalLink size={14} />} onClick={() => window.open('/demo', '_blank', 'noopener')}>
                Guest menu demo
              </MenuItem>
              <MenuItem icon={<QrCode size={14} />} onClick={() => navigate('/admin/restaurant/qr-codes')}>
                QR studio
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<LogOut size={14} />} danger onClick={handleLogout}>
                Sign out
              </MenuItem>
            </Menu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1580px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
