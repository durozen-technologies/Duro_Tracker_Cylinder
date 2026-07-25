import React, { useState, useMemo, useLayoutEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import CustomAlert from '../../components/CustomAlert';
import PrinterSettingsModal from '../../components/PrinterSettingsModal';
import { usePrinterStore } from '../../store/printer-store';
import { useDriverOrganization } from '../../hooks/useDrivers';
import { DeliveryReceiptData, DeliveryReceiptItem } from '../../utils/printer';
import { useReceiptImagePrintJob } from '../../hooks/use-receipt-image-print-job';


interface Item { id: string; name: string; price: number; capacity_kg?: number; current_full?: number; current_empty?: number; }
interface BuyerInventory { item_id: string; cylinders_pending: number; }
interface Buyer { id: string; name: string; phone?: string; price_per_kg?: number; balance_pending?: number; address?: string; inventory?: BuyerInventory[]; }

interface CartItem {
  item: Item;
  fullDelivered: number;
  emptyReceived: number;
  unitPrice: number;
  lineTotal: number;
}

export default function DeliveryScreen() {
  const navigation = useNavigation();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [buyerId, setBuyerId] = useState('');
  
  // Cart state
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [itemId, setItemId] = useState('');
  const [fullDelivered, setFullDelivered] = useState('');
  const [emptyReceived, setEmptyReceived] = useState('');
  
  const [cashCollected, setCashCollected] = useState('');
  const [upiCollected, setUpiCollected] = useState('');
  
  // Modals state
  const [buyerModalVisible, setBuyerModalVisible] = useState(false);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [buyerSearchQuery, setBuyerSearchQuery] = useState('');
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' as 'error'|'success'|'info' });

  const showAlert = (title: string, message: string, type: 'error'|'success'|'info' = 'error') => {
    setAlertConfig({ title, message, type });
    setAlertVisible(true);
  };

  const { receiptImagePrintBridge, startReceiptImagePrintJob } = useReceiptImagePrintJob();
  const { data: organization } = useDriverOrganization();

  const [idempotencyKey, setIdempotencyKey] = useState<string>(
    Date.now().toString(36) + Math.random().toString(36).substring(2)
  );

  const handleRefresh = useCallback(() => {
    queryClient.resetQueries();
    setCartItems([]);
    setBuyerId('');
    setItemId('');
    setCashCollected('');
    setUpiCollected('');
  }, [queryClient]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => setPrinterModalVisible(true)} className="mr-4 p-2 bg-zinc-100 rounded-full">
            <Ionicons name="print-outline" size={20} color="#52525b" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRefresh} className="mr-4 p-2 bg-zinc-100 rounded-full">
            <Ionicons name="refresh-outline" size={20} color="#3b82f6" />
          </TouchableOpacity>
          <TouchableOpacity onPress={logout} className="mr-4 p-2">
            <Ionicons name="log-out-outline" size={24} color="#ef4444" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, logout, handleRefresh]);

  const { data: items, isLoading: itemsLoading } = useQuery<Item[]>({
    queryKey: ['driver_items'],
    queryFn: async () => {
      const res = await api.get('/driver/items');
      return res.data;
    }
  });

  const { data: buyers, isLoading: buyersLoading } = useQuery<Buyer[]>({
    queryKey: ['driver_buyers'],
    queryFn: async () => {
      const res = await api.get('/driver/buyers');
      return res.data;
    }
  });

  const selectedBuyer = useMemo(() => buyers?.find(b => b.id === buyerId), [buyers, buyerId]);
  const selectedItem = useMemo(() => items?.find(i => i.id === itemId), [items, itemId]);

  const getUnitPrice = (item: Item) => {
    let unitPrice = item.price;
    if (selectedBuyer && selectedBuyer.price_per_kg && item.capacity_kg) {
      unitPrice = selectedBuyer.price_per_kg * item.capacity_kg;
    }
    return unitPrice;
  };

  const handleAddToCart = () => {
    if (!selectedItem) {
      showAlert("Required", "Please select an item.", "info");
      return;
    }
    const full = parseInt(fullDelivered || '0', 10);
    const empty = parseInt(emptyReceived || '0', 10);

    if (full < 0 || empty < 0) {
      showAlert("Invalid Quantity", "Delivered and received quantities cannot be negative.", "error");
      return;
    }

    if (full === 0 && empty === 0) {
      showAlert("Required", "Please enter delivered or received quantity.", "info");
      return;
    }

    const unitPrice = getUnitPrice(selectedItem);
    
    if (full > 0 && unitPrice <= 0) {
      showAlert("Price Not Set", `The price for this buyer has not been set by the admin. Cannot bill.`, "error");
      return;
    }

    const existingFullInCart = cartItems.filter(c => c.item.id === selectedItem.id).reduce((sum, c) => sum + c.fullDelivered, 0);
    const existingEmptyInCart = cartItems.filter(c => c.item.id === selectedItem.id).reduce((sum, c) => sum + c.emptyReceived, 0);

    const availableFull = selectedItem.current_full || 0;
    if (existingFullInCart + full > availableFull) {
      showAlert("No Stock", `Not enough full cylinders in warehouse. Available: ${availableFull}`, "error");
      return;
    }

    const buyerPending = selectedBuyer?.inventory?.find(i => i.item_id === selectedItem.id)?.cylinders_pending || 0;
    if (existingEmptyInCart + empty > buyerPending) {
      showAlert("Invalid", `Buyer only holds ${buyerPending} empty cylinders of this type.`, "error");
      return;
    }

    const lineTotal = parseFloat((unitPrice * full).toFixed(2));

    setCartItems(prev => [...prev, {
      item: selectedItem,
      fullDelivered: full,
      emptyReceived: empty,
      unitPrice,
      lineTotal
    }]);

    // Reset item form
    setItemId('');
    setFullDelivered('');
    setEmptyReceived('');
  };

  const handleRemoveFromCart = (index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  const totalBill = useMemo(() => {
    return cartItems.reduce((sum, current) => sum + current.lineTotal, 0).toFixed(2);
  }, [cartItems]);

  const submitMutation = useMutation({
    mutationFn: async (payload: any) => {
      return api.post('/driver/entries', payload, {
        headers: { 'X-Idempotency-Key': idempotencyKey }
      });
    },
    onSuccess: (data) => {
      showAlert("Success", "Delivery logged successfully!", "success");
      
      const preferredPrinter = usePrinterStore.getState().preferredPrinter;
      if (preferredPrinter && selectedBuyer && cartItems.length > 0) {
        const cash_paid = parseFloat(cashCollected || '0');
        const upi_paid = parseFloat(upiCollected || '0');
        const opening_balance = selectedBuyer.balance_pending || 0;
        const total = parseFloat(totalBill);
        const closing_balance = opening_balance + total - (cash_paid + upi_paid);

        const receiptItems: DeliveryReceiptItem[] = cartItems.map(c => ({
          name: c.item.name,
          quantity: c.fullDelivered,
          price: c.unitPrice,
          total: c.lineTotal
        }));

        const cylinder_balances = items?.map(item => {
          const cartItem = cartItems.find(c => c.item.id === item.id);
          const oldInv = selectedBuyer.inventory?.find(i => i.item_id === item.id);
          const oldBalance = oldInv ? oldInv.cylinders_pending : 0;
          
          const given = cartItem ? cartItem.fullDelivered : 0;
          const taken = cartItem ? cartItem.emptyReceived : 0;
          
          const newBalance = oldBalance + given - taken;
          if (newBalance === 0 && given === 0 && taken === 0) return null;
          
          return {
             name: item.name,
             count: newBalance,
             given: given,
             taken: taken
          };
        }).filter(Boolean) as {name: string, count: number, given?: number, taken?: number}[];

        const receiptData: DeliveryReceiptData = {
          receipt_number: data?.data?.bill_number || (data?.data?.id ? data.data.id.split('-')[0].toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase()),
          date: data?.data?.timestamp || new Date().toISOString(),
          agency_name: organization?.name || "Agency Name",
          agency_address: organization?.address || "",
          agency_mobile: organization?.phone || "",
          buyer_name: selectedBuyer.name,
          buyer_address: selectedBuyer.address || "",
          opening_balance: opening_balance,
          items: receiptItems,
          total_bill: total,
          cash_collected: cash_paid,
          upi_collected: upi_paid,
          closing_balance: closing_balance,
          cylinder_balances: cylinder_balances,
        };
        startReceiptImagePrintJob([receiptData], preferredPrinter).catch(err => {
          showAlert("Print Error", err.message || "Failed to print receipt", "error");
        });
      }

      // Reset form
      setBuyerId('');
      setCartItems([]);
      setItemId('');
      setFullDelivered('');
      setEmptyReceived('');
      setCashCollected('');
      setUpiCollected('');
      setIdempotencyKey(Date.now().toString(36) + Math.random().toString(36).substring(2));
      queryClient.invalidateQueries({ queryKey: ['driver_history'] });
      queryClient.invalidateQueries({ queryKey: ['driver_items'] });
      queryClient.invalidateQueries({ queryKey: ['driver_buyers'] });
    },
    onError: (err: any) => {
      showAlert("Error", err.response?.data?.detail || "Failed to log delivery.", "error");
    }
  });

  if (itemsLoading || buyersLoading) {
    return (
      <View className="flex-1 bg-zinc-50 justify-center items-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-zinc-50">
      <ScrollView className="p-4 pt-6">
        
        {/* Buyer Selection */}
        <View className="bg-white rounded-2xl p-4 mb-4 border border-zinc-100">
          <Text className="text-zinc-500 font-medium mb-2">Select Buyer</Text>
          <TouchableOpacity 
            className="flex-row items-center justify-between bg-zinc-50 border border-zinc-200 p-4 rounded-xl"
            onPress={() => setBuyerModalVisible(true)}
          >
            <Text className="text-lg" style={{ color: buyerId ? '#27272a' : '#a1a1aa' }}>
              {selectedBuyer?.name || 'Tap to select buyer...'}
            </Text>
            <Ionicons name="chevron-down" size={24} color="#a1a1aa" />
          </TouchableOpacity>
        </View>

        {/* Add Item Form */}
        {buyerId && (
          <View className="bg-white rounded-2xl p-4 mb-4 border border-zinc-100">
            <Text className="text-zinc-500 font-medium mb-2">Add Item to Bill</Text>
            
            <TouchableOpacity 
              className="flex-row items-center justify-between bg-zinc-50 border border-zinc-200 p-4 rounded-xl mb-4"
              onPress={() => setItemModalVisible(true)}
            >
              <Text className="text-lg" style={{ color: itemId ? '#27272a' : '#a1a1aa' }}>
                {selectedItem ? `${selectedItem.name} (₹${getUnitPrice(selectedItem)})` : 'Tap to select item...'}
              </Text>
              <Ionicons name="chevron-down" size={24} color="#a1a1aa" />
            </TouchableOpacity>

            <View className="flex-row gap-4 mb-4">
              <View className="flex-1">
                <Text className="text-zinc-500 font-medium mb-1">Full Delivered</Text>
                <TextInput
                  className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-lg text-center font-bold"
                  keyboardType="numeric"
                  value={fullDelivered}
                  onChangeText={setFullDelivered}
                  placeholder="0"
                />
              </View>
              <View className="flex-1">
                <Text className="text-zinc-500 font-medium mb-1">Empty Received</Text>
                <TextInput
                  className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-lg text-center font-bold"
                  keyboardType="numeric"
                  value={emptyReceived}
                  onChangeText={setEmptyReceived}
                  placeholder="0"
                />
              </View>
            </View>

            <TouchableOpacity
              className="bg-zinc-800 py-3 rounded-xl items-center"
              onPress={handleAddToCart}
            >
              <Text className="text-white font-medium text-base flex-row items-center">
                <Ionicons name="add" size={20} color="white" /> Add to Cart
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cart Items List */}
        {cartItems.length > 0 && (
          <View className="bg-white rounded-2xl p-4 mb-4 border border-zinc-100">
            <Text className="text-zinc-800 font-semibold text-lg mb-3">Cart Items</Text>
            {cartItems.map((cartItem, index) => (
              <View key={index} className="flex-row justify-between items-center py-3 border-b border-zinc-50">
                <View>
                  <Text className="text-zinc-800 font-medium text-base">{cartItem.item.name}</Text>
                  <Text className="text-zinc-500 text-sm">
                    {cartItem.fullDelivered} Full, {cartItem.emptyReceived} Empty
                  </Text>
                </View>
                <View className="flex-row items-center gap-4">
                  <Text className="text-zinc-800 font-semibold text-base">₹{cartItem.lineTotal}</Text>
                  <TouchableOpacity onPress={() => handleRemoveFromCart(index)}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Payments */}
        <View className="bg-white rounded-2xl p-4 mb-6 border border-zinc-100 space-y-4">
          <View className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-4 flex-row justify-between items-center">
            <Text className="text-blue-800 font-medium text-lg">Total Bill:</Text>
            <Text className="text-blue-900 font-bold text-2xl">₹{totalBill}</Text>
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="text-zinc-500 font-medium mb-1">Cash Collected</Text>
              <TextInput
                className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-lg text-center"
                keyboardType="numeric"
                value={cashCollected}
                onChangeText={(val) => {
                  const numVal = parseFloat(val || '0');
                  const currentUpi = parseFloat(upiCollected || '0');
                  const maxAllowed = Math.max(0, parseFloat(totalBill) - currentUpi);
                  if (numVal > maxAllowed) {
                    setCashCollected(maxAllowed > 0 ? maxAllowed.toString() : '');
                  } else {
                    setCashCollected(val);
                  }
                }}
                placeholder="₹ 0"
              />
            </View>
            <View className="flex-1">
              <Text className="text-zinc-500 font-medium mb-1">UPI Collected</Text>
              <TextInput
                className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-lg text-center"
                keyboardType="numeric"
                value={upiCollected}
                onChangeText={(val) => {
                  const numVal = parseFloat(val || '0');
                  const currentCash = parseFloat(cashCollected || '0');
                  const maxAllowed = Math.max(0, parseFloat(totalBill) - currentCash);
                  if (numVal > maxAllowed) {
                    setUpiCollected(maxAllowed > 0 ? maxAllowed.toString() : '');
                  } else {
                    setUpiCollected(val);
                  }
                }}
                placeholder="₹ 0"
              />
            </View>
          </View>
        </View>

        <TouchableOpacity
          className="py-4 rounded-xl items-center mb-12"
          style={{ backgroundColor: submitMutation.isPending ? '#60a5fa' : '#2563eb', opacity: cartItems.length === 0 ? 0.5 : 1 }}
          onPress={() => {
            if (!buyerId || cartItems.length === 0) {
              showAlert("Required", "Please select a buyer and add items to cart.");
              return;
            }

            const cash = parseFloat(cashCollected || '0');
            const upi = parseFloat(upiCollected || '0');
            const total = parseFloat(totalBill);
            
            if (cash < 0 || upi < 0) {
              showAlert("Invalid Payment", "Payment amounts cannot be negative.", "error");
              return;
            }
            
            if (cash + upi > total) {
              showAlert("Invalid Payment", "Total collected amount cannot exceed the bill amount.");
              return;
            }

            const payloadItems = cartItems.map(c => ({
              item_id: c.item.id,
              full_delivered: c.fullDelivered,
              empty_received: c.emptyReceived
            }));

            submitMutation.mutate({
              buyer_id: buyerId,
              items: payloadItems,
              cash_collected: parseFloat(cashCollected || '0'),
              upi_collected: parseFloat(upiCollected || '0')
            });
          }}
          disabled={submitMutation.isPending || cartItems.length === 0}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-lg font-semibold flex-row items-center">
              Complete Delivery <Ionicons name="checkmark-circle" size={20} color="white" />
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Buyer Modal */}
      <Modal visible={buyerModalVisible} transparent={true} animationType="slide">
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <View className="bg-white rounded-t-[32px] h-3/4 p-4 pt-3 shadow-2xl">
            <View className="w-12 h-1.5 bg-zinc-200 rounded-full self-center mb-4" />
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-zinc-900">Select Buyer</Text>
              <TouchableOpacity onPress={() => setBuyerModalVisible(false)} className="p-2 bg-zinc-50 rounded-full border border-zinc-100">
                <Ionicons name="close" size={20} color="#52525b" />
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center bg-zinc-50 rounded-2xl px-4 py-3 mb-4 border border-zinc-100">
              <Ionicons name="search" size={20} color="#a1a1aa" />
              <TextInput 
                className="flex-1 ml-2 text-base text-zinc-800"
                placeholder="Search buyers..."
                placeholderTextColor="#a1a1aa"
                value={buyerSearchQuery}
                onChangeText={setBuyerSearchQuery}
              />
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {buyers?.filter(b => b.name.toLowerCase().includes(buyerSearchQuery.toLowerCase())).length === 0 ? (
                <View className="items-center justify-center py-12">
                  <Ionicons name="search-outline" size={48} color="#e4e4e7" />
                  <Text className="text-zinc-500 font-medium mt-4">No buyers found</Text>
                </View>
              ) : (
                buyers?.filter(b => b.name.toLowerCase().includes(buyerSearchQuery.toLowerCase())).map(b => (
                  <TouchableOpacity 
                    key={b.id} 
                    className={`p-4 mb-3 rounded-2xl active:opacity-80 ${buyerId === b.id ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-zinc-100 shadow-sm'}`}
                    onPress={() => { setBuyerId(b.id); setBuyerModalVisible(false); }}
                  >
                    <View className="flex-row justify-between items-start mb-2">
                      <Text className={`text-base font-bold ${buyerId === b.id ? 'text-blue-800' : 'text-zinc-900'}`}>{b.name}</Text>
                      <Text className={`font-bold text-sm ${buyerId === b.id ? 'text-blue-600' : 'text-zinc-500'}`}>₹ {b.balance_pending?.toFixed(2) || '0.00'}</Text>
                    </View>
                    
                    {b.phone || b.address ? (
                      <View className="flex-row flex-wrap items-center gap-x-3 mb-2">
                        {b.phone ? (
                          <View className="flex-row items-center">
                            <Ionicons name="call" size={12} color={buyerId === b.id ? "#60a5fa" : "#a1a1aa"} className="mr-1" />
                            <Text className={`text-xs ${buyerId === b.id ? 'text-blue-600' : 'text-zinc-500'}`}>{b.phone}</Text>
                          </View>
                        ) : null}
                        {b.address ? (
                          <View className="flex-row items-center">
                            <Ionicons name="location" size={12} color={buyerId === b.id ? "#60a5fa" : "#a1a1aa"} className="mr-1" />
                            <Text className={`text-xs ${buyerId === b.id ? 'text-blue-600' : 'text-zinc-500'}`}>{b.address}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    
                    {/* Cylinder Holding Section */}
                    <View className={`rounded-xl p-2.5 mt-1 flex-row flex-wrap gap-2 ${buyerId === b.id ? 'bg-white/60' : 'bg-zinc-50 border border-zinc-100'}`}>
                      <Ionicons name="layers" size={14} color={buyerId === b.id ? "#3b82f6" : "#71717a"} className="mr-1 mt-0.5" />
                      {b.inventory && b.inventory.length > 0 && b.inventory.some(inv => inv.cylinders_pending > 0) ? (
                        <View className="flex-1 flex-row flex-wrap gap-x-3 gap-y-1">
                          {b.inventory.map((inv, idx) => {
                            const itemName = items?.find(i => i.id === inv.item_id)?.name || 'Unknown';
                            if (inv.cylinders_pending === 0) return null;
                            return (
                              <View key={idx} className="flex-row items-center">
                                <Text className={`text-xs mr-1 ${buyerId === b.id ? 'text-blue-700' : 'text-zinc-500'}`}>{itemName}:</Text>
                                <Text className={`font-bold text-xs ${buyerId === b.id ? 'text-blue-900' : 'text-zinc-800'}`}>{inv.cylinders_pending}</Text>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text className={`text-xs italic ${buyerId === b.id ? 'text-blue-600' : 'text-zinc-400'}`}>No cylinders held</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
              <View className="h-10" />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Item Modal */}
      <Modal visible={itemModalVisible} transparent={true} animationType="slide">
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <View className="bg-white rounded-t-[32px] h-3/4 p-4 pt-3 shadow-2xl">
            <View className="w-12 h-1.5 bg-zinc-200 rounded-full self-center mb-4" />
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-bold text-zinc-900">Select Item</Text>
              <TouchableOpacity onPress={() => setItemModalVisible(false)} className="p-2 bg-zinc-50 rounded-full border border-zinc-100">
                <Ionicons name="close" size={20} color="#52525b" />
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center bg-zinc-50 rounded-2xl px-4 py-3 mb-4 border border-zinc-100">
              <Ionicons name="search" size={20} color="#a1a1aa" />
              <TextInput 
                className="flex-1 ml-2 text-base text-zinc-800"
                placeholder="Search items..."
                placeholderTextColor="#a1a1aa"
                value={itemSearchQuery}
                onChangeText={setItemSearchQuery}
              />
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {items?.filter(i => i.name.toLowerCase().includes(itemSearchQuery.toLowerCase())).length === 0 ? (
                <View className="items-center justify-center py-12">
                  <Ionicons name="search-outline" size={48} color="#e4e4e7" />
                  <Text className="text-zinc-500 font-medium mt-4">No items found</Text>
                </View>
              ) : (
                items?.filter(i => i.name.toLowerCase().includes(itemSearchQuery.toLowerCase())).map(i => {
                  const itemPrice = getUnitPrice(i);
                  return (
                    <TouchableOpacity 
                      key={i.id} 
                      className={`p-4 mb-3 rounded-2xl flex-row items-center border active:opacity-80 shadow-sm ${itemId === i.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-zinc-100'}`}
                      onPress={() => { setItemId(i.id); setItemModalVisible(false); }}
                    >
                      <View className="flex-1">
                        <Text className={`text-base font-bold ${itemId === i.id ? 'text-blue-800' : 'text-zinc-900'}`}>{i.name}</Text>
                        <View className="flex-row items-center mt-1">
                          {i.capacity_kg ? <Text className="text-zinc-500 text-xs mr-2">{i.capacity_kg} kg</Text> : null}
                        </View>
                      </View>
                      <View className={`px-3 py-1.5 rounded-full ${itemId === i.id ? 'bg-blue-100' : 'bg-zinc-100'}`}>
                        <Text className={`font-bold text-sm ${itemId === i.id ? 'text-blue-800' : 'text-zinc-700'}`}>₹{itemPrice}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              <View className="h-10" />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PrinterSettingsModal 
        visible={printerModalVisible} 
        onClose={() => setPrinterModalVisible(false)} 
      />

      {receiptImagePrintBridge}

      <CustomAlert 
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}
