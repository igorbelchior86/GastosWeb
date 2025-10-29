export const getFeatureFlags = () => ({
  FEATURE_BUDGETS: true,
  FEATURE_PANORAMA: true,
  FEATURE_DUAL_BALANCE: true, // always on in development
});

export const setFeatureFlagOverride = () => true;
export const clearFeatureFlagOverrides = () => getFeatureFlags();

export const isBudgetsEnabled = () => true;
export const isPanoramaEnabled = () => true;
export const isDualBalanceEnabled = () => true; // always enabled in dev

export function getFeatureFlagsApi() {
  return {
    defaults: getFeatureFlags(),
    getOverrides: () => ({}),
    isBudgetsEnabled,
    isPanoramaEnabled,
    isDualBalanceEnabled,
    getAll: getFeatureFlags,
    setOverride: () => true,
    clearOverrides: clearFeatureFlagOverrides,
  };
}
