/**
 * 로컬 데이터 저장 관리
 * 
 * AsyncStorage를 사용하여 거래처 및 품목 목록을 로컬에 저장합니다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Customer, Product } from './types';
import { CUSTOMERS, PRODUCTS } from './data';

const CUSTOMERS_KEY = '@transaction_app:customers';
const PRODUCTS_KEY = '@transaction_app:products';

/**
 * 거래처 목록 불러오기
 */
export async function loadCustomers(): Promise<Customer[]> {
  try {
    const data = await AsyncStorage.getItem(CUSTOMERS_KEY);
    if (data) {
      return JSON.parse(data);
    }
    // 첫 실행 시 기본 데이터 저장
    await saveCustomers(CUSTOMERS);
    return CUSTOMERS;
  } catch (error) {
    console.error('Failed to load customers:', error);
    return CUSTOMERS;
  }
}

/**
 * 거래처 목록 저장
 */
export async function saveCustomers(customers: Customer[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
  } catch (error) {
    console.error('Failed to save customers:', error);
  }
}

/**
 * 품목 목록 불러오기
 */
export async function loadProducts(): Promise<Product[]> {
  try {
    const data = await AsyncStorage.getItem(PRODUCTS_KEY);
    if (data) {
      return JSON.parse(data);
    }
    // 첫 실행 시 기본 데이터 저장
    await saveProducts(PRODUCTS);
    return PRODUCTS;
  } catch (error) {
    console.error('Failed to load products:', error);
    return PRODUCTS;
  }
}

/**
 * 품목 목록 저장
 */
export async function saveProducts(products: Product[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  } catch (error) {
    console.error('Failed to save products:', error);
  }
}

/**
 * 거래처 추가
 */
export async function addCustomer(name: string, aliases: string[] = []): Promise<Customer> {
  const customers = await loadCustomers();
  const newCustomer: Customer = {
    id: `customer-${Date.now()}`,
    name,
    aliases,
  };
  customers.push(newCustomer);
  await saveCustomers(customers);
  return newCustomer;
}

/**
 * 제품 추가
 */
export async function addProduct(name: string, category: string, aliases: string[] = [], unitPrice?: number): Promise<Product> {
  const products = await loadProducts();
  const newProduct: Product = {
    id: `product-${Date.now()}`,
    name,
    category,
    aliases,
    unitPrice,
  };
  products.push(newProduct);
  await saveProducts(products);
  return newProduct;
}

/**
 * 거래처 삭제
 */
export async function deleteCustomer(id: string): Promise<void> {
  const customers = await loadCustomers();
  const filtered = customers.filter((c) => c.id !== id);
  await saveCustomers(filtered);
}

/**
 * 제품 업데이트
 */
export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
  const products = await loadProducts();
  const updated = products.map((p) => (p.id === id ? { ...p, ...updates } : p));
  await saveProducts(updated);
}

/**
 * 제품 삭제
 */
export async function deleteProduct(id: string): Promise<void> {
  const products = await loadProducts();
  const filtered = products.filter((p) => p.id !== id);
  await saveProducts(filtered);
}
