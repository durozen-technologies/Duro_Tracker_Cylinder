import React, { useCallback } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Wallet,
  ArrowDown,
  TrendingUp,
  ArrowUp,
  Truck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react-native";
import {
  useDashboardMetrics,
  useRecentActivity,
} from "../../hooks/useDashboard";
import { formatDistanceToNow } from "date-fns";

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const {
    data: metrics,
    isLoading: isMetricsLoading,
    refetch: refetchMetrics,
    isRefetching: isMetricsRefetching,
  } = useDashboardMetrics();
  const {
    data: activityData = [],
    isLoading: isActivityLoading,
    refetch: refetchActivity,
    isRefetching: isActivityRefetching,
  } = useRecentActivity();

  useFocusEffect(
    useCallback(() => {
      refetchMetrics();
      refetchActivity();
    }, [refetchMetrics, refetchActivity]),
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-gray-50">
      <View className="flex-1 p-4">
      <View className="mb-6 flex flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-slate-900">Dashboard</Text>
        <Pressable
          onPress={() => {
            refetchMetrics();
            refetchActivity();
          }}
          disabled={isMetricsRefetching || isActivityRefetching}
          className="p-2.5 bg-white border border-gray-200 rounded-xl active:bg-slate-50 shadow-sm"
          style={{
            opacity: isMetricsRefetching || isActivityRefetching ? 0.5 : 1,
          }}
        >
          <RefreshCw size={20} color="#475569" />
        </Pressable>
      </View>

      {/* Hero Metrics */}
      {isMetricsLoading ? (
        <View className="mb-6 h-40 items-center justify-center">
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : metrics ? (
        <View className="flex flex-col gap-4 mb-8">
          {/* Outstanding Debt - Warn Amber/Crimson */}
          <View className="bg-rose-50 rounded-[24px] border border-rose-200 p-6 overflow-hidden relative">
            <View
              className="absolute -right-6 -top-6 bg-rose-100 rounded-full w-32 h-32"
              style={{ opacity: 0.5 }}
            />
            <View className="flex flex-row items-center justify-between mb-2">
              <View className="flex flex-row items-center gap-2">
                <AlertTriangle size={20} color="#e11d48" />
                <Text className="font-bold text-sm text-rose-800 uppercase tracking-widest">
                  Outstanding Debts
                </Text>
              </View>
            </View>
            <Text className="text-4xl font-black text-rose-700 tracking-tighter mt-1">
              ₹{(metrics.outstanding_balance || 0).toLocaleString()}
            </Text>
            <Text className="text-xs text-rose-600 font-medium mt-2">
              Total market credit to be recovered
            </Text>
          </View>

          <View className="flex flex-row gap-4">
            {/* Today's Collection - Emerald Green */}
            <View className="flex-1 bg-emerald-50 rounded-[24px] border border-emerald-200 p-5 relative overflow-hidden">
              <View
                className="absolute -right-4 -bottom-4 bg-emerald-100 w-20 h-20 rounded-full"
                style={{ opacity: 0.5 }}
              />
              <View className="flex flex-row items-center gap-2 mb-2">
                <Wallet size={16} color="#059669" />
                <Text className="font-bold text-xs text-emerald-800 uppercase tracking-widest">
                  Collected
                </Text>
              </View>
              <Text className="text-2xl font-black text-emerald-700 tracking-tighter">
                ₹
                {(
                  (metrics.total_cash_collected || 0) +
                  (metrics.total_upi_collected || 0)
                ).toLocaleString()}
              </Text>
              <Text className="text-[10px] text-emerald-600 font-bold mt-1 uppercase">
                Today
              </Text>
            </View>

            {/* Today's Sales - Indigo */}
            <View className="flex-1 bg-indigo-50 rounded-[24px] border border-indigo-200 p-5 relative overflow-hidden">
              <View
                className="absolute -right-4 -top-4 bg-indigo-100 w-20 h-20 rounded-full"
                style={{ opacity: 0.5 }}
              />
              <View className="flex flex-row items-center gap-2 mb-2">
                <TrendingUp size={16} color="#4f46e5" />
                <Text className="font-bold text-xs text-indigo-800 uppercase tracking-widest">
                  Sales
                </Text>
              </View>
              <Text className="text-2xl font-black text-indigo-700 tracking-tighter">
                ₹{(metrics.todays_sales || 0).toLocaleString()}
              </Text>
              <Text className="text-[10px] text-indigo-600 font-bold mt-1 uppercase">
                Today
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Activity Feed */}
      <View className="bg-white rounded-[24px] border border-gray-100 p-5 flex flex-col mb-10">
        <View className="mb-5 flex flex-row items-center justify-between">
          <Text className="text-base font-bold text-slate-900">
            Recent Activity
          </Text>
          <Pressable 
            className="bg-indigo-50 px-3 py-1.5 rounded-full"
            onPress={() => navigation.navigate("Buyers", { screenTab: "bills" })}
          >
            <Text className="text-indigo-600 text-xs font-semibold">
              View All
            </Text>
          </Pressable>
        </View>

        <View className="relative">
          {/* Vertical Timeline Line */}
          <View className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-slate-100" />

          {isActivityLoading ? (
            <ActivityIndicator size="small" color="#4f46e5" className="my-4" />
          ) : !Array.isArray(activityData) || activityData.length === 0 ? (
            <Text className="text-sm text-slate-500 text-center my-4">
              No recent activity
            </Text>
          ) : (
            activityData.slice(0, 4).map((activity) => {
              let formattedTime = "N/A";
              try {
                if (activity?.timestamp) {
                  formattedTime = formatDistanceToNow(
                    new Date(activity.timestamp),
                    { addSuffix: true },
                  );
                }
              } catch (e) {}

              return (
                <View
                  key={activity?.id || Math.random().toString()}
                  className="flex flex-row items-center justify-between mb-5 relative"
                >
                  <View className="flex flex-row items-center gap-4 flex-1 pr-2">
                    <View
                      className="z-10 w-10 h-10 rounded-full flex items-center justify-center border-4 border-white"
                      style={{
                        backgroundColor:
                          activity?.type === "delivery"
                            ? "#e0e7ff"
                            : activity?.type === "collection"
                              ? "#d1fae5"
                              : "#ffe4e6",
                      }}
                    >
                      {activity?.type === "delivery" ? (
                        <Truck size={16} color="#4f46e5" />
                      ) : activity?.type === "collection" ? (
                        <CheckCircle2 size={16} color="#059669" />
                      ) : (
                        <AlertTriangle size={16} color="#e11d48" />
                      )}
                    </View>
                    <View className="flex flex-col flex-1">
                      <Text
                        className="text-sm font-semibold text-slate-800"
                        numberOfLines={1}
                      >
                        {activity?.message || "Activity"}
                      </Text>
                      <Text className="text-[11px] font-medium text-slate-400 mt-0.5">
                        {formattedTime}
                      </Text>
                    </View>
                  </View>
                  {activity?.amount !== undefined && activity.amount > 0 && (
                    <Text
                      className="text-sm font-bold pl-2"
                      style={{
                        color:
                          activity.type === "collection"
                            ? "#059669"
                            : "#334155",
                      }}
                    >
                      {activity.type === "collection" ? "+" : ""}₹
                      {activity.amount.toLocaleString()}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </View>
      </View>
    </View>
    </SafeAreaView>
  );
}
