// ============================================================================
// MAIN-LITE.JS - Versão simplificada do main.js para testes
// ============================================================================
// Contém apenas as variáveis e funções essenciais sem dependências DOM

// Configurações e variáveis globais
const USE_MOCK = true;
let PATH = 'mock_365';

// Dados principais
let transactions = [];
let cards = [];
let startBalance = 0;

// Funções de persistência
let save, load;

if (!USE_MOCK) {
  // Firebase (não implementado no teste)
  save = async (k, v) => {};
  load = async (k, d) => d;
} else {
  // Modo MOCK (LocalStorage)
  save = (k, v) => localStorage.setItem(`${PATH}_${k}`, JSON.stringify(v));
  load = async (k, d) => JSON.parse(localStorage.getItem(`${PATH}_${k}`)) ?? d;
}

// Cache functions
const cacheGet = (k, d) => {
  try {
    const ls = localStorage.getItem(`cache_${k}`);
    if (ls != null) return JSON.parse(ls);
  } catch {}
  return d;
};

const cacheSet = (k, v) => {
  try {
    localStorage.setItem(`cache_${k}`, JSON.stringify(v));
  } catch {}
};

// Offline queue functions
const markDirty = (k) => {
  const dirty = cacheGet('dirtyQueue', []);
  if (!dirty.includes(k)) {
    dirty.push(k);
    cacheSet('dirtyQueue', dirty);
  }
};

const flushQueue = async () => {
  const dirty = cacheGet('dirtyQueue', []);
  // Mock implementation for tests
  cacheSet('dirtyQueue', []);
  return dirty.length;
};

// Função de ordenação de transações
function sortTransactions(arr = transactions) {
  return arr.slice().sort((a, b) => {
    const dateCompare = (b.date || '').localeCompare(a.date || '');
    if (dateCompare !== 0) return dateCompare;
    return (b.id || '').localeCompare(a.id || '');
  });
}

// Auth mock
const Auth = {
  signInWithGoogle: () => Promise.resolve({ user: { uid: 'test-user' } })
};

// Sticky header function
function updateStickyMonth() {
  // Mock implementation for tests
  return true;
}

// Theme functions
function applyThemePreference(theme = 'light') {
  // Mock implementation for tests - simula aplicação do tema
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  return true;
}

// App version
const APP_VERSION = '1.4.8';

// ============================================================================
// CREATE MOCK DOM ELEMENTS FOR TESTS
// ============================================================================
function createMockDOMElements() {
  // Create txModal
  const txModal = document.createElement('div');
  txModal.id = 'txModal';
  txModal.className = 'modal hidden';
  document.body.appendChild(txModal);
  
  // Create cardModal
  const cardModal = document.createElement('div');
  cardModal.id = 'cardModal';
  cardModal.className = 'modal hidden';
  document.body.appendChild(cardModal);
  
  // Create daily table
  const dailyTable = document.createElement('table');
  dailyTable.id = 'dailyTable';
  const tbody = document.createElement('tbody');
  dailyTable.appendChild(tbody);
  document.body.appendChild(dailyTable);
  
  // Create form inputs
  const txDesc = document.createElement('input');
  txDesc.id = 'txDesc';
  txDesc.type = 'text';
  document.body.appendChild(txDesc);
  
  const txVal = document.createElement('input');
  txVal.id = 'txVal';
  txVal.type = 'number';
  document.body.appendChild(txVal);
  
  // Create header-seg
  const headerSeg = document.createElement('div');
  headerSeg.className = 'header-seg';
  headerSeg.dataset.selected = 'home';
  
  const homeOption = document.createElement('div');
  homeOption.dataset.action = 'home';
  homeOption.textContent = 'Home';
  headerSeg.appendChild(homeOption);
  
  document.body.appendChild(headerSeg);
  
  // Create floating pill
  const floatingPill = document.createElement('div');
  floatingPill.className = 'floating-pill';
  document.body.appendChild(floatingPill);
  
  // Create add transaction button
  const addTxBtn = document.createElement('button');
  addTxBtn.id = 'addTxBtn';
  addTxBtn.textContent = 'Adicionar Transação';
  addTxBtn.onclick = () => {
    // Mock behavior: show modal
    txModal.classList.remove('hidden');
  };
  document.body.appendChild(addTxBtn);
  
  // Add ESC key listener for modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      txModal.classList.add('hidden');
      cardModal.classList.add('hidden');
    }
  });
}

// Create mock elements when loaded
if (typeof document !== 'undefined') {
  createMockDOMElements();
}

// ============================================================================
// EXPOSE CRITICAL VARIABLES AND FUNCTIONS FOR TESTING
// ============================================================================
window.transactions = transactions;
window.cards = cards;
window.save = save;
window.load = load;
window.sortTransactions = sortTransactions;
window.startBalance = startBalance;
window.cacheGet = cacheGet;
window.cacheSet = cacheSet;
window.markDirty = markDirty;
window.flushQueue = flushQueue;
window.Auth = Auth;
window.updateStickyMonth = updateStickyMonth;
window.applyThemePreference = applyThemePreference;
window.APP_VERSION = APP_VERSION;

// Mark that main-lite.js has finished loading completely
window.mainJsLoaded = true;
console.log('🚀 Main-lite.js carregado completamente - todas as dependências disponíveis para testes');