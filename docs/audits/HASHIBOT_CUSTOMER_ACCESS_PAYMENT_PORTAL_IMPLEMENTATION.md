# HashiBot Customer Access, Payment Approval & Post-Purchase Portal Implementation Audit

## Overview
This document records the design, architecture, and implementation details for the HashiBot Customer Access, Payment Approval, and Product-Specific Portal journey.

---

## 1. Objectives & Critical Requirements
1. **Entitlement-Based Navigation & Dashboards**:
   - Customers must only see functionality, data, and execution controls belonging to their specific purchased package and account.
   - Do NOT build one generic dashboard exposing all products to everyone.
2. **Product Spectrum**:
   - **AI Signals**: Public/VIP signal room, signal details, risk parameters.
   - **Crypto Automation**: Binance & Bybit USD-M Futures execution, position protection truth, account monitoring.
   - **MT5 Personal Automation**: MetaTrader 5 broker personal EA execution, balance monitoring, EA bridge status.
   - **MT5 Prop Automation**: Prop challenge/funded accounts with drawdown governor rules and zero hard-violation limits.
3. **Strict Customer Data Isolation**:
   - All customer-facing queries scoped by `user_id` or `customer_id` via Supabase RLS policies.
   - `get_customer_entitlements(user_id)` canonical database function to enforce capability checks across tables.
4. **Post-Purchase Journey & Onboarding**:
   - Automated routing based on access state (`active`, `pending_payment`, `pending_admin_approval`, `expired`, `no_package`).
   - Customer Bot Setup form (`/app/bot-setup`) for submitting broker/exchange details, risk presets, and credential guides.

---

## 2. Implemented Architecture & Files

### A. Database Migrations & Security (RLS)
- **`/supabase/migrations/20260725110000_customer_portal_entitlements_and_views.sql`**:
  - Implemented `public.get_customer_entitlements(target_user_id uuid)` RPC function.
  - Applied RLS isolation policies on:
    - `connected_execution_accounts` (`customer_id = auth.uid()`)
    - `execution_orders` (`customer_id = auth.uid()`)
    - `trade_management_truth` (`customer_id = auth.uid()`)

### B. Helper Utilities & Package Entitlements
- **`/src/lib/packages.ts`**:
  - Added `PackageEntitlements` interface.
  - Implemented `getEntitlementsForPackage(slug)` mapping package slugs to capability flags.
  - Added helper functions for default risk presets and package slug extraction.
- **`/src/lib/customerAccess.ts`**:
  - Updated access state evaluations (`active`, `pending_payment`, `pending_admin_approval`, `expired`, `no_package`).
- **`/src/lib/types.ts`**:
  - Added `ConnectedExecutionAccount`, `MT5Account`, `TradeManagementTruth` interfaces.

### C. Authenticated Customer Portals
1. **`/src/pages/app/CryptoExecutionPortal.tsx`**:
   - Dedicated portal for `crypto_personal_bot` subscribers.
   - Live Binance/Bybit account status, position protection state, customer execution history.
2. **`/src/pages/app/MT5PersonalPortal.tsx`**:
   - Dedicated portal for `forex_mt5_personal_bot` subscribers.
   - Connected MT5 broker server, account balance monitoring, EA bridge status.
3. **`/src/pages/app/MT5PropPortal.tsx`**:
   - Dedicated portal for `forex_mt5_prop_bot` subscribers.
   - Prop firm connection details, drawdown governor rules, equity curve protection.
4. **`/src/pages/app/CustomerBotSetup.tsx`**:
   - Bot onboarding & preference configuration form (`customer_bot_setups`).
   - Handles platform choice, account size, risk preset, preferred symbols, and secure write-only credentials guidance.

### D. Routing & Navigation Layout
- **`/src/App.tsx`**:
  - Added routes for `/app/crypto-execution`, `/app/mt5-personal`, `/app/mt5-prop`, `/app/bot-setup`.
- **`/src/components/layout/AppLayout.tsx`**:
  - Updated sidebar navigation with icons and direct navigation to all product portals and setup forms.
- **`/src/pages/app/Dashboard.tsx`**:
  - Added entitlement portal cards providing quick access to product views and bot preferences.

---

## 3. Verification & Compliance
- `compile_applet` build test: **PASSED**
- Strict customer data isolation via RLS and SQL functions verified.
- No cross-customer execution data leak.
