import { createClient } from '@supabase/supabase-js';
import type { Customer, Product } from './types';
// Supabase 설정
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Supabase] Missing environment variables:');
  console.error('[Supabase] EXPO_PUBLIC_SUPABASE_URL:', SUPABASE_URL || '(missing)');
  console.error('[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? '(set)' : '(missing)');
}

// SSR 환경(window 없음)에서는 AsyncStorage 사용 불가 → 런타임에서만 로드
let storage: any = undefined;
if (typeof window !== 'undefined') {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    storage = AsyncStorage;
  } catch {
    // fallback: 브라우저 localStorage
    storage = typeof localStorage !== 'undefined' ? localStorage : undefined;
  }
}

// Supabase 클라이언트 생성
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    ...(storage ? { storage } : {}),
    autoRefreshToken: true,
    persistSession: typeof window !== 'undefined',
    detectSessionInUrl: false,
  },
});

// ==================== 타입 정의 ====================

export interface Transaction {
  id: string;
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice?: number;
  date: string;       // YYYY-MM-DD
  createdAt: string;  // YYYY-MM-DD HH:mm:ss
}

export interface SpecialPrice {
  id: string;
  customerName: string;
  productName: string;
  customPrice: number;
}

// ==================== 인증 ====================

/**
 * 이메일/비밀번호 로그인
 */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('[signInWithEmail] Error:', error);
    throw new Error(error.message);
  }

  console.log('[signInWithEmail] Login success:', data.user?.email);
  return data;
}

/**
 * 이메일/비밀번호 회원가입
 */
export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    console.error('[signUpWithEmail] Error:', error);
    throw new Error(error.message);
  }

  console.log('[signUpWithEmail] Signup success:', data.user?.email);
  return data;
}

/**
 * 현재 세션 가져오기 (getStoredAuth 대체)
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('[getSession] Error:', error);
    return null;
  }

  return session;
}

/**
 * 현재 로그인한 사용자 정보
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error('[getCurrentUser] Error:', error);
    return null;
  }

  return user;
}

/**
 * 로그아웃
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[signOut] Error:', error);
    throw new Error(error.message);
  }
  console.log('[signOut] Logged out');
}

// ==================== 헬퍼 ====================

function getUserId(session: { user: { id: string } }): string {
  return session.user.id;
}

/**
 * TIMESTAMPTZ → 'YYYY-MM-DD HH:mm:ss' (로컬 시간)
 */
function formatCreatedAt(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

/**
 * DB 행 → Transaction 인터페이스 변환
 */
function rowToTransaction(row: any): Transaction {
  return {
    id: String(row.id),
    customerName: row.customer_name,
    productName: row.product_name,
    quantity: row.quantity,
    unitPrice: row.unit_price ?? undefined,
    date: row.date,
    createdAt: formatCreatedAt(row.created_at),
  };
}

// ==================== 거래내역 CRUD ====================

/**
 * 거래 내역 저장 (CREATE)
 */
export async function saveTransaction(
  transaction: Omit<Transaction, 'id' | 'createdAt'>
): Promise<Transaction> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: getUserId(session),
      customer_name: transaction.customerName,
      product_name: transaction.productName,
      quantity: transaction.quantity,
      unit_price: transaction.unitPrice ?? null,
      date: transaction.date,
    })
    .select()
    .single();

  if (error) {
    console.error('[saveTransaction] Error:', error);
    throw new Error(`저장 실패: ${error.message}`);
  }

  console.log('[saveTransaction] Saved:', data.id);
  return rowToTransaction(data);
}

/**
 * 거래 내역 전체 조회 (READ)
 */
export async function getTransactions(): Promise<Transaction[]> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getTransactions] Error:', error);
    throw new Error(`조회 실패: ${error.message}`);
  }

  console.log('[getTransactions] Fetched:', data.length, '건');
  return data.map(rowToTransaction);
}

/**
 * 날짜별 거래 내역 조회
 */
export async function getTransactionsByDate(date: string): Promise<Transaction[]> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('date', date)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getTransactionsByDate] Error:', error);
    throw new Error(`조회 실패: ${error.message}`);
  }

  console.log('[getTransactionsByDate] Date:', date, '→', data.length, '건');
  return data.map(rowToTransaction);
}

/**
 * 거래 내역 수정 (UPDATE)
 */
export async function updateTransaction(
  id: string,
  updates: Partial<Omit<Transaction, 'id' | 'createdAt'>>
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const updateData: Record<string, any> = {};
  if (updates.customerName !== undefined) updateData.customer_name = updates.customerName;
  if (updates.productName !== undefined) updateData.product_name = updates.productName;
  if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
  if (updates.unitPrice !== undefined) updateData.unit_price = updates.unitPrice;
  if (updates.date !== undefined) updateData.date = updates.date;

  const { error } = await supabase
    .from('transactions')
    .update(updateData)
    .eq('id', Number(id));

  if (error) {
    console.error('[updateTransaction] Error:', error);
    throw new Error(`수정 실패: ${error.message}`);
  }

  console.log('[updateTransaction] Updated:', id);
}

/**
 * 거래 내역 삭제 (DELETE)
 */
export async function deleteTransaction(id: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', Number(id));

  if (error) {
    console.error('[deleteTransaction] Error:', error);
    throw new Error(`삭제 실패: ${error.message}`);
  }

  console.log('[deleteTransaction] Deleted:', id);
}

// ==================== 특가 관리 ====================

/**
 * 전체 특가 목록 조회
 */
export async function getSpecialPrices(): Promise<SpecialPrice[]> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('special_prices')
    .select('*')
    .order('customer_name');

  if (error) {
    console.error('[getSpecialPrices] Error:', error);
    throw new Error(`특가 조회 실패: ${error.message}`);
  }

  return data.map((row: any) => ({
    id: String(row.id),
    customerName: row.customer_name,
    productName: row.product_name,
    customPrice: row.custom_price,
  }));
}

/**
 * 특정 거래처의 특가 목록 조회
 */
export async function getSpecialPricesByCustomer(
  customerName: string
): Promise<SpecialPrice[]> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('special_prices')
    .select('*')
    .eq('customer_name', customerName)
    .order('product_name');

  if (error) {
    console.error('[getSpecialPricesByCustomer] Error:', error);
    throw new Error(`특가 조회 실패: ${error.message}`);
  }

  return data.map((row: any) => ({
    id: String(row.id),
    customerName: row.customer_name,
    productName: row.product_name,
    customPrice: row.custom_price,
  }));
}

/**
 * 특정 거래처 + 제품의 특가 조회
 */
export async function getSpecialPrice(
  customerName: string,
  productName: string
): Promise<number | null> {
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('special_prices')
    .select('custom_price')
    .eq('customer_name', customerName)
    .eq('product_name', productName)
    .maybeSingle();

  if (error) {
    console.error('[getSpecialPrice] Error:', error);
    return null;
  }

  return data ? data.custom_price : null;
}

/**
 * 특가 추가 (이미 존재하면 업데이트)
 */
export async function addSpecialPrice(
  customerName: string,
  productName: string,
  customPrice: number
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase
    .from('special_prices')
    .upsert(
      {
        user_id: getUserId(session),
        customer_name: customerName,
        product_name: productName,
        custom_price: customPrice,
      },
      { onConflict: 'user_id,customer_name,product_name' }
    );

  if (error) {
    console.error('[addSpecialPrice] Error:', error);
    throw new Error(`특가 추가 실패: ${error.message}`);
  }

  console.log('[addSpecialPrice] Added:', customerName, productName, customPrice);
}

/**
 * 특가 삭제
 */
export async function deleteSpecialPrice(id: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase
    .from('special_prices')
    .delete()
    .eq('id', Number(id));

  if (error) {
    console.error('[deleteSpecialPrice] Error:', error);
    throw new Error(`특가 삭제 실패: ${error.message}`);
  }

  console.log('[deleteSpecialPrice] Deleted:', id);
}

// ==================== 거래처 CRUD (Supabase) ====================

function rowToCustomer(row: any): Customer {
  return {
    id: String(row.id),
    name: row.name,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
  };
}

export async function getCustomersFromDB(): Promise<Customer[]> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('[getCustomersFromDB] Error:', error);
    throw new Error(`거래처 조회 실패: ${error.message}`);
  }

  return (data ?? []).map(rowToCustomer);
}

export async function addCustomerToDB(name: string, aliases: string[] = []): Promise<Customer> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('customers')
    .insert({ user_id: session.user.id, name, aliases })
    .select()
    .single();

  if (error) {
    console.error('[addCustomerToDB] Error:', error);
    throw new Error(`거래처 추가 실패: ${error.message}`);
  }

  return rowToCustomer(data);
}

export async function updateCustomerInDB(id: string, updates: Partial<Customer>): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const patch: Record<string, any> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.aliases !== undefined) patch.aliases = updates.aliases;

  const { error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', Number(id));

  if (error) {
    console.error('[updateCustomerInDB] Error:', error);
    throw new Error(`거래처 수정 실패: ${error.message}`);
  }
}

export async function deleteCustomerFromDB(id: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', Number(id));

  if (error) {
    console.error('[deleteCustomerFromDB] Error:', error);
    throw new Error(`거래처 삭제 실패: ${error.message}`);
  }
}

/** 여러 거래처를 한 번에 업서트 (마이그레이션/대량 가져오기용). 동일 이름 중복은 무시. */
export async function bulkUpsertCustomers(
  customers: Array<{ name: string; aliases?: string[] }>,
): Promise<number> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');
  if (customers.length === 0) return 0;

  const rows = customers.map((c) => ({
    user_id: session.user.id,
    name: c.name,
    aliases: c.aliases ?? [],
  }));

  const { error } = await supabase
    .from('customers')
    .upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true });

  if (error) {
    console.error('[bulkUpsertCustomers] Error:', error);
    throw new Error(`거래처 일괄 업로드 실패: ${error.message}`);
  }

  return customers.length;
}

// ==================== 품목 CRUD (Supabase) ====================

function rowToProduct(row: any): Product {
  return {
    id: String(row.id),
    name: row.name,
    category: row.category,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    unitPrice: row.unit_price ?? undefined,
  };
}

export async function getProductsFromDB(): Promise<Product[]> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('[getProductsFromDB] Error:', error);
    throw new Error(`품목 조회 실패: ${error.message}`);
  }

  return (data ?? []).map(rowToProduct);
}

export async function addProductToDB(
  name: string,
  category: string,
  aliases: string[] = [],
  unitPrice?: number,
): Promise<Product> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('products')
    .insert({
      user_id: session.user.id,
      name,
      category,
      aliases,
      unit_price: unitPrice ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[addProductToDB] Error:', error);
    throw new Error(`품목 추가 실패: ${error.message}`);
  }

  return rowToProduct(data);
}

export async function updateProductInDB(id: string, updates: Partial<Product>): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const patch: Record<string, any> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.aliases !== undefined) patch.aliases = updates.aliases;
  if (updates.unitPrice !== undefined) patch.unit_price = updates.unitPrice;

  const { error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', Number(id));

  if (error) {
    console.error('[updateProductInDB] Error:', error);
    throw new Error(`품목 수정 실패: ${error.message}`);
  }
}

export async function deleteProductFromDB(id: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', Number(id));

  if (error) {
    console.error('[deleteProductFromDB] Error:', error);
    throw new Error(`품목 삭제 실패: ${error.message}`);
  }
}

/** 여러 품목을 한 번에 업서트 (마이그레이션/대량 가져오기용). 동일 이름 중복은 무시. */
export async function bulkUpsertProducts(
  products: Array<{ name: string; category: string; aliases?: string[]; unitPrice?: number }>,
): Promise<number> {
  const session = await getSession();
  if (!session) throw new Error('로그인이 필요합니다.');
  if (products.length === 0) return 0;

  const rows = products.map((p) => ({
    user_id: session.user.id,
    name: p.name,
    category: p.category,
    aliases: p.aliases ?? [],
    unit_price: p.unitPrice ?? null,
  }));

  const { error } = await supabase
    .from('products')
    .upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true });

  if (error) {
    console.error('[bulkUpsertProducts] Error:', error);
    throw new Error(`품목 일괄 업로드 실패: ${error.message}`);
  }

  return products.length;
}
