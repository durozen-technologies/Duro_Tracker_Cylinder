import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, Pressable, ScrollView, FlatList, Modal, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, X, Search, Store, ArrowLeft, Download, FileText, Receipt, PackageOpen, Truck, RefreshCw, Edit, PauseCircle, CheckCircle } from 'lucide-react-native';
import { useProviderPurchases, useProviders, useCreatePurchase, useCreateProvider, useUpdateProvider } from '../../hooks/usePurchases';
import { useItems } from '../../hooks/useItems';
import type { Provider } from '../../types/api';
import CustomAlert from '../../components/CustomAlert';

export default function PurchasesScreen() {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const { 
    data: providerPurchasesData = [], 
    isLoading: isPurchasesLoading, 
    refetch: refetchPurchases, 
    isRefetching: isPurchasesRefetching,
    fetchNextPage: fetchNextPurchasesPage,
    hasNextPage: hasNextPurchasesPage,
    isFetchingNextPage: isFetchingNextPurchasesPage
  } = useProviderPurchases(selectedProviderId || undefined);
  const providerPurchases = providerPurchasesData || [];
  
  const { data: providers = [], isLoading: isProvidersLoading, refetch: refetchProviders, isRefetching: isProvidersRefetching } = useProviders();
  const selectedProvider = providers.find(p => p.id === selectedProviderId) || null;

  useFocusEffect(
    useCallback(() => {
      if (selectedProviderId) refetchPurchases();
      refetchProviders();
    }, [refetchPurchases, refetchProviders])
  );

  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderPhone, setNewProviderPhone] = useState('');
  const [newProviderGstin, setNewProviderGstin] = useState('');
  const [newProviderPricePerKg, setNewProviderPricePerKg] = useState('');
  const [newProviderFinBal, setNewProviderFinBal] = useState('');
  const [newProviderInventory, setNewProviderInventory] = useState<Record<string, string>>({});

  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [billNumber, setBillNumber] = useState('');
  const [itemStates, setItemStates] = useState<Record<string, { fullBought: string; emptyReturned: string }>>({});
  const [amountPaid, setAmountPaid] = useState('');
  const [isEditPriceModalOpen, setIsEditPriceModalOpen] = useState(false);
  const [editPricePerKg, setEditPricePerKg] = useState('');
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(Date.now().toString(36) + Math.random().toString(36).substring(2));

  // Clear cart and rotate idempotency key when provider changes
  React.useEffect(() => {
    setItemStates({});
    setAmountPaid('');
    setIdempotencyKey(Date.now().toString(36) + Math.random().toString(36).substring(2));
  }, [selectedProviderId]);

  const [isEditProviderModalOpen, setIsEditProviderModalOpen] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [editProviderName, setEditProviderName] = useState('');
  const [editProviderPhone, setEditProviderPhone] = useState('');
  const [editProviderGstin, setEditProviderGstin] = useState('');

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' as 'error'|'success'|'info' });

  const showAlert = (title: string, message: string, type: 'error'|'success'|'info' = 'error') => {
    setAlertConfig({ title, message, type });
    setAlertVisible(true);
  };

  const { data: items = [] } = useItems();
  const createPurchase = useCreatePurchase();
  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider();

  const handleSaveProvider = () => {
    if (!newProviderName.trim()) return;
    createProvider.mutate(
      { 
        name: newProviderName.trim(), 
        phone: newProviderPhone.trim(),
        gstin: newProviderGstin.trim(),
        price_per_kg: newProviderPricePerKg ? parseFloat(newProviderPricePerKg) : undefined,
        balance_pending: parseFloat(newProviderFinBal) || 0,
        inventory: Object.entries(newProviderInventory)
          .map(([item_id, cylinders_pending]) => ({ item_id, cylinders_pending: parseInt(cylinders_pending) || 0 }))
          .filter(inv => inv.cylinders_pending > 0),
      },
      {
        onSuccess: () => {
          setIsProviderModalOpen(false);
          setNewProviderName('');
          setNewProviderPhone('');
          setNewProviderGstin('');
          setNewProviderPricePerKg('');
          setNewProviderFinBal('');
          setNewProviderInventory({});
        }
      }
    );
  };

  const handleUpdatePrice = () => {
    if (!selectedProvider) return;
    const priceVal = parseFloat(editPricePerKg);
    
    if (priceVal < 0) {
      showAlert("Invalid", "Price cannot be negative.", "error");
      return;
    }
    
    updateProvider.mutate(
      {
        id: selectedProvider.id,
        data: {
          price_per_kg: isNaN(priceVal) ? undefined : priceVal
        }
      },
      {
        onSuccess: (updated) => {
          setIsEditPriceModalOpen(false);
          // Provider refetch will update selectedProvider automatically
        }
      }
    );
  };

  const handleEditProvider = () => {
    if (!editProviderId || !editProviderName.trim()) return;
    updateProvider.mutate(
      {
        id: editProviderId,
        data: {
          name: editProviderName.trim(),
          phone: editProviderPhone.trim(),
          gstin: editProviderGstin.trim(),
        }
      },
      {
        onSuccess: () => {
          setIsEditProviderModalOpen(false);
          setEditProviderId(null);
        }
      }
    );
  };

  const handleToggleProvider = (provider: Provider) => {
    updateProvider.mutate({
      id: provider.id,
      data: { is_active: !provider.is_active }
    });
  };

  const calculatedTotalCost = React.useMemo(() => {
    if (!selectedProvider?.price_per_kg) return 0;
    let total = 0;
    Object.entries(itemStates).forEach(([id, state]) => {
      const full = parseInt(state.fullBought) || 0;
      const item = items.find(i => i.id === id);
      if (item && item.capacity_kg) {
        total += selectedProvider.price_per_kg! * item.capacity_kg * full;
      }
    });
    return total;
  }, [itemStates, selectedProvider?.price_per_kg, items]);

  const handleSavePurchase = () => {
    if (!selectedProvider) return;
    
    const itemsPayload = [];
    let hasNegatives = false;
    
    for (const [id, state] of Object.entries(itemStates)) {
      const full = parseInt(state.fullBought) || 0;
      const empty = parseInt(state.emptyReturned) || 0;
      
      if (full < 0 || empty < 0) {
        hasNegatives = true;
        break;
      }
      
      if (full === 0 && empty === 0) continue;
      
      const item = items.find(i => i.id === id);
      const cost = (selectedProvider.price_per_kg || 0) * (item?.capacity_kg || 0) * full;
      
      itemsPayload.push({
        item_id: id,
        full_received: full,
        empty_returned: empty,
        total_cost: cost
      });
    }

    if (hasNegatives) {
      showAlert("Invalid", "Quantities cannot be negative.", "error");
      return;
    }

    if (itemsPayload.length === 0) return;

    for (const payload of itemsPayload) {
      const item = items.find(i => i.id === payload.item_id);
      if (item && payload.empty_returned > (item.current_empty || 0)) {
        showAlert("No Stock", `Not enough empty cylinders in warehouse for ${item.name}. Available: ${item.current_empty || 0}`);
        return;
      }
      
      const providerPending = selectedProvider.inventory?.find(inv => inv.item_id === payload.item_id)?.cylinders_pending || 0;
      if (payload.full_received > (providerPending + payload.empty_returned)) {
        showAlert("Invalid", `Provider cannot give ${payload.full_received} full cylinders when they only hold ${providerPending} pending and you are only returning ${payload.empty_returned} empties.`);
        return;
      }
    }

    const amount = parseFloat(amountPaid) || 0;
    if (amount < 0) {
      showAlert("Invalid Payment", "Payment amount cannot be negative.", "error");
      return;
    }

    const maxAllowedAmount = Math.max(0, calculatedTotalCost + (selectedProvider.balance_pending || 0));
    if (amount > maxAllowedAmount) {
      showAlert(
        "Invalid Payment", 
        `Payment cannot exceed the total bill amount plus outstanding balance. Maximum allowed: ₹${maxAllowedAmount.toLocaleString()}.`,
        "error"
      );
      return;
    }

    createPurchase.mutate({
      provider_id: selectedProvider.id,
      bill_number: billNumber || undefined,
      total_cost: calculatedTotalCost,
      amount_paid: amount,
      price_per_kg: selectedProvider.price_per_kg,
      items: itemsPayload,
      idempotencyKey: idempotencyKey
    }, {
      onSuccess: () => {
        setIsPurchaseModalOpen(false);
        setBillNumber('');
        setItemStates({});
        setAmountPaid('');
        setIdempotencyKey(Date.now().toString(36) + Math.random().toString(36).substring(2));
        showAlert('Success', 'Purchase recorded successfully.', 'success');
      },
      onError: (err: any) => {  }
    });
  };

  const getItemName = (id: string) => items.find(i => i.id === id)?.name || id.split('-')[0];

  const getItemsSummary = (entries: any[]) => {
    if (!entries || entries.length === 0) return 'No items';
    return entries.map(e => {
      const name = getItemName(e.item_id);
      return `${e.full_received}x ${name}`;
    }).join(', ');
  };

  const renderPurchaseRow = ({ item }: { item: any }) => {
    const receiptNumber = item.bill_number || (item.id ? String(item.id).split('-')[0].toUpperCase() : '-');
    const currentBillBal = item.total_cost - item.amount_paid;
    const formattedDate = item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown Date';

    return (
      <View className="bg-white p-4 rounded-2xl mb-4 shadow-sm border border-zinc-200 w-full">
        {/* Header */}
        <View className="flex-row justify-between items-start mb-4 border-b border-zinc-100 pb-3">
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-1">
              <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Bill No: {receiptNumber}</Text>
              {item.price_per_kg && (
                <View className="bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  <Text className="text-indigo-700 text-[10px] font-bold">₹{item.price_per_kg}/kg</Text>
                </View>
              )}
            </View>
            <Text className="text-xl font-bold text-zinc-900">
              {selectedProvider?.name || 'Unknown Provider'}
            </Text>
            <Text className="text-zinc-500 text-sm mt-0.5">
              {formattedDate}
            </Text>
          </View>
        </View>

        {/* Items Table */}
        <View className="mb-4 bg-zinc-50 rounded-xl overflow-hidden border border-zinc-100">
          <View className="flex-row border-b border-zinc-200 px-3 py-2 bg-zinc-100/50">
            <Text className="flex-1 text-zinc-500 text-xs font-bold uppercase tracking-wider">Item</Text>
            <Text className="w-16 text-center text-zinc-500 text-xs font-bold uppercase tracking-wider">Full</Text>
            <Text className="w-16 text-center text-zinc-500 text-xs font-bold uppercase tracking-wider">Empty</Text>
            <Text className="w-20 text-right text-zinc-500 text-xs font-bold uppercase tracking-wider">Total</Text>
          </View>
          {item.entries && item.entries.length > 0 ? (
            item.entries.map((e: any, idx: number) => (
              <View key={idx} className="flex-row px-3 py-2.5 border-b border-zinc-100 last:border-0 items-center">
                <View className="flex-1 pr-2">
                  <Text className="text-zinc-800 font-medium text-sm">{getItemName(e.item_id)}</Text>
                </View>
                <Text className="w-16 text-center text-zinc-800 font-semibold">{e.full_received}</Text>
                <Text className="w-16 text-center text-zinc-600 text-xs font-medium">{e.empty_returned}</Text>
                <Text className="w-20 text-right text-zinc-800 font-bold">₹{e.total_cost}</Text>
              </View>
            ))
          ) : (
            <View className="px-3 py-4 items-center">
               <Text className="text-zinc-400 text-sm font-medium">No items</Text>
            </View>
          )}
        </View>

        {/* Summary Section */}
        <View className="mb-2 px-1">
          <View className="flex-row justify-between items-center py-1.5">
            <Text className="text-zinc-600 font-medium">Total Bill Amount</Text>
            <Text className="text-zinc-900 font-bold text-base">₹{item.total_cost.toLocaleString()}</Text>
          </View>
          {item.amount_paid > 0 && (
            <View className="flex-row justify-between items-center py-1.5">
              <Text className="text-emerald-600 font-medium">Amount Paid</Text>
              <Text className="text-emerald-600 font-semibold">- ₹{item.amount_paid.toLocaleString()}</Text>
            </View>
          )}
          <View className="flex-row justify-between items-center pt-3 pb-1 border-t border-zinc-100 mt-1.5">
            <Text className="text-zinc-800 font-semibold">Balance Amount</Text>
            <Text className="text-zinc-900 font-bold text-base">₹{(item.closing_balance ?? (selectedProvider?.balance_pending || 0)).toLocaleString()}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderProviderCRM = () => {
    if (!selectedProvider) return null;
    
    // Provider purchases are natively paginated from the backend now

    return (
      <View className="flex-1">
        <View className="flex flex-row items-center justify-between mb-4 mt-2">
          <View className="flex flex-row items-center gap-4">
            <Pressable 
              onPress={() => setSelectedProviderId(null)}
              className="p-2 bg-white border border-gray-200 rounded-lg"
            >
              <ArrowLeft size={20} color="#475569" />
            </Pressable>
            <View>
              <View className="flex flex-row items-center gap-2">
                <Text className="text-xl font-bold text-slate-900">{selectedProvider.name}</Text>
                {!selectedProvider.is_active && (
                  <View className="bg-rose-100 px-2 py-0.5 rounded">
                    <Text className="text-rose-700 text-[10px] font-bold uppercase tracking-wider">Paused</Text>
                  </View>
                )}
              </View>
              <Text className="text-sm text-slate-500">{selectedProvider.phone || 'No phone'}</Text>
            </View>
          </View>
          <Pressable 
            onPress={() => setIsPurchaseModalOpen(true)}
            className="flex flex-row items-center justify-center gap-2 px-4 h-10 bg-indigo-600 rounded-lg active:bg-indigo-700"
          >
            <Plus size={16} color="#ffffff" />
            <Text className="text-white text-sm font-medium">Record Purchase</Text>
          </Pressable>
        </View>

        <View className="flex flex-row gap-4 mb-6">
          <View className="flex-1 bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-center">
            <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Outstanding</Text>
            <Text className="text-xl font-mono tracking-tight font-bold" style={{ color: selectedProvider.balance_pending > 0 ? '#e11d48' : '#059669' }}>
              {selectedProvider.balance_pending > 0 ? `₹${selectedProvider.balance_pending.toLocaleString()} Due` : `₹${Math.abs(selectedProvider.balance_pending).toLocaleString()} Adv`}
            </Text>
          </View>
          
          <Pressable 
            onPress={() => setIsInventoryModalOpen(true)}
            className="flex-1 bg-white rounded-xl border border-gray-200 p-4 active:bg-gray-50"
          >
            <View className="mb-2">
              <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cylinder Holding</Text>
            </View>
            <View>
              <Text className="text-xl font-mono tracking-tight font-bold text-slate-900">
                {selectedProvider.inventory ? selectedProvider.inventory.reduce((sum, inv) => sum + inv.cylinders_pending, 0) : 0} Total
              </Text>
            </View>
          </Pressable>
        </View>

        <View className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-row items-center justify-between">
          <View>
            <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Custom Pricing Tier</Text>
            <Text className="text-lg font-bold text-slate-900">
              {selectedProvider.price_per_kg ? `₹${selectedProvider.price_per_kg} / kg` : 'Standard Pricing'}
            </Text>
          </View>
          <Pressable 
            onPress={() => {
              setEditPricePerKg(selectedProvider.price_per_kg ? selectedProvider.price_per_kg.toString() : '');
              setIsEditPriceModalOpen(true);
            }}
            className="bg-indigo-50 px-4 py-2 rounded-lg active:bg-indigo-100"
          >
            <Text className="text-indigo-700 font-bold text-sm">Update Price</Text>
          </Pressable>
        </View>

        <View className="bg-transparent rounded-xl flex-1">
          <View className="px-4 py-4 border-b border-gray-200 bg-white rounded-t-xl flex flex-row items-center justify-between mb-2">
            <Text className="font-semibold text-slate-900">Purchase History</Text>
            <Text className="text-xs font-medium text-slate-500">{providerPurchases.length} Records</Text>
          </View>
          <View className="flex-1">
            {providerPurchases.length === 0 ? (
              <View className="py-12 items-center justify-center w-full">
                <Text className="text-slate-400 text-sm">No purchases recorded yet.</Text>
              </View>
            ) : (
              <FlatList
                data={providerPurchases}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderPurchaseRow}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
                onEndReached={() => {
                  if (hasNextPurchasesPage && !isFetchingNextPurchasesPage) {
                    fetchNextPurchasesPage();
                  }
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={isFetchingNextPurchasesPage ? <ActivityIndicator className="my-4" /> : null}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  if (selectedProvider) {
    return (
      <View className="flex-1 bg-gray-50 px-4 pt-12">
        {renderProviderCRM()}
        
        {/* Record Purchase Modal (Scoped to Provider) */}
        <Modal animationType="fade" transparent={true} visible={isPurchaseModalOpen} onRequestClose={() => setIsPurchaseModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View className="flex-1 items-center justify-center p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
            <View className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
              <View className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200 bg-indigo-50">
                <View>
                  <Text className="text-lg font-semibold text-slate-900">Record Purchase</Text>
                  <Text className="text-xs font-medium text-indigo-700 mt-0.5">{selectedProvider.name}</Text>
                </View>
                <Pressable onPress={() => setIsPurchaseModalOpen(false)} className="p-1 rounded-full bg-white border border-indigo-100">
                  <X size={20} color="#4f46e5" />
                </Pressable>
              </View>
              
              <View className="p-6 flex flex-col gap-4">
                <View className="mb-2">
                  <Text className="text-sm font-medium text-slate-700 mb-1">Purchase Bill Number (Optional)</Text>
                  <TextInput 
                    placeholder="e.g. INV-2026-9042"
                    value={billNumber}
                    onChangeText={setBillNumber}
                    className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm text-slate-900"
                  />
                </View>
                
                <View className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 max-h-64">
                  <ScrollView showsVerticalScrollIndicator={true} nestedScrollEnabled={true}>
                    <View className="flex flex-row px-3 py-2 bg-gray-100 border-b border-gray-200">
                      <Text className="flex-1 text-xs font-semibold text-gray-500 uppercase">Item Name</Text>
                      <Text className="w-20 text-center text-xs font-semibold text-gray-500 uppercase">Full Recv</Text>
                      <Text className="w-24 text-center text-xs font-semibold text-gray-500 uppercase">Empty Given</Text>
                    </View>
                    {items.map((item, index) => {
                      const state = itemStates[item.id] || { fullBought: '', emptyReturned: '' };
                      const isLast = index === items.length - 1;
                      return (
                        <View key={item.id} className={`flex flex-row items-center px-3 py-2 ${!isLast ? 'border-b border-gray-200' : ''}`}>
                          <Text className="flex-1 text-sm font-medium text-slate-700">{item.name}</Text>
                          <View className="w-20 items-center justify-center">
                            <TextInput 
                              placeholder="0"
                              placeholderTextColor="#94a3b8"
                              keyboardType="numeric"
                              value={state.fullBought}
                              onChangeText={(val) => setItemStates(prev => ({ ...prev, [item.id]: { ...state, fullBought: val } }))}
                              className="w-16 h-10 p-1 bg-white border border-gray-300 rounded text-center text-sm font-mono text-slate-900"
                            />
                          </View>
                          <View className="w-24 items-center justify-center">
                            <TextInput 
                              placeholder="0"
                              placeholderTextColor="#94a3b8"
                              keyboardType="numeric"
                              value={state.emptyReturned}
                              onChangeText={(val) => setItemStates(prev => ({ ...prev, [item.id]: { ...state, emptyReturned: val } }))}
                              className="w-16 h-10 p-1 bg-white border border-gray-300 rounded text-center text-sm font-mono text-slate-900"
                            />
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>

                <View className="flex flex-row gap-3 pt-2">
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-700 mb-1">Grand Total (₹)</Text>
                    <View className="w-full rounded-lg bg-gray-100 border-gray-200 border px-3 py-2">
                      <Text className="text-sm text-slate-700 font-mono font-bold">{calculatedTotalCost.toLocaleString()}</Text>
                    </View>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-700 mb-1">Amount Paid (₹)</Text>
                    <TextInput 
                      placeholder="0.00"
                      keyboardType="numeric"
                      value={amountPaid}
                      onChangeText={setAmountPaid}
                      className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm text-slate-900 font-mono"
                    />
                  </View>
                </View>

                <Pressable 
                  onPress={handleSavePurchase}
                  disabled={createPurchase.isPending || !Object.values(itemStates).some(state => (parseInt(state.fullBought) || 0) > 0 || (parseInt(state.emptyReturned) || 0) > 0)}
                  className="w-full rounded-lg py-3 items-center justify-center mt-2"
                  style={{ backgroundColor: (createPurchase.isPending || !Object.values(itemStates).some(state => (parseInt(state.fullBought) || 0) > 0 || (parseInt(state.emptyReturned) || 0) > 0)) ? '#a5b4fc' : '#4f46e5' }}
                >
                  <Text className="text-white font-medium text-sm">
                    {createPurchase.isPending ? 'Saving...' : 'Save Purchase Bill'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
        </Modal>
        
        {/* Edit Price Modal */}
        <Modal animationType="fade" transparent={true} visible={isEditPriceModalOpen} onRequestClose={() => setIsEditPriceModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View className="flex-1 items-center justify-center p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
            <View className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
              <View className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200">
                <Text className="text-lg font-bold text-slate-900">Custom Price / Kg</Text>
                <Pressable onPress={() => setIsEditPriceModalOpen(false)} className="p-1 rounded-full bg-slate-100">
                  <X size={20} color="#64748b" />
                </Pressable>
              </View>
              
              <View className="p-6">
                <Text className="text-sm text-slate-500 mb-4">
                  Set a custom pricing rate for <Text className="font-bold text-slate-700">{selectedProvider.name}</Text>. Leave blank to use standard pricing.
                </Text>
                
                <View className="mb-4">
                  <Text className="text-sm font-medium text-slate-700 mb-1">Price per Kg (₹)</Text>
                  <TextInput 
                    placeholder="e.g. 55.50"
                    keyboardType="numeric"
                    value={editPricePerKg}
                    onChangeText={setEditPricePerKg}
                    className="w-full rounded-lg border-gray-300 border px-4 py-3 text-sm text-slate-900 font-mono"
                  />
                </View>
                
                <Pressable 
                  onPress={handleUpdatePrice}
                  disabled={updateProvider.isPending}
                  className="w-full rounded-lg py-3 items-center justify-center bg-indigo-600"
                >
                  <Text className="text-white font-medium text-sm">
                    {updateProvider.isPending ? 'Saving...' : 'Save Custom Price'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
        </Modal>

        {/* Inventory Breakdown Modal */}
        <Modal animationType="fade" transparent={true} visible={isInventoryModalOpen} onRequestClose={() => setIsInventoryModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <View className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
              <View className="p-4 border-b border-gray-200 flex flex-row items-center justify-between bg-gray-50">
                <Text className="text-lg font-bold text-slate-900">Cylinder Breakdown</Text>
                <Pressable onPress={() => setIsInventoryModalOpen(false)} className="p-1.5 rounded-full bg-slate-200 active:bg-slate-300">
                  <X size={20} color="#475569" />
                </Pressable>
              </View>
              <View className="p-4">
                {(selectedProvider as any)?.inventory && (selectedProvider as any).inventory.length > 0 ? (
                  <View className="flex flex-col gap-3">
                    {(selectedProvider as any).inventory.map((inv: any) => {
                      if (inv.cylinders_pending === 0) return null;
                      const itemDetails = items.find(i => i.id === inv.item_id);
                      return (
                        <View key={inv.item_id} className="flex flex-row justify-between items-center bg-amber-50 p-3 rounded-xl border border-amber-100">
                          <Text className="font-semibold text-slate-700 text-base">{itemDetails?.name || 'Unknown Item'}</Text>
                          <Text className="font-mono font-bold text-lg text-amber-600">{inv.cylinders_pending} cyl</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text className="text-center text-slate-500 py-4">No cylinders held.</Text>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
        </Modal>

        <CustomAlert 
          visible={alertVisible}
          title={alertConfig.title}
          message={alertConfig.message}
          type={alertConfig.type}
          onClose={() => setAlertVisible(false)}
        />
      </View>
    );
  }

  // --- Main Provider List View ---
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-gray-50">
    <View className="flex-1 p-4">
      <View className="flex flex-row justify-between items-start mb-6">
        <View className="flex-1 mr-4">
          <Text className="text-2xl font-semibold text-slate-900">Providers</Text>
          <Text className="text-slate-500 text-sm mt-1">Manage suppliers, purchases, and outstanding balances.</Text>
        </View>
        <Pressable 
          onPress={() => {
            refetchProviders();
            if (selectedProviderId) refetchPurchases();
          }}
          disabled={isProvidersRefetching || isPurchasesRefetching}
          className="p-2.5 bg-white border border-gray-200 rounded-xl active:bg-slate-50 shadow-sm"
          style={{ opacity: (isProvidersRefetching || isPurchasesRefetching) ? 0.5 : 1 }}
        >
          <RefreshCw size={20} color="#475569" />
        </Pressable>
      </View>

      <View className="flex flex-row items-center justify-between mb-4">
        <View className="flex-1 bg-white border border-gray-300 rounded-lg flex flex-row items-center px-3 h-10">
          <Search size={16} color="#94a3b8" />
          <TextInput 
            placeholder="Search providers..." 
            className="flex-1 ml-2 text-sm text-slate-900"
          />
        </View>
      </View>

      <View className="border border-gray-200 rounded-2xl bg-white overflow-hidden flex-1">
        {isProvidersLoading ? (
          <View className="p-8 items-center justify-center">
            <ActivityIndicator size="large" color="#4f46e5" />
          </View>
        ) : (
          <FlatList
            data={providers}
            keyExtractor={(item) => item.id.toString()}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            renderItem={({ item }) => (
              <View className="border-b border-gray-100 bg-white">
                <Pressable 
                  onPress={() => setSelectedProviderId(item.id)}
                  className="flex flex-row items-center p-4 active:bg-slate-50"
                >
                  <View className="w-12 h-12 rounded-full items-center justify-center mr-4" style={{ backgroundColor: item.is_active ? '#eef2ff' : '#f1f5f9' }}>
                    <Truck size={24} color={item.is_active ? '#4f46e5' : '#94a3b8'} />
                  </View>
                  <View className="flex-1 flex flex-col justify-center gap-1">
                    <View className="flex flex-row items-center gap-2">
                      <Text className="text-base font-bold tracking-tight" style={{ color: item.is_active ? '#0f172a' : '#94a3b8' }}>{item.name}</Text>
                      {!item.is_active && (
                        <View className="bg-slate-200 px-1.5 py-0.5 rounded">
                          <Text className="text-slate-500 text-[9px] font-bold uppercase tracking-wider">Paused</Text>
                        </View>
                      )}
                    </View>
                    <View className="flex flex-row items-center gap-2">
                      <Text className="text-xs font-bold" style={{ color: !item.is_active ? '#cbd5e1' : (item.balance_pending > 0 ? '#e11d48' : '#059669') }}>
                        {item.balance_pending > 0 ? `₹${item.balance_pending.toLocaleString()} Due` : `₹${Math.abs(item.balance_pending).toLocaleString()} Adv`}
                      </Text>
                      <View className="w-1 h-1 rounded-full bg-slate-300" />
                      <Text className="text-xs font-bold" style={{ color: !item.is_active ? '#cbd5e1' : '#d97706' }}>
                        {item.inventory?.length > 0
                          ? item.inventory.map(inv => {
                              const iName = items.find(i => i.id === inv.item_id)?.name || 'Cyl';
                              return `${inv.cylinders_pending}x ${iName}`;
                            }).join(', ')
                          : '0 Empties'}
                      </Text>
                    </View>
                  </View>
                </Pressable>

                <View className="flex flex-row gap-2 px-4 pb-4">
                  <Pressable 
                    onPress={() => {
                      setEditProviderId(item.id);
                      setEditProviderName(item.name);
                      setEditProviderPhone(item.phone || '');
                      setEditProviderGstin(item.gstin || '');
                      setIsEditProviderModalOpen(true);
                    }}
                    className="flex-1 bg-rose-50 border border-rose-100 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5 active:bg-slate-100"
                  >
                    <Edit size={14} color="#475569" />
                    <Text className="text-slate-700 text-xs font-bold">Edit</Text>
                  </Pressable>
                  
                  <Pressable 
                    onPress={() => handleToggleProvider(item)}
                    className="flex-1 border py-2.5 rounded-xl flex-row items-center justify-center gap-1.5 active:opacity-80"
                    style={{ 
                      backgroundColor: item.is_active ? '#ffffff' : '#ecfdf5', 
                      borderColor: item.is_active ? '#e2e8f0' : '#a7f3d0' 
                    }}
                  >
                    {item.is_active ? <PauseCircle size={14} color="#475569" /> : <CheckCircle size={14} color="#10b981" />}
                    <Text className="text-xs font-bold" style={{ color: item.is_active ? '#334155' : '#047857' }}>
                      {item.is_active ? 'Pause' : 'Activate'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
            ListEmptyComponent={() => (
              <View className="p-8 items-center justify-center">
                <Store size={32} color="#cbd5e1" className="mb-2" />
                <Text className="text-slate-500 font-medium">No providers found</Text>
              </View>
            )}
          />
        )}
      </View>

      {/* Floating Action Button */}
      <Pressable 
        onPress={() => setIsProviderModalOpen(true)}
        className="absolute bottom-6 right-6 w-14 h-14 bg-indigo-600 rounded-full items-center justify-center active:bg-indigo-700"
      >
        <Plus size={24} color="#ffffff" />
      </Pressable>

      {/* Add Provider Modal */}
      <Modal animationType="fade" transparent={true} visible={isProviderModalOpen} onRequestClose={() => setIsProviderModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
          <View className="bg-white rounded-[24px] shadow-xl w-full max-w-sm overflow-hidden">
            <View className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200">
              <Text className="text-lg font-bold text-slate-900">Add Provider</Text>
              <Pressable onPress={() => setIsProviderModalOpen(false)} className="p-1.5 rounded-full bg-slate-100">
                <X size={18} color="#64748b" />
              </Pressable>
            </View>
            
            <View className="p-6 flex flex-col gap-4">
              <View>
                <Text className="text-sm font-bold text-slate-700 mb-1">Provider Name</Text>
                <TextInput 
                  placeholder="e.g. ABC Gas Agency"
                  value={newProviderName}
                  onChangeText={setNewProviderName}
                  className="w-full rounded-xl border-gray-300 border px-4 py-3 text-sm text-slate-900 bg-slate-50"
                />
              </View>
              <View>
                <Text className="text-sm font-bold text-slate-700 mb-1">GSTIN</Text>
                <TextInput 
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  autoCapitalize="characters"
                  value={newProviderGstin}
                  onChangeText={setNewProviderGstin}
                  className="w-full rounded-xl border-gray-300 border px-4 py-3 text-sm text-slate-900 bg-slate-50 uppercase"
                />
              </View>
              <View>
                <Text className="text-sm font-bold text-slate-700 mb-1">Phone Number</Text>
                <TextInput 
                  placeholder="e.g. 9876543210"
                  keyboardType="phone-pad"
                  value={newProviderPhone}
                  onChangeText={setNewProviderPhone}
                  className="w-full rounded-xl border-gray-300 border px-4 py-3 text-sm text-slate-900 bg-slate-50"
                />
              </View>
              <View>
                <Text className="text-sm font-bold text-slate-700 mb-1">Price per Kg (Optional)</Text>
                <TextInput 
                  placeholder="e.g. 55.50"
                  keyboardType="numeric"
                  value={newProviderPricePerKg}
                  onChangeText={setNewProviderPricePerKg}
                  className="w-full rounded-xl border-gray-300 border px-4 py-3 text-sm text-slate-900 bg-slate-50"
                />
              </View>
              <View className="flex flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-bold text-slate-700 mb-1">Initial Fin Bal</Text>
                  <TextInput 
                    placeholder="e.g. 5000"
                    keyboardType="numeric"
                    value={newProviderFinBal}
                    onChangeText={setNewProviderFinBal}
                    className="w-full rounded-xl border-gray-300 border px-4 py-3 text-sm text-slate-900 bg-slate-50"
                  />
                </View>
                <View className="flex-1 ml-2">
                  <Text className="text-sm font-bold text-slate-700 mb-1">Initial Empties</Text>
                  {items.map(item => (
                    <View key={item.id} className="flex flex-row items-center justify-between mb-2">
                      <Text className="text-xs text-slate-600 w-1/2" numberOfLines={1}>{item.name}</Text>
                      <TextInput 
                        value={newProviderInventory[item.id] || ''} 
                        onChangeText={(val) => setNewProviderInventory(prev => ({...prev, [item.id]: val}))} 
                        keyboardType="numeric" 
                        placeholder="0" 
                        className="w-1/2 rounded-xl border-gray-300 border px-3 py-1.5 text-xs text-slate-900 bg-slate-50 font-mono" 
                      />
                    </View>
                  ))}
                </View>
              </View>

              <Pressable 
                onPress={handleSaveProvider}
                disabled={createProvider.isPending || !newProviderName.trim()}
                className="w-full rounded-xl py-3.5 items-center justify-center mt-2"
                style={{ backgroundColor: (createProvider.isPending || !newProviderName.trim()) ? '#a5b4fc' : '#4f46e5' }}
              >
                <Text className="text-white font-bold text-sm">
                  {createProvider.isPending ? 'Saving...' : 'Save Provider'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Provider Modal */}
      <Modal animationType="fade" transparent={true} visible={isEditProviderModalOpen} onRequestClose={() => setIsEditProviderModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
          <View className="bg-white rounded-[24px] shadow-xl w-full max-w-sm overflow-hidden">
            <View className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200">
              <Text className="text-lg font-bold text-slate-900">Edit Provider Details</Text>
              <Pressable onPress={() => setIsEditProviderModalOpen(false)} className="p-1.5 rounded-full bg-slate-100">
                <X size={18} color="#64748b" />
              </Pressable>
            </View>
            
            <View className="p-6 flex flex-col gap-4">
              <View>
                <Text className="text-sm font-bold text-slate-700 mb-1">Provider Name</Text>
                <TextInput 
                  placeholder="e.g. ABC Gas Agency"
                  value={editProviderName}
                  onChangeText={setEditProviderName}
                  className="w-full rounded-xl border-gray-300 border px-4 py-3 text-sm text-slate-900 bg-slate-50"
                />
              </View>
              <View>
                <Text className="text-sm font-bold text-slate-700 mb-1">GSTIN</Text>
                <TextInput 
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  autoCapitalize="characters"
                  value={editProviderGstin}
                  onChangeText={setEditProviderGstin}
                  className="w-full rounded-xl border-gray-300 border px-4 py-3 text-sm text-slate-900 bg-slate-50 uppercase"
                />
              </View>
              <View>
                <Text className="text-sm font-bold text-slate-700 mb-1">Phone Number</Text>
                <TextInput 
                  placeholder="e.g. 9876543210"
                  keyboardType="phone-pad"
                  value={editProviderPhone}
                  onChangeText={setEditProviderPhone}
                  className="w-full rounded-xl border-gray-300 border px-4 py-3 text-sm text-slate-900 bg-slate-50"
                />
              </View>

              <Pressable 
                onPress={handleEditProvider}
                disabled={updateProvider.isPending || !editProviderName.trim()}
                className="w-full rounded-xl py-3.5 items-center justify-center mt-2"
                style={{ backgroundColor: (updateProvider.isPending || !editProviderName.trim()) ? '#a5b4fc' : '#4f46e5' }}
              >
                <Text className="text-white font-bold text-sm">
                  {updateProvider.isPending ? 'Saving...' : 'Save Changes'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <CustomAlert 
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertVisible(false)}
      />
    </View>
    </SafeAreaView>
  );
}
