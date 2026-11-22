'use strict';

const copy = {
  my: {
    connect: 'Supabase ချိတ်ဆက်ရန်', login: 'ဝင်ရန်', password: 'စကားဝှက်',
    disconnect: 'Project ပြောင်းရန်', logout: 'ထွက်ရန်', shops: 'ဆိုင်များ', shop: 'ဆိုင်အမည်',
    createShop: 'ဆိုင်အသစ်ဖွင့်ရန်', firstBranch: 'ပထမဆိုင်ခွဲအမည်', branches: 'ဆိုင်ခွဲများ',
    branch: 'ဆိုင်ခွဲအမည်', addBranch: 'ဆိုင်ခွဲထည့်ရန်', products: 'ဆိုင်ခွဲအားလုံးသုံး ပစ္စည်းစာရင်း',
    name: 'ပစ္စည်းအမည်', code: 'Item code', price: 'ရောင်းဈေး (MMK)', addProduct: 'ပစ္စည်းထည့်ရန်',
    noProducts: 'ပစ္စည်းမရှိသေးပါ', edit: 'ဈေးပြင်ရန်', save: 'သိမ်းရန်', cancel: 'ပယ်ဖျက်ရန်',
    live: 'Realtime ချိတ်ဆက်ထားသည်', waiting: 'Realtime စောင့်နေသည်', fallback: 'အလိုအလျောက် ပြန်စစ်နေသည်',
    saved: 'သိမ်းပြီးပါပြီ', conflict: 'ဈေးနှုန်း ပြောင်းထားပြီးပါပြီ။ လက်ရှိဈေးကိုကြည့်ပြီး ပြန်ပြင်ပါ။',
    unavailable: 'Supabase library တင်မရပါ။ အင်တာနက်ချိတ်ဆက်ပြီး စာမျက်နှာကို ပြန်ဖွင့်ပါ။',
    badProject: 'Supabase Project URL နဲ့ publishable key ကို စစ်ပါ။',
    readError: 'စာရင်းဖတ်မရပါ', writeError: 'လုပ်ဆောင်မှု မအောင်မြင်ပါ'
  },
  en: {
    connect: 'Connect Supabase', login: 'Sign in', password: 'Password', disconnect: 'Change project',
    logout: 'Sign out', shops: 'Shops', shop: 'Shop name', createShop: 'Create shop',
    firstBranch: 'First branch name', branches: 'Branches', branch: 'Branch name', addBranch: 'Add branch',
    products: 'Shared Products', name: 'Product name', code: 'Item code', price: 'Sale price (MMK)',
    addProduct: 'Add product', noProducts: 'No products yet', edit: 'Edit price', save: 'Save', cancel: 'Cancel',
    live: 'Realtime connected', waiting: 'Connecting to Realtime', fallback: 'Checking for updates automatically',
    saved: 'Saved', conflict: 'The price has changed. Review the current price and try again.',
    unavailable: 'Supabase library failed to load. Connect to the internet and reload.',
    badProject: 'Check the Supabase Project URL and publishable key.',
    readError: 'Could not load records', writeError: 'Action failed'
  }
};

const get = id => document.getElementById(id);
let language = localStorage.getItem('shop-sync-language') === 'en' ? 'en' : 'my';
const t = key => copy[language][key];
let client;
let user;
let channel;
let connection = 'waiting';
let shopId = '';
let snapshot;
let edit;
let generation = 0;
let loading = false;
let refreshPending = false;
let notice;

function renderNotice() {
  get('message').textContent = notice ? [t(notice.key), notice.detail].filter(Boolean).join(' · ') : '';
  get('message').dataset.error = String(notice?.error ?? false);
}

function tell(key, error = false, detail = '') {
  notice = key ? { key, error, detail } : undefined;
  renderNotice();
}

function translate() {
  document.documentElement.lang = language;
  get('language').textContent = language === 'my' ? 'English' : 'မြန်မာ';
  document.querySelectorAll('[data-copy]').forEach(node => { node.textContent = t(node.dataset.copy); });
  get('connection').textContent = t(connection);
  renderNotice();
  render();
}

function listItem(value) {
  const li = document.createElement('li');
  const label = document.createElement('span');
  label.textContent = value;
  li.append(label);
  return li;
}

function render() {
  if (!snapshot) {
    get('shop-selection').hidden = true;
    get('shop-content').hidden = true;
    return;
  }
  const { shops, branches, products, writable } = snapshot;
  const selection = get('shops');
  selection.replaceChildren(...shops.map(shop => new Option(shop.name, shop.id)));
  selection.value = shopId;
  get('shop-selection').hidden = !shops.length;
  get('shop-content').hidden = !shopId;
  get('create-branch').hidden = !writable;
  get('create-product').hidden = !writable;
  get('branches').replaceChildren(...branches.map(branch => listItem(branch.name)));
  const format = new Intl.NumberFormat(language === 'my' ? 'my-MM' : 'en', { maximumFractionDigits: 0 });
  get('products').replaceChildren(...products.map(product => {
    const row = listItem(product.name + ' · ' + product.item_code + ' · ' + format.format(product.sale_price_mmk) + ' MMK');
    if (writable) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiet';
      button.textContent = t('edit');
      button.onclick = () => {
        edit = product;
        const form = get('edit-price');
        get('editing').textContent = product.name;
        form.elements.price.value = product.sale_price_mmk;
        form.hidden = false;
        form.elements.price.focus();
      };
      row.append(button);
    }
    return row;
  }));
  get('empty-products').hidden = products.length > 0;
  get('edit-price').hidden = !edit || !writable;
}

function result(response) {
  if (response.error) throw response.error;
  return response.data;
}

async function allRows(makeQuery) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = result(await makeQuery().range(offset, offset + 499));
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

async function refresh() {
  if (!user) return;
  refreshPending = true;
  if (loading) return;
  loading = true;
  try {
    while (refreshPending && user) {
      refreshPending = false;
      const version = generation;
      const requestedShop = shopId;
      try {
        const [shops, memberships] = await Promise.all([
          allRows(() => client.from('shops').select('id,name').order('name').order('id')),
          allRows(() => client.from('shop_members').select('shop_id,role').order('shop_id'))
        ]);
        if (version !== generation) continue;
        const selected = shops.some(shop => shop.id === requestedShop) ? requestedShop : (shops[0]?.id ?? '');
        const [branches, products] = selected ? await Promise.all([
          allRows(() => client.from('branches').select('id,name').eq('shop_id', selected).order('name').order('id')),
          allRows(() => client.from('products').select('id,name,item_code,sale_price_mmk,updated_at')
            .eq('shop_id', selected).order('name').order('id'))
        ]) : [[], []];
        if (version !== generation) continue;
        if (shopId !== selected) edit = undefined;
        shopId = selected;
        snapshot = {
          shops, branches, products,
          writable: memberships.some(member => member.shop_id === selected && ['owner', 'manager'].includes(member.role))
        };
        if (notice?.key === 'readError') tell();
        render();
      } catch (error) {
        if (version === generation) tell('readError', true, error.message);
      }
    }
  } finally {
    loading = false;
  }
}

function setConnection(next) {
  connection = next;
  get('connection').textContent = t(next);
}

function applySession(session) {
  const next = session?.user;
  if (next?.id === user?.id) return;
  ++generation;
  if (channel) void client.removeChannel(channel);
  user = next;
  shopId = '';
  snapshot = undefined;
  edit = undefined;
  get('shop-details').open = false;
  ['create-shop', 'create-branch', 'create-product', 'edit-price'].forEach(id => get(id).reset());
  get('login').hidden = !!user;
  get('workspace').hidden = !user;
  get('identity').textContent = user?.email ?? '';
  tell();
  render();
  if (!user) return;

  setConnection('waiting');
  const topic = 'shop-sync-' + generation;
  const subscription = client.channel(topic);
  for (const table of ['shops', 'shop_members', 'branches', 'products']) {
    for (const event of ['INSERT', 'UPDATE']) {
      subscription.on('postgres_changes', { event, schema: 'public', table }, () => void refresh());
    }
  }
  channel = subscription;
  subscription.subscribe(status => {
    if (channel !== subscription || !user) return;
    setConnection(status === 'SUBSCRIBED' ? 'live' : 'fallback');
    void refresh();
  });
  void refresh();
}

function connect(url, key) {
  const project = new URL(url);
  if (project.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(project.hostname)
    || project.port || project.username || project.password || project.pathname !== '/' || project.search || project.hash
    || !/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key)) throw new Error(t('badProject'));
  client = window.supabase.createClient(project.origin, key, { auth: { detectSessionInUrl: false } });
  localStorage.setItem('shop-sync-project', JSON.stringify({ url: project.origin, key }));
  get('setup').hidden = true;
  get('login').hidden = false;
  client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => applySession(session), 0);
  });
}

function submit(id, action) {
  const form = get(id);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"], button:not([type])');
    if (button.disabled) return;
    button.disabled = true;
    tell();
    try {
      await action(new FormData(form));
    } catch (error) {
      tell(error.notice ?? 'writeError', true, error.notice ? '' : error.message);
    } finally {
      button.disabled = false;
    }
  });
}

const field = (data, name) => String(data.get(name)).trim();
const price = data => Number(field(data, 'price'));

submit('connect', data => {
  if (!window.supabase) throw Object.assign(new Error(), { notice: 'unavailable' });
  connect(field(data, 'url'), field(data, 'key'));
});
submit('sign-in', async data => {
  const password = String(data.get('password'));
  get('sign-in').elements.password.value = '';
  result(await client.auth.signInWithPassword({ email: field(data, 'email'), password }));
});
submit('create-shop', async data => {
  const version = generation;
  const createdShop = result(await client.rpc('create_shop', { shop_name: field(data, 'shop'), branch_name: field(data, 'branch') }));
  if (version !== generation) return;
  ++generation;
  shopId = createdShop;
  edit = undefined;
  if (snapshot) snapshot = { ...snapshot, branches: [], products: [], writable: false };
  get('create-branch').reset();
  get('create-product').reset();
  render();
  get('create-shop').reset();
  get('shop-details').open = false;
  tell('saved');
  void refresh();
});
submit('create-branch', async data => {
  const version = generation;
  result(await client.from('branches').insert({ shop_id: shopId, name: field(data, 'branch') }));
  if (version !== generation) return;
  get('create-branch').reset();
  tell('saved');
  void refresh();
});
submit('create-product', async data => {
  const version = generation;
  result(await client.from('products').insert({
    shop_id: shopId, name: field(data, 'name'), item_code: field(data, 'code'), sale_price_mmk: price(data)
  }));
  if (version !== generation) return;
  get('create-product').reset();
  tell('saved');
  void refresh();
});
submit('edit-price', async data => {
  const product = edit;
  const version = generation;
  if (!product) return;
  const updated = result(await client.from('products').update({ sale_price_mmk: price(data) })
    .eq('id', product.id).eq('shop_id', shopId).eq('updated_at', product.updated_at).select('id').maybeSingle());
  if (version !== generation) return;
  if (edit === product) edit = undefined;
  render();
  void refresh();
  if (!updated) throw Object.assign(new Error(), { notice: 'conflict' });
  tell('saved');
});

get('language').onclick = () => {
  language = language === 'my' ? 'en' : 'my';
  localStorage.setItem('shop-sync-language', language);
  translate();
};
get('shops').onchange = event => {
  ++generation;
  shopId = event.target.value;
  edit = undefined;
  if (snapshot) snapshot = { ...snapshot, branches: [], products: [], writable: false };
  get('create-branch').reset();
  get('create-product').reset();
  tell();
  render();
  void refresh();
};
get('cancel-edit').onclick = () => { edit = undefined; render(); };
get('sign-out').onclick = async () => {
  try { result(await client.auth.signOut({ scope: 'local' })); }
  catch (error) { tell('writeError', true, error.message); }
};
get('disconnect').onclick = () => { localStorage.removeItem('shop-sync-project'); location.reload(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
window.addEventListener('online', () => void refresh());
setInterval(() => { if (!document.hidden) void refresh(); }, 15000);

translate();
get('setup').hidden = false;
try {
  const stored = JSON.parse(localStorage.getItem('shop-sync-project') ?? 'null');
  if (!window.supabase) tell('unavailable', true);
  else if (stored) connect(stored.url, stored.key);
} catch (error) {
  tell('badProject', true, error.message);
}
