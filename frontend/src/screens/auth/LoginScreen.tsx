import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Eye, EyeOff } from "lucide-react-native";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import CustomAlert from "../../components/CustomAlert";

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error" as "error" | "success" | "info"
  });

  const handleLogin = async () => {
    if (!username || !password) {
      setAlertConfig({
        visible: true,
        title: "Login Failed",
        message: "Please enter both username and password.",
        type: "error"
      });
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
      setAlertConfig({
        visible: true,
        title: "Login Failed",
        message: error.response?.data?.detail || "Invalid credentials or server error.",
        type: "error"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
      className="bg-zinc-50 px-4"
      enableOnAndroid={true}
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-sm bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
        <View className="items-center mb-8">
          <Image 
            source={require('../../../assets/duro-tracker-logo.png')} 
            className="w-32 h-32 mb-4" 
            resizeMode="contain" 
          />
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
              className="bg-zinc-50 text-zinc-900 px-4 py-3.5 rounded-xl border border-zinc-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:bg-white"
              placeholder="Enter your username"
              placeholderTextColor="#a1a1aa"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Username Input"
            />
          </View>

          <View>
            <Text className="text-zinc-700 text-xs mb-1.5 font-bold uppercase tracking-wider pl-1 mt-3">
              Password
            </Text>
            <View className="relative justify-center">
              <TextInput
                className="bg-zinc-50 text-zinc-900 pl-4 pr-12 py-3.5 rounded-xl border border-zinc-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:bg-white"
                placeholder="Enter your password"
                placeholderTextColor="#a1a1aa"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                accessibilityLabel="Password Input"
              />
              <TouchableOpacity 
                className="absolute right-4" 
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {showPassword ? (
                  <EyeOff size={20} color="#a1a1aa" />
                ) : (
                  <Eye size={20} color="#a1a1aa" />
                )}
              </TouchableOpacity>
            </View>
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

      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </KeyboardAwareScrollView>
  );
}
