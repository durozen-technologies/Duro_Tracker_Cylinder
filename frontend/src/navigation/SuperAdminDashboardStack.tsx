import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SuperAdminDashboard from '../screens/superadmin/SuperAdminDashboard';
import ManageOrganizationScreen from '../screens/superadmin/ManageOrganizationScreen';
import ManageUserScreen from '../screens/superadmin/ManageUserScreen';

import { Organization } from '../types/api';

export type SuperAdminDashboardStackParamList = {
  DashboardHome: undefined;
  ManageOrganization: { org: Organization };
  ManageUser: { orgId: string; userId: string; username: string; isActive: boolean; role: string };
};

const Stack = createNativeStackNavigator<SuperAdminDashboardStackParamList>();

export default function SuperAdminDashboardStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DashboardHome" component={SuperAdminDashboard} />
      <Stack.Screen 
        name="ManageOrganization" 
        component={ManageOrganizationScreen} 
        options={{
          headerShown: true,
          title: 'Manage Organization',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen 
        name="ManageUser" 
        component={ManageUserScreen} 
        options={{
          headerShown: true,
          title: 'Manage User',
          headerBackTitle: 'Back',
        }}
      />
    </Stack.Navigator>
  );
}
