'use strict';
/**
 * POS LOAD TEST — simulates a busy restaurant
 * Target: 20-25 orders / minute for ~3 minutes
 * Mix: dine-in, takeaway | cash, card, UPI | add-ons, extra items to open orders
 * Strategy: direct PostgreSQL inserts via db.run() — avoids UI bottlenecks
 */
const { _electron: electron } = require('C:/Users/Lenovo/node_modules/playwright');
const path = require('path');

const BASE = 'D:/sofwtares/RESTAURANT POS';
const EXEC = path.join(BASE, 'pos/node_modules/electron/dist/electron.exe');
const APP  = path.join(BASE, 'pos');

// ── Test Data ─────────────────────────────────────────────────
const CUSTOMERS = [
  { name:'Ahmad Razif',     phone:'0123456789' },
  { name:'Siti Nora',       phone:'0198765432' },
  { name:'Raj Kumar',       phone:'0112233445' },
  { name:'Wong Wei Lin',    phone:'0165544332' },
  { name:'Fatimah Binti A', phone:'0134455667' },
  { name:'David Lim',       phone:'0167788990' },
  { name:'Priya Devi',      phone:'0189900112' },
  { name:'Hassan Omar',     phone:'0143322110' },
  { name:'Mei Ling',        phone:'0121100998' },
  { name:'Kamal Idris',     phone:'0178800234' },
];
const PAY_METHODS = ['cash','cash','cash','card','other']; // weighted toward cash
const ORDER_TYPES = ['takeaway','takeaway','dine-in','dine-in','takeaway']; // mix

let stats = { created:0, paid:0, addedItems:0, errors:0, byType:{}, byPay:{}, revenue:0 };
function rnd(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pick(arr){ return arr[rnd(0,arr.length-1)]; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ── Main ──────────────────────────────────────────────────────
(async () => {
  console.log('🚀 Launching POS for load test...');
  const app = await electron.launch({ executablePath: EXEC, args:['.'], cwd: APP });
  const win  = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(3000);

  // ── Login ────────────────────────────────────────────────
  console.log('🔑 Logging in (PIN 1234)...');
  await win.evaluate(() => { const c = document.querySelector('.cashier-chip'); if(c) c.click(); });
  await win.waitForTimeout(500);
  for (const d of ['1','2','3','4']) {
    await win.evaluate(d => { if(typeof pinKey==='function') pinKey(d); }, d);
    await win.waitForTimeout(150);
  }
  await win.waitForTimeout(5000);

  // ── Verify login ──────────────────────────────────────────
  const ctx = await win.evaluate(async () => {
    // Get open shift from DB (authoritative)
    const sr = await db.get("SELECT id,cashier_id,outlet_id,brand_id FROM shifts WHERE status='open' LIMIT 1");
    const or = await db.get('SELECT id,brand_id FROM outlets LIMIT 1');
    return {
      cashier: cashier?.name || null,
      cashierId: cashier?.id || null,
      shiftId: (sr.ok && sr.data) ? sr.data.id : shift?.id,
      outletId: (or.ok && or.data) ? or.data.id : null,
      brandId:  (or.ok && or.data) ? or.data.brand_id : null,
      items: (menu?.items||[]).filter(i=>i.active!==0).map(i=>({id:i.id,name:i.name,price:i.price,category_name:i.category_name||''})),
    };
  });
  if (!ctx.cashier) { console.error('❌ Login failed'); await app.close(); return; }
  console.log(`✅ Login: cashier=${ctx.cashier}, shift=${ctx.shiftId?.substring(0,8)}, menu=${ctx.items.length} items`);
  if (!ctx.items.length) { console.error('❌ No menu items'); await app.close(); return; }

  // Get tables from DB
  const tablesRes = await win.evaluate(async () => {
    const r = await db.all("SELECT id,name FROM tables_layout WHERE active=1 LIMIT 6");
    return r.ok ? r.data : [];
  });
  console.log(`📋 Tables: ${tablesRes.map(t=>t.name).join(', ')||'none'}`);
  console.log(`🍔 Menu: ${ctx.items.map(i=>i.name).join(', ')}`);

  const { cashierId, shiftId, outletId, brandId, items: menuItems } = ctx;
  let orderCounter = 0;

  // ── Load Test ─────────────────────────────────────────────
  const DURATION_MS    = 3 * 60 * 1000;
  const TARGET_PER_MIN = 22;
  const INTERVAL_MS    = Math.floor(60000 / TARGET_PER_MIN);
  const startTime      = Date.now();
  const openOrders     = []; // unpaid dine-in orders

  console.log(`\n⏱️  Running ${TARGET_PER_MIN} orders/min for 3 minutes (~${TARGET_PER_MIN*3} total)\n`);
  console.log('Time'.padEnd(8),'Order'.padEnd(7),'Type'.padEnd(10),'Customer'.padEnd(18),'Items'.padEnd(6),'Pay'.padEnd(8),'Total'.padEnd(9),'Status');
  console.log('─'.repeat(80));

  while (Date.now() - startTime < DURATION_MS) {
    const elapsed    = Math.floor((Date.now() - startTime) / 1000);
    const iterStart  = Date.now();
    orderCounter++;

    // Every 6th order (with open orders): add items to open dine-in + pay it
    const doAddPay = openOrders.length > 0 && orderCounter % 6 === 0;

    if (doAddPay) {
      const target   = openOrders[rnd(0, openOrders.length-1)];
      const addCount = rnd(1,2);
      const payM     = pick(PAY_METHODS);

      try {
        // Insert additional items
        const addItems = Array.from({length:addCount}, (_,i) => menuItems[rnd(0,menuItems.length-1)]);
        let addTotal = 0;
        const addItemRes = await win.evaluate(async (cfg) => {
          const now = Date.now();
          let sub = 0;
          for (const it of cfg.items) {
            const price = parseFloat(it.price)||0;
            sub += price * it.qty;
            const iid = uid();
            await db.run(
              'INSERT INTO order_items (id,order_id,item_id,item_name,category_name,quantity,unit_price,total_price,done,cancelled,comp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,0,0)',
              [iid, cfg.orderId, it.id, it.name, it.category_name||'', it.qty, price, price*it.qty]
            );
          }
          // Update order totals
          const cur = await db.get('SELECT subtotal,total FROM orders WHERE id=$1', [cfg.orderId]);
          if (cur.ok && cur.data) {
            const newSub = parseFloat(cur.data.subtotal||0) + sub;
            const newTot = parseFloat(cur.data.total||0) + sub;
            await db.run('UPDATE orders SET subtotal=$1,total=$2,updated_at=$3 WHERE id=$4', [newSub, newTot, now, cfg.orderId]);
          }
          return { sub };
        }, { orderId: target.orderId, items: addItems.map(m=>({id:m.id,name:m.name,price:m.price,category_name:m.category_name,qty:rnd(1,2)})) });

        stats.addedItems++;
        console.log(
          `${elapsed}s`.padEnd(8), `+#${target.orderNum}`.padEnd(7),
          'ADD ITEMS'.padEnd(10), target.customerName.padEnd(18),
          `+${addCount}x`.padEnd(6), '—'.padEnd(8), '—'.padEnd(9), '✅ added'
        );

        // Now pay
        const payRes = await win.evaluate(async (cfg) => {
          const cur = await db.get('SELECT total FROM orders WHERE id=$1', [cfg.orderId]);
          const total = cur.ok && cur.data ? parseFloat(cur.data.total||0) : 0;
          const m = cfg.payM==='other'?'UPI':cfg.payM;
          const recv = cfg.payM==='cash' ? cfg.cashG : total;
          const chg  = cfg.payM==='cash' ? Math.max(0,recv-total) : 0;
          const now  = Date.now();
          await db.run(
            "UPDATE orders SET status='paid',payment_method=$1,payment_received=$2,change_amount=$3,billed_at=$4,updated_at=$5,synced=0 WHERE id=$6",
            [m, recv, chg, now, now, cfg.orderId]
          );
          if (cfg.tableId) {
            await db.run("UPDATE tables_layout SET status='available',current_order_id=NULL WHERE id=$1",[cfg.tableId]);
          }
          await loadActiveOrders();
          await loadTables();
          return { total };
        }, { orderId:target.orderId, tableId:target.tableId, payM, cashG:Math.ceil((target.total*1.1+addItemRes.sub*1.1)/5)*5+5 });

        openOrders.splice(openOrders.indexOf(target), 1);
        stats.paid++;
        stats.revenue += payRes.total;
        stats.byPay[payM] = (stats.byPay[payM]||0)+1;
        console.log(
          `${elapsed}s`.padEnd(8), `💳#${target.orderNum}`.padEnd(7),
          'PAY'.padEnd(10), target.customerName.padEnd(18),
          '—'.padEnd(6), payM.padEnd(8),
          `RM ${parseFloat(payRes.total).toFixed(2)}`.padEnd(9), '✅ paid'
        );
      } catch(e) {
        stats.errors++;
        console.log(`${elapsed}s`.padEnd(8),'ADD/PAY'.padEnd(7),'ERR'.padEnd(10),
          String(e.message).substring(0,50));
      }

    } else {
      // ── Create a new order ───────────────────────────────
      const orderType = pick(ORDER_TYPES);
      const customer  = pick(CUSTOMERS);
      const payM      = pick(PAY_METHODS);
      const kotOnly   = orderType === 'dine-in' && openOrders.length < 5;
      const itemCount = rnd(1,4);
      const pickedItems = Array.from({length:itemCount}, () => ({
        ...menuItems[rnd(0,menuItems.length-1)],
        qty: rnd(1,3)
      }));

      let tableId = null, tableName = null;
      if (orderType === 'dine-in' && tablesRes.length) {
        const t = pick(tablesRes);
        tableId = t.id; tableName = t.name;
      }

      try {
        const result = await win.evaluate(async (cfg) => {
          const now      = Date.now();
          const orderId  = uid();
          const orderNum = 'ORD-' + now.toString(36).toUpperCase().slice(-6);
          let subtotal = 0;

          // Insert order
          await db.run(
            `INSERT INTO orders (id,order_number,order_type,table_id,table_name,customer_name,customer_phone,
              status,subtotal,tax_rate,tax_amount,discount_amount,total,cashier_id,cashier_name,shift_id,
              outlet_id,brand_id,created_at,updated_at,synced)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,0,$9,$10,$11,$12,$13,$14,$15,$15,0)`,
            [orderId, orderNum, cfg.orderType, cfg.tableId||null, cfg.tableName||null,
             cfg.customer.name, cfg.customer.phone, 'open', 0,
             cfg.cashierId, cfg.cashierName, cfg.shiftId, cfg.outletId, cfg.brandId, now]
          );

          // Insert items
          for (const it of cfg.items) {
            const price = parseFloat(it.price)||0;
            subtotal += price * it.qty;
            await db.run(
              'INSERT INTO order_items (id,order_id,item_id,item_name,category_name,quantity,unit_price,total_price,done,cancelled,comp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,0,0)',
              [uid(), orderId, it.id, it.name, it.category_name||'', it.qty, price, price*it.qty]
            );
          }

          // Update subtotal/total on order
          await db.run('UPDATE orders SET subtotal=$1,total=$1 WHERE id=$2', [subtotal, orderId]);

          // Mark table occupied (dine-in)
          if (cfg.tableId) {
            await db.run("UPDATE tables_layout SET status='occupied',current_order_id=$1 WHERE id=$2", [orderId, cfg.tableId]);
          }

          // If paying immediately: mark paid
          if (!cfg.kotOnly) {
            const m = cfg.payM==='other'?'UPI':cfg.payM;
            const recv = cfg.payM==='cash' ? cfg.cashG : subtotal;
            const chg  = cfg.payM==='cash' ? Math.max(0,recv-subtotal) : 0;
            await db.run(
              "UPDATE orders SET status='paid',payment_method=$1,payment_received=$2,change_amount=$3,billed_at=$4,updated_at=$4 WHERE id=$5",
              [m, recv, chg, now, orderId]
            );
            if (cfg.tableId) {
              await db.run("UPDATE tables_layout SET status='available',current_order_id=NULL WHERE id=$1",[cfg.tableId]);
            }
          }

          await loadActiveOrders();
          await loadTables();
          return { orderId, orderNum, subtotal };
        }, {
          orderType, tableId, tableName,
          customer, items: pickedItems,
          cashierId, cashierName: ctx.cashier, shiftId, outletId, brandId,
          kotOnly, payM,
          cashG: Math.ceil((pickedItems.reduce((s,i)=>(s+parseFloat(i.price||0)*i.qty),0)*1.15)/5)*5
        });

        stats.created++;
        stats.byType[orderType] = (stats.byType[orderType]||0)+1;

        if (kotOnly) {
          openOrders.push({ orderId:result.orderId, orderNum:result.orderNum,
            customerName:customer.name, tableId, total:result.subtotal });
          console.log(
            `${elapsed}s`.padEnd(8), `#${result.orderNum}`.padEnd(7),
            orderType.padEnd(10), customer.name.padEnd(18),
            `${itemCount}x`.padEnd(6), 'OPEN'.padEnd(8),
            `RM ${parseFloat(result.subtotal).toFixed(2)}`.padEnd(9), '🍽️ KOT'
          );
        } else {
          stats.paid++;
          stats.revenue += result.subtotal;
          stats.byPay[payM] = (stats.byPay[payM]||0)+1;
          console.log(
            `${elapsed}s`.padEnd(8), `#${result.orderNum}`.padEnd(7),
            orderType.padEnd(10), customer.name.padEnd(18),
            `${itemCount}x`.padEnd(6), payM.padEnd(8),
            `RM ${parseFloat(result.subtotal).toFixed(2)}`.padEnd(9), '✅'
          );
        }

      } catch(e) {
        stats.errors++;
        console.log(
          `${elapsed}s`.padEnd(8), 'ERR'.padEnd(7), orderType.padEnd(10),
          customer.name.padEnd(18), '—'.padEnd(6),'—'.padEnd(8),'—'.padEnd(9),
          `❌ ${e.message.substring(0,50)}`
        );
      }
    }

    // Throttle to target rate
    const took = Date.now() - iterStart;
    if (took < INTERVAL_MS) await sleep(INTERVAL_MS - took);
  }

  // ── Final summary ─────────────────────────────────────────
  const duration = Math.round((Date.now() - startTime) / 1000);
  const dbStats  = await win.evaluate(async (sid) => {
    const r1 = await db.get("SELECT COUNT(*) as n, SUM(total) as rev FROM orders WHERE status='paid' AND shift_id=$1", [sid]);
    const r2 = await db.get("SELECT COUNT(*) as n FROM orders WHERE status='open' AND shift_id=$1", [sid]);
    return { paid: r1.ok?r1.data:null, open: r2.ok?r2.data:null };
  }, shiftId);

  console.log('\n' + '═'.repeat(80));
  console.log('LOAD TEST COMPLETE');
  console.log('═'.repeat(80));
  console.log(`Duration        : ${duration}s (${(duration/60).toFixed(1)} min)`);
  console.log(`Orders created  : ${stats.created}`);
  console.log(`Orders paid     : ${stats.paid}`);
  console.log(`Add-item actions: ${stats.addedItems}`);
  console.log(`Errors          : ${stats.errors}`);
  console.log(`Avg rate        : ${((stats.created+stats.addedItems)/duration*60).toFixed(1)} orders/min`);
  console.log(`By type         : ${JSON.stringify(stats.byType)}`);
  console.log(`By payment      : ${JSON.stringify(stats.byPay)}`);
  console.log(`Revenue (mem)   : RM ${stats.revenue.toFixed(2)}`);
  if (dbStats.paid) console.log(`DB paid orders  : ${dbStats.paid.n} (RM ${parseFloat(dbStats.paid.rev||0).toFixed(2)} total)`);
  if (dbStats.open) console.log(`DB open orders  : ${dbStats.open.n}`);
  console.log('═'.repeat(80));

  await app.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
