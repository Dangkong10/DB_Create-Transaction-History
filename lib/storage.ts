/**
 * 거래처/품목 저장 관리 — Supabase 주 저장소 + AsyncStorage 오프라인 캐시.
 *
 * 읽기: Supabase 우선, 실패 시 AsyncStorage fallback, 그것도 비면 lib/data.ts 기본값.
 * 쓰기: Supabase 필수 (온라인 + 로그인). 성공 시 AsyncStorage 캐시도 갱신.
 * 마이그레이션: uploadLocalToSupabase() — 로컬에 쌓여있는 데이터를 일괄 업로드.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Customer, Product } from './types';
import { CUSTOMERS, PRODUCTS } from './data';
import {
  getCustomersFromDB,
  addCustomerToDB,
  updateCustomerInDB,
  deleteCustomerFromDB,
  bulkUpsertCustomers,
  getProductsFromDB,
  addProductToDB,
  updateProductInDB,
  deleteProductFromDB,
  bulkUpsertProducts,
} from './supabase';

const CUSTOMERS_KEY = '@transaction_app:customers';
const PRODUCTS_KEY = '@transaction_app:products';

async function readLocalCustomers(): Promise<Customer[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOMERS_KEY);
    return raw ? (JSON.parse(raw) as Customer[]) : null;
  } catch (err) {
    console.error('[storage] readLocalCustomers failed:', err);
    return null;
  }
}

async function writeLocalCustomers(customers: Customer[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
  } catch (err) {
    console.error('[storage] writeLocalCustomers failed:', err);
  }
}

async function readLocalProducts(): Promise<Product[] | null> {
  try {
    const raw = await AsyncStorage.getItem(PRODUCTS_KEY);
    return raw ? (JSON.parse(raw) as Product[]) : null;
  } catch (err) {
    console.error('[storage] readLocalProducts failed:', err);
    return null;
  }
}

async function writeLocalProducts(products: Product[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  } catch (err) {
    console.error('[storage] writeLocalProducts failed:', err);
  }
}

// ==================== 거래처 ====================

export async function loadCustomers(): Promise<Customer[]> {
  try {
    const remote = await getCustomersFromDB();
    if (remote.length > 0) {
      await writeLocalCustomers(remote);
      return remote;
    }
    // Supabase 비어있음 → 로컬 fallback (마이그레이션 전 상태)
    const local = await readLocalCustomers();
    if (local && local.length > 0) return local;
    // 로컬도 비어있음 → 기본값
    return CUSTOMERS;
  } catch (err) {
    console.warn('[storage] loadCustomers Supabase 실패, 로컬 fallback:', err);
    const local = await readLocalCustomers();
    if (local && local.length > 0) return local;
    return CUSTOMERS;
  }
}

export async function saveCustomers(customers: Customer[]): Promise<void> {
  // 엑셀 import 등 bulk 저장 — 전체 배열을 Supabase에 upsert.
  // UNIQUE (user_id, name) 제약 덕분에 동일 이름은 업데이트됨.
  await bulkUpsertCustomers(customers.map((c) => ({ name: c.name, aliases: c.aliases })));
  await writeLocalCustomers(customers);
}

export async function addCustomer(name: string, aliases: string[] = []): Promise<Customer> {
  const created = await addCustomerToDB(name, aliases);
  const local = (await readLocalCustomers()) ?? [];
  await writeLocalCustomers([...local, created]);
  return created;
}

export async function deleteCustomer(id: string): Promise<void> {
  await deleteCustomerFromDB(id);
  const local = (await readLocalCustomers()) ?? [];
  await writeLocalCustomers(local.filter((c) => c.id !== id));
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
  await updateCustomerInDB(id, updates);
  const local = (await readLocalCustomers()) ?? [];
  await writeLocalCustomers(local.map((c) => (c.id === id ? { ...c, ...updates } : c)));
}

// ==================== 품목 ====================

export async function loadProducts(): Promise<Product[]> {
  try {
    const remote = await getProductsFromDB();
    if (remote.length > 0) {
      await writeLocalProducts(remote);
      return remote;
    }
    const local = await readLocalProducts();
    if (local && local.length > 0) return local;
    return PRODUCTS;
  } catch (err) {
    console.warn('[storage] loadProducts Supabase 실패, 로컬 fallback:', err);
    const local = await readLocalProducts();
    if (local && local.length > 0) return local;
    return PRODUCTS;
  }
}

export async function saveProducts(products: Product[]): Promise<void> {
  await bulkUpsertProducts(
    products.map((p) => ({
      name: p.name,
      category: p.category,
      aliases: p.aliases,
      unitPrice: p.unitPrice,
    })),
  );
  await writeLocalProducts(products);
}

export async function addProduct(
  name: string,
  category: string,
  aliases: string[] = [],
  unitPrice?: number,
): Promise<Product> {
  const created = await addProductToDB(name, category, aliases, unitPrice);
  const local = (await readLocalProducts()) ?? [];
  await writeLocalProducts([...local, created]);
  return created;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
  await updateProductInDB(id, updates);
  const local = (await readLocalProducts()) ?? [];
  await writeLocalProducts(local.map((p) => (p.id === id ? { ...p, ...updates } : p)));
}

export async function deleteProduct(id: string): Promise<void> {
  await deleteProductFromDB(id);
  const local = (await readLocalProducts()) ?? [];
  await writeLocalProducts(local.filter((p) => p.id !== id));
}

// ==================== 마이그레이션 (초기 1회용) ====================

/**
 * 이 기기의 AsyncStorage에 저장된 거래처/품목을 Supabase에 일괄 업로드.
 * 동일 이름은 중복으로 간주되어 추가되지 않음 (UNIQUE 제약).
 * 정본 기기(예: Mac)에서 한 번만 실행하면 됨.
 */
export async function uploadLocalToSupabase(): Promise<{
  customers: number;
  products: number;
}> {
  const localCustomers = (await readLocalCustomers()) ?? [];
  const localProducts = (await readLocalProducts()) ?? [];

  const customerCount = await bulkUpsertCustomers(
    localCustomers.map((c) => ({ name: c.name, aliases: c.aliases })),
  );
  const productCount = await bulkUpsertProducts(
    localProducts.map((p) => ({
      name: p.name,
      category: p.category,
      aliases: p.aliases,
      unitPrice: p.unitPrice,
    })),
  );

  return { customers: customerCount, products: productCount };
}

/** 로컬 캐시에 저장된 거래처/품목 수 */
export async function getLocalCacheCounts(): Promise<{ customers: number; products: number }> {
  const c = (await readLocalCustomers()) ?? [];
  const p = (await readLocalProducts()) ?? [];
  return { customers: c.length, products: p.length };
}
