import type { MT5Health } from '../../../services/mt5-platform/index.js';
export function renderCustomerMT5Status(health: MT5Health[]) { return { title:'MT5 Connections', sections:['Bridge setup','Terminal status','Account status','Protection status','Recovery actions'], health }; }
export function renderAdminMT5Managers(health: MT5Health[]) { return { title:'MT5 Admin Center', sections:['Bridge Manager','Agent Manager','Terminal Manager','Version Manager','Bridge diagnostics','Recovery Center','Health Center'], health }; }
