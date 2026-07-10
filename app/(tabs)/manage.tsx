import { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import "../custom-scrollbar.css";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { ResponsiveContainer } from "@/components/responsive-container";
import { ScrollToTopFab } from "@/components/scroll-to-top-fab";
import { useToast } from "@/lib/toast-provider";
import { useConfirm } from "@/lib/confirm-provider";
import type { Customer, Product, ProductCategory } from "@/lib/types";
import {
  loadCustomers,
  loadProducts,
  addCustomer,
  addProduct,
  deleteCustomer,
  deleteProduct,
  updateProduct,
  saveCustomers,
  saveProducts,
  uploadLocalToSupabase,
  getLocalCacheCounts,
} from "@/lib/storage";
import {
  exportCustomers,
  exportProducts,
  downloadCustomerTemplate,
  downloadProductTemplate,
  pickExcelFile,
  parseCustomerExcel,
  parseProductExcel,
  applyCustomerImport,
  applyProductImport,
  type ImportCustomerRow,
  type ImportProductRow,
  type DuplicateMode,
} from "@/lib/excel-manage";
import { PRODUCT_CATEGORIES } from "@/lib/data";
import { getCustomerDisplayName, getProductDisplayName, searchCustomers, searchProducts } from "@/lib/search-utils";
import { useAuth } from "@/hooks/use-auth";
import { useIsMounted } from "@/hooks/use-is-mounted";

const SHADOW = Platform.OS === 'web'
  ? { boxShadow: '0 2px 12px rgba(0,0,0,0.06)' } as any
  : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 };

type TabType = "customers" | "products" | "settings";

export default function ManageScreen() {
  const { showToast } = useToast();
  const router = useRouter();
  const { showConfirm } = useConfirm();
  const params = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>("customers");

  useEffect(() => {
    if (params.tab && ['customers', 'products', 'settings'].includes(params.tab as string)) {
      setActiveTab(params.tab as TabType);
    }
  }, [params.tab]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories] = useState<ProductCategory[]>(PRODUCT_CATEGORIES);

  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerAliases, setNewCustomerAliases] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("summer");
  const [newProductAliases, setNewProductAliases] = useState("");
  const [newProductUnitPrice, setNewProductUnitPrice] = useState("");
  const [selectedProductCategory, setSelectedProductCategory] = useState<string>("all");
  const [productQuery, setProductQuery] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  /** 추가 모달 열림 상태 (거래처/제품) */
  const [addCustomerModalVisible, setAddCustomerModalVisible] = useState(false);
  const [addProductModalVisible, setAddProductModalVisible] = useState(false);

  /** 제품 목록 검색 필터 (제품명 + 별칭 + 초성). 빈 쿼리면 전체. */
  const filteredProducts = useMemo(() => {
    const q = productQuery.trim();
    return q ? searchProducts(products, q) : products;
  }, [products, productQuery]);

  /** 거래처 검색용 */
  const [customerQuery, setCustomerQuery] = useState("");
  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim();
    return q ? searchCustomers(customers, q) : customers;
  }, [customers, customerQuery]);
  const [editingUnitPrice, setEditingUnitPrice] = useState("");

  const { user, logout, refresh: refreshAuth } = useAuth();
  const mounted = useIsMounted();
  const scrollViewRef = useRef<ScrollView>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setShowScrollTop(e.nativeEvent.contentOffset.y > 200);
  };
  const handleScrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const [migrationLoading, setMigrationLoading] = useState(false);
  const [localCacheCounts, setLocalCacheCounts] = useState<{ customers: number; products: number } | null>(null);

  useEffect(() => {
    getLocalCacheCounts().then(setLocalCacheCounts).catch(() => setLocalCacheCounts(null));
  }, []);

  async function handleUploadLocalToSupabase() {
    const counts = await getLocalCacheCounts();
    if (counts.customers === 0 && counts.products === 0) {
      showToast('이 기기에 업로드할 로컬 데이터가 없습니다.', 'info');
      return;
    }
    showConfirm({
      title: '로컬 데이터 업로드',
      message:
        `이 기기의 거래처 ${counts.customers}건, 품목 ${counts.products}건을 Supabase에 업로드합니다.\n` +
        `이미 Supabase에 같은 이름이 있으면 건너뜁니다. 계속하시겠습니까?`,
      confirmText: '업로드',
      cancelText: '취소',
      onConfirm: async () => {
        setMigrationLoading(true);
        try {
          const result = await uploadLocalToSupabase();
          showToast(
            `업로드 완료: 거래처 ${result.customers}건, 품목 ${result.products}건 (중복은 제외됨)`,
            'success',
          );
          await loadData();
          const after = await getLocalCacheCounts();
          setLocalCacheCounts(after);
        } catch (err: any) {
          showToast(err?.message ?? '업로드에 실패했습니다.', 'error');
        } finally {
          setMigrationLoading(false);
        }
      },
    });
  }

  // 엑셀 가져오기 상태
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importType, setImportType] = useState<'customers' | 'products'>('customers');
  const [importCustomerRows, setImportCustomerRows] = useState<ImportCustomerRow[]>([]);
  const [importProductRows, setImportProductRows] = useState<ImportProductRow[]>([]);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip');
  const [isImporting, setIsImporting] = useState(false);


  useEffect(() => {
    console.log('로그인 상태 변경:', user ? `로그인됨 (${user.email})` : '로그아웃');
  }, [user]);

  async function handleLogin() {
    try {
      if (Platform.OS === "web") {
        window.location.href = "/login";
      } else {
        showToast("로그인 기능은 웹 브라우저에서 사용해주세요.", "info");
      }
    } catch (error) {
      console.error("Login error:", error);
      showToast("로그인 중 오류가 발생했습니다.", "error");
    }
  }

  function handleLogout() {
    showConfirm({
      title: "로그아웃",
      message: "로그아웃하면 로컬에 저장된 데이터는 유지되지만, 클라우드 동기화가 중단됩니다.",
      confirmText: "로그아웃",
      cancelText: "취소",
      onConfirm: async () => {
        try {
          await logout();
          showToast("로그아웃되었습니다.", "success");
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        } catch (error) {
          console.error("Logout error:", error);
          showToast("로그아웃 중 오류가 발생했습니다.", "error");
        }
      },
    });
  }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [loadedCustomers, loadedProducts] = await Promise.all([
      loadCustomers(), loadProducts(),
    ]);
    setCustomers(loadedCustomers);
    setProducts(loadedProducts);
  }

  async function handleAddCustomer() {
    if (!newCustomerName.trim()) { showToast("거래처 이름을 입력해주세요.", "error"); return; }
    try {
      const aliases = newCustomerAliases.split(",").map((a) => a.trim()).filter((a) => a);
      await addCustomer(newCustomerName.trim(), aliases);
      if (Platform.OS !== "web") { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
      showToast("거래처가 추가되었습니다.", "success");
      setNewCustomerName(""); setNewCustomerAliases("");
      setAddCustomerModalVisible(false);
      await loadData();
    } catch (error) { showToast("거래처 추가에 실패했습니다.", "error"); }
  }

  async function handleAddProduct() {
    if (!newProductName.trim()) { showToast("제품명을 입력해주세요.", "error"); return; }
    try {
      const aliases = newProductAliases.split(",").map((a) => a.trim()).filter((a) => a);
      const unitPrice = newProductUnitPrice ? parseInt(newProductUnitPrice.replace(/,/g, ""), 10) : undefined;
      await addProduct(newProductName.trim(), newProductCategory, aliases, unitPrice);
      if (Platform.OS !== "web") { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
      showToast("제품이 추가되었습니다.", "success");
      setNewProductName(""); setNewProductAliases(""); setNewProductUnitPrice("");
      setAddProductModalVisible(false);
      await loadData();
    } catch (error) { showToast("제품 추가에 실패했습니다.", "error"); }
  }

  async function handleDeleteCustomer(customer: Customer) {
    showConfirm({
      message: `"${customer.name}" 거래처를 삭제하시겠습니까?`,
      confirmText: "삭제",
      onConfirm: async () => {
        try {
          await deleteCustomer(customer.id);
          if (Platform.OS !== "web") { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
          await loadData();
          showToast("거래처가 삭제되었습니다.", "success");
        } catch (error) { showToast("거래처 삭제에 실패했습니다.", "error"); }
      },
    });
  }

  function handleStartEditPrice(product: Product) {
    setEditingProductId(product.id);
    setEditingUnitPrice(product.unitPrice ? product.unitPrice.toLocaleString() : "");
  }

  function handleCancelEditPrice() {
    setEditingProductId(null); setEditingUnitPrice("");
  }

  async function handleSavePrice(productId: string) {
    try {
      const unitPrice = editingUnitPrice ? parseInt(editingUnitPrice.replace(/,/g, ""), 10) : undefined;
      await updateProduct(productId, { unitPrice });
      if (Platform.OS !== "web") { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
      showToast("가격이 수정되었습니다.", "success");
      setEditingProductId(null); setEditingUnitPrice("");
      await loadData();
    } catch (error) { showToast("가격 수정에 실패했습니다.", "error"); }
  }

  async function handleDeleteProduct(product: Product) {
    showConfirm({
      message: `"${product.name}" 제품을 삭제하시겠습니까?`,
      confirmText: "삭제",
      onConfirm: async () => {
        try {
          await deleteProduct(product.id);
          if (Platform.OS !== "web") { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
          await loadData();
          showToast("제품이 삭제되었습니다.", "success");
        } catch (error) { showToast("제품 삭제에 실패했습니다.", "error"); }
      },
    });
  }

  // ===== 엑셀 핸들러 =====

  async function handleExport(type: 'customers' | 'products') {
    try {
      if (type === 'customers') {
        await exportCustomers(customers);
      } else {
        await exportProducts(products);
      }
      showToast(`${type === 'customers' ? '거래처' : '제품'} 목록을 다운로드했습니다.`, 'success');
    } catch (error) {
      showToast('엑셀 내보내기에 실패했습니다.', 'error');
    }
  }

  async function handleDownloadTemplate(type: 'customers' | 'products') {
    try {
      if (type === 'customers') {
        await downloadCustomerTemplate();
      } else {
        await downloadProductTemplate();
      }
      showToast('빈 양식을 다운로드했습니다.', 'success');
    } catch (error) {
      showToast('양식 다운로드에 실패했습니다.', 'error');
    }
  }

  async function handleImportFile(type: 'customers' | 'products') {
    try {
      const file = await pickExcelFile();
      if (!file) {
        showToast('파일을 선택해주세요. (최대 5MB)', 'error');
        return;
      }
      setImportType(type);
      setDuplicateMode('skip');

      if (type === 'customers') {
        const rows = await parseCustomerExcel(file, customers);
        setImportCustomerRows(rows);
        setImportProductRows([]);
      } else {
        const rows = await parseProductExcel(file, products);
        setImportProductRows(rows);
        setImportCustomerRows([]);
      }
      setImportModalVisible(true);
    } catch (error: any) {
      showToast(error?.message || '파일 파싱에 실패했습니다.', 'error');
    }
  }

  async function handleConfirmImport() {
    setIsImporting(true);
    try {
      if (importType === 'customers') {
        const { customers: updated, newCount, updateCount } = applyCustomerImport(importCustomerRows, customers, duplicateMode);
        await saveCustomers(updated);
        const errorCount = importCustomerRows.filter((r) => r.status === 'error').length;
        showToast(`등록 완료: 신규 ${newCount}건 · 덮어쓰기 ${updateCount}건 · 오류 ${errorCount}건`, 'success');
      } else {
        const { products: updated, newCount, updateCount } = applyProductImport(importProductRows, products, duplicateMode);
        await saveProducts(updated);
        const errorCount = importProductRows.filter((r) => r.status === 'error').length;
        showToast(`등록 완료: 신규 ${newCount}건 · 덮어쓰기 ${updateCount}건 · 오류 ${errorCount}건`, 'success');
      }
      setImportModalVisible(false);
      await loadData();
    } catch (error) {
      showToast('가져오기에 실패했습니다.', 'error');
    } finally {
      setIsImporting(false);
    }
  }

  function getImportSummary() {
    const rows = importType === 'customers' ? importCustomerRows : importProductRows;
    return {
      total: rows.length,
      newCount: rows.filter((r) => r.status === 'new').length,
      dupCount: rows.filter((r) => r.status === 'duplicate').length,
      errCount: rows.filter((r) => r.status === 'error').length,
    };
  }

  const tabItems: { key: TabType; label: string }[] = [
    { key: 'customers', label: `거래처 (${customers.length})` },
    { key: 'products', label: `제품 (${products.length})` },
    { key: 'settings', label: '설정' },
  ];

  return (
    <ScreenContainer style={{ backgroundColor: '#f5f5f5' }}>
      <ResponsiveContainer className="flex-1">
        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          className="custom-scrollbar"
          contentContainerStyle={{ paddingBottom: 100 }}
          style={Platform.OS === 'web' ? ({ flex: 1, minHeight: 0, maxHeight: '100%' } as any) : { flex: 1 }}
        >
        <View style={{ padding: 20, paddingBottom: 0 }}>
          {/* 헤더 (로그인 정보는 공용 AppHeader 로 이동) */}
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#1B365D', letterSpacing: -0.5, marginBottom: 16 }}>
            데이터 관리
          </Text>

          {/* 탭 */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {tabItems.map(tab => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 10,
                  backgroundColor: activeTab === tab.key ? '#1B365D' : '#ffffff',
                  borderWidth: 1, borderColor: activeTab === tab.key ? '#1B365D' : '#e0e0e0',
                }}
              >
                <Text style={{
                  textAlign: 'center', fontSize: 16, fontWeight: '600',
                  color: activeTab === tab.key ? '#ffffff' : '#1B365D',
                }}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 거래처 관리 */}
        {activeTab === "customers" && (
          <View style={{ paddingHorizontal: 20 }}>
            {/* + 거래처 추가 버튼 (클릭 시 모달 오픈) */}
            <TouchableOpacity
              onPress={() => setAddCustomerModalVisible(true)}
              style={{
                backgroundColor: '#1B365D', paddingVertical: 14, borderRadius: 12,
                marginBottom: 16, alignItems: 'center', ...SHADOW,
              }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>+ 거래처 추가</Text>
            </TouchableOpacity>

            {/* 엑셀로 관리 */}
            <View style={{
              backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginBottom: 16,
              borderWidth: 0.5, borderColor: '#e0e0e0', ...SHADOW,
            }}>
              <Text style={{ fontSize: 15, fontWeight: '500', color: '#1B365D', marginBottom: 12 }}>
                엑셀로 관리
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => handleExport('customers')}
                  style={{ flex: 1, minWidth: 120, backgroundColor: '#1B365D', height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>엑셀 내보내기</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleImportFile('customers')}
                  style={{ flex: 1, minWidth: 120, backgroundColor: '#1B365D', height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>엑셀 가져오기</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => handleDownloadTemplate('customers')}
                style={{
                  backgroundColor: '#ffffff', height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#1B365D',
                  justifyContent: 'center', alignItems: 'center', marginBottom: 12,
                }}
              >
                <Text style={{ color: '#1B365D', fontSize: 14, fontWeight: '600' }}>빈 양식 다운로드</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: '#666666', lineHeight: 20 }}>
                {`· 내보내기: 현재 ${customers.length}개 거래처를 엑셀로 다운로드\n· 가져오기: 엑셀 파일로 거래처 일괄 등록\n· 빈 양식: 입력 전 양식만 다운로드`}
              </Text>
            </View>

            {/* 거래처 목록 */}
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#1B365D', marginBottom: 12 }}>거래처 목록</Text>

            {/* 검색 입력 */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TextInput
                value={customerQuery}
                onChangeText={setCustomerQuery}
                placeholder="거래처명 또는 초성 입력 (예: ㄱㅇ)"
                placeholderTextColor="#999"
                style={{
                  flex: 1, paddingHorizontal: 14, paddingVertical: 10,
                  borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
                  backgroundColor: '#ffffff', fontSize: 14, color: '#1B365D',
                }}
              />
              {customerQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setCustomerQuery("")}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                    backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#475569', fontSize: 13, fontWeight: '600' }}>지우기</Text>
                </TouchableOpacity>
              )}
            </View>

            {customers.length === 0 ? (
              <Text style={{ color: '#666666', textAlign: 'center', paddingVertical: 32 }}>
                등록된 거래처가 없습니다.
              </Text>
            ) : customerQuery.trim() && filteredCustomers.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#666' }}>
                  "{customerQuery}" 와(과) 일치하는 거래처가 없습니다.
                </Text>
              </View>
            ) : (
              filteredCustomers.map((item) => (
                <View
                  key={item.id}
                  style={{
                    backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginBottom: 8,
                    borderWidth: 1, borderColor: '#e0e0e0', ...SHADOW,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '500', color: '#1B365D' }}>
                        {getCustomerDisplayName(item)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => router.push(`/special-price?customer=${encodeURIComponent(item.name)}`)}
                        style={{ backgroundColor: '#1B365D', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                      >
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>특가 설정</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteCustomer(item)}
                        style={{ backgroundColor: '#e74c3c', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                      >
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* 제품 관리 */}
        {activeTab === "products" && (
          <View style={{ paddingHorizontal: 20 }}>
            {/* + 제품 추가 버튼 (클릭 시 모달 오픈) */}
            <TouchableOpacity
              onPress={() => setAddProductModalVisible(true)}
              style={{
                backgroundColor: '#1B365D', paddingVertical: 14, borderRadius: 12,
                marginBottom: 16, alignItems: 'center', ...SHADOW,
              }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>+ 제품 추가</Text>
            </TouchableOpacity>

            {/* 엑셀로 관리 */}
            <View style={{
              backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginBottom: 16,
              borderWidth: 0.5, borderColor: '#e0e0e0', ...SHADOW,
            }}>
              <Text style={{ fontSize: 15, fontWeight: '500', color: '#1B365D', marginBottom: 12 }}>
                엑셀로 관리
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => handleExport('products')}
                  style={{ flex: 1, minWidth: 120, backgroundColor: '#1B365D', height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>엑셀 내보내기</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleImportFile('products')}
                  style={{ flex: 1, minWidth: 120, backgroundColor: '#1B365D', height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>엑셀 가져오기</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => handleDownloadTemplate('products')}
                style={{
                  backgroundColor: '#ffffff', height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#1B365D',
                  justifyContent: 'center', alignItems: 'center', marginBottom: 12,
                }}
              >
                <Text style={{ color: '#1B365D', fontSize: 14, fontWeight: '600' }}>빈 양식 다운로드</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: '#666666', lineHeight: 20 }}>
                {`· 내보내기: 현재 ${products.length}개 제품을 엑셀로 다운로드\n· 가져오기: 엑셀 파일로 제품 일괄 등록\n· 빈 양식: 입력 전 양식만 다운로드`}
              </Text>
            </View>

            {/* 제품 목록 */}
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#1B365D', marginBottom: 12 }}>제품 목록</Text>

            {/* 검색 입력 */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TextInput
                value={productQuery}
                onChangeText={setProductQuery}
                placeholder="제품명 또는 초성 입력 (예: ㅎㅂ)"
                placeholderTextColor="#999"
                style={{
                  flex: 1, paddingHorizontal: 14, paddingVertical: 10,
                  borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
                  backgroundColor: '#ffffff', fontSize: 14, color: '#1B365D',
                }}
              />
              {productQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setProductQuery("")}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                    backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#475569', fontSize: 13, fontWeight: '600' }}>지우기</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 카테고리 필터 */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <TouchableOpacity
                onPress={() => setSelectedProductCategory("all")}
                style={{
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
                  backgroundColor: selectedProductCategory === "all" ? '#1B365D' : '#ffffff',
                  borderWidth: 1, borderColor: selectedProductCategory === "all" ? '#1B365D' : '#e0e0e0',
                }}
              >
                <Text style={{
                  fontSize: 14, fontWeight: '600',
                  color: selectedProductCategory === "all" ? '#ffffff' : '#1B365D',
                }}>전체</Text>
              </TouchableOpacity>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setSelectedProductCategory(cat.id)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
                    backgroundColor: selectedProductCategory === cat.id ? '#1B365D' : '#ffffff',
                    borderWidth: 1, borderColor: selectedProductCategory === cat.id ? '#1B365D' : '#e0e0e0',
                  }}
                >
                  <Text style={{
                    fontSize: 14, fontWeight: '600',
                    color: selectedProductCategory === cat.id ? '#ffffff' : '#1B365D',
                  }}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {productQuery.trim() && filteredProducts.length === 0 && (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#666' }}>
                  "{productQuery}" 와(과) 일치하는 제품이 없습니다.
                </Text>
              </View>
            )}

            {filteredProducts.length > 0 && categories.map((category) => {
              if (selectedProductCategory !== "all" && selectedProductCategory !== category.id) return null;
              const categoryProducts = filteredProducts.filter((p) => p.category === category.id);
              if (categoryProducts.length === 0) return null;

              return (
                <View key={category.id} style={{ marginBottom: 24 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#1B365D', marginBottom: 12 }}>
                    {category.name}
                  </Text>
                  {categoryProducts.map((item) => {
                    const isEditing = editingProductId === item.id;
                    return (
                      <View key={item.id} style={{
                        backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginBottom: 8,
                        borderWidth: 1, borderColor: '#e0e0e0', ...SHADOW,
                      }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEditing ? 12 : 0 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 16, fontWeight: '500', color: '#1B365D' }}>
                              {getProductDisplayName(item)}
                            </Text>
                            {!isEditing && item.unitPrice && (
                              <Text style={{ fontSize: 14, color: '#666666', marginTop: 4 }}>
                                {item.unitPrice.toLocaleString()}원
                              </Text>
                            )}
                          </View>
                          {!isEditing && (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity
                                onPress={() => handleStartEditPrice(item)}
                                style={{ backgroundColor: '#1B365D', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                              >
                                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>가격 수정</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleDeleteProduct(item)}
                                style={{ backgroundColor: '#e74c3c', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                              >
                                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>삭제</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                        {isEditing && (
                          <View>
                            <TextInput
                              value={editingUnitPrice}
                              onChangeText={(text) => {
                                const numericValue = text.replace(/[^0-9]/g, "");
                                const formatted = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                                setEditingUnitPrice(formatted);
                              }}
                              placeholder="단가 입력 (원)"
                              placeholderTextColor="#666666"
                              style={{
                                backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
                                borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#1B365D', marginBottom: 8,
                              }}
                              keyboardType="numeric"
                              autoFocus
                            />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity
                                onPress={() => handleSavePrice(item.id)}
                                style={{ flex: 1, backgroundColor: '#1B365D', paddingVertical: 10, borderRadius: 8 }}
                              >
                                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>저장</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={handleCancelEditPrice}
                                style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e0e0e0', paddingVertical: 10, borderRadius: 8 }}
                              >
                                <Text style={{ color: '#1B365D', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>취소</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {products.length === 0 && (
              <Text style={{ color: '#666666', textAlign: 'center', paddingVertical: 32 }}>
                등록된 제품이 없습니다.
              </Text>
            )}
          </View>
        )}

        {/* 설정 */}
        {activeTab === "settings" && (
          <View style={{ paddingHorizontal: 20 }}>
            <View style={{
              backgroundColor: '#ffffff', borderRadius: 14, padding: 16,
              borderWidth: 1, borderColor: '#e0e0e0', ...SHADOW,
            }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#1B365D', marginBottom: 12 }}>계정 정보</Text>
              {user ? (
                <View>
                  <Text style={{ fontSize: 16, color: '#1B365D', marginBottom: 8 }}>{user.email}</Text>
                  <Text style={{ fontSize: 13, color: '#666666', marginBottom: 16, lineHeight: 20 }}>
                    Supabase 클라우드에 데이터가 자동 저장됩니다.{"\n"}
                    같은 계정으로 로그인하면 어떤 기기에서든 데이터에 접근할 수 있습니다.
                  </Text>
                  <TouchableOpacity
                    onPress={handleLogout}
                    style={{ backgroundColor: '#e74c3c', paddingVertical: 12, borderRadius: 10 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', textAlign: 'center', fontSize: 16 }}>로그아웃</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={{ fontSize: 13, color: '#666666', marginBottom: 16 }}>로그인되지 않았습니다.</Text>
                  <TouchableOpacity
                    onPress={handleLogin}
                    style={{ backgroundColor: '#1B365D', paddingVertical: 12, borderRadius: 10 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', textAlign: 'center', fontSize: 16 }}>로그인</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {user && (
              <View style={{
                backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginTop: 16,
                borderWidth: 1, borderColor: '#e0e0e0', ...SHADOW,
              }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: '#1B365D', marginBottom: 8 }}>
                  초기 데이터 업로드
                </Text>
                <Text style={{ fontSize: 13, color: '#666666', marginBottom: 12, lineHeight: 20 }}>
                  이 기기의 로컬 저장소에 남아 있는 거래처·품목(단가 포함)을 Supabase로 올립니다.
                  정본 데이터가 있는 기기(예: 이 Mac)에서 최초 1회만 실행하면 됩니다.
                  이후에는 다른 기기에서도 Supabase 데이터를 공유합니다.
                  {"\n\n"}
                  이미 Supabase에 같은 이름으로 저장된 항목은 중복 처리되어 건너뜁니다 (안전).
                </Text>
                {localCacheCounts && (
                  <Text style={{ fontSize: 13, color: '#1B365D', marginBottom: 12 }}>
                    현재 로컬: 거래처 {localCacheCounts.customers}건, 품목 {localCacheCounts.products}건
                  </Text>
                )}
                <TouchableOpacity
                  onPress={handleUploadLocalToSupabase}
                  disabled={migrationLoading}
                  style={{
                    backgroundColor: migrationLoading ? '#888' : '#1B365D',
                    paddingVertical: 12, borderRadius: 10,
                    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
                  }}
                >
                  {migrationLoading && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '600', textAlign: 'center', fontSize: 16 }}>
                    {migrationLoading ? '업로드 중...' : '로컬 데이터를 Supabase에 업로드'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        </ScrollView>
        <ScrollToTopFab visible={showScrollTop} onPress={handleScrollToTop} />
      </ResponsiveContainer>

      {/* 거래처 추가 모달 */}
      <Modal
        visible={addCustomerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddCustomerModalVisible(false)}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center', alignItems: 'center', padding: 16,
        }}>
          <View style={{
            backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, overflow: 'hidden',
          }}>
            {/* 헤더 */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#1B365D',
            }}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' }}>거래처 추가</Text>
              <TouchableOpacity
                onPress={() => setAddCustomerModalVisible(false)}
                style={{
                  width: 30, height: 30, borderRadius: 15,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 14, color: '#fff' }}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* 본문 */}
            <View style={{ padding: 20 }}>
              <TextInput
                value={newCustomerName}
                onChangeText={setNewCustomerName}
                placeholder="거래처 이름"
                placeholderTextColor="#999"
                style={{
                  backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
                  borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
                  fontSize: 16, color: '#1B365D', marginBottom: 8,
                }}
                returnKeyType="next"
                autoFocus
              />
              <TextInput
                value={newCustomerAliases}
                onChangeText={setNewCustomerAliases}
                placeholder="별칭 (쉼표로 구분, 예: 7조, 켈리)"
                placeholderTextColor="#999"
                style={{
                  backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
                  borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
                  fontSize: 16, color: '#1B365D', marginBottom: 16,
                }}
                returnKeyType="done"
                onSubmitEditing={handleAddCustomer}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setAddCustomerModalVisible(false)}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 10,
                    backgroundColor: '#e5e7eb', alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#475569', fontSize: 14, fontWeight: '600' }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddCustomer}
                  style={{
                    flex: 1.5, paddingVertical: 12, borderRadius: 10,
                    backgroundColor: '#1B365D', alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>추가하기</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* 제품 추가 모달 */}
      <Modal
        visible={addProductModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddProductModalVisible(false)}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center', alignItems: 'center', padding: 16,
        }}>
          <View style={{
            backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, overflow: 'hidden',
          }}>
            {/* 헤더 */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#1B365D',
            }}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' }}>제품 추가</Text>
              <TouchableOpacity
                onPress={() => setAddProductModalVisible(false)}
                style={{
                  width: 30, height: 30, borderRadius: 15,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 14, color: '#fff' }}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* 본문 */}
            <View style={{ padding: 20 }}>
              <TextInput
                value={newProductName}
                onChangeText={setNewProductName}
                placeholder="제품명"
                placeholderTextColor="#999"
                style={{
                  backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
                  borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
                  fontSize: 16, color: '#1B365D', marginBottom: 8,
                }}
                returnKeyType="next"
                autoFocus
              />
              {/* 카테고리 */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setNewProductCategory(cat.id)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 8,
                      backgroundColor: newProductCategory === cat.id ? '#1B365D' : '#f5f5f5',
                      borderWidth: 1, borderColor: newProductCategory === cat.id ? '#1B365D' : '#e0e0e0',
                    }}
                  >
                    <Text style={{
                      textAlign: 'center', fontSize: 14, fontWeight: '500',
                      color: newProductCategory === cat.id ? '#ffffff' : '#1B365D',
                    }}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={newProductAliases}
                onChangeText={setNewProductAliases}
                placeholder="별칭 (쉼표로 구분)"
                placeholderTextColor="#999"
                style={{
                  backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
                  borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
                  fontSize: 16, color: '#1B365D', marginBottom: 8,
                }}
                returnKeyType="next"
              />
              <TextInput
                value={newProductUnitPrice}
                onChangeText={(text) => {
                  const numericValue = text.replace(/[^0-9]/g, "");
                  const formatted = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                  setNewProductUnitPrice(formatted);
                }}
                placeholder="단가 (원) - 선택 사항"
                placeholderTextColor="#999"
                style={{
                  backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
                  borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
                  fontSize: 16, color: '#1B365D', marginBottom: 16,
                }}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={handleAddProduct}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setAddProductModalVisible(false)}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 10,
                    backgroundColor: '#e5e7eb', alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#475569', fontSize: 14, fontWeight: '600' }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddProduct}
                  style={{
                    flex: 1.5, paddingVertical: 12, borderRadius: 10,
                    backgroundColor: '#1B365D', alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>추가하기</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* 엑셀 가져오기 미리보기 모달 */}
      <Modal
        visible={importModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setImportModalVisible(false)}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center', alignItems: 'center', padding: 16,
        }}>
          <View style={{
            backgroundColor: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 720, padding: 24,
            maxHeight: '85%', ...SHADOW,
          }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#1B365D', marginBottom: 16 }}>
              엑셀 가져오기 미리보기
            </Text>

            {/* 요약 통계 */}
            {(() => {
              const s = getImportSummary();
              return (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 14, color: '#1B365D', marginBottom: 8 }}>
                    총 {s.total}개 행 중:
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ backgroundColor: '#EAF3DE', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 12, color: '#27500A', fontWeight: '600' }}>신규</Text>
                      </View>
                      <Text style={{ fontSize: 13, color: '#1B365D' }}>{s.newCount}개</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ backgroundColor: '#FAEEDA', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 12, color: '#633806', fontWeight: '600' }}>중복</Text>
                      </View>
                      <Text style={{ fontSize: 13, color: '#1B365D' }}>{s.dupCount}개</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ backgroundColor: '#FCEBEB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 12, color: '#791F1F', fontWeight: '600' }}>오류</Text>
                      </View>
                      <Text style={{ fontSize: 13, color: '#1B365D' }}>{s.errCount}개</Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* 중복 처리 옵션 */}
            {getImportSummary().dupCount > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1B365D', marginBottom: 8 }}>중복 처리 방식</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {([
                    { value: 'skip' as DuplicateMode, label: '건너뛰기(기존 유지)' },
                    { value: 'overwrite' as DuplicateMode, label: '덮어쓰기' },
                    { value: 'addAll' as DuplicateMode, label: '모두 추가' },
                  ]).map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setDuplicateMode(opt.value)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
                        backgroundColor: duplicateMode === opt.value ? '#1B365D' : '#ffffff',
                        borderWidth: 1, borderColor: duplicateMode === opt.value ? '#1B365D' : '#e0e0e0',
                      }}
                    >
                      <Text style={{
                        fontSize: 13, fontWeight: '600',
                        color: duplicateMode === opt.value ? '#ffffff' : '#1B365D',
                      }}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 데이터 테이블 */}
            <ScrollView style={{ maxHeight: 300, marginBottom: 16, borderWidth: 0.5, borderColor: '#e0e0e0', borderRadius: 10 }}>
              {/* 헤더 */}
              <View style={{ flexDirection: 'row', backgroundColor: '#f5f5f5', borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0' }}>
                <Text style={{ width: 50, fontSize: 12, fontWeight: '700', color: '#1B365D', padding: 8, textAlign: 'center' }}>상태</Text>
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#1B365D', padding: 8 }}>이름</Text>
                {importType === 'products' && (
                  <Text style={{ width: 80, fontSize: 12, fontWeight: '700', color: '#1B365D', padding: 8, textAlign: 'right' }}>단가</Text>
                )}
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#1B365D', padding: 8 }}>
                  {importType === 'customers' ? '별칭' : '비고'}
                </Text>
              </View>
              {/* 행 */}
              {(importType === 'customers' ? importCustomerRows : importProductRows).map((row, idx) => {
                const statusStyle =
                  row.status === 'new' ? { bg: '#EAF3DE', color: '#27500A' } :
                  row.status === 'duplicate' ? { bg: '#FAEEDA', color: '#633806' } :
                  { bg: '#FCEBEB', color: '#791F1F' };
                const statusLabel = row.status === 'new' ? '신규' : row.status === 'duplicate' ? '중복' : '오류';

                return (
                  <View key={idx} style={{
                    flexDirection: 'row', alignItems: 'center',
                    borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0',
                  }}>
                    <View style={{ width: 50, padding: 8, alignItems: 'center' }}>
                      <View style={{ backgroundColor: statusStyle.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: statusStyle.color }}>{statusLabel}</Text>
                      </View>
                    </View>
                    <Text style={{ flex: 1, fontSize: 12, color: '#1B365D', padding: 8 }} numberOfLines={1}>
                      {row.name || '(빈칸)'}
                    </Text>
                    {importType === 'products' && (
                      <Text style={{ width: 80, fontSize: 12, color: '#1B365D', padding: 8, textAlign: 'right' }}>
                        {(row as ImportProductRow).unitPrice?.toLocaleString() || ''}
                      </Text>
                    )}
                    <Text style={{ flex: 1, fontSize: 11, color: '#666666', padding: 8 }} numberOfLines={1}>
                      {row.note || (importType === 'customers' ? (row as ImportCustomerRow).aliases.join(', ') : (row as ImportProductRow).category)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>

            {/* 버튼 */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setImportModalVisible(false)}
                style={{ flex: 1, backgroundColor: '#e0e0e0', paddingVertical: 12, borderRadius: 10 }}
              >
                <Text style={{ color: '#1B365D', fontWeight: '600', textAlign: 'center', fontSize: 16 }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmImport}
                disabled={isImporting}
                style={{
                  flex: 1, backgroundColor: '#1B365D', paddingVertical: 12, borderRadius: 10,
                  opacity: isImporting ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#ffffff', fontWeight: '600', textAlign: 'center', fontSize: 16 }}>
                  {isImporting ? '등록 중...' : '등록하기'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScreenContainer>
  );
}
