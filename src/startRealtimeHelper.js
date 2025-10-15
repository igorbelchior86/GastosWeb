/**
 * Factory to create the realtime listener for Firebase updates.
 * This helper encapsulates the logic that was previously defined inline
 * in main.js. It receives a context object with getter/setter functions
 * and dependencies. When invoked, it returns an asynchronous function
 * that establishes live listeners on Firebase database references and
 * keeps local application state in sync with remote changes.
 *
 * The context must provide functions and properties corresponding to
 * those referenced in the original realtime implementation, including
 * path getters/setters, Firebase helpers, state accessors/mutators,
 * cache helpers and UI renderers. See the call site in main.js for
 * how these are supplied.
 */
import { normalizeStartBalance } from './utils/startBalance.js';

export function createStartRealtime(ctx) {
  return async function startRealtime() {
    // Destructure dependencies from the provided context. Fallbacks are used
    // so that optional fields do not cause errors if omitted.
    const {
      getPath,
      setPath,
      cleanupProfileListeners,
      resetHydration,
      firebaseDb,
      ref,
      get,
      scopedDbSegment,
      profileRef,
      registerHydrationTarget,
      hydrateStateFromCache,
      maybeCompleteHydration,
      subscribeState,
      getTransactions,
      setTransactions,
      transactionsRef,
      getCards,
      setCards,
      cardsRef,
      state,
      normalizeTransactionRecord,
      cacheGet,
      cacheSet,
      onValue,
      sanitizeTransactions,
      recomputePostDates,
      save,
      sortTransactions,
      renderTable,
      plannedModal,
      renderPlannedModal,
      fixPlannedAlignment,
      expandPlannedDayLabels,
      markHydrationTargetReady,
      setStartBalance,
      setStartDate,
      normalizeISODate,
      refreshMethodsFn,
      renderCardListFn,
      initStart,
      load,
      completeHydration,
      recalculateHeaderOffset,
      syncStartInputFromState,
      ensureStartSetFromBalance,
      profileListenersRef,
    } = ctx || {};

    // Resolve the current PATH for database access. If getPath is
    // undefined, default to null to avoid exceptions.
    let PATH = typeof getPath === 'function' ? getPath() : null;

    // Clean up any existing listeners and reset the hydration state.
    try { cleanupProfileListeners && cleanupProfileListeners(); } catch (_) {}
    try { resetHydration && resetHydration(); } catch (_) {}

    // On iOS PWAs the Firebase redirect flow can continue after load; wait for
    // completion before starting listeners to prevent spurious redirects.
    try {
      const ua = (typeof navigator !== 'undefined' && navigator.userAgent || '').toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(ua);
      const standalone = (typeof window !== 'undefined') &&
        ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
         ('standalone' in navigator && navigator.standalone));
      if (isIOS && standalone && window.Auth && window.Auth.waitForRedirect) {
        await window.Auth.waitForRedirect();
      }
    } catch (_) {}

    // Verify the current PATH has read permissions; if not, fall back to
    // the user's personal workspace. This mirrors the logic in the original
    // realtime implementation.
    try {
      const u = (typeof window !== 'undefined' && window.Auth && window.Auth.currentUser) ? window.Auth.currentUser : null;
      if (u && PATH) {
        const testRef = ref(firebaseDb, `${PATH}/${scopedDbSegment('startBal')}`);
        try {
          await get(testRef);
        } catch (err) {
          if (err && (err.code === 'PERMISSION_DENIED' || err.code === 'permission-denied')) {
            const fallback = `users/${u.uid}`;
            if (PATH !== fallback) {
              PATH = fallback;
              if (typeof setPath === 'function') setPath(PATH);
              // Delay on iOS standalone to smooth UI updates
              try {
                const ua = (navigator && navigator.userAgent || '').toLowerCase();
                const isIOS = /iphone|ipad|ipod/.test(ua);
                const standalone = (window && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                                   ('standalone' in navigator && navigator.standalone);
                if (isIOS && standalone) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}

    // Build database references for each piece of state. If profileRef is
    // undefined, these values will be null, disabling the associated listeners.
    const txRef        = profileRef ? profileRef('tx') : null;
    const cardsRefDB   = profileRef ? profileRef('cards') : null;
    const balRef       = profileRef ? profileRef('startBal') : null;
    const startDateRef = profileRef ? profileRef('startDate') : null;
    const startSetRef  = profileRef ? profileRef('startSet') : null;

    const listeners = [];

    // Register each target for hydration so that the UI can show skeletons
    if (registerHydrationTarget) {
      registerHydrationTarget('tx', !!txRef);
      registerHydrationTarget('cards', !!cardsRefDB);
      registerHydrationTarget('startBal', !!balRef);
      registerHydrationTarget('startDate', !!startDateRef);
      registerHydrationTarget('startSet', !!startSetRef);
    }

    // Hydrate from cache and signal potential completion of hydration
    try { hydrateStateFromCache && hydrateStateFromCache(); } catch (_) {}
    try { maybeCompleteHydration && maybeCompleteHydration(); } catch (_) {}

    // Subscribe to state changes and keep local transaction/card refs up to date
    if (subscribeState) {
      subscribeState((newState) => {
        try {
          const s = newState && newState.state ? newState.state : (newState || {});
          if (Array.isArray(s.transactions) && s.transactions !== transactionsRef.get()) {
            transactionsRef.set(s.transactions.slice());
            if (typeof window !== 'undefined' && typeof window.onTransactionsUpdated === 'function') {
              try { window.onTransactionsUpdated(transactionsRef.get()); } catch (e) { console.error(e); }
            }
          }
          if (Array.isArray(s.cards) && s.cards !== cardsRef.get()) {
            cardsRef.set(s.cards.slice());
            if (typeof window !== 'undefined' && typeof window.onCardsUpdated === 'function') {
              try { window.onCardsUpdated(cardsRef.get()); } catch (e) { console.error(e); }
            }
          }
        } catch (err) {
          console.error('State subscription error', err);
        }
      });
    }

    // Listener for remote transaction changes
    if (txRef && onValue) {
      listeners.push(onValue(txRef, (snap) => {
        try {
          const raw = snap.val() ?? [];
          const incoming = Array.isArray(raw) ? raw : Object.values(raw);
          const norm = normalizeTransactionRecord;
          const remote = (incoming || []).filter(t => t).map(t => norm ? norm(t) : t);
          const dirty = cacheGet ? cacheGet('dirtyQueue', []) : [];
          const hasPendingTx = Array.isArray(dirty) && dirty.includes('tx');

          if (typeof navigator !== 'undefined' && navigator.onLine && !hasPendingTx) {
            setTransactions && setTransactions(remote);
            transactionsRef.set(getTransactions ? getTransactions() : remote);
          } else {
            const local = ((transactionsRef.get() || []).map(t => (norm ? norm(t) : t)));
            const byId = new Map(local.map(t => [t.id, t]));
            for (const r of remote) {
              const l = byId.get(r.id);
              if (!l) {
                byId.set(r.id, r);
                continue;
              }
              const lt = Date.parse(l.modifiedAt || l.ts || 0);
              const rt = Date.parse(r.modifiedAt || r.ts || 0);
              if (rt >= lt) byId.set(r.id, r);
            }
            const merged = Array.from(byId.values());
            setTransactions && setTransactions(merged);
            transactionsRef.set(getTransactions ? getTransactions() : merged);
          }

          // Sanitize and recompute post dates
          const san = sanitizeTransactions ? sanitizeTransactions(getTransactions ? getTransactions() : transactionsRef.get()) : { list: transactionsRef.get(), changed: false };
          if (san && san.list) {
            setTransactions && setTransactions(san.list);
            transactionsRef.set(getTransactions ? getTransactions() : san.list);
          }
          const fixed = recomputePostDates ? recomputePostDates() : false;
          cacheSet && cacheSet('tx', getTransactions ? getTransactions() : transactionsRef.get());
          if ((san && san.changed) || fixed) {
            try { save && save('tx', transactionsRef.get()); } catch (_) {}
          }
          sortTransactions && sortTransactions();
          renderTable && renderTable();
          if (plannedModal && !plannedModal.classList.contains('hidden')) {
            if (typeof renderPlannedModal === 'function') {
              try { renderPlannedModal(); } catch (_) {}
            }
            if (typeof fixPlannedAlignment === 'function') {
              try { fixPlannedAlignment(); } catch (_) {}
            }
            if (typeof expandPlannedDayLabels === 'function') {
              try { expandPlannedDayLabels(); } catch (_) {}
            }
          }
        } finally {
          if (markHydrationTargetReady) markHydrationTargetReady('tx');
        }
      }));
    }

    // Listener for card changes
    if (cardsRefDB && onValue) {
      listeners.push(onValue(cardsRefDB, (snap) => {
        const raw = snap.val() ?? [];
        const next = Array.isArray(raw) ? raw : Object.values(raw);
        try {
          // Always update cards like transactions do - no cache comparison blocking
          const updatedCards = Array.isArray(next) ? next : Object.values(next || {});
          if (!updatedCards.some(c => c && c.name === 'Dinheiro')) {
            updatedCards.unshift({ name: 'Dinheiro', close: 0, due: 0 });
          }
          setCards && setCards(updatedCards);
          cardsRef.set(getCards ? getCards() : updatedCards);
          cacheSet && cacheSet('cards', updatedCards);
          
          // Force update window.__gastos.cards directly
          if (typeof window !== 'undefined' && window.__gastos) {
            window.__gastos.cards = updatedCards;
          }
          const fixed = recomputePostDates ? recomputePostDates() : false;
          if (fixed) {
            try { save && save('tx', transactionsRef.get()); } catch (_) {}
            cacheSet && cacheSet('tx', transactionsRef.get());
          }
          refreshMethodsFn && refreshMethodsFn();
          renderCardListFn && renderCardListFn();
          renderTable && renderTable();
        } finally {
          if (markHydrationTargetReady) markHydrationTargetReady('cards');
        }
      }));
    }

    // Listener for start balance changes
    if (balRef && onValue) {
      listeners.push(onValue(balRef, (snap) => {
        const raw = snap.exists() ? snap.val() : null;
        const next = normalizeStartBalance(raw);
        const current = normalizeStartBalance(state?.startBalance);
        if (next === current) {
          if (markHydrationTargetReady) markHydrationTargetReady('startBal');
          return;
        }
        try {
          if (typeof setStartBalance === 'function') {
            setStartBalance(next, { emit: false });
          } else if (state) {
            state.startBalance = next;
          }
          cacheSet && cacheSet('startBal', state?.startBalance ?? next);
          syncStartInputFromState && syncStartInputFromState();
          ensureStartSetFromBalance && ensureStartSetFromBalance();
          initStart && initStart();
          renderTable && renderTable();
        } finally {
          if (markHydrationTargetReady) markHydrationTargetReady('startBal');
        }
      }));
    }

    // Listener for start date changes
    if (startDateRef && onValue) {
      listeners.push(onValue(startDateRef, (snap) => {
        const raw = snap.exists() ? snap.val() : null;
        const normalized = normalizeISODate ? normalizeISODate(raw) : raw;
        if (normalized === state.startDate) {
          if (markHydrationTargetReady) markHydrationTargetReady('startDate');
          return;
        }
        try {
          state.startDate = normalized;
          try { cacheSet && cacheSet('startDate', state.startDate); } catch (_) {}
          if (normalized && normalized !== raw && typeof save === 'function' && (typeof getPath === 'function' ? getPath() : false)) {
            Promise.resolve().then(() => save('startDate', normalized)).catch(() => {});
          }
          ensureStartSetFromBalance && ensureStartSetFromBalance({ persist: false, refresh: false });
          initStart && initStart();
          renderTable && renderTable();
        } finally {
          if (markHydrationTargetReady) markHydrationTargetReady('startDate');
        }
      }));
    }

    // Listener for start set flag changes
    if (startSetRef && onValue) {
      listeners.push(onValue(startSetRef, (snap) => {
        const val = snap.exists() ? !!snap.val() : false;
        if (val === state.startSet) {
          if (markHydrationTargetReady) markHydrationTargetReady('startSet');
          return;
        }
        try {
          state.startSet = val;
          try { cacheSet && cacheSet('startSet', state.startSet); } catch (_) {}
          initStart && initStart();
          renderTable && renderTable();
        } finally {
          if (markHydrationTargetReady) markHydrationTargetReady('startSet');
        }
      }));
    }

    // Expose the list of unsubscribe functions via the provided ref object
    if (profileListenersRef && typeof profileListenersRef.set === 'function') {
      profileListenersRef.set(listeners);
    }
  };
}
