"""Only a server-bound close/cancel may use management permissions after entry pause."""
from datetime import datetime, timezone

def profit_cutoff_management_allowed(command, account, terminal, expected, now=None):
    g=command.get('profit_guard_authorization') or {}
    payload=command.get('payload') or {}
    operation=str(command.get('operation','')).upper()
    if operation not in ('CLOSE_POSITION','CANCEL_ORDER') or g.get('authority')!='PROP_PROFIT_CUTOFF':
        return False
    if not g.get('cycle_id') or g.get('cycle_id')!=payload.get('prop_profit_cycle_id'):
        return False
    for k in ('account_id','owner_id','bridge_id'):
        if not expected.get(k) or g.get(k)!=expected[k] or (command.get(k) is not None and command[k]!=expected[k]):
            return False
    if g.get('command_id')!=command.get('id') or g.get('operation')!=operation or not payload.get('ticket') or str(g.get('ticket'))!=str(payload['ticket']):
        return False
    try:
        if datetime.fromisoformat(g['expires_at'].replace('Z','+00:00')) <= (now or datetime.now(timezone.utc)):
            return False
    except (KeyError,TypeError,ValueError):
        return False
    return (account.get('connected') is True and account.get('login')==expected.get('login') and account.get('server')==expected.get('server')
            and account.get('environment')=='demo' and account.get('trade_allowed') is True and account.get('trade_expert') is True
            and terminal.get('connected') is True and terminal.get('autotrading') is True)
