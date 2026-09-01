import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.prompt2spot.admin",
  appName: "Prompt2Spot Admin",
  webDir: "dist",
  server: { androidScheme: "https" },
  android: { allowMixedContent: false },
  plugins: {
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
