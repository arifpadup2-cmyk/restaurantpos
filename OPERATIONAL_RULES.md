# Restaurant POS - Operational Rules & Workflows

**Last Updated:** 2026-05-30  
**Version:** 2.1.0  

---

## 📋 CRITICAL RULES (Must Follow Always)

### Rule 1: Memory = Documentation (Bidirectional)
**Status:** MANDATORY ⚠️

**Rule:**
- When updating memory → MUST update this file also
- When updating this file → MUST update memory also
- Memory and documentation must stay in sync
- Never update one without the other

**Workflow:**
```
User says "update memory"
    ↓
1. Update memory files in .claude/projects/*/memory/
2. Update OPERATIONAL_RULES.md file
3. Verify both are in sync
4. Confirm to user: "✅ Memory + Documentation updated"
```

**Validation Before Each Change:**
```
Before implementing ANY change:
1. Check OPERATIONAL_RULES.md for conflicting rules
2. Check memory files for context
3. If rule exists, follow it
4. If new scenario, add new rule
5. Update both memory AND file
6. Report all changes to user
```

---

### Rule 2: Version Badge System
**Status:** MANDATORY ⚠️

**Rule:**
The version badge in POS login screen must display:

1. ✅ **Current Version** (e.g., v2.1.0)
2. ✅ **Status Indicator** (🟡 checking / ✅ up to date / 🔴 update available)
3. ✅ **Last Updated Timestamp** (YYYY-MM-DD HH:MM:SS)
4. ✅ **Countdown Timer** (Next check in: Xh Xm Xs - updates every second)

**When Checking:**
```
🟡 Checking for updates...
v2.1.0
⏳ Checking for updates...
```

**When Up to Date:**
```
✅ Up to date
v2.1.0
Last check: 2026-05-30 14:48:58
Next check: 3h 52m 14s  ← Updates every second!
```

**When Update Available:**
```
🔴 Update Available: v2.1.1
v2.1.0
Released: 2026-05-30 15:30:45
```

---

### Rule 3: Auto-Update Schedule
**Status:** MANDATORY ⚠️

**Rule:**
- Check for updates: **On every POS startup** (immediate)
- Periodic check: **Every 4 hours** (14400 seconds)
- Check interval counter: Stored in localStorage as milliseconds
- Countdown display: Updates every 1 second in version badge

**Workflow:**
```
POS Starts
    ↓
Check GitHub for new release (3-5 seconds)
    ↓
Display status in version badge:
├─ v2.1.0
├─ ✅ Up to date / 🔴 Update available
├─ Last check: 2026-05-30 14:48:58
└─ Next check: 3h 52m 14s (updates every second)
    ↓
Schedule next check in 4 hours
```

---

### Rule 4: Database Schema Constraints
**Status:** MANDATORY ⚠️

**Rule:**
- **Tables with brand_id:**
  - If data is shared across all brands: brand_id CAN be NULL or empty string ''
  - If data is per-brand: brand_id MUST be NOT NULL
  - Use CHECK constraint `CHECK (brand_id IS NOT NULL)` only for per-brand tables

**Current Status:**
- ✅ tables_layout → Can be NULL (shared global defaults)
- ✅ settings → Can be NULL (uses empty string '' for global defaults)
- ✅ brands → ALWAYS required
- ✅ outlets → ALWAYS required (has brand_id NOT NULL)
- ✅ cashiers → ALWAYS required (has brand_id NOT NULL)

**When Creating Tables:**
```
If SHARED table (defaults for all outlets):
  CREATE TABLE ... (
    brand_id TEXT,     ← Nullable
    outlet_id TEXT,    ← Nullable
    ...
  )

If PER-OUTLET table:
  CREATE TABLE ... (
    brand_id TEXT NOT NULL,
    outlet_id TEXT NOT NULL,
    ...
    CHECK (brand_id IS NOT NULL),
    FOREIGN KEY (brand_id) REFERENCES brands(id)
  )
```

---

### Rule 5: POS Setup Wizard Data Requirements
**Status:** MANDATORY ⚠️

**Rule:**
Before POS setup wizard can proceed, these MUST exist in LOCAL database:

1. **Brand Record** in `brands` table
   - Columns: id, name, email, phone, city, created_at
   - Example: id='REST-GPPE8G', name='Test Restaurant'

2. **Market Record** in `markets` table
   - Columns: id, brand_id, name, created_at
   - Example: id='MARKET-001', brand_id='REST-GPPE8G'

3. **Outlet Record** in `outlets` table
   - Columns: id, brand_id, market_id, name, outlet_code, email, address, created_at
   - Example: id='565B10A0AD', brand_id='REST-GPPE8G', market_id='MARKET-001', outlet_code='YK767P'

4. **Cashier Record** in `cashiers` table
   - Columns: id, outlet_id, brand_id, name, pin, role, active, created_at
   - Example: id='FRESH-CASHIER-001', outlet_id='565B10A0AD', pin='1111'

**Verification Workflow:**
```
POS Setup Wizard Starts
    ↓
User enters Brand ID + Outlet Code
    ↓
POS queries database:
  1. SELECT * FROM brands WHERE id = 'REST-GPPE8G'
  2. SELECT * FROM outlets WHERE outlet_code = 'YK767P' AND brand_id = 'REST-GPPE8G'
  3. SELECT * FROM markets WHERE id = outlet.market_id
    ↓
If ALL exist → Green box: "✅ Main Outlet - Test Restaurant"
If ANY missing → Error: "Brand ID and Outlet Code not found"
    ↓
If verified → Proceed to database creation
```

---

### Rule 6: Dual-Mode Architecture (LOCAL + CLOUD)
**Status:** MANDATORY ⚠️

**Rule:**
POS connection priority:

```
Priority 1: LOCAL Server (127.0.0.1:3001)
   ├─ Check health: GET /health
   ├─ If responds within 3 seconds → Use LOCAL
   └─ Repeat every 30 seconds

Priority 2: CLOUD Server (Render)
   ├─ After 3 failed LOCAL checks (90 seconds)
   ├─ Connect to: https://restaurantpos-8xew.onrender.com
   └─ Use CLOUD until LOCAL recovers

Recovery:
   ├─ Monitor LOCAL health continuously
   ├─ When LOCAL responds again
   └─ Switch back to LOCAL immediately
```

**Status Display in POS:**
```
LOCAL Mode (Primary):    🟢 Connected to LOCAL
CLOUD Mode (Failover):   🟠 Connected to CLOUD
Offline Mode:            🔴 No Connection
```

---

### Rule 7: Data Sync (LOCAL ↔ CLOUD)
**Status:** MANDATORY ⚠️

**Rule:**
- Sync interval: **Every 60 seconds**
- Sync direction: **Bidirectional**
- Data synced: Menu items, staff, settings, tables, printers
- Data NOT synced: Sales history, orders (stored locally)

**Sync Workflow:**
```
Every 60 seconds:
  ↓
LOCAL database reads:
  ├─ menu_items (modified_at > last_sync)
  ├─ staff (modified_at > last_sync)
  ├─ settings (modified_at > last_sync)
  └─ tables_layout (modified_at > last_sync)
  ↓
Send to CLOUD server
  ├─ Endpoint: POST /internal/sync
  ├─ Headers: x-api-key: pos-api-key-2026
  └─ Body: { brand_id, outlet_id, tables, staff, menu, settings }
  ↓
CLOUD responds with:
  ├─ Any updates from other outlets
  ├─ New items added in back office
  └─ Settings changes
  ↓
LOCAL receives and stores
  ↓
Repeat every 60 seconds
```

**Console Indicator:**
```
When sync succeeds:  "✅ Cloud sync completed"
When sync fails:     "⚠️ Cloud sync failed, retrying in 10s"
When using LOCAL:    "📍 Using LOCAL database"
When using CLOUD:    "☁️ Using CLOUD database"
```

---

### Rule 8: Code Changes & Validation
**Status:** MANDATORY ⚠️

**Rule:**
Before implementing ANY code change:

```
Step 1: Check Rules
  ↓ Read OPERATIONAL_RULES.md
  ↓ Check if change violates any rule
  ↓ If violation found → STOP and ask user

Step 2: Check Memory
  ↓ Read memory files in .claude/projects/*/memory/
  ↓ Verify context and constraints
  ↓ If new scenario → Create new memory

Step 3: Implement
  ↓ Make the code change
  ↓ Verify against rules again

Step 4: Update Documentation
  ↓ Update OPERATIONAL_RULES.md if rules changed
  ↓ Update memory if context changed
  ↓ Verify both are in sync

Step 5: Report
  ↓ Tell user what changed
  ↓ Confirm rules still valid
  ↓ Ask for testing
```

---

## 📊 Current System Status

| Component | Status | Rule | Details |
|-----------|--------|------|---------|
| **Version** | ✅ 2.1.0 | Rule 2, 3 | Badge shows: v2.1.0, status, timestamp, countdown |
| **POS Setup** | ✅ Ready | Rule 5 | Brand, Market, Outlet, Cashier all created |
| **LOCAL Server** | ✅ Running | Rule 6, 7 | http://127.0.0.1:3001, syncs every 60s |
| **CLOUD Server** | ✅ Running | Rule 6, 7 | restaurantpos-8xew.onrender.com, backup |
| **Database** | ✅ Valid | Rule 4, 5 | All constraints correct, no violations |
| **Auto-Update** | ✅ Integrated | Rule 3 | Checks on startup + every 4 hours |
| **Dual-Mode** | ✅ Active | Rule 6 | LOCAL primary, CLOUD failover after 3 attempts |

---

## 🔄 Workflow Examples

### Workflow 1: User Reports Issue
```
User: "Version badge not updating"
  ↓
1. Check OPERATIONAL_RULES.md (Rule 2)
  → Badge MUST show: version, status, timestamp, countdown updating every second
  ↓
2. Check memory for context
  → Found: Version badge enhanced 2026-05-30
  ↓
3. Diagnose problem
  → Check auto-update-ui.js
  → Check countdown timer function
  → Check localStorage
  ↓
4. Fix code
  ↓
5. Update OPERATIONAL_RULES.md if needed
  ↓
6. Update memory files
  ↓
7. Report: "✅ Fixed. Badge now updates every second"
```

### Workflow 2: User Wants New Feature
```
User: "Add live order counter to version badge"
  ↓
1. Check OPERATIONAL_RULES.md (Rule 2)
  → Rule 2 defines what version badge MUST show
  → Adding order counter would violate Rule 2
  ↓
2. Check memory for constraints
  → Found: Version badge is minimal status display
  ↓
3. Ask user: "This would change Rule 2. Approve?"
  ↓
4. If approved:
  → Update Rule 2 in OPERATIONAL_RULES.md
  → Update memory files
  → Implement feature
  → Test
  → Report changes
  ↓
5. If not approved:
  → Explain: "Would clutter version badge as per Rule 2"
  → Suggest alternative: "Show in separate status panel?"
```

### Workflow 3: Update Memory
```
User: "Update memory with new findings"
  ↓
1. Update memory files (.claude/projects/*/memory/*.md)
  ↓
2. ALSO update OPERATIONAL_RULES.md
  → Add to relevant section
  → Update status table
  ↓
3. If workflow changed:
  → Add to Workflow Examples section
  → Update all related rules
  ↓
4. Verify sync:
  → Memory files ✅
  → OPERATIONAL_RULES.md ✅
  ↓
5. Report: "✅ Memory + Documentation updated
   - Updated: X rules
   - Added: Y workflows
   - Changed: Z details"
```

---

## 🚨 Rules That Cannot Be Broken

| Rule | Why | Violation Cost |
|------|-----|-----------------|
| **Rule 1: Memory ↔ Docs** | Keep documentation accurate across sessions | Lost context, repeated work, confusion |
| **Rule 2: Version Badge** | Users need to know system is checking updates | Users think app is frozen or outdated |
| **Rule 3: Auto-Update** | Consistent update experience | Users miss critical security patches |
| **Rule 4: DB Constraints** | Data integrity | Database errors, failed setup wizard |
| **Rule 5: Setup Data** | POS can't start without brand/outlet | "Brand ID not found" error loop |
| **Rule 6: Dual-Mode** | Offline fallback | Restaurant POS goes down when LOCAL server restarts |
| **Rule 7: Data Sync** | Multi-outlet consistency | Back office changes don't reach POS for hours |

---

## ✅ Validation Checklist

Before deploying ANY change:

- [ ] Read OPERATIONAL_RULES.md top to bottom
- [ ] Check memory files for context
- [ ] Identify which rules apply to this change
- [ ] Verify code follows all applicable rules
- [ ] Update OPERATIONAL_RULES.md if rules changed
- [ ] Update memory files if context changed
- [ ] Run tests against rules
- [ ] Report all changes to user
- [ ] Get user confirmation

---

**Status:** 🟢 All rules active and enforced  
**Last Validated:** 2026-05-30 15:00  
**Next Review:** When any rule is violated or new feature requested

