import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Switch,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SuperAdminDashboardStackParamList } from "../../navigation/SuperAdminDashboardStack";
import {
  useUpdateOrganizationUser,
  useDeleteOrganizationUser,
} from "../../hooks/useSuperAdmin";
import { User, KeyRound, Save, Trash2 } from "lucide-react-native";

type Props = NativeStackScreenProps<
  SuperAdminDashboardStackParamList,
  "ManageUser"
>;

export default function ManageUserScreen({ route, navigation }: Props) {
  const {
    orgId,
    userId,
    username,
    isActive: initialIsActive,
    role,
  } = route.params;

  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(initialIsActive);

  const updateUserMutation = useUpdateOrganizationUser();
  const deleteUserMutation = useDeleteOrganizationUser();

  const handleUpdateUser = () => {
    const data: { password?: string; is_active?: boolean } = {
      is_active: isActive,
    };
    if (password) {
      data.password = password;
    }

    updateUserMutation.mutate(
      { orgId, userId, data },
      {
        onSuccess: () => {
          Alert.alert("Success", "User updated successfully");
          navigation.goBack();
        },
        onError: (error: any) => {
          Alert.alert(
            "Error",
            error.response?.data?.detail || "Failed to update user",
          );
        },
      },
    );
  };

  const handleDeleteUser = () => {
    Alert.alert(
      "Delete User",
      "Are you sure you want to permanently delete this user? This action CANNOT be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteUserMutation.mutate(
              { orgId, userId },
              {
                onSuccess: () => {
                  navigation.goBack();
                },
                onError: (error: any) => {
                  Alert.alert(
                    "Error",
                    error.response?.data?.detail || "Failed to delete user",
                  );
                },
              },
            );
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView
      className="flex-1 bg-zinc-50"
      edges={["bottom", "left", "right"]}
    >
      <ScrollView className="flex-1 px-6 py-6">
        {/* Header */}
        <View className="flex-row items-center mb-6">
          <View className="w-12 h-12 bg-indigo-100 rounded-full items-center justify-center mr-4">
            <User size={24} color="#4f46e5" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Manage {role.replace("_", " ")}
            </Text>
            <Text className="text-2xl font-extrabold text-slate-900">
              {username}
            </Text>
          </View>
        </View>

        {/* User Settings */}
        <View className="bg-white rounded-3xl p-6 border border-zinc-100 shadow-sm mb-6">
          <Text className="text-lg font-bold text-slate-900 mb-6">
            User Settings
          </Text>

          {/* Active Toggle */}
          <View className="flex-row justify-between items-center mb-6 border-b border-zinc-100 pb-6">
            <View className="flex-1 mr-4">
              <Text className="text-base font-bold text-slate-900 mb-1">
                Account Status
              </Text>
              <Text className="text-sm text-slate-500">
                {isActive
                  ? "User can log in and use the app."
                  : "User is suspended and cannot log in."}
              </Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: "#e2e8f0", true: "#4f46e5" }}
              thumbColor="#ffffff"
            />
          </View>

          {/* Reset Password */}
          <Text className="text-sm font-semibold text-slate-700 mb-2">
            Reset Password (Optional)
          </Text>
          <View className="relative justify-center mb-8">
            <TextInput
              className="border border-zinc-200 rounded-xl p-4 pl-12 text-base text-slate-900 bg-zinc-50 focus:border-indigo-500 focus:bg-white"
              value={password}
              onChangeText={setPassword}
              placeholder="Leave blank to keep current"
              placeholderTextColor="#94a3b8"
              secureTextEntry
            />
            <View className="absolute left-4">
              <KeyRound size={20} color="#94a3b8" />
            </View>
          </View>

          <Pressable
            className={`flex-row justify-center items-center py-4 rounded-xl ${updateUserMutation.isPending ? "bg-slate-300" : "bg-slate-900 active:bg-slate-800"}`}
            onPress={handleUpdateUser}
            disabled={updateUserMutation.isPending}
          >
            {updateUserMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Save size={20} color="white" />
                <Text className="text-white font-bold text-base ml-2">
                  Save Changes
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Danger Zone */}
        <View className="bg-red-50 rounded-3xl p-6 border border-red-100 mb-12">
          <Text className="text-lg font-bold text-red-900 mb-2">
            Danger Zone
          </Text>
          <Text className="text-sm text-red-700 mb-4">
            Deleting this user is permanent. If this is a driver, ensure they
            have no active deliveries, or prefer suspending them instead.
          </Text>

          <Pressable
            className={`flex-row justify-center items-center py-4 rounded-xl ${deleteUserMutation.isPending ? "bg-red-300" : "bg-red-600 active:bg-red-700"}`}
            onPress={handleDeleteUser}
            disabled={deleteUserMutation.isPending}
          >
            {deleteUserMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Trash2 size={20} color="white" />
                <Text className="text-white font-bold text-base ml-2">
                  Delete User
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
