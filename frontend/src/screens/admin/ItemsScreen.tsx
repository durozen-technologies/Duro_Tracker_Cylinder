import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, Pressable, FlatList, Modal, TextInput, ActivityIndicator, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Edit2, X, PackageOpen, CheckCircle, PauseCircle, Trash2, RefreshCw } from 'lucide-react-native';
import { useItems, useToggleItem, useCreateItem, useUpdateItem, useDeleteItem } from '../../hooks/useItems';
import type { Item } from '../../types/api';

export default function ItemsScreen() {
  const { data: items = [], isLoading, refetch: refetchItems, isRefetching: isItemsRefetching } = useItems();
  
  useFocusEffect(
    useCallback(() => {
      refetchItems();
    }, [refetchItems])
  );

  const toggleMutation = useToggleItem();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();

  // Add State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [newFull, setNewFull] = useState('');
  const [newEmpty, setNewEmpty] = useState('');
  const [newHsnCode, setNewHsnCode] = useState('');
  const [newGstPercent, setNewGstPercent] = useState('');

  // Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCapacity, setEditCapacity] = useState('');
  const [editHsnCode, setEditHsnCode] = useState('');
  const [editGstPercent, setEditGstPercent] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    createItem.mutate({
      name: newName.trim(),

      price: 0,
      capacity_kg: parseFloat(newCapacity) || 0,
      hsn_code: newHsnCode.trim() || undefined,
      gst_percent: newGstPercent ? parseFloat(newGstPercent) : undefined,
      initial_full: parseInt(newFull) || 0,
      initial_empty: parseInt(newEmpty) || 0,
      is_active: true
    }, {
      onSuccess: () => {
        setIsModalOpen(false);
        setNewName('');
        setNewCapacity('');
        setNewFull('');
        setNewEmpty('');
        setNewHsnCode('');
        setNewGstPercent('');
      }
    });
  };

  const openEditModal = (item: Item) => {
    setEditId(item.id);
    setEditName(item.name);
    setEditCapacity(item.capacity_kg ? item.capacity_kg.toString() : '');
    setEditHsnCode(item.hsn_code || '');
    setEditGstPercent(item.gst_percent ? item.gst_percent.toString() : '');
    setIsEditModalOpen(true);
  };

  const handleEdit = () => {
    if (!editId || !editName.trim()) return;
    updateItem.mutate({
      id: editId,
      data: {
        name: editName.trim(),

        price: 0,
        capacity_kg: parseFloat(editCapacity) || 0,
        hsn_code: editHsnCode.trim() || undefined,
        gst_percent: editGstPercent ? parseFloat(editGstPercent) : undefined,
      }
    }, {
      onSuccess: () => {
        setIsEditModalOpen(false);
      }
    });
  };

  const handleDelete = () => {
    if (!editId) return;
    deleteItem.mutate(editId, {
      onSuccess: () => {
        setIsEditModalOpen(false);
      }
    });
  };

  const toggleItem = (item: Item) => {
    toggleMutation.mutate({ id: item.id, isActive: !item.is_active });
  };

  const renderItemCard = ({ item }: { item: Item }) => {
    return (
      <View className="bg-white rounded-[24px] p-3 border border-slate-100 mb-4 shadow-sm">
        <View className="flex flex-row gap-3">
          {/* Details */}
          <View className="flex-1 flex flex-col gap-2.5">
            {/* Header Row */}
            <View className="flex flex-row items-start justify-between gap-2">
              <View className="flex-1 flex flex-col gap-0.5">
                <Text className="text-slate-900 font-bold text-sm" numberOfLines={1}>{item.name}</Text>
                <View className="flex flex-row gap-2 items-center mt-1">
                  {item.capacity_kg ? <Text className="text-slate-500 text-[11px] font-medium">{item.capacity_kg} kg</Text> : null}
                  {item.hsn_code ? <Text className="text-slate-400 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-md">HSN: {item.hsn_code}</Text> : null}
                  {item.gst_percent ? <Text className="text-slate-400 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-md">GST: {item.gst_percent}%</Text> : null}
                </View>
              </View>
            </View>

            {/* Chips Row */}
            <View className="flex flex-row flex-wrap gap-2">
              <View className="bg-indigo-50 border border-indigo-100 rounded-full px-2 py-1 flex flex-row items-center gap-1">
                <Text className="text-indigo-700 text-[11px] font-bold">Total: {item.current_full + item.current_empty}</Text>
              </View>
              <View className="bg-amber-50 border border-amber-100 rounded-full px-2 py-1 flex flex-row items-center gap-1">
                <Text className="text-amber-700 text-[11px] font-bold">{item.current_full} Full</Text>
              </View>
              <View className="bg-slate-50 border border-slate-200 rounded-full px-2 py-1 flex flex-row items-center gap-1">
                <Text className="text-slate-600 text-[11px] font-bold">{item.current_empty} Empty</Text>
              </View>
            </View>

            {/* Actions Row */}
            <View className="flex flex-row gap-2 mt-1">
              <Pressable 
                onPress={() => openEditModal(item)}
                className="px-4 py-3 bg-rose-50 border border-rose-100 rounded-xl flex-1 items-center justify-center flex flex-row gap-1 active:bg-slate-100"
              >
                <Edit2 size={14} color="#475569" />
                <Text className="text-slate-700 text-xs font-bold">Edit</Text>
              </Pressable>
              <Pressable 
                onPress={() => toggleItem(item)}
                className="flex-1 border rounded-xl py-2 items-center justify-center flex flex-row gap-1 active:opacity-80"
                style={item.is_active ? { backgroundColor: '#ffffff', borderColor: '#e2e8f0' } : { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }}
              >
                {item.is_active ? <PauseCircle size={14} color="#475569" /> : <CheckCircle size={14} color="#10b981" />}
                <Text className="text-xs font-bold" style={{ color: item.is_active ? '#334155' : '#047857' }}>
                  {item.is_active ? 'Pause' : 'Activate'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-gray-50">
    <View className="flex-1 p-4">
      {/* Header */}
      <View className="flex flex-row justify-between items-start mb-6">
        <View className="flex-1 mr-4">
          <Text className="text-2xl font-semibold text-slate-900">Manage Cylinder Variants</Text>
          <Text className="text-slate-500 text-sm mt-1">Configure your product catalog and initial inventory counts.</Text>
        </View>
        <Pressable 
          onPress={() => refetchItems()}
          disabled={isItemsRefetching}
          className="px-4 py-3 bg-white border border-slate-200 rounded-xl active:bg-slate-50 shadow-sm"
          style={{ opacity: isItemsRefetching ? 0.5 : 1 }}
        >
          <RefreshCw size={20} color="#475569" />
        </Pressable>
      </View>

      {/* Main List */}
      <View className="flex-1">
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#4f46e5" />
          </View>
        ) : items.length === 0 ? (
          <View className="flex-1 items-center justify-center p-12 bg-white rounded-2xl border border-gray-200">
            <View className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <PackageOpen size={32} color="#94a3b8" />
            </View>
            <Text className="text-lg font-medium text-slate-900">No items found</Text>
            <Text className="text-slate-500 text-sm mt-1 text-center max-w-xs">You haven&apos;t added any cylinder variants yet. Click the button above to get started.</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            renderItem={renderItemCard}
            keyExtractor={item => item.id.toString()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
          />
        )}
      </View>

      {/* Floating Action Button */}
      <Pressable 
        onPress={() => setIsModalOpen(true)}
        className="absolute bottom-6 right-6 w-14 h-14 bg-indigo-600 rounded-full items-center justify-center shadow-lg active:bg-indigo-700"
      >
        <Plus size={24} color="#ffffff" />
      </Pressable>

      {/* Add Item Modal */}
      <Modal animationType="fade" transparent={true} visible={isModalOpen} onRequestClose={() => setIsModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
          <View className="bg-white rounded-[24px] shadow-xl w-full max-w-md overflow-hidden">
            <View className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200">
              <Text className="text-lg font-bold text-slate-900">Add Cylinder Variant</Text>
              <Pressable onPress={() => setIsModalOpen(false)} className="p-1.5 rounded-full bg-slate-100">
                <X size={18} color="#64748b" />
              </Pressable>
            </View>
            
            <View className="p-6 flex flex-col gap-4">
              <View className="flex flex-row gap-3">
                <View className="flex-[2]">
                  <Text className="text-sm font-bold text-slate-700 mb-1">Item Name</Text>
                  <TextInput 
                    placeholder="e.g. 19kg Commercial"
                    value={newName}
                    onChangeText={setNewName}
                    className="w-full rounded-xl border-slate-200 border bg-slate-50 px-4 py-3 text-sm text-slate-900"
                  />
                </View>
                <View className="flex-[1]">
                  <Text className="text-sm font-bold text-slate-700 mb-1">Capacity (kg)</Text>
                  <TextInput 
                    placeholder="19"
                    keyboardType="numeric"
                    value={newCapacity}
                    onChangeText={setNewCapacity}
                    className="w-full rounded-xl border-slate-200 border bg-slate-50 px-4 py-3 text-sm text-slate-900 font-mono"
                  />
                </View>
              </View>

              <View className="flex flex-row gap-3 mt-2">
                <View className="flex-1">
                  <Text className="text-sm font-bold text-slate-700 mb-1">HSN Code</Text>
                  <TextInput 
                    placeholder="271119"
                    keyboardType="numeric"
                    value={newHsnCode}
                    onChangeText={setNewHsnCode}
                    className="w-full rounded-xl border-slate-200 border bg-slate-50 px-4 py-3 text-sm text-slate-900 font-mono"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-slate-700 mb-1">GST (%)</Text>
                  <TextInput 
                    placeholder="18"
                    keyboardType="numeric"
                    value={newGstPercent}
                    onChangeText={setNewGstPercent}
                    className="w-full rounded-xl border-slate-200 border bg-slate-50 px-4 py-3 text-sm text-slate-900 font-mono"
                  />
                </View>
              </View>

              <View className="bg-amber-50 p-4 rounded-xl border border-amber-100 mt-2">
                <Text className="text-sm font-bold text-amber-900 mb-3">Initial Stock Entry</Text>
                <View className="flex flex-row gap-3">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-amber-800 mb-1">Full Cylinders</Text>
                    <TextInput 
                      placeholder="0"
                      keyboardType="numeric"
                      value={newFull}
                      onChangeText={setNewFull}
                      className="w-full rounded-xl border-amber-200 border bg-white px-4 py-3 text-sm text-slate-900 font-mono"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-amber-800 mb-1">Empty Cylinders</Text>
                    <TextInput 
                      placeholder="0"
                      keyboardType="numeric"
                      value={newEmpty}
                      onChangeText={setNewEmpty}
                      className="w-full rounded-xl border-amber-200 border bg-white px-4 py-3 text-sm text-slate-900 font-mono"
                    />
                  </View>
                </View>
              </View>

              <Pressable 
                onPress={handleCreate}
                disabled={createItem.isPending}
                className="w-full rounded-xl py-3.5 items-center justify-center mt-3"
                style={{ backgroundColor: createItem.isPending ? '#818cf8' : '#4f46e5' }}
              >
                <Text className="text-white font-bold text-sm">
                  {createItem.isPending ? 'Saving...' : 'Save Item'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Item Modal */}
      <Modal animationType="fade" transparent={true} visible={isEditModalOpen} onRequestClose={() => setIsEditModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
          <View className="bg-white rounded-[24px] shadow-xl w-full max-w-md overflow-hidden">
            <View className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200">
              <Text className="text-lg font-bold text-slate-900">Edit Cylinder Variant</Text>
              <Pressable onPress={() => setIsEditModalOpen(false)} className="p-1.5 rounded-full bg-slate-100">
                <X size={18} color="#64748b" />
              </Pressable>
            </View>
            
            <View className="p-6 flex flex-col gap-4">
              <View className="flex flex-row gap-3">
                <View className="flex-[2]">
                  <Text className="text-sm font-bold text-slate-700 mb-1">Item Name</Text>
                  <TextInput 
                    placeholder="e.g. 19kg Commercial"
                    value={editName}
                    onChangeText={setEditName}
                    className="w-full rounded-xl border-slate-200 border bg-slate-50 px-4 py-3 text-sm text-slate-900"
                  />
                </View>
                <View className="flex-[1]">
                  <Text className="text-sm font-bold text-slate-700 mb-1">Capacity (kg)</Text>
                  <TextInput 
                    placeholder="19"
                    keyboardType="numeric"
                    value={editCapacity}
                    onChangeText={setEditCapacity}
                    className="w-full rounded-xl border-slate-200 border bg-slate-50 px-4 py-3 text-sm text-slate-900 font-mono"
                  />
                </View>
              </View>

              <View className="flex flex-row gap-3 mt-2">
                <View className="flex-1">
                  <Text className="text-sm font-bold text-slate-700 mb-1">HSN Code</Text>
                  <TextInput 
                    placeholder="271119"
                    keyboardType="numeric"
                    value={editHsnCode}
                    onChangeText={setEditHsnCode}
                    className="w-full rounded-xl border-slate-200 border bg-slate-50 px-4 py-3 text-sm text-slate-900 font-mono"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-slate-700 mb-1">GST (%)</Text>
                  <TextInput 
                    placeholder="18"
                    keyboardType="numeric"
                    value={editGstPercent}
                    onChangeText={setEditGstPercent}
                    className="w-full rounded-xl border-slate-200 border bg-slate-50 px-4 py-3 text-sm text-slate-900 font-mono"
                  />
                </View>
              </View>

              <View className="flex flex-row justify-between mt-3 gap-3">
                <Pressable 
                  onPress={handleDelete}
                  disabled={deleteItem.isPending}
                  className="rounded-xl px-4 py-3.5 bg-rose-50 items-center justify-center border border-rose-100 flex-1"
                >
                  <Text className="text-rose-600 font-bold text-sm flex flex-row items-center gap-2">
                    <Trash2 size={16} color="#e11d48" /> Delete
                  </Text>
                </Pressable>
                
                <Pressable 
                  onPress={handleEdit}
                  disabled={updateItem.isPending}
                  className="rounded-xl py-3.5 items-center justify-center flex-[2]"
                  style={{ backgroundColor: updateItem.isPending ? '#818cf8' : '#4f46e5' }}
                >
                  <Text className="text-white font-bold text-sm">
                    {updateItem.isPending ? 'Updating...' : 'Update Item'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
    </SafeAreaView>
  );
}
