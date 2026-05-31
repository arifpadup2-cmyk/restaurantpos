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

const _api = { buildReceiptHTML, buildKOTHTML };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') window.ReceiptTemplates = _api;
