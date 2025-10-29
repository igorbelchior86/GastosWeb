/*
 * Settings modal helpers
 *
 * This module encapsulates rendering of the Settings modal, including
 * fetching the user's profile from Firebase Auth (when available),
 * caching it locally, and wiring up the sign‑out button. To use it,
 * call `setupSettings` with the modal element. It returns an object
 * containing `openSettings`, `closeSettings` and `renderSettings`.
 */

import { cacheGet, cacheSet } from '../utils/cache.js';
import { applyCurrencyProfile, getAvailableProfiles, getCurrentProfile } from '../utils/currencyProfile.js';
import { getRuntimeProfile } from '../utils/profile.js';
import { showModal, updateModalOpenState } from '../utils/dom.js';
import { askConfirmLogout, askConfirmReset } from './modalHelpers.js';
import * as preferenceService from '../services/preferenceService.js';
import * as appState from '../state/appState.js';

/**
 * Apply theme preference to the document
 */
function applyThemePreference(pref) {
  // pref: 'light' | 'dark' | 'system'
  const getSystemPref = () => {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch (_) { 
      return 'dark'; 
    }
  };
  
  let resolved = pref === 'system' ? getSystemPref() : pref;
  const root = document.documentElement;
  if (resolved === 'light') {
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
  } else {
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');
  }
}

/**
 * Set up the settings modal. This attaches event handlers to render
 * the profile, persist it to cache, and handle sign out. It also
 * listens for `auth:state` events to re‑render the profile when the
 * authentication state changes.
 *
 * @param {HTMLElement} settingsModalEl The root element of the settings modal
 * @returns {{ openSettings: Function, closeSettings: Function, renderSettings: Function }}
 */
export function setupSettings(settingsModalEl) {
  if (!settingsModalEl) {
    return {
      openSettings: () => {},
      closeSettings: () => {},
      renderSettings: () => {}
    };
  }

  /**
   * Retrieve the user profile from Firebase Auth if available. Falls
   * back to null if Auth is not initialised or no user is logged in.
   *
   * @returns {{ name: string, email: string, photo: string } | null}
   */
  function getProfileFromAuth() {
    try {
      const user = window.Auth && window.Auth.currentUser;
      if (!user) return null;
      return {
        name: user.displayName || '',
        email: user.email || '',
        photo: user.photoURL || ''
      };
    } catch {
      return null;
    }
  }

  /**
   * Persist the profile into local cache. A no‑op on failure.
   *
   * @param {object|null} profile User profile to persist
   */
  function persistProfile(profile) {
    try {
      cacheSet('profile', profile);
      // Also cache the avatar image if it's a new URL
      if (profile && profile.photo) {
        cacheAvatarImage(profile.photo);
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Cache avatar image locally to avoid repeated downloads
   */
  async function cacheAvatarImage(photoURL) {
    try {
      const cachedAvatarURL = cacheGet('avatar_url', null);
      if (cachedAvatarURL === photoURL) {
        // Avatar already cached
        return; // Already cached
      }

      // Caching new avatar
      
      // Fetch the image and convert to blob
      const response = await fetch(photoURL);
      if (!response.ok) {
        console.warn('[settings] failed to fetch avatar:', response.status);
        return;
      }
      
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onload = () => {
        try {
          // Store as data URL for immediate use
          cacheSet('avatar_data', reader.result);
          cacheSet('avatar_url', photoURL);
          console.log('[settings] avatar cached successfully');
        } catch (err) {
          console.warn('[settings] failed to cache avatar data:', err);
        }
      };
      
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn('[settings] avatar caching failed:', err);
    }
  }

  /**
   * Get cached avatar data URL or original URL
   */
  function getAvatarURL(photoURL) {
    try {
      const cachedURL = cacheGet('avatar_url', null);
      const cachedData = cacheGet('avatar_data', null);
      
      if (cachedURL === photoURL && cachedData) {
        // Using cached avatar
        return cachedData;
      }
    } catch (err) {
      console.warn('[settings] failed to get cached avatar:', err);
    }
    
    console.log('[settings] using original avatar URL');
    return photoURL;
  }

  /**
   * Load a cached profile from local storage if present.
   *
   * @returns {object|null} cached profile or null
   */
  function loadCachedProfile() {
    try {
      return cacheGet('profile', null);
    } catch {
      return null;
    }
  }

  /**
   * Render the contents of the settings modal. This builds the
   * profile card and sign‑out button. It uses the cached profile
   * or falls back to the Auth user. After rendering, the logout
   * button is wired up to sign out and hide the modal.
   */
  function renderSettings() {
    const box = settingsModalEl.querySelector('.modal-content');
    if (!box) return;
    let profile = getProfileFromAuth();
    // Profile from auth loaded
    if (profile && profile.email) persistProfile(profile);
    if (!profile) {
      profile = loadCachedProfile() || { name: '', email: '', photo: '' };
      console.log('[settings] profile from cache:', profile);
    }
    // Profile photo ready
    const avatarURL = profile.photo ? getAvatarURL(profile.photo) : '';
    const avatarImg = avatarURL ? `<img src="${avatarURL}" alt="Avatar"/>` : '';
    const sub = profile.email || '';
    const cardHTML = `
      <div class="settings-card">
        <div class="settings-profile">
          <div class="settings-avatar">${avatarImg}</div>
          <div class="settings-names">
            <div class="settings-name">${(profile.name || '')}</div>
            <div class="settings-sub">${sub}</div>
          </div>
        </div>
      </div>`;
    // Get current theme and currency preferences from app state
    const currentPrefs = appState.getPreferences();
    const savedTheme = currentPrefs.theme || 'system';
    const currentCurrencyProfile = currentPrefs.currencyProfile || 'BR';
    
    const version = (typeof window !== 'undefined' && window.__gastos && window.__gastos.appVersion) || 'v?';
    const listHTML = `
      <h3 class="settings-section-title">Personalização</h3>
      <div class="settings-theme-card">
        <div class="theme-row">
          <button class="theme-btn" data-theme="light" aria-pressed="${savedTheme === 'light' ? 'true' : 'false'}">Claro</button>
          <button class="theme-btn" data-theme="dark" aria-pressed="${savedTheme === 'dark' ? 'true' : 'false'}">Escuro</button>
          <button class="theme-btn" data-theme="system" aria-pressed="${savedTheme === 'system' ? 'true' : 'false'}">Sistema</button>
        </div>
        <div class="settings-item settings-link" data-action="currency">
          <div class="left">--</div>
          <div class="right">›</div>
        </div>
      </div>
      
      <h3 class="settings-section-title">Financeiro</h3>
      <div class="settings-list">
        <div class="settings-item settings-link" data-action="cards">
          <div class="left">Cartões</div>
          <div class="right">›</div>
        </div>
      </div>
      
      <h3 class="settings-section-title">Sobre</h3>
      <div class="settings-list">
        <div class="settings-item">
          <div class="version-number">${version}</div>
        </div>
        <div class="settings-item danger">
          <button id="resetDataBtn" class="settings-cta">
            <div class="left">Apagar Todos os Dados</div>
          </button>
        </div>
      </div>
      
      <div class="settings-list">
        <div class="settings-item danger">
          <button id="logoutBtn" class="settings-cta">
            <div class="left">
              <span class="settings-icon icon-logout"></span>
              Sair da conta
            </div>
          </button>
        </div>
      </div>`;
    box.innerHTML = cardHTML + listHTML;
    
    // Theme selector event listeners
    box.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const theme = btn.dataset.theme;
        
        // Save preference through preferenceService (persists to Firebase + localStorage)
        await preferenceService.set('theme', theme);
        
        // Also update appState
        appState.setPreference('theme', theme);
        
        // Apply theme immediately
        applyThemePreference(theme);
        
        // Update aria-pressed state
        box.querySelectorAll('.theme-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
      });
    });

      // Wire currency selector: open existing currencyProfileModal and populate list
    (function wireCurrencySelector(){
      const currencyLink = box.querySelector('[data-action="currency"]');
      if (!currencyLink) return;

        // Currency selector wired

      // Set initial label from runtime profile
      try {
        const runtime = getRuntimeProfile();
        const left = currencyLink.querySelector('.left');
        if (left && runtime) left.textContent = runtime.name || '--';
      } catch (_) {}

      currencyLink.onclick = () => {
        console.log('[settings] currency selector clicked');
        let modal = document.getElementById('currencyProfileModal');
        let list = document.getElementById('currencyProfileList');
        let closeBtn = document.getElementById('closeCurrencyProfileModal');
        console.log('[settings] modal/list refs:', { modal, list, closeBtn });
        if (!modal || !list) {
          // Try fallbacks and log helpful info
          modal = document.querySelector('#currencyProfileModal') || modal;
          list = document.querySelector('#currencyProfileList') || list;
          closeBtn = document.querySelector('#closeCurrencyProfileModal') || closeBtn;
          console.warn('[settings] modal or list not found by id, tried querySelector:', { modal, list, closeBtn });
        }
        if (!modal) {
          console.warn('[settings] currency modal element not found — creating dynamic modal');
          try {
            modal = document.createElement('div');
            modal.id = 'currencyProfileModal';
            modal.className = 'bottom-modal backdrop-blur hidden sheet-modal';
            modal.setAttribute('role','dialog');
            modal.setAttribute('aria-modal','true');
            modal.innerHTML = `
              <div class="bottom-modal-box">
                <div class="modal-drag"></div>
                <button id="closeCurrencyProfileModal" class="modal-close-btn" aria-label="Fechar">✕</button>
                <header class="sheet-header">
                  <h2 id="currencyProfileTitle">País / Moeda</h2>
                </header>
                <div class="modal-content">
                  <ul id="currencyProfileList" style="list-style:none;padding:6px 0;margin:0;display:block;"></ul>
                </div>
              </div>`;
            document.body.appendChild(modal);
            // re-query list and closeBtn
            list = modal.querySelector('#currencyProfileList');
            closeBtn = modal.querySelector('#closeCurrencyProfileModal');
          } catch (err) {
            console.error('[settings] failed to create currency modal dynamically', err);
            return;
          }
        }

        // populate list only if available
        if (!list) {
          console.warn('[settings] currency list element not found — showing modal without items');
        } else {
          try {
            const profiles = getAvailableProfiles();
            console.log('[settings] currency profiles:', profiles);
            // Use preferenceService to get the saved preference, fallback to appState, then localStorage fallback
            const currentId = currentCurrencyProfile || (getCurrentProfile() && getCurrentProfile().id) || localStorage.getItem('ui:profile') || Object.keys(profiles)[0];
            console.log('[settings] current currency profile from preferences:', currentId);
            list.innerHTML = '';
            Object.keys(profiles || {}).forEach(pid => {
              const p = profiles[pid];
              const li = document.createElement('li');
              li.className = 'currency-profile-item';
              
              const isSelected = pid === currentId;
              li.innerHTML = `
                <div class="currency-profile-info">
                  <div class="currency-profile-name">${p.name}</div>
                  <div class="currency-profile-details">${p.locale} · ${p.currency}</div>
                </div>
                <div class="currency-profile-icon">${isSelected ? '✓' : '›'}</div>
              `;
              
              li.onclick = async () => {
                try {
                  console.log('[settings] applying currency profile:', pid);
                  applyCurrencyProfile(pid);
                  
                  // Save preference through preferenceService (persists to Firebase + localStorage)
                  await preferenceService.set('currencyProfile', pid);
                  
                  // Also update appState
                  appState.setPreference('currencyProfile', pid);
                  
                  // Update the selector label
                  const left = currencyLink.querySelector('.left');
                  if (left) left.textContent = p.name || '--';
                  
                  // Close ALL modals when currency is selected (return to accordion)
                  modal.classList.add('hidden');
                  const settingsModal = document.getElementById('settingsModal');
                  if (settingsModal) settingsModal.classList.add('hidden');
                  try { if (typeof window.updateModalOpenState === 'function') window.updateModalOpenState(); } catch (_) {}
                  
                  // Show toast
                  try {
                    const showToast = window.__gastos?.showToast;
                    if (typeof showToast === 'function') {
                      showToast(`Moeda alterada para ${p.name}`, 'success', 3000);
                    }
                  } catch (err) { console.warn('[settings] toast failed', err); }
                  
                  // Reload data from new profile
                  setTimeout(async () => {
                    try {
                      console.log('[settings] loading data for new profile:', pid);
                      
                      // Clear profile-scoped cache first
                      if (typeof window.cacheClearProfile === 'function') {
                        console.log('[settings] clearing profile cache');
                        window.cacheClearProfile();
                      }
                      
                      // Load fresh data from Firebase with new profile scoping
                      const load = window.__gastos?.load;
                      if (typeof load === 'function') {
                        console.log('[settings] loading fresh data from Firebase');
                        
                        const [newTx, newCards, newStartBal] = await Promise.all([
                          load('tx', []),
                          load('cards', [{name:'Dinheiro',close:0,due:0}]),
                          load('startBal', null)
                        ]);
                        
                        console.log('[settings] loaded profile data:', { 
                          txCount: newTx?.length || 0, 
                          cardCount: newCards?.length || 0,
                          startBal: newStartBal 
                        });
                        
                        // Update app state with new profile data
                        if (window.setTransactions) window.setTransactions(newTx);
                        if (window.setCards) window.setCards(newCards);  
                        if (window.setStartBalance) window.setStartBalance(newStartBal);
                        
                        // Update cache
                        if (window.cacheSet) {
                          window.cacheSet('tx', newTx);
                          window.cacheSet('cards', newCards);
                          window.cacheSet('startBal', newStartBal);
                        }
                        
                        // Re-render everything
                        if (window.refreshMethods) window.refreshMethods();
                        if (window.renderCardList) window.renderCardList();
                        
                        const renderTable = window.__gastos?.renderTable;
                        if (typeof renderTable === 'function') {
                          console.log('[settings] re-rendering table with new data');
                          renderTable();
                        }
                      } else {
                        console.warn('[settings] load function not available');
                      }
                      
                    } catch (err) { 
                      console.warn('[settings] profile reload failed:', err);
                    }
                  }, 100);
                  
                  // Dispatch reset so other modules (modal, caches) return to baseline
                  if (typeof window !== 'undefined') {
                    try {
                      if (typeof window.resetAppStateForProfileChange === 'function') {
                        window.resetAppStateForProfileChange(`settings:${pid}`);
                      }
                    } catch (err) {
                      console.warn('[settings] direct profile reset failed', err);
                    }
                    try {
                      const evt = new CustomEvent('profileChangeReset', { detail: { profileId: pid } });
                      window.dispatchEvent(evt);
                    } catch (err) {
                      console.warn('[settings] profileChangeReset event dispatch failed', err);
                    }
                  }
                  
                } catch (err) { console.warn('applyCurrencyProfile failed', err); }
              };
              list.appendChild(li);
            });
          } catch (err) {
            console.warn('Failed to populate currency profiles', err);
          }
        }

        if (closeBtn) closeBtn.onclick = () => { 
          modal.classList.add('hidden'); 
          try { if (typeof window.updateModalOpenState === 'function') window.updateModalOpenState(); } catch(_){}
          
          // Reabrir modal de settings após fechar modal de moedas (comportamento de sub-modal)
          setTimeout(() => {
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal) {
              settingsModal.classList.remove('hidden');
              try { if (typeof window.updateModalOpenState === 'function') window.updateModalOpenState(); } catch(_){}
            }
          }, 100);
        };

        console.log('[settings] showing currency modal');
        try {
          // Prefer the dom helper to manage modal open state
          showModal(modal);
        } catch (err) {
          // Fallback: toggle class directly
          modal.classList.remove('hidden');
          try { if (typeof window.updateModalOpenState === 'function') window.updateModalOpenState(); } catch(_){}
        }
      };
    })();
    
    // Wire cards button to open card modal (replicating currency modal behavior)
    const cardsBtn = box.querySelector('[data-action="cards"]');
    if (cardsBtn) {
      cardsBtn.onclick = () => {
        console.log('[settings] cards button clicked');
        try {
          const cardModal = document.getElementById('cardModal');
          const closeCardBtn = document.getElementById('closeCardModal');
          
          if (!cardModal) {
            console.warn('[settings] cardModal element not found');
            return;
          }
          
          // Setup close button handler (same pattern as currency modal)
          if (closeCardBtn) {
            closeCardBtn.onclick = () => {
              cardModal.classList.add('hidden');
              try { if (typeof window.updateModalOpenState === 'function') window.updateModalOpenState(); } catch(_){}
              
              // Reabrir modal de settings após fechar modal de cartões (comportamento de sub-modal)
              setTimeout(() => {
                const settingsModal = document.getElementById('settingsModal');
                if (settingsModal) {
                  settingsModal.classList.remove('hidden');
                  try { if (typeof window.updateModalOpenState === 'function') window.updateModalOpenState(); } catch(_){}
                }
              }, 100);
            };
          }
          
          // Open cards modal (same pattern as currency modal)
          console.log('[settings] showing cards modal');
          try {
            // Use the same showModal helper if available
            if (typeof showModal === 'function') {
              showModal(cardModal);
            } else {
              // Fallback: toggle class directly
              cardModal.classList.remove('hidden');
              try { if (typeof window.updateModalOpenState === 'function') window.updateModalOpenState(); } catch(_){}
            }
            
            // Render cards list after opening modal
            if (typeof window.renderCardList === 'function') {
              window.renderCardList();
            } else if (window.__gastos && typeof window.__gastos.renderCardList === 'function') {
              window.__gastos.renderCardList();
            }
          } catch (err) {
            console.warn('[settings] failed to show card modal:', err);
          }
          
        } catch (err) {
          console.warn('[settings] failed to open card modal:', err);
        }
      };
    }
    
    // Reset data button
    const resetBtn = box.querySelector('#resetDataBtn');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        try {
          const shouldReset = await askConfirmReset();
            
          if (shouldReset) {
            // Call the global reset function if available
            if (typeof window.performResetAllData === 'function') {
              await window.performResetAllData(false); // false = don't ask confirm again
            }
            settingsModalEl.classList.add('hidden');
            updateModalOpenState();
          }
        } catch (err) {
          console.error('Reset failed:', err);
        }
      };
    }
    
    // Logout button
    const logoutBtn = box.querySelector('#logoutBtn');
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        try {
          const shouldLogout = await askConfirmLogout();
            
          if (shouldLogout) {
            if (window.Auth && typeof window.Auth.signOut === 'function') {
              await window.Auth.signOut();
            }
            // Clear cached profile
            try {
              cacheSet('profile', null);
            } catch {
              /* ignore */
            }
            // Hide modal and restore page scroll state
            settingsModalEl.classList.add('hidden');
            updateModalOpenState();
          }
        } catch (err) {
          console.error('Logout failed:', err);
        }
      };
    }
    

  }

  /**
   * Show the settings modal. Renders the content before making it
   * visible and updating the modal open state.
   */
  function openSettings() {
    renderSettings();
    settingsModalEl.classList.remove('hidden');
    if (typeof window.updateModalOpenState === 'function') {
      window.updateModalOpenState();
    }
  }

  /**
   * Hide the settings modal and restore page scroll state. Does not
   * modify the modal content.
   */
  function closeSettings() {
    settingsModalEl.classList.add('hidden');
    if (typeof window.updateModalOpenState === 'function') {
      window.updateModalOpenState();
    }
  }

  // When the auth state changes (user signs in/out), re‑render the
  // settings to reflect the new user profile
  function onAuthState() {
    try {
      renderSettings();
    } catch {
      /* ignore */
    }
  }
  document.addEventListener('auth:state', onAuthState);

  // Expose functions. The caller can call openSettings() and closeSettings()
  return {
    openSettings,
    closeSettings,
    renderSettings
  };
}
