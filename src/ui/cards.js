/*
 * Card UI module
 *
 * Encapsulates rendering and interaction logic for managing credit
 * cards. Functions in this module are pure in that they operate on
 * data passed in via the `ctx` argument rather than closing over
 * external variables. This makes them easier to reuse and test in
 * isolation. See the documentation for each function for required
 * context fields.
 */

import { escHtml } from '../utils/format.js';

/**
 * Rebuild the select element used to choose the payment method. When
 * called, the contents of the provided select will be cleared and
 * repopulated based on the current list of cards. This helper does
 * not mutate the cards array; it relies entirely on the passed
 * values.
 *
 * @param {HTMLSelectElement|null} met the select to populate
 * @param {Array<{name:string}>} cards list of card objects
 */
export function refreshMethods(met, cards) {
  if (!met) return;
  met.innerHTML = '';
  const list = Array.isArray(cards) && cards.length ? cards : [{ name: 'Dinheiro', close: 0, due: 0 }];
  list.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name;
    met.appendChild(opt);
  });
}

/**
 * Create the action buttons for a card list item. The actions include
 * edit and delete, and operate on the provided context. Editing
 * prompts the user for a new name, closing day and due day. Deleting
 * removes the card from the list after confirmation. Both actions
 * persist changes via the provided save function and refresh the UI
 * accordingly.
 *
 * The context object must provide:
 *   - cards: Array of existing cards (mutable)
 *   - transactions: Array of existing transactions (mutable)
 *   - getTransactions(): function returning current transactions
 *   - setTransactions(arr): function to replace transactions
 *   - save(key, value): async persistence helper
 *   - refreshMethodsFn: function to refresh method select
 *   - renderCardList(): function to rerender card list
 *   - renderTable(): function to rerender the transaction table
 *   - post(opDate, cardName): function returning the invoice date
 *   - met: HTMLSelectElement for payment methods
 *
 * @param {object} card the card represented by this list item
 * @param {object} ctx context with data and helpers (see above)
 * @returns {HTMLElement} a div containing the swipe actions
 */
export function createCardSwipeActions(card, ctx) {
  const actions = document.createElement('div');
  actions.className = 'swipe-actions';

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'icon edit';
  editBtn.style.padding = '0';
  editBtn.style.background = 'none';
  editBtn.style.border = 'none';
  editBtn.style.cursor = 'pointer';
  const editIconDiv = document.createElement('div');
  editIconDiv.className = 'icon-action icon-edit';
  editBtn.appendChild(editIconDiv);
  editBtn.addEventListener('click', () => {
    const newName = prompt('Nome do cartão', card.name)?.trim();
    if (!newName) return;
    const newClose = parseInt(prompt('Dia de fechamento (1-31)', card.close), 10);
    const newDue = parseInt(prompt('Dia de vencimento (1-31)', card.due), 10);
    if (
      Number.isNaN(newClose) || Number.isNaN(newDue) ||
      newClose < 1 || newClose > 31 ||
      newDue < 1 || newDue > 31 ||
      newClose >= newDue
    ) {
      alert('Dados inválidos');
      return;
    }
    // Prevent duplicate names
    if (newName !== card.name && ctx.cards.some((c) => c.name === newName)) {
      alert('Já existe cartão com esse nome');
      return;
    }
    const oldName = card.name;
    card.name = newName;
    card.close = newClose;
    card.due = newDue;
    // Update any transactions referencing this card
    const txsSnapshot = typeof ctx.getTransactions === 'function' ? ctx.getTransactions() : ctx.transactions;
    const updatedTxs = (txsSnapshot || []).map((t) => {
      if (t && t.method === oldName) {
        return {
          ...t,
          method: newName,
          postDate: ctx.post(t.opDate, newName),
          modifiedAt: new Date().toISOString(),
        };
      }
      return t;
    });
    if (typeof ctx.setTransactions === 'function') {
      ctx.setTransactions(updatedTxs);
    } else {
      ctx.transactions.length = 0;
      updatedTxs.forEach((tx) => ctx.transactions.push(tx));
    }
    // Persist updates
    try {
      ctx.save('cards', ctx.cards);
    } catch {
      /* ignore */
    }
    try {
      ctx.save('tx', typeof ctx.getTransactions === 'function' ? ctx.getTransactions() : ctx.transactions);
    } catch {
      /* ignore */
    }
    // Refresh UI components
    ctx.refreshMethodsFn(ctx.met, ctx.cards);
    ctx.renderCardList();
    ctx.renderTable();
  });
  actions.appendChild(editBtn);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'icon danger delete';
  delBtn.style.padding = '0';
  delBtn.style.background = 'none';
  delBtn.style.border = 'none';
  delBtn.style.cursor = 'pointer';
  const delIconDiv = document.createElement('div');
  delIconDiv.className = 'icon-action icon-delete';
  delBtn.appendChild(delIconDiv);
  delBtn.addEventListener('click', () => {
    if (!confirm('Excluir cartão?')) return;
    ctx.cards = ctx.cards.filter((x) => x.name !== card.name);
    try {
      ctx.save('cards', ctx.cards);
    } catch {
      /* ignore */
    }
    ctx.refreshMethodsFn(ctx.met, ctx.cards);
    ctx.renderCardList();
    ctx.renderTable();
  });
  actions.appendChild(delBtn);
  return actions;
}

/**
 * Build the visual content for a card list item. The content displays
 * the card name, closing day and due day using inline SVG icons.
 *
 * @param {object} card the card to visualise
 * @returns {HTMLElement}
 */
export function createCardContent(card) {
  const content = document.createElement('div');
  content.className = 'card-content card-line';
  content.innerHTML = `
    <div class="card-name" style="text-align:center;margin:6px 0; font-weight:700">${escHtml(card.name)}</div>
    <div class="card-detail" style="display:flex;align-items:center;gap:8px;padding:4px 0;color:currentColor">
      <span class="card-icon" style="width:20px;display:inline-flex;align-items:center;color:currentColor">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1 .9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1 -.9-2-2-2zm0 16H5V9h14v11z"/>
        </svg>
      </span>
      <span class="card-label" style="flex:0 0 auto">Fechamento</span>
      <span class="card-value" style="margin-left:auto;font-weight:600">${escHtml(String(card.close))}</span>
    </div>
    <div class="card-detail" style="display:flex;align-items:center;gap:8px;padding:4px 0;color:currentColor">
      <span class="card-icon" style="width:20px;display:inline-flex;align-items:center;color:currentColor">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d="M12 20c4.41 0 8-3.59 8-8s-3.59-8 -8-8 -8 3.59 -8 8 3.59 8 8 8zm0-14c3.31 0 6 2.69 6 6s-2.69 6 -6 6 -6-2.69 -6-6 2.69-6 6-6zm.5 3H11v5l4.25 2.52 .75-1.23 -3.5-2.04V9z"/>
        </svg>
      </span>
      <span class="card-label" style="flex:0 0 auto">Vencimento</span>
      <span class="card-value" style="margin-left:auto;font-weight:600">${escHtml(String(card.due))}</span>
    </div>
  `;
  return content;
}

/**
 * Compose a complete list item element for a card. This helper
 * delegates to createCardSwipeActions and createCardContent using the
 * provided context. The returned <li> element can be appended to
 * arbitrary lists.
 *
 * @param {object} card card to render
 * @param {object} ctx context as required by createCardSwipeActions
 * @returns {HTMLLIElement}
 */
export function createCardListItem(card, ctx) {
  const li = document.createElement('li');
  const wrap = document.createElement('div');
  wrap.className = 'swipe-wrapper';
  const actions = createCardSwipeActions(card, ctx);
  const content = createCardContent(card);
  wrap.appendChild(actions);
  wrap.appendChild(content);
  li.appendChild(wrap);
  return li;
}

/**
 * Render the list of cards. Clears the container and populates it
 * based on the cards array in the context. Always ensures that the
 * cash card ('Dinheiro') is not displayed (only real cards). When no
 * cards exist, displays a placeholder message. Optionally initialises
 * swipe gestures on the container when provided.
 *
 * The context object must provide:
 *   - cards: array of card objects
 *   - cardModal: modal element containing the list (optional)
 *   - cardListEl: explicit <ul> element to populate (optional)
 *   - initSwipe(root, wrapperSel, actionsSel, lineSel, onceFlag): swipe helper (optional)
 *   - renderCardList(): function (context) → used for refresh (self recursion)
 *   - ctx: passed to createCardListItem
 *
 * @param {object} ctx context with required fields
 */
export function renderCardList(ctx) {
  // Determine the list element to render into
  let ul = null;
  if (ctx.cardListEl) {
    ul = ctx.cardListEl;
  } else if (typeof document !== 'undefined') {
    ul = document.getElementById('cardList');
    if (!ul && ctx.cardModal) {
      ul = ctx.cardModal.querySelector('#cardList');
    }
  }
  if (!ul) return;
  // Clear existing items
  ul.innerHTML = '';
  const visibleCards = (ctx.cards || []).filter((c) => c && c.name !== 'Dinheiro');
  if (!visibleCards.length) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'card-empty';
    emptyLi.textContent = 'Nenhum cartão cadastrado';
    ul.appendChild(emptyLi);
  } else {
    visibleCards.forEach((card) => {
      const li = createCardListItem(card, ctx);
      ul.appendChild(li);
    });
  }
  // Initialise swipe if provided
  if (typeof ctx.initSwipe === 'function') {
    try {
      ctx.initSwipe(ul, '.swipe-wrapper', '.swipe-actions', '.card-line', 'cardsSwipeInit');
    } catch {
      /* ignore swipe errors */
    }
  }
}