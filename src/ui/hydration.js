/*
 * Hydration management
 *
 * Centralises all logic related to boot hydration. The original
 * implementation relied on several globals in main.js. Those
 * variables and functions are now encapsulated here. Consumers
 * should import the functions they need and call them on startup.
 */

// Internal state
let hydrationInProgress = true;
const hydrationTargets = new Map();
let _hydrationFallbackTimer = null;

/**
 * Reset the hydration status. Sets the app to hydrating state, clears
 * existing targets and schedules a fallback completion in case
 * hydration never finishes. In the original code this also toggled
 * skeleton CSS classes; UI side effects should be handled by
 * consumers if needed.
 */
export function resetHydration() {
  hydrationInProgress = true;
  hydrationTargets.clear();
  try {
    document.documentElement.classList.add('skeleton-boot');
  } catch {
    /* ignore */
  }
  try {
    if (_hydrationFallbackTimer) clearTimeout(_hydrationFallbackTimer);
    _hydrationFallbackTimer = setTimeout(() => {
      if (hydrationInProgress) {
        for (const [k, v] of hydrationTargets.entries()) {
          if (v === false) hydrationTargets.set(k, true);
        }
        maybeCompleteHydration();
      }
    }, 4000);
  } catch {
    /* ignore */
  }
}

/**
 * Register a hydration target. When `enabled` is truthy, the target
 * will be tracked and considered incomplete until it is marked
 * ready via markHydrationTargetReady(). A falsy enabled skips
 * registration.
 *
 * @param {string} key unique identifier for the hydration target
 * @param {boolean} enabled whether to track this target
 */
export function registerHydrationTarget(key, enabled) {
  if (!enabled || !key) return;
  hydrationTargets.set(key, false);
}

/**
 * Mark a hydration target as ready. Once all registered targets are
 * ready, hydration completes automatically.
 *
 * @param {string} key identifier previously passed to registerHydrationTarget
 */
export function markHydrationTargetReady(key) {
  if (!key || !hydrationTargets.has(key)) return;
  hydrationTargets.set(key, true);
  maybeCompleteHydration();
}

/**
 * Internal: check whether all targets are ready and trigger
 * completion. Exposed only for the fallback timer.
 */
function maybeCompleteHydration() {
  if (!hydrationInProgress) return;
  
  for (const status of hydrationTargets.values()) {
    if (status === false) return;
  }
  
  completeHydration();
}

/**
 * Finalise hydration. Clears timers, resets state and calls user
 * provided callbacks if present on the window object. Consumers may
 * attach their own hooks to run after hydration completes.
 */
export function completeHydration() {
  if (!hydrationInProgress) return;
  
  hydrationInProgress = false;
  hydrationTargets.clear();
  
  try {
    if (_hydrationFallbackTimer) {
      clearTimeout(_hydrationFallbackTimer);
      _hydrationFallbackTimer = null;
    }
  } catch {
    /* ignore */
  }
  
  // CRITICAL: Mark hydration as complete in appState to unblock initStart
  try {
    if (typeof window.setBootHydrated === 'function') {
      window.setBootHydrated(true);
    }
  } catch (err) { 
    console.warn('[hydration] Failed to set bootHydrated:', err);
  }
  
  // Delegate to hooks on window if present
  try {
    if (typeof window.ensureStartSetFromBalance === 'function') {
      window.ensureStartSetFromBalance({ persist: true });
    }
  } catch (err) { /* ignore */ }
  
  try {
    if (typeof window.refreshMethods === 'function') window.refreshMethods();
  } catch (err) { /* ignore */ }
  
  try {
    if (typeof window.renderCardList === 'function') window.renderCardList();
  } catch (err) { /* ignore */ }
  
  // NÃO chama initStart aqui - espera remover skeleton-boot primeiro
  
  try {
    if (typeof window.safeRenderTable === 'function') window.safeRenderTable();
  } catch (err) { /* ignore */ }
  
  try {
    document.documentElement.classList.remove('skeleton-boot');
  } catch (err) { /* ignore */ }
  
  // AGORA chama initStart DEPOIS de remover skeleton-boot
  try {
    if (typeof window.initStart === 'function') window.initStart();
  } catch (err) { /* ignore */ }
  
  // Auto-scroll to today if displaying current year
  try {
    const g = window.__gastos || {};
    const currentYear = new Date().getFullYear();
    const viewYear = g.VIEW_YEAR || (g.yearSelectorApi && typeof g.yearSelectorApi.getViewYear === 'function' ? g.yearSelectorApi.getViewYear() : null);
    
    // LÓGICA BINÁRIA: Se config saldo inicial visível = desabilitar auto scroll
    const startContainer = document.getElementById('startGroup') || document.querySelector('.start-container');
    const isStartVisible = startContainer && startContainer.style.display !== 'none';
    
    if (!isStartVisible && viewYear === currentYear && typeof g.scrollTodayIntoView === 'function') {
      setTimeout(() => {
        g.scrollTodayIntoView();
      }, 400);
    }
  } catch (err) { /* ignore */ }
}

/**
 * Query whether hydration is still in progress. Useful for gating UI
 * updates until hydration completes.
 *
 * @returns {boolean}
 */
export function isHydrating() {
  return hydrationInProgress;
}

// Expose internal map for debugging/testing if needed
export { hydrationTargets, maybeCompleteHydration };