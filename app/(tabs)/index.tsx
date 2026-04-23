import { useState, useRef, useEffect } from "react";
import {
  ScrollView,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  Keyboard,
} from "react-native";
import "../custom-scrollbar.css";
import * as Haptics from "expo-haptics";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { ResponsiveContainer } from "@/components/responsive-container";
import { useColors } from "@/hooks/use-colors";
import { useToast } from "@/lib/toast-provider";
import { useConfirm } from "@/lib/confirm-provider";
import { loadCustomers, loadProducts } from "@/lib/storage";
import { searchCustomers, searchProducts } from "@/lib/search-utils";
import type { Customer, Product, TransactionItem } from "@/lib/types";
import { saveTransactionOffline } from "@/lib/sync-manager";
import { useAuth } from "@/hooks/use-auth";
import { useSync } from "@/hooks/use-sync";
import { SyncStatusBadge } from "@/components/sync-status-badge";

export default function HomeScreen() {
  const colors = useColors();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const { user, logout } = useAuth();
  const { syncStatus, isOnline } = useSync();
  
  // 로그인 함수
  const handleLogin = () => {
    if (Platform.OS === "web") {
      window.location.href = "/login";
    }
  };
  
  // 데이터 상태
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  // 입력 상태
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<TransactionItem[]>([
    { id: "1", productName: "", quantity: 0 }
  ]);
  const [isCancellation, setIsCancellation] = useState(false);
  
  // UI 상태
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 제품 검색 상태 (각 품목별로 관리)
  const [activeProductInput, setActiveProductInput] = useState<string | null>(null);
  const [productSuggestions, setProductSuggestions] = useState<Record<string, Product[]>>({});

  // 수량 직접 입력 모드 (품목 ID → 편집 중 여부)
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null);
  const [editingQuantityValue, setEditingQuantityValue] = useState("");

  // 유효성 검사: 거래처 이름이 등록된 리스트에 있는지
  const customerError = customerQuery.trim() !== "" && !customers.some(c => c.name === customerQuery.trim());

  // 유효성 검사: 각 품목명이 등록된 리스트에 있는지
  const productErrors: Record<string, boolean> = {};
  items.forEach(item => {
    if (item.productName.trim() !== "") {
      productErrors[item.id] = !products.some(p => p.name === item.productName.trim());
    }
  });

  // 수량 0인 품목 존재 여부
  const hasZeroQuantity = items.some(item => item.quantity <= 0);

  // 폼 전체 유효성
  const isFormValid =
    !!selectedCustomer &&
    !customerError &&
    items.every(item => item.productName.trim() !== "") &&
    !Object.values(productErrors).some(v => v) &&
    !hasZeroQuantity;

  // Refs
  const customerInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const itemRefs = useRef<Record<string, View | null>>({});
  const productNameInputRefs = useRef<Record<string, TextInput | null>>({});
  // 중복 제출 방지용 동기식 락 (state는 비동기라 빠른 더블클릭 방지 못 함)
  const isSubmittingRef = useRef(false);

  // 모바일 키보드 대응: 포커스 시 해당 입력 필드를 화면 중앙으로 스크롤
  const handleInputFocus = (event: any) => {
    if (Platform.OS === 'web') {
      setTimeout(() => {
        event?.target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  };

  // 데이터 로드
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [loadedCustomers, loadedProducts] = await Promise.all([
      loadCustomers(),
      loadProducts(),
    ]);
    setCustomers(loadedCustomers);
    setProducts(loadedProducts);
  }

  // 거래처 검색
  useEffect(() => {
    if (customerQuery.trim()) {
      const filtered = searchCustomers(customers, customerQuery);
      setFilteredCustomers(filtered);
      setShowCustomerSuggestions(true);
    } else {
      setFilteredCustomers([]);
      setShowCustomerSuggestions(false);
    }
  }, [customerQuery, customers]);

  // 거래처 선택
  function handleSelectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomerQuery(customer.name);
    setShowCustomerSuggestions(false);
    Keyboard.dismiss();
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  // 품목 추가
  function handleAddItem() {
    const newItem: TransactionItem = {
      id: Date.now().toString(),
      productName: "",
      quantity: 0,
    };
    setItems([...items, newItem]);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    // 새 품목을 화면 중앙으로 스크롤 및 자동 포커스
    setTimeout(() => {
      const newProductNameInput = productNameInputRefs.current[newItem.id];
      
      if (Platform.OS === 'web') {
        // 웹: 품목 카드 View를 찾아서 화면 중앙으로 스크롤
        if (newProductNameInput && typeof window !== 'undefined') {
          const itemCard = itemRefs.current[newItem.id];
          if (itemCard) {
            // React Native View의 내부 DOM 노드 접근
            const cardElement = (itemCard as any)._nativeTag
              ? document.querySelector(`[data-tag="${(itemCard as any)._nativeTag}"]`)
              : null;
            
            if (cardElement) {
              cardElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
              });
            }
          }
          
          // 스크롤 후 포커스
          setTimeout(() => {
            newProductNameInput?.focus();
          }, 300);
        }
      } else {
        // 모바일: measureLayout 사용
        const newItemRef = itemRefs.current[newItem.id];
        if (newItemRef && scrollViewRef.current) {
          newItemRef.measureLayout(
            // @ts-ignore
            scrollViewRef.current.getInnerViewNode(),
            (x, y) => {
              scrollViewRef.current?.scrollTo({ y: y - 100, animated: true });
              // 스크롤 후 포커스
              setTimeout(() => {
                newProductNameInput?.focus();
              }, 300);
            },
            () => {}
          );
        }
      }
    }, 200); // DOM 업데이트 완료 보장을 위해 200ms로 증가
  }

  // 품목 삭제
  function handleRemoveItem(id: string) {
    if (items.length === 1) {
      showToast("최소 1개의 품목이 필요합니다.", "error");
      return;
    }
    setItems(items.filter((item) => item.id !== id));
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  // 품목 업데이트
  function handleUpdateItem(id: string, field: "productName" | "quantity" | "unitPrice", value: string | number | undefined) {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
    
    // 제품명 입력 시 검색
    if (field === "productName" && typeof value === "string") {
      if (value.trim()) {
        const filtered = searchProducts(products, value);
        setProductSuggestions({ ...productSuggestions, [id]: filtered });
        setActiveProductInput(id);
      } else {
        const newSuggestions = { ...productSuggestions };
        delete newSuggestions[id];
        setProductSuggestions(newSuggestions);
        setActiveProductInput(null);
      }
    }
  }
  
  // 제품 선택
  function handleSelectProduct(itemId: string, product: Product) {
    setItems(
      items.map((item) =>
        item.id === itemId ? { ...item, productName: product.name, unitPrice: product.unitPrice } : item
      )
    );
    
    // 검색 결과 닫기
    const newSuggestions = { ...productSuggestions };
    delete newSuggestions[itemId];
    setProductSuggestions(newSuggestions);
    setActiveProductInput(null);
    
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  // 저장

  async function handleSubmit() {
    console.log("[handleSubmit] 저장 버튼 클릭됨");

    // 저장 중이면 중복 클릭 방지 (ref는 동기식 — 빠른 더블클릭도 차단)
    if (isSubmittingRef.current) {
      console.log("[handleSubmit] 저장 중이므로 중복 클릭 방지");
      return;
    }
    isSubmittingRef.current = true;

    // 유효성 검사
    if (!selectedCustomer) {
      console.log("[handleSubmit] 검증 실패: 거래처 선택 안됨");
      isSubmittingRef.current = false;
      showToast("거래처를 선택해주세요.", "error");
      return;
    }

    const hasEmptyProduct = items.some((item) => !item.productName.trim());
    if (hasEmptyProduct) {
      console.log("[handleSubmit] 검증 실패: 품목명 비어있음");
      isSubmittingRef.current = false;
      showToast("모든 품목명을 입력해주세요.", "error");
      return;
    }

    const hasInvalidQuantity = items.some((item) => item.quantity <= 0);
    if (hasInvalidQuantity) {
      console.log("[handleSubmit] 검증 실패: 수량 0 이하");
      isSubmittingRef.current = false;
      showToast("수량은 1 이상이어야 합니다.", "error");
      return;
    }
    
    console.log("[handleSubmit] 유효성 검사 통과", { selectedCustomer, items, isCancellation });

    setIsSubmitting(true);

    try {
      // 거래일 준비
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // 각 품목을 개별 거래로 로컬에 저장 → 큐에 추가 → 온라인이면 자동 동기화
      for (const item of items) {
        await saveTransactionOffline({
          customerName: selectedCustomer.name,
          productName: item.productName,
          quantity: isCancellation ? -Math.abs(item.quantity) : item.quantity,
          unitPrice: item.unitPrice,
          date: dateStr,
        });
      }

      console.log("로컬 저장 완료 (동기화 대기열 추가됨)");

      console.log("[handleSubmit] 저장 성공!");

      // 다른 페이지에 즉시 반영 이벤트 발행
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('transaction:changed'));
      }

      // 성공 피드백
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // 저장 성공 메시지 먼저 표시
      const customerName = selectedCustomer.name;
      const itemCount = items.length;
      
      // 초기화 실행
      console.log("[handleSubmit] 초기화 실행 전");
      handleReset();
      console.log("[handleSubmit] 초기화 실행 후");
      
      // 그 다음 알림 표시
      showToast(`저장 완료: ${customerName}의 거래 내역 ${itemCount}건이 저장되었습니다.`, "success");
    } catch (error) {
      console.error("[handleSubmit] 저장 실패:", error);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      showToast("저장에 실패했습니다. 다시 시도해주세요.", "error");
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }

  // 초기화
  function handleReset() {
    // 취소 및 반품 체크박스 먼저 초기화
    setIsCancellation(false);
    setCustomerQuery("");
    setSelectedCustomer(null);
    setItems([{ id: Date.now().toString(), productName: "", quantity: 0 }]);
    setShowCustomerSuggestions(false);
    setFilteredCustomers([]);
    setActiveProductInput(null);
    setProductSuggestions({});
    customerInputRef.current?.focus();
  }

  return (
    <ScreenContainer style={{ backgroundColor: '#f5f5f5' }}>
      <ResponsiveContainer>
        {/* Flex 컨테이너: 전체 화면 높이 고정 */}
        <View 
          className="flex-1"
          style={Platform.OS === 'web' ? {
            maxHeight: '100dvh' as any,
            display: 'flex' as any,
            flexDirection: 'column' as any,
            overflow: 'hidden' as any
          } as any : { flex: 1 }}
        >
          {/* 헤더 영역 */}
          <View className="px-5 pt-5 pb-3">
            {/* 로그인 정보 (우측 상단) - 항상 표시 */}
            <View className="flex-row justify-end items-center mb-3 gap-3">
              {user ? (
                <>
                  <Text className="text-sm text-muted">{user.email}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      showConfirm({
                        title: "로그아웃",
                        message: "로그아웃 하시겠습니까? 로그아웃 후에도 로컬 데이터는 유지됩니다.",
                        onConfirm: async () => {
                          await logout();
                          showToast("로그아웃되었습니다.", "success");
                        },
                      });
                    }}
                  >
                    <Text className="text-sm text-error font-semibold">
                      로그아웃
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  onPress={handleLogin}
                >
                  <Text className="text-sm text-primary font-semibold">
                    로그인
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            
            <View className="items-center gap-2">
              <Text className="text-3xl font-bold text-foreground">
                거래내역 입력
              </Text>
              <SyncStatusBadge />
              <Text className="text-base text-muted">
                거래처와 품목을 입력하세요
              </Text>
            </View>

            {/* 출고/반품 탭 */}
            <View style={{
              flexDirection: 'row', marginTop: 16, borderRadius: 10, overflow: 'hidden',
              borderWidth: 2, borderColor: isCancellation ? '#e74c3c' : '#e0e0e0',
              ...(Platform.OS === 'web'
                ? { boxShadow: '0 2px 12px rgba(0,0,0,0.06)' } as any
                : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }),
            }}>
              <TouchableOpacity
                onPress={() => {
                  setIsCancellation(false);
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, paddingVertical: 12,
                  backgroundColor: !isCancellation ? '#1B365D' : '#ffffff',
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons name="local-shipping" size={18} color={!isCancellation ? '#ffffff' : '#666666'} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: !isCancellation ? '#ffffff' : '#666666' }}>출고</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setIsCancellation(true);
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, paddingVertical: 12,
                  backgroundColor: isCancellation ? '#e74c3c' : '#ffffff',
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons name="undo" size={18} color={isCancellation ? '#ffffff' : '#666666'} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: isCancellation ? '#ffffff' : '#666666' }}>반품</Text>
              </TouchableOpacity>
            </View>

            {/* 반품 모드 경고 배너 */}
            {isCancellation && (
              <View style={{
                backgroundColor: '#fde8e8', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16,
                marginTop: 12,
              }}>
                <Text style={{ color: '#e74c3c', fontWeight: '600', fontSize: 14, textAlign: 'center' }}>
                  반품 거래를 입력합니다
                </Text>
              </View>
            )}
          </View>

          {/* 스크롤 가능 영역: 거래처 + 품목 목록 */}
          <ScrollView
            ref={scrollViewRef}
            className="flex-1 custom-scrollbar"
            contentContainerStyle={{
              padding: 20,
              paddingTop: 12,
              paddingBottom: 100
            }}
            style={Platform.OS === 'web' ? {
              flex: 1,
              minHeight: 0, // Flex 버그 방지: 내용물보다 커지는 것 방지
              maxHeight: '100%', // 부모 높이를 초과하지 못하도록 강제
              overflowY: 'auto' as any,
              scrollbarGutter: 'stable' as any
            } as any : { flex: 1 }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-6">
          {/* 거래처 검색 */}
          <View className="gap-2">
            <TouchableOpacity
              onPress={() => customerInputRef.current?.focus()}
              activeOpacity={0.7}
              style={{ padding: 12, margin: -12, cursor: 'pointer' } as any}
            >
              <Text className="text-xl font-semibold text-foreground">
                거래처 이름
              </Text>
            </TouchableOpacity>
            <View style={{ position: 'relative' }}>
              <TextInput
                ref={customerInputRef}
                value={customerQuery}
                onChangeText={setCustomerQuery}
                placeholder="거래처 이름 또는 초성 입력 (예: ㅎㅂ)"
                placeholderTextColor="#666666"
                className="text-foreground text-xl"
                style={{
                  fontSize: 20,
                  backgroundColor: '#ffffff',
                  borderRadius: 14,
                  paddingHorizontal: 20,
                  paddingRight: customerQuery ? 48 : 20,
                  paddingVertical: 16,
                  borderColor: customerError ? '#e74c3c' : '#e0e0e0',
                  borderWidth: customerError ? 2 : 1,
                  ...(Platform.OS === 'web'
                    ? { boxShadow: '0 2px 12px rgba(0,0,0,0.06)' } as any
                    : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }),
                }}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={handleInputFocus}
              />
              {customerQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setCustomerQuery("");
                    setSelectedCustomer(null);
                    customerInputRef.current?.focus();
                  }}
                  activeOpacity={0.6}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: [{ translateY: -12 }],
                    width: 24,
                    height: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  accessibilityLabel="입력 지우기"
                >
                  <Text style={{ fontSize: 16, color: '#999999' }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            {customerError && (
              <Text style={{ color: '#e74c3c', fontSize: 14, marginTop: 4 }}>
                등록되지 않은 거래처입니다
              </Text>
            )}

            {/* 자동완성 목록 */}
            {showCustomerSuggestions && filteredCustomers.length > 0 && (
              <View className="bg-surface border border-border rounded-xl overflow-hidden max-h-60">
                <ScrollView>
                  {filteredCustomers.map((customer) => (
                    <TouchableOpacity
                      key={customer.id}
                      onPress={() => handleSelectCustomer(customer)}
                      className="px-6 py-4 border-b border-border"
                      activeOpacity={0.7}
                    >
                      <Text className="text-foreground text-xl">
                        {customer.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* 품목 입력 */}
          <View className="gap-2" style={{ marginTop: 48 }}>
            <TouchableOpacity
              onPress={() => {
                const firstItem = items[0];
                if (firstItem) productNameInputRefs.current[firstItem.id]?.focus();
              }}
              activeOpacity={0.7}
              style={{ padding: 12, margin: -12, cursor: 'pointer' } as any}
            >
              <Text className="text-xl font-semibold text-foreground">
                품목 목록
              </Text>
            </TouchableOpacity>

            {items.map((item, index) => (
              <View
                key={item.id}
                ref={(ref) => { itemRefs.current[item.id] = ref; }}
                // @ts-ignore - data-item-id for web scrollIntoView
                data-item-id={item.id}
                className="p-4 gap-3"
                style={{
                  backgroundColor: '#f8f9fa',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                }}
              >
                <View className="flex-row items-center justify-between">
                  <TouchableOpacity
                    onPress={() => productNameInputRefs.current[item.id]?.focus()}
                    activeOpacity={0.7}
                    style={{ padding: 12, margin: -12, cursor: 'pointer' } as any}
                  >
                    <Text className="text-lg font-medium text-foreground">
                      품목 {index + 1}
                    </Text>
                  </TouchableOpacity>
                  {items.length > 1 && (
                    <TouchableOpacity
                      onPress={() => handleRemoveItem(item.id)}
                      activeOpacity={0.6}
                    >
                      <Text className="text-error text-lg font-semibold">
                        삭제
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View>
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      ref={(ref) => { productNameInputRefs.current[item.id] = ref; }}
                      value={item.productName}
                      onChangeText={(value) =>
                        handleUpdateItem(item.id, "productName", value)
                      }
                      placeholder="품목명 입력 (초성 가능, 예: ㅎㅂ)"
                      placeholderTextColor="#666666"
                      className="text-foreground text-lg"
                      style={{
                        fontSize: 18,
                        backgroundColor: '#ffffff',
                        borderRadius: 10,
                        paddingHorizontal: 16,
                        paddingRight: item.productName ? 44 : 16,
                        paddingVertical: 14,
                        borderColor: productErrors[item.id] ? '#e74c3c' : '#e0e0e0',
                        borderWidth: productErrors[item.id] ? 2 : 1,
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      onFocus={handleInputFocus}
                    />
                    {item.productName.length > 0 && (
                      <TouchableOpacity
                        onPress={() => {
                          handleUpdateItem(item.id, "productName", "");
                          productNameInputRefs.current[item.id]?.focus();
                        }}
                        activeOpacity={0.6}
                        style={{
                          position: 'absolute',
                          right: 10,
                          top: '50%',
                          transform: [{ translateY: -12 }],
                          width: 24,
                          height: 24,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        accessibilityLabel="품목명 지우기"
                      >
                        <Text style={{ fontSize: 16, color: '#999999' }}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {productErrors[item.id] && (
                    <Text style={{ color: '#e74c3c', fontSize: 14, marginTop: 4 }}>
                      등록되지 않은 품목입니다
                    </Text>
                  )}
                  
                  {/* 제품 자동완성 목록 */}
                  {activeProductInput === item.id && productSuggestions[item.id] && productSuggestions[item.id].length > 0 && (
                    <View className="bg-background border border-border rounded-lg mt-2 overflow-hidden max-h-48">
                      <ScrollView>
                        {productSuggestions[item.id].map((product) => (
                          <TouchableOpacity
                            key={product.id}
                            onPress={() => handleSelectProduct(item.id, product)}
                            className="px-4 py-3 border-b border-border"
                            activeOpacity={0.7}
                          >
                            <Text className="text-foreground text-base">
                              {product.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <View className="flex-row items-center gap-3">
                  <Text className="text-lg text-foreground">수량:</Text>
                  <View className="flex-row items-center gap-2 flex-1">
                    {/* 마이너스 버튼 */}
                    <TouchableOpacity
                      onPress={() => {
                        const newVal = Math.max(0, item.quantity - 1);
                        handleUpdateItem(item.id, "quantity", newVal);
                        if (Platform.OS !== "web") {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                      }}
                      className="w-12 h-12 items-center justify-center"
                      style={{ backgroundColor: '#e0e0e0', borderRadius: 8 }}
                      activeOpacity={0.6}
                    >
                      <Text style={{ fontSize: 24, fontWeight: '700', color: '#1B365D' }}>−</Text>
                    </TouchableOpacity>

                    {/* 수량 표시 / 직접 입력 */}
                    {editingQuantityId === item.id ? (
                      <TextInput
                        value={editingQuantityValue}
                        onChangeText={setEditingQuantityValue}
                        onBlur={() => {
                          const num = parseInt(editingQuantityValue) || 0;
                          handleUpdateItem(item.id, "quantity", Math.max(0, num));
                          setEditingQuantityId(null);
                          setEditingQuantityValue("");
                        }}
                        autoFocus
                        keyboardType="number-pad"
                        className="bg-background border-2 border-primary rounded-lg px-4 py-2 text-foreground text-xl text-center flex-1"
                        style={{ fontSize: 20, minWidth: 60 }}
                        selectTextOnFocus
                        onFocus={handleInputFocus}
                      />
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          setEditingQuantityId(item.id);
                          setEditingQuantityValue(item.quantity.toString());
                        }}
                        className="bg-background border border-border rounded-lg px-4 py-2 flex-1 items-center"
                        activeOpacity={0.6}
                      >
                        <Text
                          className="text-xl font-semibold"
                          style={{ color: item.quantity === 0 ? colors.muted : colors.foreground }}
                        >
                          {item.quantity}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* 플러스 버튼 */}
                    <TouchableOpacity
                      onPress={() => {
                        handleUpdateItem(item.id, "quantity", item.quantity + 1);
                        if (Platform.OS !== "web") {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                      }}
                      className="w-12 h-12 items-center justify-center"
                      style={{ backgroundColor: '#1B365D', borderRadius: 8 }}
                      activeOpacity={0.6}
                    >
                      <Text style={{ fontSize: 24, fontWeight: '700', color: '#ffffff' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>


              </View>
            ))}
          </View>
            </View>
          </ScrollView>

          {/* Footer: 하단 버튼 영역 */}
          <View
            className="bg-background border-t border-border"
            style={Platform.OS === 'web' ? {
              flexShrink: 0,
              zIndex: 10,
              boxShadow: '0 -2px 10px rgba(0,0,0,0.1)' as any,
              paddingTop: 16,
              paddingHorizontal: 'clamp(4px, 3vw, 20px)' as any,
              paddingBottom: 'calc(1rem + 70px + env(safe-area-inset-bottom))' as any,
            } as any : { paddingVertical: 16, paddingHorizontal: 12, paddingBottom: 70 }}
          >
            <View className="gap-3">
              {/* 품목 추가 버튼 */}
              <TouchableOpacity
                onPress={handleAddItem}
                style={{
                  borderWidth: 2, borderColor: '#1B365D', borderStyle: 'dashed',
                  borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: '#EDF1F7',
                }}
                activeOpacity={0.7}
              >
                <Text style={{ color: '#1B365D', fontSize: 18, fontWeight: '600' }} numberOfLines={1}>
                  + 품목 추가
                </Text>
              </TouchableOpacity>

              {/* 저장 버튼 */}
              <View>
                {hasZeroQuantity && !isSubmitting && (
                  <Text style={{ color: '#e74c3c', fontSize: 13, textAlign: 'center', marginBottom: 4 }}>
                    수량이 0인 품목이 있습니다
                  </Text>
                )}
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={isSubmitting || !isFormValid}
                  style={{
                    backgroundColor: (isSubmitting || !isFormValid) ? '#999999' : isCancellation ? '#e74c3c' : '#1B365D',
                    opacity: (isSubmitting || !isFormValid) ? 0.5 : 1,
                    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700' }} numberOfLines={1}>
                    {isSubmitting ? "저장 중..." : isCancellation ? "반품 저장하기" : "저장하기"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </ResponsiveContainer>
    </ScreenContainer>
  );
}
