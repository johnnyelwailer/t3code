import Constants from "expo-constants";

const appVariant = Constants.expoConfig?.extra?.appVariant;

export const NEXI_BRAND_MARK_SOURCE =
  appVariant === "development"
    ? require("../../assets/brand/nexi-icon-dev-1024.png")
    : appVariant === "preview"
      ? require("../../assets/brand/nexi-icon-preview-1024.png")
      : require("../../assets/brand/nexi-icon-prod-1024.png");
