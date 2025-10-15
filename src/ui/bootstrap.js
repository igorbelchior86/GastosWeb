/**
 * Initializes application bootstrap logic, including start-balance UI,
 * card modal wiring, asynchronous data hydration and dynamic layout
 * adjustments. This file encapsulates the heavy startup code that
 * previously lived in main.js to keep the entrypoint lean.
 *
 * The functions herein rely on globals and helpers populated on
 * `window.__gastos` and the DOM. To ensure calls like `initStart()`
 * remain valid, this module attaches `initStart` back onto
 * `window.__gastos`.
 */

import { normalizeStartBalance } from '../utils/startBalance.js';
import * as appState from '../state/appState.js';
import { hydratePreferences } from '../utils/preferenceHydration.js';

export function runBootstrap() {
  const g = (window.__gastos = window.__gastos || {});

  // Local bindings: prefer properties from window.__gastos (populated by main.js),
  // fallback to DOM lookups or no-op functions to avoid ReferenceErrors.
  const startContainer = g.startContainer || (typeof document !== 'undefined' && document.getElementById('startGroup'));
  const dividerSaldo = g.dividerSaldo || (typeof document !== 'undefined' && document.getElementById('dividerSaldo'));
  const startGroup = g.startGroup || (typeof document !== 'undefined' && document.getElementById('startGroup'));
  const setStartBtn = g.setStartBtn || (typeof document !== 'undefined' && document.getElementById('setStartBtn'));
  const startInput = g.startInput || (typeof document !== 'undefined' && document.getElementById('startInput'));

  const addBtn = g.addBtn || (typeof document !== 'undefined' && document.getElementById('addBtn'));
  const addCardBtn = g.addCardBtn || (typeof document !== 'undefined' && document.getElementById('addCardBtn'));
  const openCardBtn = g.openCardBtn || (typeof document !== 'undefined' && document.getElementById('openCardModal'));
  const closeCardModal = g.closeCardModal || (typeof document !== 'undefined' && document.getElementById('closeCardModal'));
  const cardModal = g.cardModal || (typeof document !== 'undefined' && document.getElementById('cardModal'));

  const date = g.date || (typeof document !== 'undefined' && document.getElementById('opDate'));

  // Prefer centralized app state from the gastos bridge, fall back to
  // a global `window.state` if present. Using a safe default prevents
  // ReferenceErrors during early bootstrap when main.js hasn't wired
  // the shared state onto `window.__gastos` yet.
  const state = g.state || (typeof window !== 'undefined' && window.state) || {};

  const refreshMethods = g.refreshMethods || (() => {});
  const renderCardList = g.renderCardList || (() => {});
  const existingInitStart = g.initStart || (() => {});
  const safeRenderTable = g.safeRenderTable || (() => {});
  const flushQueue = g.flushQueue || (() => {});
  const load = g.load || (async () => []);
  const cacheSet = g.cacheSet || (() => {});
  const getTransactions = g.getTransactions || (() => []);
  const setTransactions = g.setTransactions || (() => {});
  const renderTable = g.renderTable || (() => {});
  const save = g.save || (async () => {});
  const cards = g.cards || [];
  const transactions = g.transactions || [];

  const addCard = g.addCard || (() => {});
  const addTx = g.addTx || (() => {});
  const setStartBalance = g.setStartBalance || ((val) => {
    if (state) state.startBalance = val;
    return val;
  });
  const syncStartInputFromState = g.syncStartInputFromState || (() => {});
  const ensureStartSetFromBalance = g.ensureStartSetFromBalance || (() => {});
  const normalizeISODate = g.normalizeISODate || ((iso) => iso);
  const todayISO = g.todayISO || (() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });

  const showCardModal = g.showCardModal || (() => { if (cardModal) { cardModal.classList.remove('hidden'); } });
  const hideCardModal = g.hideCardModal || (() => { if (cardModal) { cardModal.classList.add('hidden'); } });

  // Recreate the initStart helper. It toggles visibility of the
  // initial balance input based on whether a start date/balance has
  // already been configured. Originally defined in main.js.
  function initStart() {
    // Don't run during skeleton boot to prevent flash
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('skeleton-boot')) {
      console.log('[initStart] Skipping - skeleton-boot active');
      return;
    }
    
    // Read state directly from appState module
    const startSet = appState.getStartSet();
    const startBalance = appState.getStartBalance();
    
    // Durante hidratação inicial, se startBalance ainda for null mas não sabemos
    // se é primeiro uso ou se os dados ainda não carregaram, NÃO mostra a caixa
    // para evitar flash. Só mostra quando temos certeza (após hidratação).
    const isHydrated = appState.isBootHydrated();
    if (!isHydrated && startBalance === null) {
      console.log('[initStart] Waiting for hydration before showing start box');
      return;
    }

    // LÓGICA BINÁRIA SIMPLES:
    // Não configurou saldo? Mostra
    // Configurou saldo? Esconde
    const showStart = (startBalance === null || startBalance === undefined);

    console.log('[initStart] SIMPLE CHECK:', { startBalance, isHydrated, showStart });

    // exibe ou oculta todo o container de saldo inicial
    startContainer.style.display = showStart ? 'block' : 'none';
    dividerSaldo.style.display = showStart ? 'block' : 'none';
    // (mantém linha antiga para compatibilidade)
    startGroup.style.display = showStart ? 'flex' : 'none';
    // mantém o botão habilitado; a função addTx impede lançamentos
    try { addBtn.classList.toggle('disabled', showStart); } catch (_) {}

    // marca visibilidade para checagens externas
    try { startContainer.setAttribute('data-start-visible', String(showStart)); } catch (_) {}
  }
  // Expose initStart on global state so existing calls still work
  g.initStart = initStart;
  
  // Update start input placeholder based on currency profile
  function updateStartInputPlaceholder() {
    if (!startInput) return;
    try {
      const profile = window.APP_PROFILE || window.CURRENT_PROFILE;
      if (profile && window.APP_FMT) {
        // Format zero using the current currency formatter
        const placeholder = window.APP_FMT.format(0);
        startInput.placeholder = placeholder;
      }
    } catch (err) {
      console.warn('[bootstrap] Failed to update start input placeholder:', err);
    }
  }
  
  // Update placeholder on initial load
  updateStartInputPlaceholder();
  
  // Update placeholder when currency profile changes
  try {
    window.addEventListener('currencyProfileChanged', () => {
      updateStartInputPlaceholder();
    });
  } catch (_) {}

  // Handle start-balance confirmation
  if (setStartBtn) {
    setStartBtn.addEventListener('click', async () => {
    const raw = startInput.value || '';
    // remove tudo que não for dígito
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      alert('Valor inválido');
      return;
    }
    // interpreta como centavos
    const numberValue = parseInt(digits, 10) / 100;
    if (isNaN(numberValue)) {
      alert('Valor inválido');
      return;
    }
    // salva o novo saldo e renderiza novamente
    setStartBalance(numberValue);
    cacheSet('startBal', state.startBalance);
    syncStartInputFromState();
    const anchorISO = normalizeISODate(state.startDate) || todayISO();
    if (anchorISO !== state.startDate) {
      state.startDate = anchorISO;
      cacheSet('startDate', state.startDate);
      try { save('startDate', state.startDate); } catch (_) {}
    } else if (!state.startDate) {
      // garante persistência mesmo se valor já vier normalizado de outra instância
      cacheSet('startDate', anchorISO);
      try { save('startDate', anchorISO); } catch (_) {}
    }
    // Persist start balance and mark the start flow as completed (startSet=true)
    try {
      await save('startBal', state.startBalance);
    } catch(_) {}
    state.startSet = true;
    try { cacheSet('startSet', true); } catch(_) {}
    try { await save('startSet', true); } catch(_) {}
    initStart();
    renderTable();
  });
  }

  // Hook up card modal triggers and add/edit buttons
  if (typeof addCardBtn !== 'undefined' && addCardBtn) addCardBtn.onclick = addCard;
  if (typeof addBtn !== 'undefined' && addBtn) {
    addBtn.onclick = async () => {
      // If start balance input is visible, block opening add modal
      try {
        const ds = startContainer && startContainer.getAttribute && startContainer.getAttribute('data-start-visible');
        const visible = ds === 'true' ? true : (startContainer && startContainer.style && startContainer.style.display && startContainer.style.display !== 'none');
        if (visible) {
          // give a gentle feedback (no modal)
          try { startInput && startInput.focus(); } catch (_) {}
          return;
        }
      } catch (_) {}
      // Get addTx from global context when clicked, not when bootstrap runs
      const g = window.__gastos;
      if (g && typeof g.addTx === 'function') {
        await g.addTx();
      } else if (window.addTx && typeof window.addTx === 'function') {
        await window.addTx();
      }
    };
  }
  if (typeof openCardBtn !== 'undefined' && openCardBtn && openCardBtn) openCardBtn.onclick = () => showCardModal();
  if (typeof closeCardModal !== 'undefined' && closeCardModal) closeCardModal.onclick = hideCardModal;
  if (cardModal) {
    cardModal.onclick = e => {
      if (e.target === cardModal) {
        hideCardModal();
      }
    };
  }

  // Immediately-invoked async bootstrap sequence. This hydrates
  // cached data, renders initial UI, adjusts scroll spacers and
  // performs live fetches from Firebase if online.
  (async () => {
    // Attempt to hydrate UI from cache immediately so the accordion has
    // data to render even before realtime listeners respond.
    try { if (typeof g.hydrateStateFromCache === 'function') await g.hydrateStateFromCache(); } catch (_) {}
    // Instancia todos os botões “Adicionar” a partir do template
    document.querySelectorAll('[data-add-btn-container]').forEach(container => {
      const tpl = document.getElementById('add-button-template');
      const btn = tpl.content.cloneNode(true).firstElementChild;
      const targetId = container.dataset.targetId;
      if (targetId) btn.id = targetId;
      container.appendChild(btn);
    });
    date.value = todayISO();
    // Renderiza imediatamente com dados em cache
    refreshMethods();
    renderCardList();
    // NÃO chama initStart aqui - espera remover skeleton-boot primeiro
    try { console.debug('bootstrap: about to call safeRenderTable, type =', typeof safeRenderTable); } catch(_) {}
    safeRenderTable();
    // exibe conteúdo após carregar dados localmente
    const wrap = document.querySelector('.wrapper');
    wrap.classList.remove('app-hidden');
    // Remove skeleton flag so start-balance obeys real logic
    try { document.documentElement.classList.remove('skeleton-boot'); } catch (_) {}
    // AGORA chama initStart DEPOIS de remover skeleton-boot
    initStart();
    // iOS/Safari: force layout settle so bottom extent is correct
    // tiny scroll nudge prevents initial underflow that hides last days
    try {
      const y = wrap.scrollTop;
      wrap.scrollTop = y + 1;
      wrap.scrollTop = y;
    } catch {}

    // Watchdog: se o acordeão não montar, tenta novamente sem travar a UI
    const ensureAccordion = () => {
      const hasMonths = document.querySelector('#accordion details.month');
      if (!hasMonths) {
        console.warn('Accordion still empty; retrying render…');
        safeRenderTable();
      }
    };
    // duas tentativas espaçadas
    setTimeout(ensureAccordion, 1200);
    setTimeout(ensureAccordion, 4000);

    // Spacer dinâmico no fim: só aparece quando o usuário encosta o fim
    // para permitir que o último divider passe sob o pseudo‑footer
    try {
      let endSpacer = document.getElementById('endScrollSpacer');
      if (!endSpacer) {
        endSpacer = document.createElement('div');
        endSpacer.id = 'endScrollSpacer';
        Object.assign(endSpacer.style, {
          height: '0px', width: '100%', pointerEvents: 'none'
        });
        wrap.appendChild(endSpacer);
      }
      const targetSpacer = () => {
        const btn = document.querySelector('.floating-add-button');
        const h = btn ? (btn.getBoundingClientRect().height || 64) : 64;
        return Math.max(72, Math.round(h + 12));
      };
      const updateEndSpacer = () => {
        const nearBottom = (wrap.scrollTop + wrap.clientHeight) >= (wrap.scrollHeight - 2);
        endSpacer.style.height = nearBottom ? (targetSpacer() + 'px') : '0px';
      };
      wrap.addEventListener('scroll', updateEndSpacer);
      window.addEventListener('resize', updateEndSpacer);
      if (window.visualViewport) visualViewport.addEventListener('resize', updateEndSpacer);
      updateEndSpacer();
    } catch (_) {}

    if (typeof PATH === 'string') {
      try {
        const [liveTx, liveCards, liveBalRaw] = await Promise.all([
          load('tx', []),
          load('cards', cards),
          load('startBal', state.startBalance)
        ]);
        const liveBal = normalizeStartBalance(liveBalRaw);
        const currentBal = normalizeStartBalance(state.startBalance);

        const hasLiveTx    = Array.isArray(liveTx)    ? liveTx.length    > 0 : liveTx    && Object.keys(liveTx).length    > 0;
        const hasLiveCards = Array.isArray(liveCards) ? liveCards.length > 0 : liveCards && Object.keys(liveCards).length > 0;

        // Converte objeto → array se necessário
        const fixedTx = Array.isArray(liveTx) ? liveTx : Object.values(liveTx || {});

        if (hasLiveTx) {
          // Sanitize and persist if needed (one-time migration path on boot)
          const s = sanitizeTransactions(fixedTx);
          const current = getTransactions ? getTransactions() : transactions;
          if (JSON.stringify(s.list) !== JSON.stringify(current)) {
            setTransactions(s.list);
            try { cacheSet('tx', getTransactions()); } catch (_) { cacheSet('tx', s.list); }
            if (s.changed) { try { save('tx', getTransactions()); } catch (_) {} }
            renderTable();
          }
        }
        if (hasLiveCards) {
          const normalized = Array.isArray(liveCards) ? liveCards : Object.values(liveCards || {});
          if (!normalized.some(c => c && c.name === 'Dinheiro')) normalized.unshift({ name: 'Dinheiro', close: 0, due: 0 });
          setCards(normalized);
          try { cacheSet('cards', getCards()); } catch (_) { cacheSet('cards', normalized); }
          refreshMethods(); renderCardList(); renderTable();
        }
        if (liveBal !== currentBal) {
          setStartBalance(liveBal);
          cacheSet('startBal', state.startBalance);
          syncStartInputFromState();
          ensureStartSetFromBalance();
          initStart(); renderTable();
        }
      } catch (_) { /* ignore boot fetch when not logged yet */ }
    }
    // se online, tenta esvaziar fila pendente
    if (navigator.onLine) flushQueue();
  })();

  // Re-run initStart when relevant parts of app state change (e.g., after reset)
  try {
    appState.subscribeState(({ changedKeys }) => {
      if (!changedKeys || !Array.isArray(changedKeys)) return;
      const interesting = ['startSet', 'startBalance', 'bootHydrated'];
      if (changedKeys.some(k => interesting.includes(k))) {
        try { initStart(); } catch (_) {}
      }
    });
  } catch (_) {}
}
