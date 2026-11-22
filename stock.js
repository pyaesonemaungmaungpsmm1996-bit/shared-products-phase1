'use strict';

(() => {
  const labels = {
    my: {
      title: 'လက်ကျန်၊ အဝယ်နှင့် အရောင်း', balance: 'ဆိုင်ခွဲလက်ကျန်', newDocument: 'စာရင်းအသစ်',
      kind: 'စာရင်းအမျိုးအစား', opening: 'အဖွင့်လက်ကျန်', purchase: 'အဝယ်', sale: 'အရောင်း',
      party: 'ဝယ်သူ / ပစ္စည်းသွင်းသူအမည်', addLine: 'ပစ္စည်းတစ်ကြောင်း ထည့်ရန်', product: 'ပစ္စည်း',
      qty: 'အရေအတွက်', unit: 'တစ်ခုဈေး (MMK)', total: 'စုစုပေါင်း', remove: 'ဖယ်ရန်',
      initial: 'ယခုပေးချေငွေ (MMK)', method: 'ပေးချေမှုနည်းလမ်း', cash: 'လက်ငင်းငွေ', bank: 'ဘဏ်',
      saveDraft: 'Draft သိမ်းရန်', post: 'အတည်ပြုရန်', reset: 'အသစ်စရန်', documents: 'နောက်ဆုံး စာရင်း ၁၀၀',
      movements: 'နောက်ဆုံး လက်ကျန်အဝင်အထွက် ၁၀၀', payments: 'နောက်ဆုံး ပေးချေမှု ၁၀၀',
      draft: 'Draft', posted: 'အတည်ပြုပြီး', editDraft: 'Draft ပြင်ရန်', payment: 'ပေးချေငွေ (MMK)',
      recordPayment: 'ပေးချေမှုသိမ်းရန်', paid: 'ပေးပြီး', due: 'ကျန်ငွေ', retry: 'တူညီသော တောင်းဆိုမှု ပြန်စမ်းရန်',
      pending: 'သိမ်းပြီးမပြီး မသေချာပါ။ တူညီသော တောင်းဆိုမှုကို ပြန်စမ်းပါ။',
      migrated: 'အဆင့် ၂ migration ကို Supabase မှာ Run ပြီး preview ကို ပြန်ဖွင့်ပါ။',
      conflict: 'အခြားစက်က စာရင်းပြောင်းထားပါတယ်။ စာရင်းထဲကနေ ပြန်ဖွင့်ပါ။',
      none: 'စာရင်းမရှိသေးပါ', saved: 'သိမ်းပြီးပါပြီ', failed: 'သိမ်းမရပါ', loading: 'စာရင်းဖတ်နေသည်',
      loadFailed: 'စာရင်းဖတ်မရပါ', insufficient: 'ရွေးထားတဲ့ ဆိုင်ခွဲမှာ လက်ကျန်မလုံလောက်ပါ။',
      partyRequired: 'ကျန်ငွေရှိရင် ဝယ်သူ သို့မဟုတ် ပစ္စည်းသွင်းသူအမည် ထည့်ပါ။',
      invalidTotal: 'စုစုပေါင်းနဲ့ ပေးချေငွေကို စစ်ပါ။', duplicateProduct: 'ပစ္စည်းတစ်မျိုးကို တစ်ကြောင်းပဲ ထည့်ပါ။'
    },
    en: {
      title: 'Stock, purchases and sales', balance: 'Branch stock', newDocument: 'New document',
      kind: 'Document type', opening: 'Opening stock', purchase: 'Purchase', sale: 'Sale',
      party: 'Customer / supplier name', addLine: 'Add product line', product: 'Product',
      qty: 'Quantity', unit: 'Unit price (MMK)', total: 'Total', remove: 'Remove',
      initial: 'Payment now (MMK)', method: 'Payment method', cash: 'Cash', bank: 'Bank',
      saveDraft: 'Save draft', post: 'Confirm', reset: 'Start new', documents: 'Latest 100 documents',
      movements: 'Latest 100 stock movements', payments: 'Latest 100 payments',
      draft: 'Draft', posted: 'Confirmed', editDraft: 'Edit draft', payment: 'Payment amount (MMK)',
      recordPayment: 'Record payment', paid: 'Paid', due: 'Outstanding', retry: 'Retry the same request',
      pending: 'Save result is unknown. Retry the same request.',
      migrated: 'Run the Phase 2 migration in Supabase, then reload this preview.',
      conflict: 'Another device changed this document. Reopen it from the list.',
      none: 'No records yet', saved: 'Saved', failed: 'Could not save', loading: 'Loading records',
      loadFailed: 'Could not load records', insufficient: 'Insufficient stock at the selected branch.',
      partyRequired: 'Enter a customer or supplier name for the outstanding amount.',
      invalidTotal: 'Check the total and the payment amount.', duplicateProduct: 'Use one line per product.'
    }
  };

  const form = get('stock-form');
  const paymentForm = get('stock-pay');
  const linesNode = get('stock-lines');
  const branchSelect = get('stock-branch');
  let data;
  let scope = '';
  let branch = '';
  let loadedProducts = '';
  let draft;
  let payment;
  let busy = false;
  let refreshing = false;
  let refreshQueued = false;
  let operationNotice;
  let loadNotice;
  let pending;

  const tr = key => labels[language][key];
  const revision = () => [client?.supabaseUrl, user?.id, shopId, branch].join('/');
  const pendingKey = () => ['stock-command', client?.supabaseUrl, user?.id, shopId].join(':');
  const productList = () => snapshot?.products ?? [];
  const role = () => snapshot?.role;
  const managed = () => ['owner', 'manager'].includes(role());
  function canDraft(kind) {
    return managed() || (role() === 'cashier' && kind === 'sale')
      || (role() === 'stock_staff' && ['opening', 'purchase'].includes(kind));
  }
  function canPay(kind) {
    return kind !== 'opening' && (managed() || role() === 'accountant' || (role() === 'cashier' && kind === 'sale'));
  }
  function formatMoney(number) {
    return new Intl.NumberFormat(language === 'my' ? 'my-MM' : 'en').format(number) + ' MMK';
  }
  function dateLabel(date) {
    return new Intl.DateTimeFormat(language === 'my' ? 'my-MM' : 'en', {
      dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Yangon'
    }).format(new Date(date));
  }
  function nameOf(id) {
    const product = productList().find(item => item.id === id);
    return product ? product.name + ' (' + product.item_code + ')' : id;
  }

  function paintNotices() {
    const content = notice => notice ? [tr(notice.key), notice.detail].filter(Boolean).join(' · ') : '';
    get('stock-status').textContent = content(loadNotice);
    get('stock-operation').textContent = content(operationNotice);
    get('stock-retry').hidden = !pending;
    get('stock-retry').disabled = busy;
    for (const button of document.querySelectorAll('#stock-form button[type=submit], #stock-pay button:not([type])')) {
      button.disabled = busy || !!pending;
    }
  }

  function replaceSelect(select, options, desired = select.value) {
    select.replaceChildren(...options.map(([id, label]) => new Option(label, id)));
    if (options.some(([id]) => id === desired)) select.value = desired;
  }

  function fieldLabel(key, input) {
    const label = document.createElement('label');
    const title = document.createElement('span');
    title.dataset.stock = key;
    title.textContent = tr(key);
    label.append(title, input);
    return label;
  }

  function addLine(line) {
    if (linesNode.children.length >= 100) return;
    const row = document.createElement('div');
    row.className = 'stock-line';
    const product = document.createElement('select');
    product.required = true;
    product.className = 'stock-product';
    replaceSelect(product, [['', '—'], ...productList().map(item => [item.id, nameOf(item.id)])], line?.product_id);
    const quantity = document.createElement('input');
    quantity.className = 'stock-qty';
    quantity.inputMode = 'numeric';
    quantity.pattern = '[1-9][0-9]{0,8}';
    quantity.required = true;
    quantity.value = line?.quantity ?? 1;
    const unit = document.createElement('input');
    unit.className = 'stock-unit';
    unit.inputMode = 'numeric';
    unit.pattern = '[0-9]{1,12}';
    unit.required = true;
    unit.value = line?.unit_mmk ?? 0;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'quiet';
    remove.dataset.stock = 'remove';
    remove.textContent = tr('remove');
    remove.onclick = () => {
      if (linesNode.children.length > 1) row.remove();
      syncForm();
    };
    product.onchange = () => {
      if (form.elements.kind.value === 'sale') {
        unit.value = productList().find(item => item.id === product.value)?.sale_price_mmk ?? 0;
      }
      syncForm();
    };
    row.append(fieldLabel('product', product), fieldLabel('qty', quantity), fieldLabel('unit', unit), remove);
    linesNode.append(row);
    syncForm();
  }

  function wholeNumber(value, maxDigits) {
    return new RegExp('^[0-9]{1,' + maxDigits + '}$').test(value) ? Number(value) : 0;
  }

  function getLines() {
    return Array.from(linesNode.children, row => ({
      product_id: row.querySelector('.stock-product').value,
      quantity: wholeNumber(row.querySelector('.stock-qty').value, 9),
      unit_mmk: form.elements.kind.value === 'opening' ? 0 : wholeNumber(row.querySelector('.stock-unit').value, 12)
    }));
  }

  function syncForm() {
    const kind = form.elements.kind.value;
    const showPayment = canPay(kind);
    get('stock-initial-payment').hidden = !showPayment;
    form.elements.amount.disabled = !showPayment;
    for (const row of linesNode.children) {
      row.querySelector('.stock-unit').disabled = kind === 'opening';
      row.querySelector('.stock-unit').parentElement.hidden = kind === 'opening';
      row.querySelector('button').hidden = linesNode.children.length === 1;
    }
    const total = getLines().reduce((sum, line) => sum + BigInt(line.quantity || 0) * BigInt(line.unit_mmk || 0), 0n);
    get('stock-total').textContent = tr('total') + ' · ' + formatMoney(total);
  }

  function cleanForm(documentRow) {
    draft = documentRow;
    form.reset();
    const kinds = ['opening', 'purchase', 'sale'].filter(canDraft);
    replaceSelect(form.elements.kind, kinds.map(kind => [kind, tr(kind)]), documentRow?.kind ?? kinds[0]);
    form.elements.kind.disabled = !!documentRow;
    form.elements.party.value = documentRow?.counterparty ?? '';
    linesNode.replaceChildren();
    (documentRow?.lines ?? [undefined]).forEach(addLine);
  }

  function showPayment(documentRow) {
    payment = documentRow;
    paymentForm.reset();
    paymentForm.hidden = !payment;
    if (payment) {
      get('stock-pay-details').textContent = tr('due') + ' · ' + formatMoney(payment.total_mmk - payment.paid_mmk);
      paymentForm.elements.amount.focus();
    }
  }

  function buttonFor(label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quiet';
    button.textContent = tr(label);
    button.onclick = action;
    return button;
  }

  function renderRows() {
    const rows = data ?? { balances: [], documents: [], movements: [], payments: [] };
    const stock = new Map(rows.balances.map(item => [item.product_id, item.on_hand]));
    const describe = (target, items) => get(target).replaceChildren(...(items.length ? items : [listItem(tr('none'))]));
    describe('stock-balances', productList().map(item => listItem(nameOf(item.id) + ' · ' + (stock.get(item.id) ?? 0))));
    describe('stock-documents', rows.documents.map(doc => {
      const title = [tr(doc.kind), tr(doc.status), '#' + doc.id.slice(0, 8), dateLabel(doc.updated_at), doc.counterparty,
        formatMoney(doc.total_mmk), tr('paid') + ' ' + formatMoney(doc.paid_mmk),
        tr('due') + ' ' + formatMoney(doc.total_mmk - doc.paid_mmk)].filter(Boolean).join(' · ');
      const row = listItem(title + ' — ' + doc.lines.map(line => nameOf(line.product_id) + ' × ' + line.quantity).join(', '));
      if (doc.status === 'draft' && canDraft(doc.kind)) {
        row.append(buttonFor('editDraft', () => {
          cleanForm(doc);
          get('stock-create').open = true;
          form.elements.party.focus();
        }));
      }
      if (doc.status === 'posted' && doc.total_mmk > doc.paid_mmk && canPay(doc.kind)) {
        row.append(buttonFor('recordPayment', () => showPayment(doc)));
      }
      return row;
    }));
    describe('stock-movements', rows.movements.map(row => listItem(
      [dateLabel(row.occurred_at), nameOf(row.product_id), (row.quantity_delta > 0 ? '+' : '') + row.quantity_delta,
        '#' + row.document_id.slice(0, 8)].join(' · '))));
    describe('stock-payments', rows.payments.map(row => listItem(
      [dateLabel(row.recorded_at), tr(row.method), formatMoney(row.amount_mmk), '#' + row.document_id.slice(0, 8)].join(' · '))));
  }

  function resetBranch(selected) {
    branch = selected;
    data = undefined;
    loadNotice = branch ? { key: 'loading' } : undefined;
    get('stock-create').open = false;
    showPayment(undefined);
    cleanForm();
  }

  function savedRequest() {
    try { return JSON.parse(sessionStorage.getItem(pendingKey()) ?? 'null'); }
    catch { return undefined; }
  }

  function render() {
    const currentScope = user && shopId && snapshot?.role ? [user.id, shopId].join('/') : '';
    const scopeChanged = currentScope !== scope;
    if (scopeChanged) {
      scope = currentScope;
      pending = scope ? savedRequest() : undefined;
      operationNotice = pending ? { key: 'pending' } : undefined;
      branch = '';
      data = undefined;
    }
    const branches = snapshot?.branches ?? [];
    get('stock-panel').hidden = !scope || !branches.length;
    if (!scope || !branches.length) return;
    const selected = branches.some(item => item.id === branch) ? branch : branches[0].id;
    replaceSelect(branchSelect, branches.map(item => [item.id, item.name]), selected);

    if (branch !== selected || scopeChanged) {
      resetBranch(selected);
      void refresh();
    }
    const kinds = ['opening', 'purchase', 'sale'].filter(canDraft);
    get('stock-create').hidden = !kinds.length || !productList().length;
    replaceSelect(form.elements.kind, kinds.map(kind => [kind, tr(kind)]));
    const products = JSON.stringify(productList().map(item => [item.id, item.name, item.item_code]));
    if (products !== loadedProducts) {
      loadedProducts = products;
      const options = [['', '—'], ...productList().map(item => [item.id, nameOf(item.id)])];
      for (const select of linesNode.querySelectorAll('.stock-product')) replaceSelect(select, options);
    }
    for (const select of document.querySelectorAll('.tender')) {
      replaceSelect(select, ['cash','bank'].map(method => [method, tr(method)]));
    }
    for (const node of document.querySelectorAll('[data-stock]')) node.textContent = tr(node.dataset.stock);
    syncForm();
    paintNotices();
    renderRows();
  }

  async function refresh() {
    if (!scope || !branch) return;
    refreshQueued = true;
    if (refreshing) return;
    refreshing = true;
    try {
      while (refreshQueued && scope && branch) {
        refreshQueued = false;
        const context = revision();
        const shop = shopId;
        const selected = branch;
        const query = (table, columns) => client.from(table).select(columns).eq('shop_id', shop).eq('branch_id', selected);
        try {
          const [balances, documents, movements, payments] = (await Promise.all([
            allRows(() => query('stock_balances','product_id,on_hand').order('product_id')),
            query('stock_documents','id,kind,status,version,counterparty,lines,total_mmk,paid_mmk,updated_at')
              .order('updated_at',{ascending:false}).order('id').limit(100),
            query('stock_movements','product_id,document_id,quantity_delta,occurred_at')
              .order('occurred_at',{ascending:false}).order('id',{ascending:false}).limit(100),
            query('stock_payments','document_id,amount_mmk,method,recorded_at')
              .order('recorded_at',{ascending:false}).order('id').limit(100)
          ]));
          if (context !== revision()) continue;
          data = { balances, documents: result(documents), movements: result(movements), payments: result(payments) };
          loadNotice = undefined;
          renderRows();
        } catch (error) {
          if (context !== revision()) continue;
          loadNotice = ['PGRST205','42P01'].includes(error.code)
            ? { key: 'migrated' } : { key: 'loadFailed', detail: error.message };
        }
        paintNotices();
      }
    } finally {
      refreshing = false;
    }
  }

  function setPending(request, key) {
    if (request) sessionStorage.setItem(key, JSON.stringify(request));
    else sessionStorage.removeItem(key);
    if (key === pendingKey()) pending = request;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const random = crypto.getRandomValues(new Uint8Array(16));
    random[6] = (random[6] & 15) | 64;
    random[8] = (random[8] & 63) | 128;
    const hex = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join('-');
  }

  async function write(command) {
    if (busy || (!command && !pending) || (command && pending)) return;
    const key = pendingKey();
    const activeRevision = revision();
    const targetShop = shopId;
    const request = pending ?? { id: uuid(), command };
    busy = true;
    operationNotice = undefined;
    try {
      setPending(request, key);
      paintNotices();
      const response = await client.rpc('stock_command', { p_shop: targetShop, p_request: request.id, p_command: request.command });
      if (response.error) {
        const definitive = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
        if (definitive) setPending(undefined, key);
        if (key === pendingKey()) {
          let notice = definitive ? 'failed' : 'pending';
          if (response.error.code === 'P4090') notice = 'conflict';
          if (response.error.message.startsWith('Insufficient stock')) notice = 'insufficient';
          if (response.error.message.startsWith('Customer or supplier')) notice = 'partyRequired';
          operationNotice = { key: notice, detail: notice === 'failed' ? response.error.message : '' };
        }
      } else {
        setPending(undefined, key);
        if (key === pendingKey()) operationNotice = { key: 'saved' };
        if (activeRevision === revision()) {
          if (request.command.action === 'payment') showPayment(undefined);
          else {
            cleanForm();
            get('stock-create').open = false;
          }
        }
      }
    } catch (error) {
      if (key === pendingKey()) operationNotice = { key: pending ? 'pending' : 'failed', detail: pending ? '' : error.message };
    } finally {
      busy = false;
      paintNotices();
      void refresh();
    }
  }

  form.onsubmit = event => {
    event.preventDefault();
    const action = event.submitter?.value ?? 'draft';
    const kind = form.elements.kind.value;
    const lines = getLines();
    if (new Set(lines.map(line => line.product_id)).size !== lines.length) {
      operationNotice = { key: 'duplicateProduct' };
      return paintNotices();
    }
    const total = lines.reduce((sum, line) => sum + BigInt(line.quantity) * BigInt(line.unit_mmk), 0n);
    const amount = action === 'post' && canPay(kind) ? Number(form.elements.amount.value) : 0;
    if (total > 9999999999999n || BigInt(amount) > total) {
      operationNotice = { key: 'invalidTotal' };
      return paintNotices();
    }
    void write({ action, kind, branch_id: branch, document_id: draft?.id ?? null, version: draft?.version ?? null, lines,
      counterparty: form.elements.party.value.trim(), amount_mmk: amount, method: form.elements.method.value });
  };
  paymentForm.onsubmit = event => {
    event.preventDefault();
    if (!payment) return;
    const amount = Number(paymentForm.elements.amount.value);
    if (amount <= 0 || amount > payment.total_mmk - payment.paid_mmk) {
      operationNotice = { key: 'invalidTotal' };
      return paintNotices();
    }
    void write({ action: 'payment', document_id: payment.id, version: payment.version, amount_mmk: amount,
      method: paymentForm.elements.method.value });
  };
  get('stock-retry').onclick = () => void write();
  get('add-stock-line').onclick = () => addLine();
  get('stock-reset').onclick = () => cleanForm();
  get('stock-pay-cancel').onclick = () => showPayment(undefined);
  form.oninput = syncForm;
  form.elements.kind.onchange = () => {
    if (form.elements.kind.value === 'sale') {
      for (const row of linesNode.children) row.querySelector('.stock-unit').value =
        productList().find(item => item.id === row.querySelector('.stock-product').value)?.sale_price_mmk ?? 0;
    }
    syncForm();
  };
  branchSelect.onchange = () => { resetBranch(branchSelect.value); render(); void refresh(); };
  window.stockWorkspace = { render, refresh };
  render();
})();
