// Currency / country profiles for the app.
// Keep this small and declarative so new profiles can be added easily.
window.CURRENCY_PROFILES = {
  BR: {
    id: 'BR', name: 'Brasil (BRL)', locale: 'pt-BR', currency: 'BRL', decimalPlaces: 2,
    features: { invoiceParcel: true }
  },
  PT: {
    id: 'PT', name: 'Portugal (EUR)', locale: 'pt-PT', currency: 'EUR', decimalPlaces: 2,
    features: { invoiceParcel: false }
  },
  US: {
    id: 'US', name: 'Estados Unidos (USD)', locale: 'en-US', currency: 'USD', decimalPlaces: 2,
    features: { invoiceParcel: false }
  }
};
