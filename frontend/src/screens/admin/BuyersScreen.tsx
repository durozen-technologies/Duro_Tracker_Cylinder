import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { Plus, X, Search, Store, ArrowLeft, Download, FileText, Receipt, Edit2, Trash2, RefreshCw, PackageOpen } from 'lucide-react-native';

import { useBuyers, useCreateBuyer, useUpdateBuyer, useDeleteBuyer, useGlobalBills, useBuyerLedger, useGlobalBillsPaginated } from '../../hooks/useBuyers';
import { useItems } from '../../hooks/useItems';
import { BillCard } from '../../components/BillCard';
import type { Buyer } from '../../types/api';
import { format } from 'date-fns';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';


export default function BuyersScreen() {
  const route = useRoute<RouteProp<Record<string, { screenTab?: 'crm' | 'bills' }>, string>>();
  const { data: buyers = [], isLoading, refetch: refetchBuyers, isRefetching: isBuyersRefetching } = useBuyers();
  const [activeTab, setActiveTab] = useState<'crm' | 'bills'>(route.params?.screenTab || 'crm');
  
  useFocusEffect(
    useCallback(() => {
      if (route.params?.screenTab) {
        setActiveTab(route.params.screenTab);
      }
    }, [route.params?.screenTab])
  );
  
  const [globalBillsTab, setGlobalBillsTab] = useState<'ALL' | 'SALES' | 'COLLECTIONS'>('ALL');
  const { 
    data: globalBillsPages, 
    isLoading: isGlobalBillsLoading, 
    hasNextPage, 
    fetchNextPage,
    refetch: refetchGlobalBills,
    isRefetching: isGlobalBillsRefetching
  } = useGlobalBillsPaginated(globalBillsTab);

  const globalBillsData = Array.isArray(globalBillsPages) ? globalBillsPages : [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<Buyer | null>(null);
  
  const { data: items = [] } = useItems();
  
  const { 
    data: buyerLedgerData = [], 
    isLoading: isLedgerLoading, 
    refetch: refetchLedger, 
    isRefetching: isLedgerRefetching,
    hasNextPage: hasNextLedgerPage,
    fetchNextPage: fetchNextLedgerPage
  } = useBuyerLedger(selectedBuyer?.id);

  useEffect(() => {
    refetchBuyers();
    if (activeTab === 'bills') {
      refetchGlobalBills();
    }
  }, [refetchBuyers, refetchGlobalBills, activeTab]);

  const createBuyer = useCreateBuyer();
  const updateBuyer = useUpdateBuyer();
  const deleteBuyer = useDeleteBuyer();
  
  const [newName, setNewName] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newFinBal, setNewFinBal] = useState('');
  const [newInventory, setNewInventory] = useState<Record<string, string>>({});

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editBuyerId, setEditBuyerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editOwner, setEditOwner] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editFinBal, setEditFinBal] = useState('');
  const [editInventory, setEditInventory] = useState<Record<string, string>>({});

  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
  const [isCollectionsModalOpen, setIsCollectionsModalOpen] = useState(false);
  const [editPricePerKg, setEditPricePerKg] = useState('');

  const handleSaveBuyer = () => {
    if (!newName.trim()) return;
    createBuyer.mutate({
      name: newName.trim(),
      phone: newPhone.trim(),
      address: newAddress.trim(),
      type: 'commercial',
      balance_pending: parseFloat(newFinBal) || 0,
      inventory: Object.entries(newInventory)
        .map(([item_id, cylinders_pending]) => ({ item_id, cylinders_pending: parseInt(cylinders_pending) || 0 }))
        .filter(inv => inv.cylinders_pending > 0),
    }, {
      onSuccess: () => {
        setIsModalOpen(false);
        setNewName('');
        setNewOwner('');
        setNewPhone('');
        setNewAddress('');
        setNewFinBal('');
        setNewInventory({});
      }
    });
  };

  const openEditModal = (buyer: Buyer) => {
    setEditBuyerId(buyer.id);
    setEditName(buyer.name);
    setEditPhone(buyer.phone || '');
    setEditAddress(buyer.address || '');
    setEditFinBal(buyer.balance_pending.toString());
    const invMap: Record<string, string> = {};
    buyer.inventory?.forEach(inv => {
      invMap[inv.item_id] = inv.cylinders_pending.toString();
    });
    setEditInventory(invMap);
    setIsEditModalOpen(true);
  };

  const handleEditBuyer = () => {
    if (!editBuyerId || !editName.trim()) return;
    updateBuyer.mutate({
      id: editBuyerId,
      data: {
        name: editName.trim(),
        phone: editPhone.trim(),
        address: editAddress.trim(),
      }
    }, {
      onSuccess: () => {
        setIsEditModalOpen(false);
        if (selectedBuyer && selectedBuyer.id === editBuyerId) {
          // Temporarily updating local selected buyer for instant UI update
          setSelectedBuyer(prev => prev ? { 
            ...prev, 
            name: editName.trim(),
            phone: editPhone.trim(),
            address: editAddress.trim(),
          } : null);
        }
      }
    });
  };

  const handleDeleteBuyer = () => {
    if (!editBuyerId) return;
    deleteBuyer.mutate(editBuyerId, {
      onSuccess: () => {
        setIsEditModalOpen(false);
        if (selectedBuyer?.id === editBuyerId) {
          setSelectedBuyer(null);
        }
      },
      onError: (err: any) => {
        Alert.alert("Cannot Delete", err.response?.data?.detail || "An error occurred while deleting the buyer.");
      }
    });
  };

  const handleUpdatePrice = () => {
    if (!selectedBuyer) return;
    const priceVal = parseFloat(editPricePerKg);

    if (priceVal < 0) {
      Alert.alert("Invalid", "Price cannot be negative.");
      return;
    }

    updateBuyer.mutate({
      id: selectedBuyer.id,
      data: {
        price_per_kg: isNaN(priceVal) ? undefined : priceVal
      }
    }, {
      onSuccess: (updatedData) => {
        setIsPriceModalOpen(false);
        setSelectedBuyer(updatedData);
      }
    });
  };

  const handleSharePDF = async (item: any) => {
    try {
      const url = `${API_BASE_URL}/driver/entries/${item.id}/pdf`;
      const fileUri = `${FileSystem.cacheDirectory}Bill_${item.bill_number || item.id}.pdf`;

      const token = await AsyncStorage.getItem("@auth_token");

      const { uri } = await FileSystem.downloadAsync(url, fileUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          UTI: ".pdf",
          mimeType: "application/pdf",
        });
      } else {
        Alert.alert(
          "Sharing not available",
          "Sharing is not supported on this device.",
        );
      }
    } catch (e) {
      Alert.alert("Error", "Could not download or share the PDF.");
      console.error(e);
    }
  };

  const renderLedgerRow = ({ item }: { item?: any }) => {
    if (!item) return null;

    let formattedDate = 'N/A';
    try {
      if (item.timestamp || item.date) {
        formattedDate = format(new Date(item.timestamp || item.date), 'MMM dd, yyyy');
      }
    } catch (e) {}

    const isBill = item.type === 'bill';

    return (
      <View className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200 mb-3 overflow-hidden">
        {/* Top Section: Identity & Value */}
        <View className="p-4 flex flex-row justify-between items-start">
          <View className="flex-1 pr-4">
            <Text className="text-base font-bold text-slate-900 tracking-tight" numberOfLines={1}>
              {item.bill_number ? `Bill No : ${item.bill_number}` : `Ref: ${item.id?.substring(0,8) || '-'}`}
            </Text>
            <Text className="text-xs font-medium text-slate-500 mt-1">{formattedDate}</Text>
          </View>
          <View className="flex flex-row items-center gap-4 shrink-0">
            {isBill && (
              <Pressable onPress={() => handleSharePDF(item)} className="p-2 bg-indigo-50 rounded-xl border border-indigo-100 active:bg-indigo-100">
                <Ionicons name="share-social" size={18} color="#4f46e5" />
              </Pressable>
            )}
            <View className="items-end">
              {isBill ? (
                <Text className="text-lg font-black font-mono text-indigo-600">
                  ₹{item.amount ? item.amount.toLocaleString() : '0'}
                </Text>
              ) : (
                <Text className="text-lg font-black font-mono text-emerald-600">
                  +₹{item.paid ? item.paid.toLocaleString() : '0'}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Bottom Section: Details & Balances */}
        <View className="bg-slate-50 px-4 py-3 flex flex-row justify-between items-center border-t border-slate-100">
          <View className="flex flex-row items-center gap-2">
            <View className="px-2 py-1 rounded" style={{ backgroundColor: isBill ? '#eef2ff' : '#ecfdf5' }}>
              <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isBill ? '#4338ca' : '#047857' }}>
                {isBill ? 'Sales Bill' : 'Payment'}
              </Text>
            </View>
            {isBill && (
              <Text className="text-xs font-semibold text-slate-600 ml-1">
                {item.fullGiven || 0} Full / {item.emptyCollected || 0} MT
              </Text>
            )}
          </View>
          <View className="items-end flex flex-row gap-3">
            <View className="items-end">
              <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Fin Bal</Text>
              <Text className="text-xs font-bold text-slate-700 font-mono tracking-tight">₹{item.finRunBal !== undefined ? item.finRunBal.toLocaleString() : '0'}</Text>
            </View>
            <View className="w-px h-6 bg-slate-200" />
            <View className="items-end">
              <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Cyl Bal</Text>
              <Text className="text-xs font-bold text-slate-700 font-mono tracking-tight">{item.cylRunBal !== undefined ? item.cylRunBal : '0'}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderBuyerCRM = () => {
    if (selectedBuyer) {
      return (
        <ScrollView className="flex-1 pb-20">
          <View className="flex flex-row items-center justify-between mb-6 mt-2">
            <View className="flex flex-row items-center gap-4">
              <Pressable 
                onPress={() => setSelectedBuyer(null)}
                className="p-2 bg-white border border-gray-200 rounded-lg"
              >
                <ArrowLeft size={20} color="#475569" />
              </Pressable>
              <View>
                <Text className="text-xl font-bold text-slate-900">{selectedBuyer.name}</Text>
                <Text className="text-sm text-slate-500">{selectedBuyer.phone || 'No phone'}</Text>
              </View>
            </View>
            
            <Pressable 
              onPress={() => openEditModal(selectedBuyer)}
              className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg flex flex-row items-center gap-2 active:bg-indigo-100"
            >
              <Edit2 size={16} color="#4f46e5" />
              <Text className="text-indigo-700 font-bold text-xs">Edit</Text>
            </Pressable>
          </View>

          <View className="flex flex-row gap-4 mb-6">
            <View className="flex-1 bg-white rounded-xl border border-gray-200 p-4 flex flex-row items-center justify-between">
              <View>
                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Financial Balance</Text>
                <Text className="text-xl font-mono tracking-tight font-bold" style={{ color: selectedBuyer.balance_pending > 0 ? '#e11d48' : '#059669' }}>
                  {selectedBuyer.balance_pending > 0 ? `₹${selectedBuyer.balance_pending.toLocaleString()} Due` : `₹${Math.abs(selectedBuyer.balance_pending).toLocaleString()} Adv`}
                </Text>
              </View>
            </View>
            
            <View 
              className="flex-1 bg-white rounded-xl border border-gray-200 p-4"
            >
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cylinder Holding</Text>
              </View>
              <View>
                <Text className="text-xl font-mono tracking-tight font-bold text-slate-900">
                  {selectedBuyer.inventory ? selectedBuyer.inventory.reduce((sum, inv) => sum + inv.cylinders_pending, 0) : 0} Total
                </Text>
              </View>
            </View>
          </View>

          <View className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-row items-center justify-between">
            <View>
              <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Price (Per KG)</Text>
              <Text className="text-lg font-bold text-slate-900">
                {selectedBuyer.price_per_kg ? `₹${selectedBuyer.price_per_kg}` : 'Not Set'}
              </Text>
              {!selectedBuyer.price_per_kg && (
                <Text className="text-xs text-red-500 mt-1 font-medium">Please add a price before billing</Text>
              )}
            </View>
            <Pressable 
              onPress={() => {
                setEditPricePerKg(selectedBuyer.price_per_kg ? selectedBuyer.price_per_kg.toString() : '');
                setIsPriceModalOpen(true);
              }}
              className="bg-indigo-50 px-4 py-2 rounded-lg active:bg-indigo-100"
            >
              <Text className="text-indigo-700 font-bold text-sm">
                {selectedBuyer.price_per_kg ? 'Update Price' : 'Add Price'}
              </Text>
            </Pressable>
          </View>

          <View className="flex flex-row gap-4 mb-6">
            <Pressable 
              onPress={() => setIsSalesModalOpen(true)}
              className="flex-1 bg-white rounded-xl border border-gray-200 p-4 active:bg-gray-50"
            >
              <View className="mb-2">
                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Sales</Text>
              </View>
              <View>
                <Text className="text-xl font-mono tracking-tight font-bold text-slate-900">
                  ₹{(selectedBuyer?.total_lifetime_sales || 0).toLocaleString()}
                </Text>
              </View>
            </Pressable>

            <Pressable 
              onPress={() => setIsCollectionsModalOpen(true)}
              className="flex-1 bg-white rounded-xl border border-gray-200 p-4 active:bg-gray-50"
            >
              <View className="mb-2">
                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Paid</Text>
              </View>
              <View>
                <Text className="text-xl font-mono tracking-tight font-bold text-slate-900">
                  ₹{(selectedBuyer?.total_lifetime_paid || 0).toLocaleString()}
                </Text>
              </View>
            </Pressable>
          </View>

          {/* Embedded Inventory Breakdown */}
          <View className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <View className="p-4 border-b border-gray-200 bg-gray-50">
              <Text className="text-xs font-bold text-slate-900 uppercase tracking-wider">Cylinder Holding Breakdown</Text>
            </View>
            <View className="p-4">
              {selectedBuyer?.inventory && selectedBuyer.inventory.length > 0 ? (
                <View className="flex flex-col gap-3">
                  {selectedBuyer.inventory.map(inv => {
                    if (inv.cylinders_pending === 0) return null;
                    const itemDetails = items?.find(i => i.id === inv.item_id);
                    return (
                      <View key={inv.item_id} className="flex flex-row justify-between items-center bg-amber-50 p-3 rounded-xl border border-amber-100">
                        <Text className="font-semibold text-slate-700 text-base">{itemDetails?.name || 'Unknown Item'}</Text>
                        <Text className="font-mono font-bold text-lg text-amber-600">{inv.cylinders_pending} cyl</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text className="text-center text-slate-500 py-4 font-medium">No cylinders currently held.</Text>
              )}
            </View>
          </View>
        </ScrollView>
      );
    }

    return (
      <View className="flex-1 pb-20">
        <View className="flex flex-row items-center justify-between mb-6">
          <View className="flex-1 bg-white border border-gray-300 rounded-lg flex flex-row items-center px-3 mr-4 h-10">
            <Search size={16} color="#94a3b8" />
            <TextInput 
              placeholder="Search buyers..." 
              className="flex-1 ml-2 text-sm text-slate-900"
            />
          </View>
          <Pressable 
            onPress={() => setIsModalOpen(true)}
            className="flex flex-row items-center justify-center gap-2 px-4 h-10 bg-indigo-600 rounded-lg"
          >
            <Plus size={16} color="#ffffff" />
            <Text className="text-white text-sm font-medium">Add Buyer</Text>
          </Pressable>
        </View>

        <View className="border border-gray-200 rounded-2xl bg-white overflow-hidden">
          <FlatList
            data={buyers}
            keyExtractor={(item) => item.id.toString()}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            renderItem={({ item }) => (
              <Pressable 
                onPress={() => setSelectedBuyer(item)}
                className="flex flex-row items-center border-b border-gray-100 p-4 active:bg-slate-50"
              >
                <View className="w-12 h-12 bg-indigo-50 rounded-full items-center justify-center mr-4">
                  <Store size={24} color="#4f46e5" />
                </View>
                <View className="flex-1 flex flex-col justify-center gap-1">
                  <Text className="text-base font-bold text-slate-900 tracking-tight">{item.name}</Text>
                  <View className="flex flex-row items-center gap-2">
                    <Text className="text-xs font-bold" style={{ color: item.balance_pending > 0 ? '#e11d48' : '#059669' }}>
                      {item.balance_pending > 0 ? `₹${item.balance_pending.toLocaleString()} Due` : `₹${Math.abs(item.balance_pending).toLocaleString()} Adv`}
                    </Text>
                    <View className="w-1 h-1 rounded-full bg-slate-300" />
                    <Text className="text-xs font-bold text-amber-600">
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
            )}
          />
        </View>
      </View>
    );
  };

  const renderGlobalBills = () => (
    <View className="flex-1 mt-2">
      {/* Tab Selector */}
      <View className="flex flex-row bg-slate-200 p-1 rounded-xl mb-4 w-full">
        <Pressable 
          className={`w-1/3 py-2 rounded-lg items-center justify-center ${globalBillsTab === 'ALL' ? 'bg-white' : ''}`}
          onPress={() => setGlobalBillsTab('ALL')}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit className={`text-sm font-medium px-1 ${globalBillsTab === 'ALL' ? 'text-slate-900' : 'text-slate-500'}`}>All Bills</Text>
        </Pressable>
        <Pressable 
          className={`w-1/3 py-2 rounded-lg items-center justify-center ${globalBillsTab === 'SALES' ? 'bg-white' : ''}`}
          onPress={() => setGlobalBillsTab('SALES')}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit className={`text-sm font-medium px-1 ${globalBillsTab === 'SALES' ? 'text-slate-900' : 'text-slate-500'}`}>Sales</Text>
        </Pressable>
        <Pressable 
          className={`w-1/3 py-2 rounded-lg items-center justify-center ${globalBillsTab === 'COLLECTIONS' ? 'bg-white' : ''}`}
          onPress={() => setGlobalBillsTab('COLLECTIONS')}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit className={`text-sm font-medium px-1 ${globalBillsTab === 'COLLECTIONS' ? 'text-slate-900' : 'text-slate-500'}`}>Collections</Text>
        </Pressable>
      </View>

      {isGlobalBillsLoading ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-slate-500 font-medium">Loading bills...</Text>
        </View>
      ) : !Array.isArray(globalBillsData) || globalBillsData.length === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-slate-500 font-medium">No bills found.</Text>
        </View>
      ) : (
        <FlatList
          className="flex-1"
          data={globalBillsData}
          keyExtractor={(item, index) => item?.id ? item.id.toString() : index.toString()}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (hasNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <BillCard 
              item={item} 
              itemsCatalog={items} 
              handlePrint={() => {
                Alert.alert("Notice", "Printing is available in the Driver app.");
              }} 
            />
          )}
        />
      )}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-gray-50">
    <View className="flex-1 p-4">
      {/* Header & Tabs */}
        <View className="flex flex-col mb-4">
          <View className="flex flex-row justify-between items-start mb-4">
            <View className="flex-1 mr-4">
              <Text className="text-2xl font-semibold text-slate-900">Buyers & Sales</Text>
              <Text className="text-slate-500 text-sm mt-1">Manage retailer accounts and daily sales records.</Text>
            </View>
            <Pressable 
              onPress={() => {
                refetchBuyers();
                refetchGlobalBills();
                if (selectedBuyer) refetchLedger();
              }}
              disabled={isBuyersRefetching || isGlobalBillsRefetching || isLedgerRefetching}
              className="p-2.5 bg-white border border-gray-200 rounded-xl active:bg-slate-50 shadow-sm"
              style={{ opacity: (isBuyersRefetching || isGlobalBillsRefetching || isLedgerRefetching) ? 0.5 : 1 }}
            >
              <RefreshCw size={20} color="#475569" />
            </Pressable>
          </View>
          
          <View className="flex flex-row p-1 bg-slate-200 rounded-xl w-full">
            <Pressable
              onPress={() => { setActiveTab('crm'); setSelectedBuyer(null); }}
              className={`w-1/2 py-2 items-center justify-center rounded-lg ${activeTab === 'crm' ? 'bg-white' : ''}`}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit className={`text-sm font-medium px-1 ${activeTab === 'crm' ? 'text-slate-900' : 'text-slate-500'}`}>Buyer CRM</Text>
            </Pressable>
            <Pressable
              onPress={() => { setActiveTab('bills'); setSelectedBuyer(null); }}
              className={`w-1/2 py-2 items-center justify-center rounded-lg ${activeTab === 'bills' ? 'bg-white' : ''}`}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit className={`text-sm font-medium px-1 ${activeTab === 'bills' ? 'text-slate-900' : 'text-slate-500'}`}>Global Daily Bills</Text>
            </Pressable>
          </View>
        </View>

        {activeTab === 'crm' ? renderBuyerCRM() : renderGlobalBills()}

        {/* Add Buyer Modal */}
        <Modal animationType="fade" transparent={true} visible={isModalOpen} onRequestClose={() => setIsModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View className="flex-1 items-center justify-center p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
            <View className="bg-white rounded-2xl w-full max-w-lg overflow-hidden max-h-[90%]">
              <View className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
                <Text className="text-lg font-semibold text-slate-900">Add New Buyer</Text>
                <Pressable onPress={() => setIsModalOpen(false)} className="p-1 rounded-full">
                  <X size={20} color="#94a3b8" />
                </Pressable>
              </View>
              
              <ScrollView className="p-6">
                <View className="mb-6">
                  <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Business Details</Text>
                  
                  <View className="mb-4">
                    <Text className="text-sm font-medium text-slate-700 mb-1">Shop Name</Text>
                    <TextInput value={newName} onChangeText={setNewName} className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm" />
                  </View>
                  
                  <View className="mb-4">
                    <Text className="text-sm font-medium text-slate-700 mb-1">Owner Name</Text>
                    <TextInput value={newOwner} onChangeText={setNewOwner} className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm" />
                  </View>
                  
                  <View className="flex flex-row gap-4">
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-slate-700 mb-1">Mobile</Text>
                      <TextInput value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-slate-700 mb-1">Address</Text>
                      <TextInput value={newAddress} onChangeText={setNewAddress} className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm" />
                    </View>
                  </View>
                </View>

                <View className="h-px bg-gray-200 mb-6" />

                <View className="mb-4">
                  <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Opening Balances</Text>
                  <View className="flex flex-row gap-4">
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-700 mb-1">Financial Balance (₹)</Text>
                    <TextInput value={newFinBal} onChangeText={setNewFinBal} keyboardType="numeric" placeholder="0" className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm font-mono" />
                    <Text className="text-[10px] text-slate-500 mt-1">Amount they owe you.</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-700 mb-2">Cylinder Balances (Empties)</Text>
                    {items.map(item => (
                      <View key={item.id} className="flex flex-row items-center justify-between mb-2">
                        <Text className="text-xs text-slate-600 w-1/2">{item.name}</Text>
                        <TextInput 
                          value={newInventory[item.id] || ''} 
                          onChangeText={(val) => setNewInventory(prev => ({...prev, [item.id]: val}))} 
                          keyboardType="numeric" 
                          placeholder="0" 
                          className="w-1/2 rounded-lg border-gray-300 border px-2 py-1 text-xs font-mono" 
                        />
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View className="flex flex-row justify-end gap-3 mt-6 mb-4">
                <Pressable onPress={() => setIsModalOpen(false)} className="px-4 py-2.5 bg-white border border-gray-300 rounded-lg">
                  <Text className="text-sm font-medium text-slate-700">Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSaveBuyer} disabled={createBuyer.isPending} className="px-6 py-2.5 rounded-lg" style={{ backgroundColor: createBuyer.isPending ? '#818cf8' : '#4f46e5' }}>
                  <Text className="text-sm font-medium text-white">{createBuyer.isPending ? 'Saving...' : 'Save Buyer Profile'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Buyer Modal */}
      <Modal animationType="fade" transparent={true} visible={isEditModalOpen} onRequestClose={() => setIsEditModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
          <View className="bg-white rounded-2xl w-full max-w-lg overflow-hidden max-h-[90%]">
            <View className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
              <Text className="text-lg font-semibold text-slate-900">Edit Buyer Profile</Text>
              <Pressable onPress={() => setIsEditModalOpen(false)} className="p-1 rounded-full">
                <X size={20} color="#94a3b8" />
              </Pressable>
            </View>
            
            <ScrollView className="p-6">
              <View className="mb-6">
                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Business Details</Text>
                
                <View className="mb-4">
                  <Text className="text-sm font-medium text-slate-700 mb-1">Shop Name</Text>
                  <TextInput value={editName} onChangeText={setEditName} className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm" />
                </View>
                
                <View className="mb-4">
                  <Text className="text-sm font-medium text-slate-700 mb-1">Owner Name</Text>
                  <TextInput value={editOwner} onChangeText={setEditOwner} className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm" />
                </View>
                
                <View className="flex flex-row gap-4">
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-700 mb-1">Mobile</Text>
                    <TextInput value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-700 mb-1">Address</Text>
                    <TextInput value={editAddress} onChangeText={setEditAddress} className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm" />
                  </View>
                </View>
              </View>



              <View className="flex flex-row justify-between mt-6 mb-4 gap-3">
                <Pressable onPress={handleDeleteBuyer} disabled={deleteBuyer.isPending} className="px-4 py-2.5 bg-rose-50 border border-rose-100 rounded-lg flex-1 items-center justify-center">
                  <Text className="text-sm font-bold text-rose-600 flex flex-row items-center gap-2">
                    Delete
                  </Text>
                </Pressable>
                <Pressable onPress={handleEditBuyer} disabled={updateBuyer.isPending} className="px-6 py-2.5 flex-[2] items-center justify-center rounded-lg" style={{ backgroundColor: updateBuyer.isPending ? '#818cf8' : '#4f46e5' }}>
                  <Text className="text-sm font-medium text-white">{updateBuyer.isPending ? 'Saving...' : 'Update Buyer Profile'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Update Price Modal */}
      <Modal animationType="fade" transparent={true} visible={isPriceModalOpen} onRequestClose={() => setIsPriceModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
          <View className="bg-white rounded-[24px] w-full max-w-md overflow-hidden">
            <View className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200">
              <Text className="text-lg font-bold text-slate-900">Update Custom Pricing</Text>
              <Pressable onPress={() => setIsPriceModalOpen(false)} className="p-1.5 rounded-full bg-slate-100">
                <X size={18} color="#64748b" />
              </Pressable>
            </View>
            
            <View className="p-6 flex flex-col gap-4">
              <Text className="text-sm text-slate-600 mb-2">
                Set a custom price per kg for this buyer. Item prices will be automatically calculated as (Capacity × Price/kg) for this buyer during billing. Leave blank to use standard pricing.
              </Text>
              
              <View>
                <Text className="text-sm font-bold text-slate-700 mb-1">Price per kg (₹)</Text>
                <TextInput 
                  placeholder="e.g. 50"
                  keyboardType="numeric"
                  value={editPricePerKg}
                  onChangeText={setEditPricePerKg}
                  className="w-full rounded-xl border-gray-300 border px-4 py-3 text-sm text-slate-900 bg-slate-50 font-mono"
                />
              </View>

              <Pressable 
                onPress={handleUpdatePrice}
                disabled={updateBuyer.isPending}
                className="w-full rounded-xl py-3.5 items-center justify-center mt-4"
                style={{ backgroundColor: updateBuyer.isPending ? '#818cf8' : '#4f46e5' }}
              >
                <Text className="text-white font-bold text-sm">
                  {updateBuyer.isPending ? 'Saving...' : 'Save Pricing'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sales Modal */}
      <Modal animationType="slide" transparent={true} visible={isSalesModalOpen} onRequestClose={() => setIsSalesModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl h-5/6 overflow-hidden">
            <View className="p-4 border-b border-gray-200 flex flex-row items-center justify-between bg-gray-50">
              <Text className="text-lg font-bold text-slate-900">Sales History</Text>
              <Pressable onPress={() => setIsSalesModalOpen(false)} className="p-1.5 rounded-full bg-slate-200 active:bg-slate-300">
                <X size={20} color="#475569" />
              </Pressable>
            </View>
            <View className="flex-1 bg-slate-50">
              <FlatList
                data={buyerLedgerData.filter(row => row.type === 'bill')}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => <React.Fragment>{renderLedgerRow({item})}</React.Fragment>}
                contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                onEndReached={() => {
                  if (hasNextLedgerPage && !isLedgerRefetching) {
                    fetchNextLedgerPage();
                  }
                }}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={<Text className="text-center text-slate-500 py-8">No sales history found.</Text>}
                ListFooterComponent={isLedgerRefetching ? <Text className="text-center py-4 text-slate-500">Loading...</Text> : null}
              />
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Collections Modal */}
      <Modal animationType="slide" transparent={true} visible={isCollectionsModalOpen} onRequestClose={() => setIsCollectionsModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl h-5/6 overflow-hidden">
            <View className="p-4 border-b border-gray-200 flex flex-row items-center justify-between bg-gray-50">
              <Text className="text-lg font-bold text-slate-900">Collections History</Text>
              <Pressable onPress={() => setIsCollectionsModalOpen(false)} className="p-1.5 rounded-full bg-slate-200 active:bg-slate-300">
                <X size={20} color="#475569" />
              </Pressable>
            </View>
            <View className="flex-1 bg-slate-50">
              <FlatList
                data={buyerLedgerData.filter(row => row.type === 'payment')}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => <React.Fragment>{renderLedgerRow({item})}</React.Fragment>}
                contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                onEndReached={() => {
                  if (hasNextLedgerPage && !isLedgerRefetching) {
                    fetchNextLedgerPage();
                  }
                }}
                onEndReachedThreshold={0.5}
                ListEmptyComponent={<Text className="text-center text-slate-500 py-8">No collections history found.</Text>}
                ListFooterComponent={isLedgerRefetching ? <Text className="text-center py-4 text-slate-500">Loading...</Text> : null}
              />
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
    </SafeAreaView>
  );
}
