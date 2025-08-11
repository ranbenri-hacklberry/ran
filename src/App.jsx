import React from 'react';

// Button component with variants
function Button({ children, onClick, disabled, variant = 'light', className = '', ...rest }) {
  const base = 'inline-flex items-center justify-center rounded-full px-4 py-3 font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2';
  const variants = {
    primary: 'bg-emerald-500 text-white hover:bg-emerald-400 focus:ring-emerald-500',
    light: 'bg-white text-black border border-black hover:bg-gray-50 focus:ring-emerald-500',
    neutral: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-400',
    disabled: 'bg-gray-200 text-gray-400 cursor-not-allowed',
    selected: 'bg-emerald-500 text-white hover:bg-emerald-400 focus:ring-emerald-500',
  };
  const cls = disabled ? variants.disabled : variants[variant] || variants.light;
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} className={`${base} ${cls} ${className}`} {...rest}>
      {children}
    </button>
  );
}

// Option schema per product
const OPTION_SCHEMAS = {
  espresso: [
    { key: 'size', label: 'גודל', type: 'radio', required: true, options: [
      { value: 'short', label: 'קצר' },
      { value: 'long', label: 'ארוך' },
    ]},
  ],
  cappuccino: [
    { key: 'milk', label: 'חלב', type: 'radio', required: true, options: [
      { value: 'regular', label: 'רגיל' },
      { value: 'oat', label: 'שיבולת שועל' },
      { value: 'soy', label: 'סויה' },
      { value: 'almond', label: 'שקדים' },
    ]},
    { key: 'strength', label: 'חוזק', type: 'radio', required: true, options: [
      { value: 'mild', label: 'חלש' },
      { value: 'regular', label: 'רגיל' },
      { value: 'strong', label: 'חזק' },
    ]},
  ],
};

const DEFAULT_OPTIONS = {
  espresso: { size: 'short' },
  cappuccino: { milk: 'regular', strength: 'regular' },
};

function optionsSignature(id, opts) {
  const keys = Object.keys(opts || {}).sort();
  return `${id}::` + keys.map(k => `${k}=${opts[k]}`).join('|');
}

function optionsDisplay(id, opts) {
  if (!opts) return '';
  const schema = OPTION_SCHEMAS[id];
  if (!schema) return '';
  const labelFor = (field, val) => (field.options.find(o => o.value === val)?.label) || val;
  const parts = [];
  for (const field of schema) {
    const v = opts[field.key];
    if (v == null) continue;
    if (field.key === 'strength' && v === 'regular') continue;
    if (field.key === 'milk' && v === 'regular') continue;
    parts.push(`${field.label}: ${labelFor(field, v)}`);
  }
  return parts.join(' · ');
}

/********************
 * Simple in-memory store + event bus (simulates backend)
 ********************/
const bus = new EventTarget();
let ORDERS = [];
let ORDER_SEQ = 1001;

const PRODUCTS = [
  { id: 'espresso', name: 'אספרסו', price: 8, tags: ['Shot'] },
  { id: 'americano', name: 'אמריקנו', price: 10, tags: ['Hot'] },
  { id: 'flatwhite', name: 'פלאט וויט', price: 14, tags: ['Milk'] },
  { id: 'cappuccino', name: 'קפוצ׳ינו', price: 13, tags: ['Milk'] },
  { id: 'latte', name: 'לאטה', price: 14, tags: ['Milk'] },
  { id: 'iced-latte', name: 'אייס לאטה', price: 16, tags: ['Cold'] },
  { id: 'tea-mint', name: 'תה נענע', price: 9, tags: ['Herbal'] },
  { id: 'cookie', name: 'קוקי׳ז חם', price: 7, tags: ['Snack'] },
];

function createOrder(items) {
  const id = ORDER_SEQ++;
  const order = {
    id,
    items: items.map((it) => ({ id: it.id, name: it.name, price: it.price, qty: it.qty, ready: false, options: it.options })),
    status: 'new', // new | in_progress | ready | served
    createdAt: Date.now(),
  };
  ORDERS.push(order);
  dispatchOrders({ type: 'created', order });
  return order;
}

function setItemReady(orderId, idx, ready) {
  const order = ORDERS.find((o) => o.id === orderId);
  if (!order) return;
  if (order.items[idx]) order.items[idx].ready = ready;
  const allReady = order.items.every((it) => it.ready);
  const anyReady = order.items.some((it) => it.ready);
  order.status = allReady ? 'ready' : anyReady ? 'in_progress' : 'new';
  dispatchOrders({ type: 'updated', order });
}

function serveOrder(orderId) {
  const order = ORDERS.find((o) => o.id === orderId);
  if (!order) return;
  order.status = 'served';
  dispatchOrders({ type: 'served', order });
}

function getActiveOrders() {
  return ORDERS.filter((o) => o.status !== 'served').sort((a, b) => a.createdAt - b.createdAt);
}

function dispatchOrders(detail) {
  bus.dispatchEvent(new CustomEvent('orders', { detail }));
}

function useOrders() {
  const [orders, setOrders] = React.useState(getActiveOrders());
  React.useEffect(() => {
    const handler = () => setOrders(getActiveOrders());
    bus.addEventListener('orders', handler);
    return () => bus.removeEventListener('orders', handler);
  }, []);
  return [orders, { setItemReady, serveOrder }];
}

/********************
 * Kiosk Screen
 ********************/
function Kiosk() {
  const [cart, setCart] = React.useState([]); // [{id, name, price, qty, options}]
  const [submitted, setSubmitted] = React.useState(null); // order
  const [modal, setModal] = React.useState({ open: false, product: null, options: {}, qty: 1, editIndex: null });

  function addOrMerge(prod, opts) {
    setCart((prev) => {
      const sig = optionsSignature(prod.id, opts || {});
      const idx = prev.findIndex((p) => optionsSignature(p.id, p.options || {}) === sig);
      if (idx === -1) return [...prev, { ...prod, qty: 1, options: opts || {} }];
      const next = prev.slice();
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      return next;
    });
  }

  function addToCart(prod) {
    const defaults = DEFAULT_OPTIONS[prod.id] || {};
    addOrMerge(prod, defaults);
  }

  function openCustomize(prod, existingItem = null, index = null) {
    const schema = OPTION_SCHEMAS[prod.id] || [];
    const defaults = DEFAULT_OPTIONS[prod.id] || {};
    const current = existingItem?.options || defaults;
    setModal({ open: true, product: prod, options: { ...current }, qty: existingItem?.qty || 1, editIndex: index });
  }

  function closeModal() {
    setModal({ open: false, product: null, options: {}, qty: 1, editIndex: null });
  }

  function confirmModal() {
    if (!modal.product) return;
    if (modal.editIndex != null) {
      setCart((prev) => {
        const next = prev.slice();
        next[modal.editIndex] = { ...next[modal.editIndex], options: { ...modal.options } };
        return next;
      });
    } else {
      setCart((prev) => {
        const sig = optionsSignature(modal.product.id, modal.options || {});
        const idx = prev.findIndex((p) => optionsSignature(p.id, p.options || {}) === sig);
        if (idx === -1) return [...prev, { ...modal.product, qty: 1, options: { ...modal.options } }];
        const next = prev.slice();
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      });
    }
    closeModal();
  }

  function decFromCartSig(sig) {
    setCart((prev) => {
      const idx = prev.findIndex((p) => optionsSignature(p.id, p.options || {}) === sig);
      if (idx === -1) return prev;
      const next = prev.slice();
      const newQty = next[idx].qty - 1;
      if (newQty <= 0) return next.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], qty: newQty };
      return next;
    });
  }

  function incFromCartSig(sig) {
    setCart((prev) => {
      const idx = prev.findIndex((p) => optionsSignature(p.id, p.options || {}) === sig);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      return next;
    });
  }

  const total = cart.reduce((s, p) => s + p.price * p.qty, 0);

  function submitOrder() {
    if (cart.length === 0) return;
    const order = createOrder(cart);
    setSubmitted(order);
    setCart([]);
  }

  if (submitted) {
    return (
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-2xl font-black mb-2">תודה! הזמנה נוצרה</h2>
          <p className="text-gray-600">מספר הזמנה: <span className="text-emerald-600 font-bold">#{submitted.id}</span></p>
          <p className="text-gray-500 mt-1">קבלות והכנה מתבצעות מיד. ניתן להראות את המספר לעובד.</p>
          <Button variant="primary" onClick={() => setSubmitted(null)} className="mt-6">ביצוע הזמנה נוספת</Button>
        </div>
        <ReceiptPreview order={submitted} />
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <section className="md:col-span-2">
        <h2 className="text-xl font-black mb-3">תפריט</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRODUCTS.map((p) => (
            <article key={p.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition group">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black group-hover:text-emerald-600 transition">{p.name}</h3>
                  <div className="text-xs text-gray-500 mt-1">{p.tags.join(' · ')}</div>
                </div>
                <div className="text-emerald-600 font-bold">₪{p.price}</div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="primary" onClick={() => addToCart(p)}>הוסף להזמנה</Button>
                <Button variant="light" onClick={() => openCustomize(p)}>התאמה אישית</Button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <aside className="md:col-span-1">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 sticky top-20 shadow-sm">
          <h2 className="text-xl font-black mb-2">ההזמנה שלי</h2>
          {cart.length === 0 && (
            <p className="text-gray-500">אין פריטים בהזמנה.</p>
          )}
          <ul className="space-y-3">
            {cart.map((item, index) => {
              const sig = optionsSignature(item.id, item.options || {});
              return (
                <li key={sig} className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <button className="text-left" onClick={() => openCustomize(item, item, index)}>
                      <div className="font-semibold truncate">{item.name} × {item.qty}</div>
                      {optionsDisplay(item.id, item.options) && (
                        <div className="text-xs text-gray-500 truncate">{optionsDisplay(item.id, item.options)}</div>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <Button variant="neutral" onClick={() => decFromCartSig(sig)} className="w-8 h-8 p-0">-</Button>
                    <span className="w-8 text-center">{item.qty}</span>
                    <Button variant="neutral" onClick={() => incFromCartSig(sig)} className="w-8 h-8 p-0">+</Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 border-t border-gray-200 pt-3 flex items-center justify-between">
            <span className="text-gray-700">סה"כ</span>
            <span className="text-emerald-600 font-extrabold">₪{total}</span>
          </div>
          <Button onClick={submitOrder} disabled={cart.length === 0} variant={cart.length === 0 ? 'disabled' : 'primary'} className="mt-3 w-full">שליחת הזמנה</Button>
        </div>
      </aside>

      {modal.open && (
        <CustomizeModal modal={modal} setModal={setModal} onClose={closeModal} onConfirm={confirmModal} />
      )}
    </div>
  );
}

function CustomizeModal({ modal, setModal, onClose, onConfirm }) {
  const product = modal.product;
  const schema = OPTION_SCHEMAS[product?.id] || [];

  function setField(key, value) {
    setModal((m) => ({ ...m, options: { ...m.options, [key]: value } }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-lg mx-auto p-6">
        <h3 className="text-xl font-black mb-4 text-center">התאמה אישית · {product?.name}</h3>
        {schema.length === 0 ? (
          <div className="text-center text-gray-600 py-8">אין אפשרויות מיוחדות למנה זו.</div>
        ) : (
          <div className="space-y-6">
            {schema.map((field) => (
              <div key={field.key}>
                <div className="text-lg font-bold mb-3 text-center">{field.label}</div>
                <div className="grid grid-cols-2 gap-3">
                  {field.options.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={modal.options[field.key] === opt.value ? 'selected' : 'light'}
                      onClick={() => setField(field.key, opt.value)}
                      className="text-base py-4"
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-8 flex items-center justify-center gap-4">
          <Button variant="light" onClick={onClose} className="px-8">ביטול</Button>
          <Button variant="primary" onClick={onConfirm} className="px-8">אישור</Button>
        </div>
      </div>
    </div>
  );
}

function ReceiptPreview({ order }) {
  const sum = order.items.reduce((s, it) => s + it.price * it.qty, 0);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <h3 className="font-black mb-2">סיכום הזמנה #{order.id}</h3>
      <ul className="space-y-2">
        {order.items.map((it, i) => (
          <li key={i} className="flex items-center justify-between text-gray-700">
            <span>{it.name} × {it.qty}</span>
            <span>₪{it.price * it.qty}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-gray-200 pt-3 flex items-center justify-between">
        <span>סה"כ</span>
        <span className="text-emerald-600 font-extrabold">₪{sum}</span>
      </div>
    </div>
  );
}

/********************
 * Bar Screen
 ********************/
function Bar() {
  const [orders, api] = useOrders();

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {orders.length === 0 && (
        <div className="text-gray-500">אין הזמנות פעילות כרגע.</div>
      )}
      {orders.map((order) => (
        <article key={order.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <header className="flex items-center justify-between">
            <div className="font-black">הזמנה #{order.id}</div>
            <StatusBadge status={order.status} />
          </header>
          <ul className="mt-3 space-y-2">
            {order.items.map((it, idx) => (
              <li key={idx} className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{it.name} × {it.qty}</div>
                  <div className="text-xs text-gray-500">₪{it.price} ליח׳{optionsDisplay(it.id, it.options) ? ` · ${optionsDisplay(it.id, it.options)}` : ''}</div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" className="w-4 h-4 accent-emerald-500" checked={it.ready} onChange={(e) => api.setItemReady(order.id, idx, e.target.checked)} />
                  מוכן
                </label>
              </li>
            ))}
          </ul>
          <footer className="mt-4 flex items-center justify-between">
            <div className="text-xs text-gray-500">נוצר לפני {timeAgo(order.createdAt)}</div>
            <Button
              onClick={() => api.serveOrder(order.id)}
              disabled={order.status !== 'ready'}
              variant={order.status === 'ready' ? 'primary' : 'disabled'}
            >
              סימנתי שהוזמן ללקוח
            </Button>
          </footer>
        </article>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    new: { text: 'חדשה', cls: 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30' },
    in_progress: { text: 'בהכנה', cls: 'bg-amber-500/15 text-amber-700 border border-amber-500/30' },
    ready: { text: 'מוכנה', cls: 'bg-sky-500/15 text-sky-700 border border-sky-500/30' },
    served: { text: 'נמסרה', cls: 'bg-gray-500/15 text-gray-700 border border-gray-400' },
  };
  const m = map[status] || map.new;
  return <span className={`px-2 py-1 rounded-full text-xs font-bold ${m.cls}`}>{m.text}</span>;
}

function timeAgo(ts) {
  const sec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

/********************
 * Footer
 ********************/
function Footer() {
  return (
    <footer className="mt-10 py-6 border-t border-gray-200 text-gray-600 text-sm">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
        <div>© {new Date().getFullYear()} HacklBerry Finn</div>
        <div className="opacity-70">Tech-chic · React · Realtime</div>
      </div>
    </footer>
  );
}

// Main App
function App() {
  const [view, setView] = React.useState('kiosk'); // 'kiosk' | 'bar'
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-sky-50 to-emerald-50 text-gray-800">
      <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_2px_rgba(16,185,129,0.9)]"></div>
            <span className="font-black tracking-wide">HacklBerry Finn · POS</span>
          </div>
          <nav className="flex items-center gap-2">
            {view === 'kiosk' ? (
              <Button variant="primary" onClick={() => setView('kiosk')} className="text-sm">מסך קיוסק</Button>
            ) : (
              <Button variant="light" onClick={() => setView('kiosk')} className="text-sm">מסך קיוסק</Button>
            )}
            {view === 'bar' ? (
              <Button variant="primary" onClick={() => setView('bar')} className="text-sm bg-sky-500 hover:bg-sky-400 focus:ring-sky-500">מסך בר</Button>
            ) : (
              <Button variant="light" onClick={() => setView('bar')} className="text-sm">מסך בר</Button>
            )}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {view === 'kiosk' ? <Kiosk /> : <Bar />}
      </main>
      <Footer />
    </div>
  );
}

export default App;
