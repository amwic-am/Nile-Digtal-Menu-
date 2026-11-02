export type Role =
  | 'super_admin'
  | 'manager'
  | 'receptionist'
  | 'waiter'
  | 'cashier'
  | 'chef'
  | 'auditor';

export interface StaffUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  restaurant_id: number;
}

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'inactive';
export type OrderStatus =
  | 'new'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'completed'
  | 'cancelled';
export type TableShape = 'square' | 'round' | 'rect';
export type PaymentMethod = 'cash' | 'card' | 'telebirr' | 'room_charge';

export interface DiningTable {
  id: number;
  code: string;
  name: string;
  capacity: number;
  shape: TableShape;
  status: TableStatus;
  areaId: number;
  areaName: string;
  floorId: number;
  floorName: string;
  locationLabel: string | null;
  isActive: boolean;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  sessionId: number | null;
  sessionCode: string | null;
  guestsCount: number | null;
  orderCount: number;
  billTotal: number;
  waiterId: number | null;
  waiterName: string | null;
  qrToken: string | null;
}

export interface MenuAddon {
  id: number;
  name: string;
  price: number;
}

export interface MenuItem {
  id: number;
  name: string;
  nameAm: string | null;
  description: string | null;
  price: number;
  image: string | null;
  isSignature: boolean;
  arEnabled: boolean;
  spiceLevel: number;
  prepMinutes: number;
  tags: string | null;
  available: boolean;
  addons: MenuAddon[];
}

export interface MenuCategory {
  id: number;
  name: string;
  nameAm: string | null;
  description: string | null;
  items: MenuItem[];
}

export interface RestaurantPublic {
  id: number;
  name: string;
  slug: string;
  currency: string;
  serviceChargePct: number;
  taxPct: number;
  autoAcceptOrders: boolean;
  autoOpenSessions: boolean;
}

export interface PublicScan {
  restaurant: RestaurantPublic;
  table: {
    id: number;
    code: string;
    name: string;
    capacity: number;
    shape: TableShape;
    status: TableStatus;
    locationLabel: string | null;
    areaName: string;
    floorName: string;
  };
  session: { id: number; code: string; guestsCount: number; openedAt: string } | null;
  guests: Array<{ id: number; name: string; isLead: boolean }>;
  menu: MenuCategory[];
  canOrder: boolean;
  notice: string | null;
}

export interface OrderSummary {
  id: number;
  orderNo: number;
  displayNo: string;
  status: OrderStatus;
  source: 'qr' | 'waiter' | 'reception';
  total: number;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  guestName: string | null;
  guestRoom?: string | null;
  createdAt: string;
  notes: string | null;
  tableId: number;
  tableCode: string;
  areaName: string;
  sessionCode: string;
  sessionId: number;
  waiterName: string | null;
  itemCount: number;
  itemsSummary: string | null;
  cancelReason?: string | null;
}

export interface OrderItem {
  id: number;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  notes: string | null;
  addons: Array<{ name: string; price: number }>;
}

export interface OrderHistoryEntry {
  status: OrderStatus;
  note: string | null;
  changedBy: string | null;
  createdAt: string;
}

export interface OrderDetail extends OrderSummary {
  orderNo: number;
  discount: number;
  updatedAt: string;
  capacity: number;
  floorName: string;
  sessionOpenedAt: string;
  waiterId: number | null;
  qrToken: string | null;
  items: OrderItem[];
  history: OrderHistoryEntry[];
  waiters: Array<{ id: number; name: string; role: Role }>;
}

export interface Payment {
  id: number;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  createdAt: string;
}

export interface Bill {
  id: number | null;
  sessionId: number;
  tableId: number;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  status: string;
  orderCount: number;
  payments: Payment[];
  items: Array<{ name: string; qty: number; unitPrice: number; total: number }>;
}

export interface SessionSummary {
  id: number;
  code: string;
  status: 'open' | 'closed';
  guestsCount: number;
  openedAt: string;
  closedAt: string | null;
  tableId: number;
  tableCode: string;
  capacity: number;
  areaName: string;
  floorName: string;
  openedByName: string | null;
  guests: Array<{ id: number; name: string; isLead: boolean; joinedAt: string }>;
  orders: Array<{
    id: number;
    orderNo: number;
    displayNo: string;
    status: OrderStatus;
    total: number;
    paymentStatus: string;
    createdAt: string;
    guestName: string | null;
    itemCount: number;
  }>;
  bill: Bill | null;
  qrToken: string | null;
}

export interface Reservation {
  id: number;
  customerName: string;
  phone: string | null;
  guests: number;
  reservedAt: string;
  durationMin: number;
  status: 'confirmed' | 'seated' | 'cancelled' | 'no_show' | 'completed';
  notes: string | null;
  deposit: number;
  createdAt: string;
  tableId: number;
  tableCode: string;
  capacity: number;
  areaName: string;
  floorName: string;
}

export interface QrTable {
  id: number;
  code: string;
  capacity: number;
  status: TableStatus;
  areaId: number;
  areaName: string;
  floorId: number;
  floorName: string;
  token: string | null;
  qrCreatedAt: string | null;
  qr: { token: string; createdAt: string | null; scanUrl: string; dataUrl: string } | null;
  qrHistoryCount: number;
}

export interface DashboardData {
  tables: { available: number; occupied: number; reserved: number; cleaning: number; inactive: number; total: number };
  orders: { new: number; accepted: number; preparing: number; ready: number; served: number };
  openSessions: number;
  today: { revenue: number; sales: number; orders: number; avgTicket: number };
  recentOrders: OrderSummary[];
  topItems: Array<{ name: string; qty: number; revenue: number }>;
  tablesMap: Array<{
    id: number; code: string; status: TableStatus; areaId: number; areaName: string;
    sessionId: number | null; guestsCount: number | null; billTotal: number;
  }>;
  activity: Array<{ id: number; action: string; detail: string; createdAt: string; tableCode: string }>;
  reservations: Array<{ id: number; customerName: string; guests: number; reservedAt: string; tableCode: string; status: string }>;
}

export interface Area {
  id: number;
  name: string;
  description: string | null;
  floorId: number;
  floorName: string;
  sort: number;
  tableCount: number;
}

export interface Floor {
  id: number;
  name: string;
  level: number;
}

export interface TableDetailResponse {
  table: DiningTable;
  session: {
    id: number; code: string; status: string; guestsCount: number; openedAt: string;
    closedAt: string | null; openedByName: string | null;
  } | null;
  guests: Array<{ id: number; name: string; isLead: boolean; joinedAt: string }>;
  orders: OrderSummary[];
  bill: Bill | null;
  history: Array<{ id: number; orderNo: number; displayNo: string; status: OrderStatus; total: number; createdAt: string; paymentStatus: string }>;
  activity: Array<{ id: number; action: string; detail: string; createdAt: string; staffName: string | null }>;
  reservations: Array<{ id: number; customerName: string; phone: string | null; guests: number; reservedAt: string; status: string; notes: string | null; durationMin: number }>;
  qrHistory: Array<{ id: number; status: string; createdAt: string; revokedAt: string | null }>;
  waiters: Array<{ id: number; name: string; role: Role }>;
}

export interface WaiterUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface ReportData {
  range: string;
  totals: {
    orders: number; sales: number; service: number; tax: number; guests: number;
    avgTicket: number; payments: number; cancelled: number; cancelledValue: number; sessions: number;
  };
  byTable: Array<{ tableCode: string; areaName: string; orders: number; sales: number }>;
  topItems: Array<{ name: string; qty: number; revenue: number }>;
  byWaiter: Array<{ waiter: string; orders: number; sales: number }>;
  hourly: Array<{ hour: number; orders: number; sales: number }>;
  methods: Array<{ method: PaymentMethod; count: number; amount: number }>;
  reservations: { count: number; cancelled: number; noShow: number };
}

export interface NotificationItem {
  id: string;
  kind: string;
  message: string;
  tableCode?: string;
  tableId?: number;
  orderId?: number;
  callType?: 'waiter' | 'bill';
  createdAt: string;
}
