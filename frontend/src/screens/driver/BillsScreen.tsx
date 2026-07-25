import React, { useState, useLayoutEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api, API_BASE_URL } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useReceiptImagePrintJob } from '../../hooks/use-receipt-image-print-job';
import { usePrinterStore } from '../../store/printer-store';
import { DeliveryReceiptData, DeliveryReceiptItem } from '../../utils/printer';
import { format } from 'date-fns';
import { useDriverItems } from '../../hooks/useItems';
import { useDriverOrganization } from '../../hooks/useDrivers';
import { useAuth } from '../../context/AuthContext';
import PrinterSettingsModal from '../../components/PrinterSettingsModal';
import { BillCard } from '../../components/BillCard';


export default function BillsScreen() {
  const navigation = useNavigation();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [printerModalVisible, setPrinterModalVisible] = useState(false);

  const [activeTab, setActiveTab] = useState<'SALES' | 'COLLECTIONS'>('SALES');
  const { receiptImagePrintBridge, startReceiptImagePrintJob } = useReceiptImagePrintJob();
  const preferredPrinter = usePrinterStore((state) => state.preferredPrinter);
  const { data: itemsCatalog = [] } = useDriverItems();
  const { data: organization } = useDriverOrganization();

  const handleRefresh = useCallback(() => {
    queryClient.resetQueries();
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
  const { 
    data: historyData, 
    isLoading, 
    refetch, 
    isRefetching, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  } = useInfiniteQuery({
    queryKey: ['driver_history', activeTab],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get('/driver/entries', {
        params: { 
          paginated: true, 
          cursor: pageParam, 
          limit: 20, 
          bill_type: activeTab === 'SALES' ? 'sales' : 'collections' 
        }
      });
      return res.data;
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
  });

  const history = historyData || [];

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-zinc-100">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const displayedHistory = history;

  const handlePrint = (item: any) => {
    if (!preferredPrinter) {
      Alert.alert("No Printer", "Please select a printer in the Delivery screen first.");
      return;
    }
    
    // Use snapshot if available, otherwise fallback to approximation
    const currentBalance = item.buyer?.balance_pending || 0;
    const openingBalance = item.opening_balance != null ? item.opening_balance : (currentBalance - item.total_bill_amount + item.cash_collected + item.upi_collected);
    const closingBalance = item.closing_balance != null ? item.closing_balance : currentBalance;
    
    const receiptItems: DeliveryReceiptItem[] = item.items.map((i: any) => ({
      name: i.item?.name || 'Item',
      quantity: i.full_delivered,
      price: i.unit_price_at_delivery,
      total: i.line_total_amount
    }));

      // Map only the items that were part of this specific delivery bill
      // to ensure historical accuracy, using the holding snapshot.
      const cylinderBalances = item.items
      ?.filter((bi: any) => bi.buyer_holding_snapshot != null)
      .map((bi: any) => {
        const given = bi.full_delivered || 0;
        const taken = bi.empty_received || 0;
        return {
          name: bi.item?.name || itemsCatalog?.find((cat: any) => cat.id === bi.item_id)?.name || 'Item',
          count: bi.buyer_holding_snapshot,
          given: given,
          taken: taken
        };
      });
    
    const isPayment = item.bill_number?.startsWith('PAY-');

    const receiptData: DeliveryReceiptData = {
      receipt_type: isPayment ? 'PAYMENT' : 'DELIVERY',
      receipt_number: item.bill_number || item.id.split('-')[0].toUpperCase(),
      date: item.timestamp,
      agency_name: organization?.name || "Agency Name",
      agency_address: organization?.address || "",
      agency_mobile: organization?.phone || "",
      buyer_name: item.buyer?.name || item.adhoc_buyer_name || 'Unknown',
      buyer_address: item.buyer?.address || "",
      buyer_phone: item.buyer?.phone || "",
      opening_balance: openingBalance,
      items: receiptItems,
      total_bill: item.total_bill_amount,
      cash_collected: item.cash_collected,
      upi_collected: item.upi_collected,
      closing_balance: closingBalance,
      cylinder_balances: cylinderBalances,
    };

    startReceiptImagePrintJob([receiptData], preferredPrinter).catch(err => {
      Alert.alert("Print Error", err.message || "Failed to print receipt");
    });
  };

  const handleSharePDF = async (item: any) => {
    try {
      const url = `${API_BASE_URL}/driver/entries/${item.id}/pdf`;
      const fileUri = `${FileSystem.cacheDirectory}Bill_${item.bill_number || item.id}.pdf`;
      
      const token = await AsyncStorage.getItem('@auth_token');
      
      const { uri } = await FileSystem.downloadAsync(url, fileUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } else {
        Alert.alert("Sharing not available", "Sharing is not supported on this device.");
      }
    } catch (e) {
      Alert.alert("Error", "Could not download or share the PDF.");
      console.error(e);
    }
  };

  return (
    <View className="flex-1 bg-zinc-100">
      <View className="flex-row bg-white p-2 mb-2">
        <TouchableOpacity 
          className={`flex-1 py-3 items-center rounded-lg ${activeTab === 'SALES' ? 'bg-zinc-800' : 'bg-transparent'}`}
          onPress={() => setActiveTab('SALES')}
        >
          <Text className={`font-semibold ${activeTab === 'SALES' ? 'text-white' : 'text-zinc-500'}`}>Sales Bills</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          className={`flex-1 py-3 items-center rounded-lg ${activeTab === 'COLLECTIONS' ? 'bg-zinc-800' : 'bg-transparent'}`}
          onPress={() => setActiveTab('COLLECTIONS')}
        >
          <Text className={`font-semibold ${activeTab === 'COLLECTIONS' ? 'text-white' : 'text-zinc-500'}`}>Collection Bills</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayedHistory}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BillCard item={item} handlePrint={handlePrint} handleSharePDF={handleSharePDF} itemsCatalog={itemsCatalog} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View className="py-10 items-center">
            <Ionicons name="receipt-outline" size={48} color="#d4d4d8" />
            <Text className="text-zinc-400 mt-4 text-center">No deliveries logged today.</Text>
          </View>
        }
        refreshing={isRefetching}
        onRefresh={refetch}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null}
      />
      
      <PrinterSettingsModal 
        visible={printerModalVisible} 
        onClose={() => setPrinterModalVisible(false)} 
      />
      {receiptImagePrintBridge}
    </View>
  );
  
};
