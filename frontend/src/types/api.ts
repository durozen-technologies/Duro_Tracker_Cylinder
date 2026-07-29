

export interface Item {
  id: string;
  name: string;
  price: number;
  capacity_kg?: number;
  hsn_code?: string;
  gst_percent?: number;
  initial_full: number;
  initial_empty: number;
  current_full: number;
  current_empty: number;
  is_active: boolean;
}

export interface ItemCreate {
  name: string;
  price: number;
  capacity_kg?: number;
  hsn_code?: string;
  gst_percent?: number;
  initial_full: number;
  initial_empty: number;
  is_active?: boolean;
}

export interface ItemUpdate {
  name?: string;
  price?: number;
  capacity_kg?: number;
  hsn_code?: string;
  gst_percent?: number;
  current_full?: number;
  current_empty?: number;
  is_active?: boolean;
}

export interface Driver {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
  // Extraneous stats if returned by backend
  deliveries?: number;
  collected?: number;
  lastActive?: string;
}

export interface InventoryItem {
  item_id: string;
  cylinders_pending: number;
}

export interface Buyer {
  id: string;
  name: string;
  phone?: string;
  type: 'retail' | 'commercial';
  address?: string;
  is_active: boolean;
  balance_pending: number;
  total_lifetime_sales: number;
  total_lifetime_paid: number;
  inventory: InventoryItem[];
  price_per_kg?: number;
}

export interface BuyerCreate {
  name: string;
  phone?: string;
  type: 'retail' | 'commercial';
  address?: string;
  balance_pending?: number;
  inventory?: InventoryItem[];
  price_per_kg?: number;
}

export interface BuyerUpdate {
  name?: string;
  phone?: string;
  type?: 'retail' | 'commercial';
  address?: string;
  is_active?: boolean;
  price_per_kg?: number;
  balance_pending?: number;
  inventory?: InventoryItem[];
}

export interface DashboardMetrics {
  total_dispatched: number;
  total_empty_received: number;
  total_cash_collected: number;
  total_upi_collected: number;
  outstanding_balance: number;
  todays_sales: number;
}

export interface Provider {
  id: string;
  name: string;
  phone?: string;
  gstin?: string;
  price_per_kg?: number;
  balance_pending: number;
  inventory: InventoryItem[];
  is_active: boolean;
}

export interface ProviderCreate {
  name: string;
  phone?: string;
  gstin?: string;
  price_per_kg?: number;
  balance_pending?: number;
  inventory?: InventoryItem[];
}

export interface ProviderUpdate {
  name?: string;
  phone?: string;
  gstin?: string;
  price_per_kg?: number;
  is_active?: boolean;
  balance_pending?: number;
  inventory?: InventoryItem[];
}

export interface PurchaseEntry {
  id: string;
  purchase_bill_id: string;
  item_id: string;
  full_received: number;
  empty_returned: number;
  total_cost: number;
}

export interface PurchaseBill {
  id: string;
  provider_id: string;
  bill_number?: string;
  total_cost: number;
  amount_paid: number;
  opening_balance?: number;
  closing_balance?: number;
  price_per_kg?: number;
  created_at: string;
  entries: PurchaseEntry[];
}

export interface Organization {
  id: string;
  name: string;
  max_users: number;
  address?: string | null;
  phone?: string | null;
  bill_prefix_sales: string;
  bill_prefix_collection: string;
  created_at?: string;
}

export interface OrganizationCreate {
  name: string;
  max_users: number;
  address?: string | null;
  phone?: string | null;
  bill_prefix_sales?: string;
  bill_prefix_collection?: string;
}

export interface UserCreate {
  username: string;
  password?: string;
  role: 'super_admin' | 'tenant_admin' | 'driver';
  is_active?: boolean;
}

export interface User {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at?: string;
  organization_id?: string;
}

export interface OrganizationUpdate {
  name?: string;
  max_users?: number;
  address?: string | null;
  phone?: string | null;
  bill_prefix_sales?: string | null;
  bill_prefix_collection?: string | null;
}

export interface DeliveryBillCreate {
  buyer_id?: string | null;
  adhoc_buyer_name?: string | null;
  items: DeliveryItemCreate[];
  cash_collected: number;
  upi_collected: number;
  timestamp?: string | null;
}

export interface DeliveryBillOut {
  id: string;
  driver_id: string | null;
  buyer_id: string | null;
  adhoc_buyer_name: string | null;
  bill_number: string | null;
  idempotency_key: string | null;
  buyer: BuyerSummary | null;
  total_bill_amount: number;
  cash_collected: number;
  upi_collected: number;
  items: DeliveryItemOut[];
  timestamp: string;
}

export interface DeliveryItem {
  id: string;
  item_id: string;
  unit_price_at_delivery: number;
  line_total_amount: number;
}


export interface DeliveryItemCreate {
  item_id: string;
  full_delivered: number;
  empty_received: number;
}

export interface BuyerSummary {
  id: string;
  name: string;
  is_active: boolean;
  address?: string;
  balance_pending?: number;
}

export interface DeliveryItemOut {
  id: string;
  item_id: string;
  unit_price_at_delivery: number;
  line_total_amount: number;
  full_delivered: number;
  empty_received: number;
  item?: Item;
}
