'use strict';
// ── Shared print templates — all 80mm. 3 KOT + 3 Bill designs, Arabic-aware. ──
// Single source of truth used by the POS (pos/main.js, for printing) AND the
// server (for the Back Office live-preview endpoint), so what you preview in the
// Back Office is exactly what the POS prints. Plain JS — no Node/Electron deps.
//
// Each item may carry an Arabic name (name_ar / item_name_ar) rendered RTL.

function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _arName(i) {
  const na = i.name_ar || i.item_name_ar || i.nameAr;
  return na ? `<div dir="rtl" style="font-family:'Tahoma','Arial',sans-serif;font-weight:bold">${_esc(na)}</div>` : '';
}
function _itemName(i) { return _esc(i.name || i.item_name || ''); }
function _mods(i) {
  return Array.isArray(i.modifiers) && i.modifiers.length
    ? i.modifiers.map(m => `+ ${_esc(m.name)}`).join(', ') : '';
}

// ===== KOT =====
function buildKOTHTML(d) {
  if (d.fieldConfig) return kotConfigurable(d, d.fieldConfig);
  const fn = { 2: kotDesign2, 3: kotDesign3 }[Number(d.design)] || kotDesign1;
  return fn(d);
}
function _kotShell(inner, extraCss = '') {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box}body{font-family:monospace;padding:8px;width:300px;margin:0}
.c{text-align:center}.b{font-weight:bold}.div{border-top:2px dashed #000;margin:8px 0}
table{width:100%;border-collapse:collapse}${extraCss}</style></head><body>${inner}</body></html>`;
}
function kotDesign1(d) {   // Standard
  const type = (d.orderType||'').toUpperCase().replace('-',' ');
  const rows = (d.items||[]).map(i => `<tr style="border-bottom:1px dashed #aaa">
    <td style="font-size:16px;font-weight:bold;padding:5px 3px">${_itemName(i)}${i.variantName?` [${_esc(i.variantName)}]`:''}${_arName(i)}${_mods(i)?`<br><span style="font-size:11px;font-weight:normal">${_mods(i)}</span>`:''}${i.notes?`<br><span style="font-size:11px;font-style:italic">* ${_esc(i.notes)}</span>`:''}</td>
    <td style="font-size:16px;font-weight:bold;text-align:right;padding:5px 3px;white-space:nowrap">x${i.qty||i.quantity}</td></tr>`).join('');
  return _kotShell(`<div class="c b" style="font-size:20px;margin:6px 0">★ K O T ★</div>
${d.kotNumber?`<p class="c b" style="font-size:18px;margin:3px 0">KOT #${d.kotNumber}</p>`:''}
<p class="c" style="margin:3px 0">Order #${d.orderNumber} — ${type}</p>
<p class="c" style="margin:3px 0">${new Date(d.createdAt).toLocaleTimeString()}</p>
${d.tableName?`<p class="c b" style="font-size:15px;margin:3px 0">TABLE: ${_esc(d.tableName)}</p>`:''}
${d.customerName?`<p class="c" style="margin:3px 0">${_esc(d.customerName)}</p>`:''}
<div class="div"></div><table>${rows}</table><div class="div"></div>
<p class="c">Cashier: ${_esc(d.cashierName)}</p>`);
}
function kotDesign2(d) {   // Bold / large (busy kitchens)
  const type = (d.orderType||'').toUpperCase().replace('-',' ');
  const rows = (d.items||[]).map(i => `<div style="border-bottom:1px solid #000;padding:7px 0">
    <div style="display:flex;justify-content:space-between"><span style="font-size:19px;font-weight:bold">${_itemName(i)}</span><span style="font-size:19px;font-weight:bold">x${i.qty||i.quantity}</span></div>
    ${_arName(i)?`<div style="font-size:16px">${_arName(i)}</div>`:''}
    ${i.variantName?`<div style="font-size:13px">[${_esc(i.variantName)}]</div>`:''}${_mods(i)?`<div style="font-size:13px">${_mods(i)}</div>`:''}${i.notes?`<div style="font-size:13px;font-style:italic">* ${_esc(i.notes)}</div>`:''}</div>`).join('');
  return _kotShell(`<div class="c b" style="font-size:26px;border:3px solid #000;padding:6px;margin-bottom:6px">KITCHEN ORDER</div>
${d.tableName?`<div class="c b" style="font-size:22px;margin:4px 0">TABLE ${_esc(d.tableName)}</div>`:`<div class="c b" style="font-size:18px;margin:4px 0">${type}</div>`}
<div class="c" style="font-size:13px">#${d.orderNumber}${d.kotNumber?` · KOT ${d.kotNumber}`:''} · ${new Date(d.createdAt).toLocaleTimeString()}</div>
<div class="div"></div>${rows}<div class="div"></div>
<div class="c" style="font-size:12px">${_esc(d.cashierName)}</div>`, 'body{font-size:14px}');
}
function kotDesign3(d) {   // Compact
  const rows = (d.items||[]).map(i => `<tr><td style="padding:2px 0">${i.qty||i.quantity} × ${_itemName(i)}${_arName(i)}</td></tr>`).join('');
  return _kotShell(`<div class="c b" style="font-size:15px">KOT #${d.kotNumber||d.orderNumber}</div>
<div class="c" style="font-size:12px">${d.tableName?`T:${_esc(d.tableName)} · `:''}${new Date(d.createdAt).toLocaleTimeString()}</div>
<div class="div" style="margin:5px 0"></div><table style="font-size:14px;font-weight:bold">${rows}</table>`, 'body{font-size:12px;padding:6px}');
}

// ===== BILL =====
function buildReceiptHTML(d) {
  if (d.fieldConfig) return billConfigurable(d, d.fieldConfig);
  const fn = { 2: billDesign2, 3: billDesign3 }[Number(d.design)] || billDesign1;
  return fn(d);
}
function _payLines(d) {
  if (d.isDraft) return '';
  let s = '';
  if (Array.isArray(d.paymentLines) && d.paymentLines.length) {
    // Split payment: show each tender separately.
    for (const p of d.paymentLines)
      s += `<tr><td>Paid (${_esc(p.method)})</td><td align="right">${d.currency}${parseFloat(p.amount||0).toFixed(2)}</td></tr>`;
  } else if (d.paymentMethod) {
    s += `<tr><td>Paid (${_esc(d.paymentMethod)})</td><td align="right">${d.currency}${parseFloat(d.paymentReceived||0).toFixed(2)}</td></tr>`;
  } else {
    return '';
  }
  if (d.changeAmount > 0) s += `<tr><td>Change</td><td align="right">${d.currency}${parseFloat(d.changeAmount).toFixed(2)}</td></tr>`;
  return s;
}
function billDesign1(d) {   // Classic (monospace)
  const rows = (d.items||[]).map(i => `<tr><td>${_itemName(i)}${i.variantName?` [${_esc(i.variantName)}]`:''}${_arName(i)}${_mods(i)?`<br><span style="font-size:11px">${_mods(i)}</span>`:''}</td><td>${i.quantity}</td><td>${d.currency}${parseFloat(i.unit_price).toFixed(2)}</td><td>${d.currency}${parseFloat(i.total_price).toFixed(2)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;font-size:12px;padding:10px;width:300px;margin:0}
h2,p{text-align:center;margin:3px 0}table{width:100%;border-collapse:collapse}td,th{padding:2px 3px}.div{border-top:1px dashed #000;margin:6px 0}.bold{font-weight:bold}</style></head><body>
<h2>${_esc(d.restaurantName)}</h2>
${d.isDraft?`<p class="bold" style="border:2px dashed #000;padding:4px">** DRAFT BILL **</p>`:''}
<p>Invoice #${d.orderNumber}</p><p>${new Date(d.billedAt).toLocaleString()}</p>
<p>${(d.orderType||'').toUpperCase()} | ${_esc(d.cashierName)}</p>
${d.tableName?`<p>Table: ${_esc(d.tableName)}</p>`:''}${d.customerName?`<p>Customer: ${_esc(d.customerName)}</p>`:''}
<div class="div"></div><table><tr><th align="left">Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${rows}</table><div class="div"></div>
<table><tr><td>Subtotal</td><td align="right">${d.currency}${parseFloat(d.subtotal).toFixed(2)}</td></tr>
${d.taxAmount>0?`<tr><td>Tax(${d.taxRate}%)</td><td align="right">${d.currency}${parseFloat(d.taxAmount).toFixed(2)}</td></tr>`:''}
${d.discountAmount>0?`<tr><td>Discount</td><td align="right">-${d.currency}${parseFloat(d.discountAmount).toFixed(2)}</td></tr>`:''}
<tr class="bold"><td>TOTAL</td><td align="right">${d.currency}${parseFloat(d.total).toFixed(2)}</td></tr>${_payLines(d)}</table>
<div class="div"></div><p>${_esc(d.receiptFooter)}</p></body></html>`;
}
function billDesign2(d) {   // Modern (sans-serif, boxed total)
  const rows = (d.items||[]).map(i => `<tr style="border-bottom:1px solid #eee"><td style="padding:4px 0">${_itemName(i)} <span style="color:#666">×${i.quantity}</span>${_arName(i)}${i.variantName?`<div style="font-size:11px;color:#666">[${_esc(i.variantName)}]</div>`:''}</td><td align="right" style="padding:4px 0;white-space:nowrap">${d.currency}${parseFloat(i.total_price).toFixed(2)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;padding:10px;width:300px;margin:0}
table{width:100%;border-collapse:collapse}.c{text-align:center}</style></head><body>
<div class="c" style="font-size:20px;font-weight:800;letter-spacing:1px">${_esc(d.restaurantName)}</div>
<div class="c" style="border-top:3px solid #000;border-bottom:3px solid #000;padding:4px;margin:8px 0;font-weight:700">TAX INVOICE</div>
${d.isDraft?`<div class="c" style="font-weight:bold">** DRAFT **</div>`:''}
<div style="font-size:11px;color:#444">Invoice: <b>#${d.orderNumber}</b><br>${new Date(d.billedAt).toLocaleString()}<br>${(d.orderType||'').toUpperCase()} · Cashier: ${_esc(d.cashierName)}${d.tableName?`<br>Table: ${_esc(d.tableName)}`:''}${d.customerName?`<br>Customer: ${_esc(d.customerName)}`:''}</div>
<table style="margin-top:8px">${rows}</table>
<table style="margin-top:8px;border-top:1px dashed #000;padding-top:6px">
<tr><td>Subtotal</td><td align="right">${d.currency}${parseFloat(d.subtotal).toFixed(2)}</td></tr>
${d.taxAmount>0?`<tr><td>Tax (${d.taxRate}%)</td><td align="right">${d.currency}${parseFloat(d.taxAmount).toFixed(2)}</td></tr>`:''}
${d.discountAmount>0?`<tr><td>Discount</td><td align="right">-${d.currency}${parseFloat(d.discountAmount).toFixed(2)}</td></tr>`:''}</table>
<div style="background:#000;color:#fff;display:flex;justify-content:space-between;padding:7px 10px;margin-top:6px;font-size:16px;font-weight:800"><span>TOTAL</span><span>${d.currency}${parseFloat(d.total).toFixed(2)}</span></div>
<table style="margin-top:6px">${_payLines(d)}</table>
<div class="c" style="margin-top:10px;font-size:11px;color:#444">${_esc(d.receiptFooter)}</div></body></html>`;
}
function billDesign3(d) {   // Detailed (full invoice fields + Arabic)
  const rows = (d.items||[]).map(i => `<tr style="border-bottom:1px dotted #ccc"><td style="padding:3px 0">${_itemName(i)}${_arName(i)}${i.variantName?` [${_esc(i.variantName)}]`:''}</td><td align="center">${i.quantity}</td><td align="right">${d.currency}${parseFloat(i.unit_price).toFixed(2)}</td><td align="right">${d.currency}${parseFloat(i.total_price).toFixed(2)}</td></tr>`).join('');
  const meta = [
    ['Invoice #', d.orderNumber],
    ['Order time', d.createdAt ? new Date(d.createdAt).toLocaleString() : ''],
    ['Completed', d.completedAt ? new Date(d.completedAt).toLocaleString() : ''],
    ['Payment time', d.billedAt ? new Date(d.billedAt).toLocaleString() : ''],
    ['Order type', (d.orderType||'').toUpperCase()],
    ['Cashier', d.cashierName],
    ['Waiter', d.waiterName],
    ['Customer', d.customerName],
    ['Phone', d.customerPhone],
    ['Table', d.tableName],
  ].filter(([,v]) => v).map(([k,v]) => `<tr><td style="color:#555">${k}</td><td align="right">${_esc(v)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;padding:10px;width:300px;margin:0}
table{width:100%;border-collapse:collapse}td,th{padding:1px 2px}.c{text-align:center}.bold{font-weight:bold}</style></head><body>
<div class="c bold" style="font-size:18px">${_esc(d.restaurantName)}</div>
<div class="c bold" style="font-size:13px;margin:4px 0">TAX INVOICE</div>
${d.isDraft?`<div class="c bold">** DRAFT **</div>`:''}
<table style="margin:6px 0">${meta}</table>
<table style="border-top:1px solid #000;border-bottom:1px solid #000;margin-top:4px"><tr class="bold"><th align="left">Item</th><th>Qty</th><th align="right">Rate</th><th align="right">Amt</th></tr>${rows}</table>
<table style="margin-top:6px">
<tr><td>Gross</td><td align="right">${d.currency}${parseFloat(d.subtotal).toFixed(2)}</td></tr>
${d.discountAmount>0?`<tr><td>Discount</td><td align="right">-${d.currency}${parseFloat(d.discountAmount).toFixed(2)}</td></tr>`:''}
${d.compAmount>0?`<tr><td>Complimentary</td><td align="right">-${d.currency}${parseFloat(d.compAmount).toFixed(2)}</td></tr>`:''}
${d.cancelledAmount>0?`<tr><td style="color:#999">Cancelled (not charged)</td><td align="right" style="color:#999">${d.currency}${parseFloat(d.cancelledAmount).toFixed(2)}</td></tr>`:''}
${d.taxAmount>0?`<tr><td>Tax (${d.taxRate}%)</td><td align="right">${d.currency}${parseFloat(d.taxAmount).toFixed(2)}</td></tr>`:''}
${d.serviceChargeAmount>0?`<tr><td>Service charge</td><td align="right">${d.currency}${parseFloat(d.serviceChargeAmount).toFixed(2)}</td></tr>`:''}
<tr class="bold" style="font-size:14px;border-top:1px solid #000"><td>TOTAL</td><td align="right">${d.currency}${parseFloat(d.total).toFixed(2)}</td></tr>${_payLines(d)}</table>
<div class="c" style="margin-top:8px">${_esc(d.receiptFooter)}</div></body></html>`;
}

// ══════════════════════════════════════════════════════════════════════════
//  CONFIGURABLE TEMPLATES — Back Office controls each field's visibility + px
//  font size. Field metadata below is also consumed by the Back Office editor.
// ══════════════════════════════════════════════════════════════════════════

// [key, label, default px, default visible]
const BILL_FIELDS = [
  ['restaurantName', 'Restaurant name',      18, true],
  ['taxInvoice',     '"TAX INVOICE" label',  13, true],
  ['invoiceNumber',  'Invoice number',       11, true],
  ['orderTime',      'Order time',           11, true],
  ['completedTime',  'Completed time',       11, false],
  ['paymentTime',    'Payment time',         11, true],
  ['orderType',      'Order type',           11, true],
  ['cashier',        'Cashier',              11, true],
  ['waiter',         'Waiter',               11, true],
  ['customer',       'Customer name',        11, true],
  ['phone',          'Customer phone',       11, true],
  ['table',          'Table',                11, true],
  ['items',          'Item lines',           12, true],
  ['itemArabic',     'Arabic item name',     12, true],
  ['subtotal',       'Gross / subtotal',     12, true],
  ['discount',       'Discount',             12, true],
  ['comp',           'Complimentary',        12, true],
  ['cancelled',      'Cancelled amount',     12, true],
  ['tax',            'Tax',                  12, true],
  ['serviceCharge',  'Service charge',       12, true],
  ['total',          'Total',                15, true],
  ['payments',       'Payment breakdown',    12, true],
  ['footer',         'Footer text',          11, true],
];
const KOT_FIELDS = [
  ['title',         'Title (KOT/Kitchen)',  20, true],
  ['kotNumber',     'KOT number',           18, true],
  ['orderNumber',   'Order number',         12, true],
  ['orderType',     'Order type',           12, true],
  ['time',          'Time',                 12, true],
  ['table',         'Table',                15, true],
  ['customer',      'Customer name',        12, true],
  ['items',         'Item lines',           16, true],
  ['itemArabic',    'Arabic item name',     14, true],
  ['itemVariant',   'Variant',              11, true],
  ['itemModifiers', 'Modifiers',            11, true],
  ['itemNotes',     'Item notes',           11, true],
  ['cashier',       'Cashier',              12, true],
];

function defaultConfig(fieldList) {
  const fields = {};
  for (const [key, , size, show] of fieldList) fields[key] = { show: show, size: size };
  return { fields };
}
function getDefaultBillConfig() { return defaultConfig(BILL_FIELDS); }
function getDefaultKotConfig()  { return defaultConfig(KOT_FIELDS); }

function _merge(cfg, fieldList) {
  const out = {};
  for (const [key, , size, show] of fieldList) {
    const c = (cfg && cfg.fields && cfg.fields[key]) || {};
    out[key] = {
      show: c.show === undefined ? show : c.show !== false,
      size: parseInt(c.size, 10) || size,
    };
  }
  return out;
}

function billConfigurable(d, cfg) {
  const F   = _merge(cfg, BILL_FIELDS);
  const cur = d.currency || '';
  const sh  = k => F[k].show;
  const sz  = k => F[k].size;
  const money = v => `${cur}${parseFloat(v || 0).toFixed(2)}`;

  const meta = [
    ['invoiceNumber', 'Invoice #',    d.orderNumber],
    ['orderTime',     'Order time',   d.createdAt   ? new Date(d.createdAt).toLocaleString()   : ''],
    ['completedTime', 'Completed',    d.completedAt ? new Date(d.completedAt).toLocaleString() : ''],
    ['paymentTime',   'Payment time', d.billedAt    ? new Date(d.billedAt).toLocaleString()    : ''],
    ['orderType',     'Order type',   (d.orderType || '').toUpperCase()],
    ['cashier',       'Cashier',      d.cashierName],
    ['waiter',        'Waiter',       d.waiterName],
    ['customer',      'Customer',     d.customerName],
    ['phone',         'Phone',        d.customerPhone],
    ['table',         'Table',        d.tableName],
  ].filter(([k, , v]) => sh(k) && v)
   .map(([k, label, v]) => `<tr style="font-size:${sz(k)}px"><td style="color:#555">${label}</td><td align="right">${_esc(v)}</td></tr>`).join('');

  const itemRows = (d.items || []).map(i =>
    `<tr style="border-bottom:1px dotted #ccc;font-size:${sz('items')}px"><td style="padding:3px 0">${_itemName(i)}${sh('itemArabic') ? _arName(i) : ''}${i.variantName ? ` [${_esc(i.variantName)}]` : ''}</td><td align="center">${i.quantity}</td><td align="right">${money(i.unit_price)}</td><td align="right">${money(i.total_price)}</td></tr>`).join('');

  const totals = [
    ['subtotal',      'Gross',                    d.subtotal,            false, true],
    ['discount',      'Discount',                 d.discountAmount,      true,  d.discountAmount > 0],
    ['comp',          'Complimentary',            d.compAmount,          true,  d.compAmount > 0],
    ['cancelled',     'Cancelled (not charged)',  d.cancelledAmount,     false, d.cancelledAmount > 0],
    ['tax',           `Tax (${d.taxRate || 0}%)`, d.taxAmount,           false, d.taxAmount > 0],
    ['serviceCharge', 'Service charge',           d.serviceChargeAmount, false, d.serviceChargeAmount > 0],
  ].filter(([k, , , , cond]) => sh(k) && cond)
   .map(([k, label, v, neg]) => `<tr style="font-size:${sz(k)}px"><td>${label}</td><td align="right">${neg ? '-' : ''}${money(v)}</td></tr>`).join('');

  const totalRow = sh('total') ? `<tr style="font-size:${sz('total')}px;font-weight:800;border-top:1px solid #000"><td>TOTAL</td><td align="right">${money(d.total)}</td></tr>` : '';
  const pay = sh('payments') ? `<table style="font-size:${sz('payments')}px;margin-top:2px">${_payLines(d)}</table>` : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;padding:10px;width:300px;margin:0}
table{width:100%;border-collapse:collapse}td,th{padding:1px 2px}.c{text-align:center}.bold{font-weight:bold}</style></head><body>
${sh('restaurantName') ? `<div class="c bold" style="font-size:${sz('restaurantName')}px">${_esc(d.restaurantName)}</div>` : ''}
${sh('taxInvoice') ? `<div class="c bold" style="font-size:${sz('taxInvoice')}px;margin:4px 0">TAX INVOICE</div>` : ''}
${d.isDraft ? `<div class="c bold">** DRAFT **</div>` : ''}
<table style="margin:6px 0">${meta}</table>
<table style="border-top:1px solid #000;border-bottom:1px solid #000;margin-top:4px"><tr class="bold" style="font-size:${sz('items')}px"><th align="left">Item</th><th>Qty</th><th align="right">Rate</th><th align="right">Amt</th></tr>${itemRows}</table>
<table style="margin-top:6px">${totals}${totalRow}</table>
${pay}
${sh('footer') ? `<div class="c" style="margin-top:8px;font-size:${sz('footer')}px">${_esc(d.receiptFooter)}</div>` : ''}
</body></html>`;
}

function kotConfigurable(d, cfg) {
  const F  = _merge(cfg, KOT_FIELDS);
  const sh = k => F[k].show;
  const sz = k => F[k].size;
  const type = (d.orderType || '').toUpperCase().replace('-', ' ');

  const rows = (d.items || []).map(i => `<tr style="border-bottom:1px dashed #aaa">
    <td style="font-size:${sz('items')}px;font-weight:bold;padding:5px 3px">${_itemName(i)}${sh('itemVariant') && i.variantName ? ` [${_esc(i.variantName)}]` : ''}${sh('itemArabic') ? _arName(i) : ''}${sh('itemModifiers') && _mods(i) ? `<br><span style="font-size:${sz('itemModifiers')}px;font-weight:normal">${_mods(i)}</span>` : ''}${sh('itemNotes') && i.notes ? `<br><span style="font-size:${sz('itemNotes')}px;font-style:italic">* ${_esc(i.notes)}</span>` : ''}</td>
    <td style="font-size:${sz('items')}px;font-weight:bold;text-align:right;padding:5px 3px;white-space:nowrap">x${i.qty || i.quantity}</td></tr>`).join('');

  return _kotShell(`${sh('title') ? `<div class="c b" style="font-size:${sz('title')}px;margin:6px 0">★ K O T ★</div>` : ''}
${sh('kotNumber') && d.kotNumber ? `<p class="c b" style="font-size:${sz('kotNumber')}px;margin:3px 0">KOT #${d.kotNumber}</p>` : ''}
${sh('orderNumber') || sh('orderType') ? `<p class="c" style="font-size:${sz('orderNumber')}px;margin:3px 0">${sh('orderNumber') ? `Order #${d.orderNumber}` : ''}${sh('orderNumber') && sh('orderType') ? ' — ' : ''}${sh('orderType') ? type : ''}</p>` : ''}
${sh('time') ? `<p class="c" style="font-size:${sz('time')}px;margin:3px 0">${new Date(d.createdAt).toLocaleTimeString()}</p>` : ''}
${sh('table') && d.tableName ? `<p class="c b" style="font-size:${sz('table')}px;margin:3px 0">TABLE: ${_esc(d.tableName)}</p>` : ''}
${sh('customer') && d.customerName ? `<p class="c" style="font-size:${sz('customer')}px;margin:3px 0">${_esc(d.customerName)}</p>` : ''}
<div class="div"></div><table>${rows}</table><div class="div"></div>
${sh('cashier') ? `<p class="c" style="font-size:${sz('cashier')}px">Cashier: ${_esc(d.cashierName)}</p>` : ''}`);
}

const _api = {
  buildReceiptHTML, buildKOTHTML,
  billConfigurable, kotConfigurable,
  getDefaultBillConfig, getDefaultKotConfig,
  BILL_FIELDS, KOT_FIELDS,
};
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') window.ReceiptTemplates = _api;
