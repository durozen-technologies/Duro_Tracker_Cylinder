const fs = require("fs");
const path = require("path");

function readEnvFileValue(key) {
  try {
    const envPath = path.join(__dirname, ".env");
    const file = fs.readFileSync(envPath, "utf-8");
    const line = file
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${key}=`));

    if (!line) {
      return "";
    }

    return line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, "");
  } catch {
    return "";
  }
}

const expoPublicApiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  readEnvFileValue("EXPO_PUBLIC_API_URL");
const splashBackgroundColor = "#F7F1E8";
const androidIconForeground = "./assets/images/android-icon-foreground.png";
const androidIconBackground = "./assets/images/android-icon-background.png";
const androidIconMonochrome = "./assets/images/android-icon-monochrome.png";

const config = {
  name: "Duro Tracker",
  slug: "duro-tracker",
  version: "1.0.2",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "durotracker",
  userInterfaceStyle: "light",
  splash: {
    image: "./assets/Logo.png",
    resizeMode: "contain",
    backgroundColor: splashBackgroundColor,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.durozen.durotracker",
  },
  android: {
    versionCode: 3,
    splash: {
      image: "./assets/Logo.png",
      resizeMode: "contain",
      backgroundColor: splashBackgroundColor,
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: [
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.ACCESS_FINE_LOCATION",
    ],
    package: "com.durozen.durotracker",
  },
  web: {},
  plugins: [
    "expo-secure-store",
    "@react-native-community/datetimepicker",
    [
      "expo-splash-screen",
      {
        image: "./assets/Logo.png",
        backgroundColor: splashBackgroundColor,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Allow Duro Tracker to choose item images for catalogue and shop items.",
      },
    ],
  ],
  extra: {
    eas: {
      projectId: "8bd0810a-72de-43b3-a836-8c0d78481136",
    },
  },
};

module.exports = () => ({
  expo: {
    ...config,
    extra: {
      ...config.extra,
      expoPublicApiUrl,
    },
  },
});
