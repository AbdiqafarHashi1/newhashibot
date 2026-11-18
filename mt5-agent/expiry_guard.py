"""Server-bound expiry closures retain protective access after entry authorization ends."""
from datetime import datetime, timezone


def expiry_management_allowed(command, account, terminal, expected, now=None):
    proof = command.get('expiry_authorization') or {}
    payload = command.get('payload') or {}
    operation = str(command.get('operation', '')).upper()
    if operation not in ('CLOSE_POSITION', 'CANCEL_ORDER') or proof.get('authority') != 'EXECUTION_ACCESS_EXPIRED':
        return False
    if not proof.get('entitlement_id') or proof['entitlement_id'] != payload.get('expiry_entitlement_id'):
        return False
    for key in ('account_id', 'owner_id', 'bridge_id'):
        if not expected.get(key) or proof.get(key) != expected[key] or command.get(key,expected[key]) != expected[key]:
            return False
    if proof.get('command_id') != command.get('id') or proof.get('operation') != operation or not payload.get('ticket') or str(proof.get('ticket')) != str(payload['ticket']):
        return False
    try:
        if datetime.fromisoformat(proof['expires_at'].replace('Z', '+00:00')) <= (now or datetime.now(timezone.utc)):
            return False
    except (KeyError, TypeError, ValueError):
        return False
    return (account.get('connected') is True and account.get('login') == expected.get('login') and account.get('server') == expected.get('server')
            and account.get('environment') == 'demo' and account.get('trade_allowed') is True and account.get('trade_expert') is True
            and terminal.get('connected') is True and terminal.get('autotrading') is True)
