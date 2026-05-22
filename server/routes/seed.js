'use strict'

const express  = require('express')
const crypto   = require('crypto')
const { jwtAuth } = require('../middleware/jwtAuth')

module.exports = function seedRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  // POST /seed/demo  — full demo environment generator
  router.post('/demo', async (req, res) => {
    const { days = 30, clearExisting = false } = req.body || {}
    const log = []

    try {
      if (clearExisting) {
        await sql`DELETE FROM order_items`
        await sql`DELETE FROM orders`
        await sql`DELETE FROM expenses`
        await sql`DELETE FROM shifts`
        await sql`DELETE FROM day_closings`
        await sql`DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM audit_log LIMIT 0)`
        await sql`DELETE FROM no_sale_log`
        await sql`DELETE FROM cashiers WHERE name != 'admin'`
        await sql`DELETE FROM categories`
        await sql`DELETE FROM menu_items`
        await sql`DELETE FROM customers`
        log.push('Cleared existing demo data')
      }

      // ── 1. RESTAURANT SETTINGS ──────────────────────────────────────
      const settingsMap = {
        restaurant_name:        'Warung Makan Selera',
        branch_name:            'Main Branch — Taman Jaya',
        currency:               'RM',
        tax_rate:               '6',
        receipt_footer:         'Thank you for dining with us! Please visit again.',
        service_charge_rate:    '10',
        service_charge_label:   'Service Charge',
        mgr_discount_threshold: '15',
        require_void_reason:    '1',
        cash_variance_alert_pct:'5',
        kot_stay_seconds:       '8',
      }
      const rid = req.user?.restaurant_id || ''
      for (const [key, value] of Object.entries(settingsMap)) {
        await sql`INSERT INTO settings (restaurant_id,key,value) VALUES (${rid},${key},${value}) ON CONFLICT (restaurant_id,key) DO UPDATE SET value=EXCLUDED.value`
      }
      log.push('Restaurant settings configured')

      // ── 2. TABLES ───────────────────────────────────────────────────
      const [{ c: tblCount }] = await sql`SELECT COUNT(*)::int AS c FROM tables_layout`
      if (tblCount < 5) {
        const tables = [
          ...Array.from({ length: 10 }, (_, i) => ({ id: `tbl-d${i+1}`, name: `D${i+1}`, capacity: i < 6 ? 4 : 6 })),
          ...Array.from({ length: 4  }, (_, i) => ({ id: `tbl-v${i+1}`, name: `VIP ${i+1}`, capacity: 8 })),
          { id: 'tbl-patio1', name: 'Patio 1', capacity: 4 },
          { id: 'tbl-patio2', name: 'Patio 2', capacity: 4 },
        ]
        for (const t of tables)
          await sql`INSERT INTO tables_layout (id,name,capacity,status) VALUES (${t.id},${t.name},${t.capacity},'available') ON CONFLICT (id) DO NOTHING`
        log.push(`Seeded ${tables.length} tables`)
      }

      // ── 3. STAFF ────────────────────────────────────────────────────
      const staffList = [
        { id: 'staff-admin',  name: 'Admin',      pin: '0000', role: 'admin',    active: 1 },
        { id: 'staff-mgr1',   name: 'Razif',      pin: '1234', role: 'manager',  active: 1 },
        { id: 'staff-cash1',  name: 'Suraya',      pin: '1111', role: 'cashier',  active: 1 },
        { id: 'staff-cash2',  name: 'Hafiz',       pin: '2222', role: 'cashier',  active: 1 },
        { id: 'staff-cash3',  name: 'Nadia',       pin: '3333', role: 'cashier',  active: 1 },
        { id: 'staff-waiter1',name: 'Azman',       pin: '4444', role: 'waiter',   active: 1 },
        { id: 'staff-waiter2',name: 'Siti',        pin: '5555', role: 'waiter',   active: 1 },
      ]
      for (const s of staffList)
        await sql`INSERT INTO cashiers (id,name,pin,role,active,created_at) VALUES (${s.id},${s.name},${s.pin},${s.role},${s.active},${Date.now()}) ON CONFLICT (id) DO NOTHING`
      log.push(`Seeded ${staffList.length} staff`)

      // ── 4. MENU CATEGORIES ──────────────────────────────────────────
      const catData = [
        { id:'cat-starter',  name:'Appetizers',          color:'#f97316', sort_order:1 },
        { id:'cat-rice',     name:'Rice & Noodles',       color:'#eab308', sort_order:2 },
        { id:'cat-grill',    name:'Grilled & Fried',      color:'#ef4444', sort_order:3 },
        { id:'cat-soup',     name:'Soup & Curry',         color:'#f59e0b', sort_order:4 },
        { id:'cat-seafood',  name:'Seafood',              color:'#3b82f6', sort_order:5 },
        { id:'cat-veg',      name:'Vegetarian',           color:'#22c55e', sort_order:6 },
        { id:'cat-hot',      name:'Hot Beverages',        color:'#78716c', sort_order:7 },
        { id:'cat-cold',     name:'Cold Beverages',       color:'#06b6d4', sort_order:8 },
        { id:'cat-dessert',  name:'Desserts',             color:'#ec4899', sort_order:9 },
      ]
      for (const c of catData)
        await sql`INSERT INTO categories (id,name,color,sort_order,active) VALUES (${c.id},${c.name},${c.color},${c.sort_order},1) ON CONFLICT (id) DO NOTHING`
      log.push(`Seeded ${catData.length} categories`)

      // ── 5. MENU ITEMS ───────────────────────────────────────────────
      const itemData = [
        // Appetizers
        { id:'item-001', cat:'cat-starter',  name:'Chicken Satay (10 pcs)',     price:14.90 },
        { id:'item-002', cat:'cat-starter',  name:'Prawn Crackers',             price: 5.90 },
        { id:'item-003', cat:'cat-starter',  name:'Spring Rolls (6 pcs)',       price: 9.90 },
        { id:'item-004', cat:'cat-starter',  name:'Soup Kambing',               price:12.90 },
        // Rice & Noodles
        { id:'item-010', cat:'cat-rice',     name:'Nasi Goreng Kampung',        price:13.90 },
        { id:'item-011', cat:'cat-rice',     name:'Nasi Goreng Seafood',        price:16.90 },
        { id:'item-012', cat:'cat-rice',     name:'Mee Goreng Mamak',           price:12.90 },
        { id:'item-013', cat:'cat-rice',     name:'Char Kway Teow',             price:14.90 },
        { id:'item-014', cat:'cat-rice',     name:'Nasi Lemak Special',         price:16.90 },
        { id:'item-015', cat:'cat-rice',     name:'Nasi Biryani Ayam',          price:18.90 },
        { id:'item-016', cat:'cat-rice',     name:'Mee Rebus',                  price:11.90 },
        { id:'item-017', cat:'cat-rice',     name:'Laksa Johor',                price:13.90 },
        // Grilled & Fried
        { id:'item-020', cat:'cat-grill',    name:'Ayam Percik',                price:22.90 },
        { id:'item-021', cat:'cat-grill',    name:'Ikan Bakar Stingray',        price:28.90 },
        { id:'item-022', cat:'cat-grill',    name:'Kambing Bakar',              price:32.90 },
        { id:'item-023', cat:'cat-grill',    name:'Ayam Goreng Berempah',       price:18.90 },
        // Soup & Curry
        { id:'item-030', cat:'cat-soup',     name:'Kari Ayam',                  price:16.90 },
        { id:'item-031', cat:'cat-soup',     name:'Tom Yam Campur',             price:22.90 },
        { id:'item-032', cat:'cat-soup',     name:'Sup Tulang',                 price:19.90 },
        { id:'item-033', cat:'cat-soup',     name:'Masak Lemak Cili Api',       price:18.90 },
        // Seafood
        { id:'item-040', cat:'cat-seafood',  name:'Udang Masak Butter',         price:32.90 },
        { id:'item-041', cat:'cat-seafood',  name:'Sotong Goreng Tepung',       price:24.90 },
        { id:'item-042', cat:'cat-seafood',  name:'Ketam Masak Pedas',          price:38.90 },
        { id:'item-043', cat:'cat-seafood',  name:'Ikan Siakap 3 Rasa',        price:42.90 },
        // Vegetarian
        { id:'item-050', cat:'cat-veg',      name:'Tauhu Goreng',               price: 9.90 },
        { id:'item-051', cat:'cat-veg',      name:'Sayur Campur Goreng',        price: 8.90 },
        { id:'item-052', cat:'cat-veg',      name:'Kangkung Belacan',           price: 9.90 },
        // Hot Beverages
        { id:'item-060', cat:'cat-hot',      name:'Teh Tarik',                  price: 4.50 },
        { id:'item-061', cat:'cat-hot',      name:'Kopi O',                     price: 3.50 },
        { id:'item-062', cat:'cat-hot',      name:'Milo Panas',                 price: 4.50 },
        { id:'item-063', cat:'cat-hot',      name:'Nescafe Panas',              price: 4.50 },
        // Cold Beverages
        { id:'item-070', cat:'cat-cold',     name:'Teh Ais',                    price: 4.90 },
        { id:'item-071', cat:'cat-cold',     name:'Milo Ais',                   price: 5.50 },
        { id:'item-072', cat:'cat-cold',     name:'Air Sirap Bandung',          price: 4.50 },
        { id:'item-073', cat:'cat-cold',     name:'Fresh Limau Ais',            price: 6.90 },
        { id:'item-074', cat:'cat-cold',     name:'Coconut Shake',              price: 8.90 },
        { id:'item-075', cat:'cat-cold',     name:'Ribena Ais',                 price: 5.50 },
        // Desserts
        { id:'item-080', cat:'cat-dessert',  name:'Cendol',                     price: 6.90 },
        { id:'item-081', cat:'cat-dessert',  name:'Ice Kacang',                 price: 7.90 },
        { id:'item-082', cat:'cat-dessert',  name:'Ais Cream Goreng',           price: 9.90 },
        { id:'item-083', cat:'cat-dessert',  name:'Bubur Kacang Hijau',         price: 6.50 },
        { id:'item-084', cat:'cat-dessert',  name:'Pisang Goreng',              price: 7.90 },
      ]
      for (const i of itemData)
        await sql`INSERT INTO menu_items (id,category_id,name,price,active) VALUES (${i.id},${i.cat},${i.name},${i.price},1) ON CONFLICT (id) DO NOTHING`
      log.push(`Seeded ${itemData.length} menu items`)

      // ── 6. CUSTOMERS ────────────────────────────────────────────────
      const customerData = [
        { id:'cust-001', name:'Ahmad Farid',   phone:'0121234567', loyalty_points:150, total_spent:890.50,  visit_count:12 },
        { id:'cust-002', name:'Nurul Aina',    phone:'0112345678', loyalty_points:80,  total_spent:420.00,  visit_count:7  },
        { id:'cust-003', name:'Tan Wei Ming',  phone:'0197654321', loyalty_points:320, total_spent:1840.00, visit_count:28 },
        { id:'cust-004', name:'Priya Devi',    phone:'0168765432', loyalty_points:45,  total_spent:210.00,  visit_count:3  },
        { id:'cust-005', name:'Mohd Razif',    phone:'0133456789', loyalty_points:580, total_spent:3200.00, visit_count:45 },
      ]
      const now = Date.now()
      for (const c of customerData)
        await sql`INSERT INTO customers (id,name,phone,loyalty_points,total_spent,visit_count,created_at,updated_at)
          VALUES (${c.id},${c.name},${c.phone},${c.loyalty_points},${c.total_spent},${c.visit_count},${now},${now})
          ON CONFLICT (id) DO NOTHING`
      log.push(`Seeded ${customerData.length} customers`)

      // ── 7. HISTORICAL ORDERS (N days) ───────────────────────────────
      const cashiers  = staffList.filter(s => s.role === 'cashier' || s.role === 'manager')
      const allItems  = itemData
      const orderTypes = ['dine-in','dine-in','dine-in','takeaway','takeaway','delivery']
      const payMethods = ['cash','cash','cash','card','card']

      let totalOrders = 0
      let totalShifts = 0

      for (let d = parseInt(days); d >= 1; d--) {
        const dayStart = new Date()
        dayStart.setHours(0,0,0,0)
        dayStart.setDate(dayStart.getDate() - d)
        const dateStr = dayStart.toISOString().split('T')[0]

        // Check if day already closed
        const [existing] = await sql`SELECT id FROM day_closings WHERE date=${dateStr}`
        if (existing) continue

        // Two shifts per day: morning (07:00-15:00), evening (15:00-23:00)
        const shifts = [
          { start: new Date(dayStart.getTime() + 7*3600000),  end: new Date(dayStart.getTime() + 15*3600000), cashier: cashiers[totalShifts%cashiers.length] },
          { start: new Date(dayStart.getTime() + 15*3600000), end: new Date(dayStart.getTime() + 23*3600000), cashier: cashiers[(totalShifts+1)%cashiers.length] },
        ]

        let daySales = 0; let dayCash = 0; let dayCard = 0; let dayOrders = 0
        let dayExpenses = 0; let dayDineIn = 0; let dayTakeaway = 0; let dayDelivery = 0

        for (const sh of shifts) {
          const shiftId  = uid()
          const openCash = 200 + Math.floor(Math.random() * 300)
          await sql`INSERT INTO shifts (id,cashier_id,cashier_name,opening_cash,status,terminal_id,opened_at,closed_at,synced)
            VALUES (${shiftId},${sh.cashier.id},${sh.cashier.name},${openCash},'closed','POS-01',${sh.start.getTime()},${sh.end.getTime()},1)
            ON CONFLICT (id) DO NOTHING`
          totalShifts++

          // 8-18 orders per shift (busier evening)
          const isEvening  = sh.start.getHours() >= 15
          const orderCount = isEvening
            ? 12 + Math.floor(Math.random() * 7)
            :  6 + Math.floor(Math.random() * 6)

          for (let o = 0; o < orderCount; o++) {
            const orderId   = uid()
            const orderNum  = `${dateStr.replace(/-/g,'')}-${String(dayOrders+1).padStart(3,'0')}`
            const orderType = orderTypes[Math.floor(Math.random() * orderTypes.length)]
            const payMethod = payMethods[Math.floor(Math.random() * payMethods.length)]
            const createdAt = sh.start.getTime() + Math.floor(Math.random() * (sh.end.getTime() - sh.start.getTime()))

            // Pick 1-5 random items
            const itemCount = 1 + Math.floor(Math.random() * 4)
            const picked = shuffled(allItems).slice(0, itemCount)

            let subtotal = 0
            const orderItems = picked.map(item => {
              const qty   = 1 + Math.floor(Math.random() * 3)
              const total = parseFloat((item.price * qty).toFixed(2))
              subtotal   += total
              return { id: uid(), orderId, itemId: item.id, name: item.name, qty, price: item.price, total }
            })
            subtotal = parseFloat(subtotal.toFixed(2))

            const taxRate   = 6
            const taxAmt    = parseFloat((subtotal * taxRate / 100).toFixed(2))
            const scRate    = 10
            const scAmt     = parseFloat((subtotal * scRate / 100).toFixed(2))
            // Occasional discount (15% chance)
            let discType = 'none', discVal = 0, discAmt = 0, approvedBy = null
            if (Math.random() < 0.15) {
              discType = 'percent'
              discVal  = [5,10,15,20][Math.floor(Math.random()*4)]
              discAmt  = parseFloat((subtotal * discVal / 100).toFixed(2))
              if (discVal >= 15) approvedBy = 'Razif' // manager
            }
            const total   = parseFloat((subtotal + taxAmt + scAmt - discAmt).toFixed(2))
            const received = payMethod === 'cash' ? Math.ceil(total / 10) * 10 : total
            const change  = parseFloat((received - total).toFixed(2))

            const tableId   = orderType === 'dine-in' ? `tbl-d${1 + Math.floor(Math.random()*10)}` : null
            const tableName = tableId ? `D${tableId.replace('tbl-d','')}` : null

            await sql`INSERT INTO orders
              (id,order_number,order_type,table_id,table_name,status,subtotal,tax_rate,tax_amount,
               discount_type,discount_value,discount_amount,service_charge_rate,service_charge_amount,
               total,payment_method,payment_received,change_amount,cashier_id,cashier_name,shift_id,
               terminal_id,approved_by,created_at,updated_at,billed_at,synced)
              VALUES (${orderId},${orderNum},${orderType},${tableId},${tableName},'paid',
                ${subtotal},${taxRate},${taxAmt},${discType},${discVal},${discAmt},
                ${scRate},${scAmt},${total},${payMethod},${received},${change},
                ${sh.cashier.id},${sh.cashier.name},${shiftId},'POS-01',${approvedBy},
                ${createdAt},${createdAt},${createdAt},1)
              ON CONFLICT (id) DO NOTHING`

            for (const i of orderItems)
              await sql`INSERT INTO order_items (id,order_id,item_id,item_name,category_name,quantity,unit_price,total_price,cancelled)
                VALUES (${i.id},${i.orderId},${i.itemId},${i.name},'',${i.qty},${i.price},${i.total},0)
                ON CONFLICT (id) DO NOTHING`

            daySales   += total
            if (payMethod === 'cash') dayCash += total
            else                      dayCard += total
            if (orderType === 'dine-in')  dayDineIn++
            if (orderType === 'takeaway') dayTakeaway++
            if (orderType === 'delivery') dayDelivery++
            dayOrders++
            totalOrders++
          }

          // 1-3 expenses per shift
          const expCats = ['Ingredients','Packaging','Utilities','Cleaning','Miscellaneous']
          const expCount = 1 + Math.floor(Math.random() * 2)
          for (let e = 0; e < expCount; e++) {
            const amt = parseFloat((20 + Math.random() * 180).toFixed(2))
            dayExpenses += amt
            await sql`INSERT INTO expenses (id,category,description,amount,cashier_id,cashier_name,shift_id,terminal_id,created_at,synced)
              VALUES (${uid()},${expCats[Math.floor(Math.random()*expCats.length)]},'Daily expenses',${amt},${sh.cashier.id},${sh.cashier.name},${shiftId},'POS-01',${sh.start.getTime()},1)
              ON CONFLICT (id) DO NOTHING`
          }
        }

        // Day closing
        const net = parseFloat((daySales - dayExpenses).toFixed(2))
        const [existingDay] = await sql`SELECT id FROM day_closings WHERE date=${dateStr}`
        if (!existingDay) {
          await sql`INSERT INTO day_closings
            (id,date,total_orders,total_sales,cash_sales,card_sales,online_payment_sales,
             total_expenses,net_sales,dine_in_count,takeaway_count,delivery_count,online_count,
             closed_by,closed_at,synced)
            VALUES (${uid()},${dateStr},${dayOrders},${parseFloat(daySales.toFixed(2))},
              ${parseFloat(dayCash.toFixed(2))},${parseFloat(dayCard.toFixed(2))},0,
              ${parseFloat(dayExpenses.toFixed(2))},${net},${dayDineIn},${dayTakeaway},${dayDelivery},0,
              'Admin',${dayStart.getTime()+86399000},1)`
        }
      }
      log.push(`Generated ${totalOrders} orders across ${parseInt(days)} days`)

      // ── 8. AUDIT LOG SAMPLES ────────────────────────────────────────
      const auditSamples = [
        { action:'ORDER_CANCELLED', entity_type:'order', cashier_name:'Suraya', details:'Reason: Customer changed mind' },
        { action:'ITEM_VOIDED',     entity_type:'order_item', cashier_name:'Hafiz', details:'Reason: Wrong item ordered' },
        { action:'DISCOUNT_MGR_APPROVED', entity_type:'order', cashier_name:'Nadia', approved_by:'Razif', details:'20% discount approved' },
        { action:'NO_SALE',         entity_type:null, cashier_name:'Suraya', details:'Reason: Making change' },
        { action:'TABLE_TRANSFER',  entity_type:'order', cashier_name:'Azman', details:'Transferred from D3 to D7' },
        { action:'MGR_APPROVAL',    entity_type:null, cashier_name:'Hafiz', approved_by:'Razif', details:'Manager Razif approved: Authorize 20% discount' },
      ]
      for (const a of auditSamples)
        await sql`INSERT INTO audit_log (id,action,entity_type,entity_id,cashier_id,cashier_name,approved_by,details,terminal_id,created_at)
          VALUES (${uid()},${a.action},${a.entity_type||null},${uid()},${a.cashier_name},${a.cashier_name},${a.approved_by||null},${a.details},'POS-01',${Date.now() - Math.floor(Math.random()*7*86400000)})
          ON CONFLICT (id) DO NOTHING`
      log.push(`Seeded ${auditSamples.length} audit log entries`)

      // ── 9. NO-SALE LOG SAMPLES ──────────────────────────────────────
      const noSaleSamples = [
        { reason:'Making change',   cashier_name:'Suraya' },
        { reason:'Count drawer',    cashier_name:'Hafiz' },
        { reason:'Add float',       cashier_name:'Nadia' },
        { reason:'Manager approved',cashier_name:'Suraya', approved_by:'Razif' },
      ]
      for (const n of noSaleSamples)
        await sql`INSERT INTO no_sale_log (id,reason,cashier_id,cashier_name,terminal_id,created_at)
          VALUES (${uid()},${n.reason},${n.cashier_name},${n.cashier_name},'POS-01',${Date.now()-Math.floor(Math.random()*3*86400000)})
          ON CONFLICT (id) DO NOTHING`
      log.push(`Seeded ${noSaleSamples.length} no-sale log entries`)

      res.json({ ok: true, log, summary: { orders: totalOrders, shifts: totalShifts, days: parseInt(days) } })
    } catch (e) {
      console.error('Seed error:', e)
      res.status(500).json({ error: e.message, log })
    }
  })

  // POST /seed/clear — wipe all transactional data (keep menu/staff)
  router.post('/clear', async (req, res) => {
    try {
      await sql`DELETE FROM order_items`
      await sql`DELETE FROM orders`
      await sql`DELETE FROM expenses`
      await sql`DELETE FROM shifts`
      await sql`DELETE FROM day_closings`
      await sql`DELETE FROM audit_log`
      await sql`DELETE FROM no_sale_log`
      res.json({ ok: true, message: 'Transaction data cleared. Menu and staff retained.' })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  return router
}

// ── Helpers ───────────────────────────────────────────────────────
function uid () {
  return crypto.randomUUID()
}

function shuffled (arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
