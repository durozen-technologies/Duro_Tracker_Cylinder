import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  LogOut,
  Building2,
  Users,
  Plus,
  ChevronRight,
  X,
} from "lucide-react-native";
import { useAuth } from "../../context/AuthContext";
import {
  useOrganizations,
  useCreateOrganization,
  useSuperAdminStats,
} from "../../hooks/useSuperAdmin";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SuperAdminDashboardStackParamList } from "../../navigation/SuperAdminDashboardStack";

type Props = NativeStackScreenProps<
  SuperAdminDashboardStackParamList,
  "DashboardHome"
>;

export default function SuperAdminDashboard({ navigation }: Props) {
  const { logout } = useAuth();
  const { data: organizations, isLoading, error } = useOrganizations();
  const { data: stats } = useSuperAdminStats();
  const createOrgMutation = useCreateOrganization();

  const [modalVisible, setModalVisible] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [maxUsers, setMaxUsers] = useState("10");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [salesPrefix, setSalesPrefix] = useState("SHA");
  const [collectionPrefix, setCollectionPrefix] = useState("PAY");

  const handleCreateOrg = () => {
    if (!newOrgName.trim()) {
      Alert.alert("Error", "Organization name is required");
      return;
    }
    const maxUsersInt = parseInt(maxUsers, 10);
    if (isNaN(maxUsersInt) || maxUsersInt < 1) {
      Alert.alert("Error", "Max users must be a valid positive number");
      return;
    }

    createOrgMutation.mutate(
      {
        name: newOrgName.trim(),
        max_users: maxUsersInt,
        address: address.trim() || null,
        phone: phone.trim() || null,
        bill_prefix_sales: salesPrefix.trim() || "SHA",
        bill_prefix_collection: collectionPrefix.trim() || "PAY",
      },
      {
        onSuccess: () => {
          setModalVisible(false);
          setNewOrgName("");
          setMaxUsers("10");
          setAddress("");
          setPhone("");
          setSalesPrefix("SHA");
          setCollectionPrefix("PAY");
        },
        onError: (err: any) => {
          Alert.alert(
            "Error",
            err.response?.data?.detail || "Failed to create organization",
          );
        },
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-zinc-50" edges={["top"]}>
      <View className="px-6 pt-6 pb-4 bg-white border-b border-zinc-100 flex-row justify-between items-center">
        <View>
          <Text className="text-[28px] font-extrabold text-slate-900 tracking-tight">
            Platform
          </Text>
          <Text className="text-[15px] font-medium text-slate-500 mt-1">
            Super Admin Controls
          </Text>
        </View>
        <Pressable
          onPress={logout}
          className="w-12 h-12 bg-rose-50 rounded-full items-center justify-center active:bg-rose-100"
        >
          <LogOut size={20} color="#e11d48" />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-6 pt-6">
        <Text className="text-lg font-bold text-slate-900 mb-4">
          Quick Stats
        </Text>
        <View className="flex-row gap-4 mb-8">
          <View className="flex-1 bg-white p-5 rounded-2xl border border-zinc-100">
            <View className="w-10 h-10 rounded-full bg-blue-50 items-center justify-center mb-3">
              <Building2 size={20} color="#3b82f6" />
            </View>
            <Text className="text-3xl font-black text-slate-900">
              {organizations ? organizations.length : 0}
            </Text>
            <Text className="text-sm font-medium text-slate-500 mt-1">
              Active Tenants
            </Text>
          </View>
          <View className="flex-1 bg-white p-5 rounded-2xl border border-zinc-100">
            <View className="w-10 h-10 rounded-full bg-emerald-50 items-center justify-center mb-3">
              <Users size={20} color="#10b981" />
            </View>
            <Text className="text-3xl font-black text-slate-900">
              {stats ? stats.total_users : "-"}
            </Text>
            <Text className="text-sm font-medium text-slate-500 mt-1">
              Total Users
            </Text>
          </View>
        </View>

        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-lg font-bold text-slate-900">
            Organizations
          </Text>
          <Pressable
            className="flex-row items-center bg-blue-50 px-3 py-1.5 rounded-full"
            onPress={() => setModalVisible(true)}
          >
            <Plus size={16} color="#3b82f6" />
            <Text className="text-blue-600 font-semibold ml-1">New</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#3b82f6" className="mt-8" />
        ) : error ? (
          <Text className="text-red-500">Failed to load organizations</Text>
        ) : (
          <View className="bg-white rounded-2xl border border-zinc-100 overflow-hidden mb-8">
            {organizations?.length === 0 ? (
              <View className="p-8 items-center">
                <Text className="text-slate-500">No organizations found.</Text>
              </View>
            ) : (
              organizations?.map((org, index) => (
                <Pressable
                  key={org.id}
                  className="p-5 flex-row items-center active:bg-slate-50"
                  style={
                    index !== organizations.length - 1
                      ? { borderBottomWidth: 1, borderBottomColor: "#f8fafc" }
                      : undefined
                  }
                  onPress={() =>
                    navigation.navigate("ManageOrganization", { org: org })
                  }
                >
                  <View className="w-12 h-12 bg-indigo-50 rounded-xl items-center justify-center mr-4">
                    <Building2 size={24} color="#6366f1" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-bold text-slate-900">
                      {org.name}
                    </Text>
                    <Text className="text-sm text-slate-500 mt-0.5">
                      Max Users: {org.max_users}
                    </Text>
                  </View>
                  <ChevronRight size={20} color="#cbd5e1" />
                </Pressable>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Organization</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <X size={24} color="#64748b" />
              </Pressable>
            </View>

            <Text style={styles.label}>Organization Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., ABC Gas Agency"
              value={newOrgName}
              onChangeText={setNewOrgName}
            />

            <Text style={styles.label}>User Limit (Max Drivers/Users)</Text>
            <TextInput
              style={styles.input}
              placeholder="10"
              keyboardType="number-pad"
              value={maxUsers}
              onChangeText={setMaxUsers}
            />

            <Text style={styles.label}>Address (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 123 Main St"
              value={address}
              onChangeText={setAddress}
            />

            <Text style={styles.label}>Mobile Number (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 9876543210"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Sales Bill Prefix</Text>
                <TextInput
                  style={styles.input}
                  placeholder="SHA"
                  value={salesPrefix}
                  onChangeText={setSalesPrefix}
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Collection Prefix</Text>
                <TextInput
                  style={styles.input}
                  placeholder="PAY"
                  value={collectionPrefix}
                  onChangeText={setCollectionPrefix}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            <Pressable
              style={[
                styles.createBtn,
                createOrgMutation.isPending && styles.createBtnDisabled,
              ]}
              onPress={handleCreateOrg}
              disabled={createOrgMutation.isPending}
            >
              {createOrgMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.createBtnText}>Create Organization</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0f172a",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    color: "#0f172a",
  },
  createBtn: {
    backgroundColor: "#3b82f6",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  createBtnDisabled: {
    backgroundColor: "#93c5fd",
  },
  createBtnText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});
