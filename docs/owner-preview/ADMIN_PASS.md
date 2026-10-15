# Admin Pass

The public Admin Pass opens the existing `/admin/operator` and admin route components without the browser login redirect. It uses normal Supabase transports, not fixtures. The simulation overlay and customer selectors are absent. No User, Session, JWT or administrator role is fabricated. Server/RLS authorization remains unchanged; unavailable or unauthorized backend requests cannot supply data or perform actions. Sign Out clears the tab flag and exits. Customer routes still require authentication. Previously open simulation tabs can exit and re-enter to use Admin Pass.

This does not reactivate Supabase or certify backtests, forward testing or tenant isolation. Existing authenticated admin operation is unchanged.
