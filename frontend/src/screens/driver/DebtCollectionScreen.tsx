import React, { useState, useLayoutEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { DeliveryReceiptData } from '../../utils/printer';
import { useReceiptImagePrintJob } from '../../hooks/use-receipt-image-print-job';
import { useDriverOrganization } from '../../hooks/useDrivers';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

import { usePrinterStore } from '../../store/printer-store';
import CustomAlert from '../../components/CustomAlert';
import PrinterSettingsModal from '../../components/PrinterSettingsModal';

export default function DebtCollectionScreen() {
  const navigation = useNavigation();
  const { userToken, logout } = useAuth();
  const { preferredPrinter } = usePrinterStore();
  const queryClient = useQueryClient();
  const { data: organization } = useDriverOrganization();
  const { startReceiptImagePrintJob, receiptImagePrintBridge } = useReceiptImagePrintJob();

  const [buyerModalVisible, setBuyerModalVisible] = useState(false);
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [buyerSearchQuery, setBuyerSearchQuery] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [cashCollected, setCashCollected] = useState('');
  const [upiCollected, setUpiCollected] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => Date.now().toString(36) + Math.random().toString(36).substring(2));

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' as 'error' | 'success' | 'info' });

  const showAlert = (title: string, message: string, type: 'error' | 'success' | 'info' = 'error') => {
    setAlertConfig({ title, message, type });
    setAlertVisible(true);
  };

  const handleRefresh = useCallback(() => {
    queryClient.resetQueries();
    setBuyerId('');
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

  // Fetch Buyers
  const { data: buyers, isLoading: buyersLoading } = useQuery({
    queryKey: ['driver_buyers'],
    queryFn: async () => {
      const res = await api.get(`/driver/buyers`);
      return res.data as { id: string, name: string, phone?: string, address: string, balance_pending: number }[];
    },
    enabled: !!userToken
  });

  const selectedBuyer = buyers?.find(b => b.id === buyerId);

  const submitMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await api.post(`/driver/collections`, payload, {
        headers: {
          'X-Idempotency-Key': idempotencyKey
        }
      });
    },
    onSuccess: (data) => {
      showAlert("Success", "Payment collected successfully.", "success");

      if (selectedBuyer && preferredPrinter) {
        const cash_paid = parseFloat(cashCollected || '0');
        const upi_paid = parseFloat(upiCollected || '0');

        const receiptData: DeliveryReceiptData = {
          receipt_type: 'PAYMENT',
          receipt_number: data?.data?.bill_number || Math.random().toString(36).substring(2, 8).toUpperCase(),
          date: data?.data?.timestamp || new Date().toISOString(),
          agency_name: organization?.name || "Agency Name",
          agency_address: organization?.address || "",
          agency_mobile: organization?.phone || "",
          buyer_name: selectedBuyer.name,
          buyer_address: selectedBuyer.address || "",
          opening_balance: parseFloat(selectedBuyer.balance_pending.toString()),
          items: [],
          total_bill: 0,
          cash_collected: cash_paid,
          upi_collected: upi_paid,
          closing_balance: parseFloat(selectedBuyer.balance_pending.toString()) - (cash_paid + upi_paid),
        };
        startReceiptImagePrintJob([receiptData], preferredPrinter).catch(err => {
          showAlert("Print Error", err.message || "Failed to print receipt", "error");
        });
      }

      // Reset form
      setBuyerId('');
      setCashCollected('');
      setUpiCollected('');
      setIdempotencyKey(Date.now().toString(36) + Math.random().toString(36).substring(2));
      queryClient.invalidateQueries({ queryKey: ['driver_history'] });
      queryClient.invalidateQueries({ queryKey: ['driver_buyers'] });
    },
    onError: (err: any) => {
      showAlert("Error", err.response?.data?.detail || "Failed to log collection.", "error");
    }
  });

  if (buyersLoading) {
    return (
      <View className="flex-1 bg-zinc-50 justify-center items-center">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-zinc-50">
      <ScrollView className="flex-1 p-4 pt-6" showsVerticalScrollIndicator={false}>

        {/* Buyer Selection */}
        <View className="bg-white rounded-2xl p-4 mb-4 border border-zinc-100">
          <Text className="text-zinc-500 font-medium mb-2">Select Buyer *</Text>
          <TouchableOpacity
            className="flex-row items-center justify-between bg-zinc-50 border border-zinc-200 p-4 rounded-xl"
            onPress={() => setBuyerModalVisible(true)}
          >
            {selectedBuyer ? (
              <View>
                <Text className="text-zinc-800 font-semibold text-lg">{selectedBuyer.name}</Text>
                <Text className="text-zinc-500 text-sm mt-1">Pending: ₹ {parseFloat(selectedBuyer.balance_pending.toString()).toFixed(2)}</Text>
              </View>
            ) : (
              <Text className="text-zinc-400 text-lg">Tap to select a buyer...</Text>
            )}
            <Ionicons name="chevron-down" size={24} color="#a1a1aa" />
          </TouchableOpacity>
        </View>

        {/* Payment Collection */}
        {selectedBuyer && (
          <View className="bg-white rounded-2xl p-4 border border-zinc-100 shadow-sm mb-6 space-y-4">

            <View className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-4 flex-row justify-between items-center">
              <Text className="text-blue-800 font-medium text-lg">Current Pending:</Text>
              <Text className="text-blue-900 font-bold text-2xl">₹{parseFloat(selectedBuyer.balance_pending.toString()).toFixed(2)}</Text>
            </View>

            <View className="flex-row gap-4 mb-4">
              <View className="flex-1">
                <Text className="text-zinc-500 font-medium mb-1">Cash Collected</Text>
                <TextInput
                  className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-lg text-center font-bold"
                  keyboardType="numeric"
                  value={cashCollected}
                  onChangeText={(val) => {
                    const numVal = parseFloat(val || '0');
                    const pending = parseFloat(selectedBuyer.balance_pending.toString() || '0');
                    const currentUpi = parseFloat(upiCollected || '0');
                    const maxAllowed = Math.max(0, pending - currentUpi);
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
                  className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-lg text-center font-bold"
                  keyboardType="numeric"
                  value={upiCollected}
                  onChangeText={(val) => {
                    const numVal = parseFloat(val || '0');
                    const pending = parseFloat(selectedBuyer.balance_pending.toString() || '0');
                    const currentCash = parseFloat(cashCollected || '0');
                    const maxAllowed = Math.max(0, pending - currentCash);
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

            <View className="mt-2 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
              <View className="flex-row justify-between mb-2">
                <Text className="text-emerald-600 font-medium">Total Collected</Text>
                <Text className="text-emerald-600 font-bold">- ₹ {(parseFloat(cashCollected || '0') + parseFloat(upiCollected || '0')).toFixed(2)}</Text>
              </View>
              <View className="h-px bg-zinc-200 my-2" />
              <View className="flex-row justify-between">
                <Text className="text-zinc-800 font-bold">New Pending</Text>
                <Text className="text-zinc-800 font-bold">
                  ₹ {(parseFloat(selectedBuyer.balance_pending.toString()) - (parseFloat(cashCollected || '0') + parseFloat(upiCollected || '0'))).toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity
          className="py-4 rounded-xl items-center mb-12"
          style={{ backgroundColor: submitMutation.isPending ? '#60a5fa' : '#2563eb', opacity: !buyerId ? 0.5 : 1 }}
          onPress={() => {
            if (!buyerId) {
              showAlert("Required", "Please select a buyer.");
              return;
            }
            const cash = parseFloat(cashCollected || '0');
            const upi = parseFloat(upiCollected || '0');

            if (cash + upi <= 0) {
              showAlert("Invalid", "Please enter an amount to collect.");
              return;
            }

            if (cash + upi > parseFloat(selectedBuyer?.balance_pending?.toString() || '0')) {
              showAlert("Invalid", "Cannot collect more than the pending balance.");
              return;
            }

            submitMutation.mutate({
              buyer_id: buyerId,
              cash_collected: cash,
              upi_collected: upi
            });
          }}
          disabled={submitMutation.isPending || !buyerId}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-lg font-semibold flex-row items-center">
              Submit Payment <Ionicons name="checkmark-circle" size={20} color="white" />
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
              <Text className="text-xl font-bold text-zinc-900">Select Buyer with Debt</Text>
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
              {buyers?.filter(b => b.balance_pending > 0 && b.name.toLowerCase().includes(buyerSearchQuery.toLowerCase())).length === 0 ? (
                <View className="items-center justify-center py-12">
                  <Ionicons name="search-outline" size={48} color="#e4e4e7" />
                  <Text className="text-zinc-500 font-medium mt-4 text-center">No buyers found.</Text>
                </View>
              ) : (
                buyers?.filter(b => b.balance_pending > 0 && b.name.toLowerCase().includes(buyerSearchQuery.toLowerCase())).map(b => (
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
                      <View className="flex-row flex-wrap items-center gap-x-3">
                        {b.phone ? (
                          <View className="flex-row items-center">
                            <Ionicons name="call" size={12} color={buyerId === b.id ? "#60a5fa" : "#a1a1aa"} className="mr-1" />
                            <Text className={`text-xs ${buyerId === b.id ? 'text-blue-600' : 'text-zinc-500'}`}>{b.phone}</Text>
                          </View>
                        ) : null}
                        {b.address ? (
                          <View className="flex-row items-center mt-1">
                            <Ionicons name="location" size={12} color={buyerId === b.id ? "#60a5fa" : "#a1a1aa"} className="mr-1" />
                            <Text className={`text-xs ${buyerId === b.id ? 'text-blue-600' : 'text-zinc-500'}`}>{b.address}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))
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

      <CustomAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertVisible(false)}
      />

      {receiptImagePrintBridge}
    </KeyboardAvoidingView>
  );
}
