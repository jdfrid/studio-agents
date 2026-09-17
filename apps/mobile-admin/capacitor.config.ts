import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Play listing identity — do not change; a new applicationId is a new store app.
  appId: "com.prompt2spot.admin",
  appName: "Reelmino Admin",
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
