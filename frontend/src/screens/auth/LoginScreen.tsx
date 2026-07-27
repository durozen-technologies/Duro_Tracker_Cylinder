import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert("Error", "Please enter both username and password.");
      return;
    }

    setIsLoading(true);
    try {
      // Create x-www-form-urlencoded data for OAuth2
      const params = new URLSearchParams();
      params.append("username", username);
      params.append("password", password);

      const response = await api.post(`/auth/login`, params.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const { access_token } = response.data;
      await login(access_token);
    } catch (error: any) {
      console.error("Login error", error);
      Alert.alert(
        "Login Failed",
        error.response?.data?.detail || "Invalid credentials or server error.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-zinc-50 justify-center items-center px-4"
    >
      <View className="w-full max-w-sm bg-white p-8 rounded-[32px] shadow-sm border border-zinc-100">
        <View className="items-center mb-8">
          <View className="w-16 h-16 bg-blue-50 rounded-2xl items-center justify-center mb-4 border border-blue-100">
            <Text className="text-blue-600 text-2xl font-bold">DT</Text>
          </View>
          <Text className="text-3xl font-bold text-zinc-900 mb-2 tracking-tight">
            Duro Tracker
          </Text>
          <Text className="text-zinc-500 text-sm font-medium">
            Sign in to continue
          </Text>
        </View>

        <View className="space-y-4">
          <View>
            <Text className="text-zinc-700 text-xs mb-1.5 font-bold uppercase tracking-wider pl-1">
              Username
            </Text>
            <TextInput
              className="bg-zinc-50 text-zinc-900 px-4 py-3.5 rounded-xl border border-zinc-200 focus:border-blue-500 focus:bg-white"
              placeholder="Enter your username"
              placeholderTextColor="#a1a1aa"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View>
            <Text className="text-zinc-700 text-xs mb-1.5 font-bold uppercase tracking-wider pl-1 mt-3">
              Password
            </Text>
            <TextInput
              className="bg-zinc-50 text-zinc-900 px-4 py-3.5 rounded-xl border border-zinc-200 focus:border-blue-500 focus:bg-white"
              placeholder="Enter your password"
              placeholderTextColor="#a1a1aa"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
        </View>

        <TouchableOpacity
          className="w-full py-4 rounded-xl items-center mt-8 active:opacity-80"
          style={{
            backgroundColor: isLoading ? "rgba(37, 99, 235, 0.5)" : "#2563eb",
          }}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-base tracking-wide">
              Sign In
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
