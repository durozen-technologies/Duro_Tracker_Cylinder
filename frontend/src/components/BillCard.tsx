import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

export function BillCard({ item, handlePrint, handleSharePDF, itemsCatalog }: { item: any; handlePrint: (item: any) => Promise<void> | void; handleSharePDF?: (item: any) => void; itemsCatalog?: any[] }) {
  const [isPrinting, setIsPrinting] = useState(false);

  const onPrintPress = async () => {
    setIsPrinting(true);
    try {
      await handlePrint(item);
    } finally {
      setIsPrinting(false);
    }
  };

  if (!item) return null;
  const isCollectionBill = !item.items || item.items.length === 0;
  const currentBalance = item.buyer?.balance_pending || 0;
  const cashCollected = item.cash_collected || 0;
  const upiCollected = item.upi_collected || 0;
  const totalBillAmount = item.total_bill_amount || 0;

  const openingBalance = item.opening_balance != null ? item.opening_balance : (currentBalance - totalBillAmount + cashCollected + upiCollected);
  const closingBalance = item.closing_balance != null ? item.closing_balance : currentBalance;

  const receiptNumber = item.bill_number || (item.id ? String(item.id).split('-')[0].toUpperCase() : '-');
  const currentBillBal = totalBillAmount - cashCollected - upiCollected;

  return (
    <View className="bg-white p-4 rounded-2xl mb-4 shadow-sm border border-zinc-200">
      {/* Header */}
      <View className="flex-row justify-between items-start mb-4 border-b border-zinc-100 pb-3">
        <View className="flex-1">
          <Text className="text-zinc-500 text-xs font-semibold mb-1 uppercase tracking-wider">Bill No: {receiptNumber}</Text>
          <Text className="text-xl font-bold text-zinc-900">
            {item.buyer?.name || item.adhoc_buyer_name || 'Unknown Buyer'}
          </Text>
          <Text className="text-zinc-500 text-sm mt-0.5">
            {item.timestamp ? format(new Date(item.timestamp), 'dd MMM yyyy, hh:mm a') : 'Unknown Date'}
          </Text>
          {item.buyer?.address ? (
            <Text className="text-zinc-400 text-xs mt-1">{item.buyer.address}</Text>
          ) : null}
        </View>
        <View className="flex-row gap-2">
          {handleSharePDF && (
            <TouchableOpacity onPress={() => handleSharePDF(item)} className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-100 active:bg-indigo-100">
              <Ionicons name="share-social" size={20} color="#4f46e5" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onPrintPress} disabled={isPrinting} className={`p-2.5 bg-blue-50 rounded-xl border border-blue-100 ${isPrinting ? 'opacity-50' : 'active:bg-blue-100'}`}>
            {isPrinting ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Ionicons name="print" size={20} color="#2563eb" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Opening Balance - Sales Only */}
      {!isCollectionBill && (
        <View className="flex-row justify-between items-center mb-4 px-1">
          <Text className="text-zinc-500 text-sm font-medium">Opening Balance</Text>
          <Text className="text-zinc-800 text-sm font-bold">₹{openingBalance.toFixed(2)}</Text>
        </View>
      )}

      {/* Items Table - Only for Sales */}
      {!isCollectionBill && (
        <View className="mb-4 bg-zinc-50 rounded-xl overflow-hidden border border-zinc-100">
          <View className="flex-row border-b border-zinc-200 px-3 py-2 bg-zinc-100/50">
            <Text className="flex-1 text-zinc-500 text-xs font-bold uppercase tracking-wider">Item</Text>
            <Text className="w-12 text-center text-zinc-500 text-xs font-bold uppercase tracking-wider">Qty</Text>
            <Text className="w-16 text-center text-zinc-500 text-xs font-bold uppercase tracking-wider">Rate</Text>
            <Text className="w-20 text-right text-zinc-500 text-xs font-bold uppercase tracking-wider">Total</Text>
          </View>
          {item.items && item.items.length > 0 ? (
            item.items.map((i: any, idx: number) => (
              <View key={idx} className="flex-row px-3 py-2.5 border-b border-zinc-100 last:border-0 items-center">
                <View className="flex-1 pr-2">
                  <Text className="text-zinc-800 font-medium text-sm">{i.item?.name || 'Unknown'}</Text>
                  {i.empty_received > 0 && (
                    <Text className="text-orange-500 text-xs mt-0.5">{i.empty_received} Empty Returned</Text>
                  )}
                </View>
                <Text className="w-12 text-center text-zinc-800 font-semibold">{i.full_delivered}</Text>
                <Text className="w-16 text-center text-zinc-600 text-xs font-medium">₹{i.unit_price_at_delivery}</Text>
                <Text className="w-20 text-right text-zinc-800 font-bold">₹{i.line_total_amount}</Text>
              </View>
            ))
          ) : (
            <View className="px-3 py-4 items-center">
               <Text className="text-zinc-400 text-sm font-medium">No items in this bill</Text>
            </View>
          )}
        </View>
      )}

      {/* Summary Section - Sales */}
      {!isCollectionBill && (
        <View className="mb-4 px-1">
          <View className="flex-row justify-between items-center py-1.5">
            <Text className="text-zinc-600 font-medium">Total Bill Amount</Text>
            <Text className="text-zinc-900 font-bold text-base">₹{totalBillAmount.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between items-center py-1.5">
            <Text className="text-emerald-600 font-medium">Cash Paid</Text>
            <Text className="text-emerald-600 font-semibold">- ₹{cashCollected.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between items-center py-1.5">
            <Text className="text-blue-600 font-medium">UPI Paid</Text>
            <Text className="text-blue-600 font-semibold">- ₹{upiCollected.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between items-center pt-3 pb-1 border-t border-zinc-100 mt-1.5">
            <Text className="text-zinc-800 font-semibold">Balance Amount</Text>
            <Text className="text-zinc-900 font-bold text-base">₹{currentBillBal.toFixed(2)}</Text>
          </View>
        </View>
      )}

      {/* Payment Table - Collections */}
      {isCollectionBill && (
        <View className="mb-4 bg-white rounded-xl overflow-hidden border border-zinc-200 shadow-sm">
          <View className="flex-row border-b border-zinc-200 px-3 py-2.5 bg-zinc-50">
            <Text className="flex-1 text-zinc-500 text-xs font-bold uppercase tracking-wider">Account Summary</Text>
            <Text className="w-24 text-right text-zinc-500 text-xs font-bold uppercase tracking-wider">Amount</Text>
          </View>
          
          <View className="flex-row px-3 py-3 border-b border-zinc-100 items-center">
            <View className="flex-1 flex-row items-center">
                <Ionicons name="wallet-outline" size={18} color="#64748b" />
                <Text className="text-zinc-700 font-semibold text-sm ml-2">Opening Balance</Text>
            </View>
            <Text className="w-24 text-right text-zinc-700 font-bold text-sm">₹{openingBalance.toFixed(2)}</Text>
          </View>

          {cashCollected > 0 && (
            <View className="flex-row px-3 py-3 border-b border-zinc-100 items-center">
              <View className="flex-1 flex-row items-center">
                  <Ionicons name="cash" size={18} color="#10b981" />
                  <Text className="text-zinc-800 font-semibold text-sm ml-2">Cash Received</Text>
              </View>
              <Text className="w-24 text-right text-emerald-600 font-bold text-sm">- ₹{cashCollected.toFixed(2)}</Text>
            </View>
          )}

          {upiCollected > 0 && (
            <View className="flex-row px-3 py-3 border-b border-zinc-100 items-center">
              <View className="flex-1 flex-row items-center">
                  <Ionicons name="phone-portrait" size={18} color="#3b82f6" />
                  <Text className="text-zinc-800 font-semibold text-sm ml-2">UPI Received</Text>
              </View>
              <Text className="w-24 text-right text-blue-600 font-bold text-sm">- ₹{upiCollected.toFixed(2)}</Text>
            </View>
          )}

          <View className="flex-row px-3 py-2.5 items-center bg-zinc-50 border-t border-zinc-100 border-b border-zinc-200">
            <Text className="flex-1 text-zinc-600 font-bold text-xs uppercase tracking-wider">Total Payment</Text>
            <Text className="w-32 text-right text-zinc-800 font-bold text-sm tracking-tight">- ₹{(cashCollected + upiCollected).toFixed(2)}</Text>
          </View>
          
          <View className="flex-row px-3 py-3.5 items-center bg-zinc-100">
            <Text className="flex-1 text-zinc-800 font-bold text-sm uppercase tracking-wider">Closing Balance</Text>
            <Text className="w-32 text-right text-zinc-900 font-black text-lg tracking-tight">₹{closingBalance.toFixed(2)}</Text>
          </View>
        </View>
      )}

      {/* Closing Balance - Sales Only */}
      {!isCollectionBill && (
        <View className="flex-row justify-between items-center p-3 bg-zinc-800 rounded-xl mb-4 shadow-sm">
          <Text className="text-zinc-100 font-semibold">Closing Balance</Text>
          <Text className="text-white font-bold text-lg tracking-tight">₹{closingBalance.toFixed(2)}</Text>
        </View>
      )}

      {/* Cylinders Holding */}
      {item.items && item.items.filter((bi: any) => bi.buyer_holding_snapshot != null).length > 0 && (
        <View className="border border-zinc-200 rounded-xl overflow-hidden">
          <View className="bg-zinc-50 px-3 py-2 border-b border-zinc-200">
            <Text className="text-zinc-600 font-bold text-xs uppercase tracking-wider text-center">
              Cylinders Holding
            </Text>
          </View>
          <View className="p-3 gap-2 bg-white">
            {item.items
              .filter((bi: any) => bi.buyer_holding_snapshot != null)
              .map((bi: any, idx: number) => {
                const itemName = bi.item?.name || itemsCatalog?.find((i: any) => i.id === bi.item_id)?.name || 'Cyl';
                const given = bi.full_delivered || 0;
                const taken = bi.empty_received || 0;
                const hold = bi.buyer_holding_snapshot;
                
                return (
                  <View key={idx} className="bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg flex-row justify-center items-center shadow-sm">
                    <Text className="text-orange-900 font-semibold text-xs text-center">
                      {itemName} - Given: {given}  Taken: {taken}  Hold: {hold}
                    </Text>
                  </View>
                );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
