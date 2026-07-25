import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SuperAdminDashboardStackParamList } from '../../navigation/SuperAdminDashboardStack';
import { 
  useCreateTenantAdmin, 
  useUpdateOrganization, 
  useDeleteOrganization, 
  useOrganizationUsers 
} from '../../hooks/useSuperAdmin';
import { UserPlus, Building2, KeyRound, Save, Trash2, Users, ChevronRight } from 'lucide-react-native';

type Props = NativeStackScreenProps<SuperAdminDashboardStackParamList, 'ManageOrganization'>;

export default function ManageOrganizationScreen({ route, navigation }: Props) {
  const { org } = route.params as any; // Using 'any' if route type isn't fully updated
  
  // Create Admin State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Update Org State
  const [editName, setEditName] = useState(org.name);
  const [editMaxUsers, setEditMaxUsers] = useState(org.max_users?.toString() || '10');
  const [address, setAddress] = useState(org.address || '');
  const [phone, setPhone] = useState(org.phone || '');
  const [salesPrefix, setSalesPrefix] = useState(org.bill_prefix_sales || 'SHA');
  const [collectionPrefix, setCollectionPrefix] = useState(org.bill_prefix_collection || 'PAY');

  const { data: users, isLoading: isLoadingUsers } = useOrganizationUsers(org.id);
  const createAdminMutation = useCreateTenantAdmin();
  const updateOrgMutation = useUpdateOrganization();
  const deleteOrgMutation = useDeleteOrganization();

  useEffect(() => {
    // Sync params if they change
    setEditName(org.name);
    setEditMaxUsers(org.max_users?.toString() || '10');
    setAddress(org.address || '');
    setPhone(org.phone || '');
    setSalesPrefix(org.bill_prefix_sales || 'SHA');
    setCollectionPrefix(org.bill_prefix_collection || 'PAY');
  }, [org]);

  const handleCreateAdmin = () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    createAdminMutation.mutate(
      { orgId: org.id, data: { username, password, role: 'tenant_admin' } },
      {
        onSuccess: () => {
          Alert.alert('Success', `Admin '${username}' successfully created!`);
          setUsername('');
          setPassword('');
        },
        onError: (error: any) => {
          Alert.alert('Error', error.response?.data?.detail || 'Failed to create admin');
        },
      }
    );
  };

  const handleUpdateOrg = () => {
    if (!editName || !editMaxUsers) return;
    updateOrgMutation.mutate(
      { 
        orgId: org.id, 
        data: { 
          name: editName, 
          max_users: parseInt(editMaxUsers, 10),
          address: address.trim() || null,
          phone: phone.trim() || null,
          bill_prefix_sales: salesPrefix.trim() || 'SHA',
          bill_prefix_collection: collectionPrefix.trim() || 'PAY'
        } 
      },
      {
        onSuccess: (updatedOrg: any) => {
          Alert.alert('Success', 'Organization updated successfully');
          navigation.setParams({ org: updatedOrg } as any);
        },
        onError: (error: any) => {
          Alert.alert('Error', error.response?.data?.detail || 'Failed to update organization');
        }
      }
    );
  };

  const handleDeleteOrg = () => {
    Alert.alert(
      'Delete Organization',
      'Are you sure you want to delete this organization? This will destroy all data and user accounts permanently. This action CANNOT be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete Permanently', 
          style: 'destructive',
          onPress: () => {
            deleteOrgMutation.mutate(org.id, {
              onSuccess: () => {
                navigation.goBack();
              },
              onError: (error: any) => {
                Alert.alert('Error', error.response?.data?.detail || 'Failed to delete organization');
              }
            });
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-zinc-50" edges={['bottom', 'left', 'right']}>
      <ScrollView className="flex-1 px-6 py-6">
        
        {/* Header */}
        <View className="flex-row items-center mb-6">
          <View className="w-12 h-12 bg-indigo-100 rounded-full items-center justify-center mr-4">
            <Building2 size={24} color="#4f46e5" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-1">Manage</Text>
            <Text className="text-2xl font-extrabold text-slate-900">{org.name}</Text>
          </View>
        </View>

        {/* Edit Organization Details */}
        <View className="bg-white rounded-3xl p-6 border border-zinc-100 shadow-sm mb-6">
          <Text className="text-lg font-bold text-slate-900 mb-4">Organization Details</Text>
          
          <Text className="text-sm font-semibold text-slate-700 mb-2">Name</Text>
          <TextInput
            className="border border-zinc-200 rounded-xl p-4 text-base text-slate-900 bg-zinc-50 mb-4 focus:border-indigo-500 focus:bg-white"
            value={editName}
            onChangeText={setEditName}
          />

          <Text className="text-sm font-semibold text-slate-700 mb-2">Max Users</Text>
          <TextInput
            className="border border-zinc-200 rounded-xl p-4 text-base text-slate-900 bg-zinc-50 mb-4 focus:border-indigo-500 focus:bg-white"
            value={editMaxUsers}
            onChangeText={setEditMaxUsers}
            keyboardType="number-pad"
          />

          <Text className="text-sm font-semibold text-slate-700 mb-2">Address</Text>
          <TextInput
            className="border border-zinc-200 rounded-xl p-4 text-base text-slate-900 bg-zinc-50 mb-4 focus:border-indigo-500 focus:bg-white"
            value={address}
            onChangeText={setAddress}
            placeholder="Optional"
          />

          <Text className="text-sm font-semibold text-slate-700 mb-2">Mobile Number</Text>
          <TextInput
            className="border border-zinc-200 rounded-xl p-4 text-base text-slate-900 bg-zinc-50 mb-4 focus:border-indigo-500 focus:bg-white"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Optional"
          />

          <View className="flex-row gap-4 mb-6">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-slate-700 mb-2">Sales Prefix</Text>
              <TextInput
                className="border border-zinc-200 rounded-xl p-4 text-base text-slate-900 bg-zinc-50 focus:border-indigo-500 focus:bg-white"
                value={salesPrefix}
                onChangeText={setSalesPrefix}
                placeholder="SHA"
                autoCapitalize="characters"
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-slate-700 mb-2">Collection Prefix</Text>
              <TextInput
                className="border border-zinc-200 rounded-xl p-4 text-base text-slate-900 bg-zinc-50 focus:border-indigo-500 focus:bg-white"
                value={collectionPrefix}
                onChangeText={setCollectionPrefix}
                placeholder="PAY"
                autoCapitalize="characters"
              />
            </View>
          </View>

          <Pressable 
            className={`flex-row justify-center items-center py-4 rounded-xl ${updateOrgMutation.isPending ? 'bg-slate-300' : 'bg-slate-900 active:bg-slate-800'}`}
            onPress={handleUpdateOrg}
            disabled={updateOrgMutation.isPending}
          >
            {updateOrgMutation.isPending ? <ActivityIndicator color="white" /> : (
              <>
                <Save size={20} color="white" />
                <Text className="text-white font-bold text-base ml-2">Save Changes</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Create Tenant Admin */}
        <View className="bg-white rounded-3xl p-6 border border-zinc-100 shadow-sm mb-6">
          <View className="flex-row items-center mb-6 border-b border-zinc-100 pb-4">
            <UserPlus size={20} color="#0f172a" />
            <Text className="text-lg font-bold text-slate-900 ml-3">Add Admin Account</Text>
          </View>

          <Text className="text-sm font-semibold text-slate-700 mb-2">Admin Username</Text>
          <TextInput
            className="border border-zinc-200 rounded-xl p-4 text-base text-slate-900 bg-zinc-50 mb-5 focus:border-indigo-500 focus:bg-white"
            value={username}
            onChangeText={setUsername}
            placeholder="e.g., store_admin1"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
          />

          <Text className="text-sm font-semibold text-slate-700 mb-2">Temporary Password</Text>
          <View className="relative justify-center mb-8">
            <TextInput
              className="border border-zinc-200 rounded-xl p-4 pl-12 text-base text-slate-900 bg-zinc-50 focus:border-indigo-500 focus:bg-white"
              value={password}
              onChangeText={setPassword}
              placeholder="Password123"
              placeholderTextColor="#94a3b8"
              secureTextEntry
            />
            <View className="absolute left-4">
              <KeyRound size={20} color="#94a3b8" />
            </View>
          </View>

          <Pressable 
            className={`flex-row justify-center items-center py-4 rounded-xl ${createAdminMutation.isPending ? 'bg-indigo-300' : 'bg-indigo-600 active:bg-indigo-700'}`}
            onPress={handleCreateAdmin}
            disabled={createAdminMutation.isPending}
          >
            {createAdminMutation.isPending ? <ActivityIndicator color="white" /> : (
              <>
                <UserPlus size={20} color="white" />
                <Text className="text-white font-bold text-base ml-2">Create Admin</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Existing Users List */}
        <View className="bg-white rounded-3xl p-6 border border-zinc-100 shadow-sm mb-6">
          <View className="flex-row items-center mb-4 border-b border-zinc-100 pb-4">
            <Users size={20} color="#0f172a" />
            <Text className="text-lg font-bold text-slate-900 ml-3">Existing Users</Text>
          </View>
          
          {isLoadingUsers ? (
            <ActivityIndicator color="#4f46e5" className="py-4" />
          ) : !users || users.length === 0 ? (
            <Text className="text-slate-500 italic text-center py-4">No users found.</Text>
          ) : (
            users.map(user => (
              <Pressable 
                key={user.id} 
                className="flex-row items-center justify-between py-4 border-b border-zinc-50 active:bg-zinc-50"
                onPress={() => navigation.navigate('ManageUser', {
                  orgId: org.id,
                  userId: user.id,
                  username: user.username,
                  isActive: user.is_active,
                  role: user.role
                })}
              >
                <View>
                  <Text className="font-bold text-slate-900 text-base">{user.username}</Text>
                  <Text className="text-sm text-slate-500 capitalize">{user.role.replace('_', ' ')}</Text>
                </View>
                <View className="flex-row items-center">
                  <View className={`px-2 py-1 rounded-md mr-3 ${user.is_active ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    <Text className={`text-xs font-bold ${user.is_active ? 'text-emerald-700' : 'text-red-700'}`}>
                      {user.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </Text>
                  </View>
                  <ChevronRight size={20} color="#94a3b8" />
                </View>
              </Pressable>
            ))
          )}
        </View>

        {/* Danger Zone */}
        <View className="bg-red-50 rounded-3xl p-6 border border-red-100 mb-12">
          <Text className="text-lg font-bold text-red-900 mb-2">Danger Zone</Text>
          <Text className="text-sm text-red-700 mb-4">
            Deleting this organization will permanently erase all data, entries, buyers, and user accounts associated with it.
          </Text>
          
          <Pressable 
            className={`flex-row justify-center items-center py-4 rounded-xl ${deleteOrgMutation.isPending ? 'bg-red-300' : 'bg-red-600 active:bg-red-700'}`}
            onPress={handleDeleteOrg}
            disabled={deleteOrgMutation.isPending}
          >
            {deleteOrgMutation.isPending ? <ActivityIndicator color="white" /> : (
              <>
                <Trash2 size={20} color="white" />
                <Text className="text-white font-bold text-base ml-2">Delete Organization</Text>
              </>
            )}
          </Pressable>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
