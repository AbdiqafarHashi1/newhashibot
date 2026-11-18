"""Server-bound weekend management and last-mile UTC entry checks."""
from datetime import datetime, timezone


def weekend_management_allowed(command, account, terminal, expected, now=None):
    proof = command.get('weekend_authorization') or {}
    payload = command.get('payload') or {}
    operation = str(command.get('operation', '')).upper()
    if operation not in ('CLOSE_POSITION', 'CANCEL_ORDER') or proof.get('authority') != 'WEEKEND_ROTATION':
        return False
    if proof.get('weekend_rotation')!='friday-20-sunday-21/v1' or payload.get('weekend_rotation')!=proof['weekend_rotation']:
        return False
    at=now or datetime.now(timezone.utc)
    if not(at.weekday()==4 and at.hour>=20 or at.weekday()==5 or at.weekday()==6 and at.hour<21):
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


def weekend_entry_allowed(symbol, certified=False, now=None):
    import re
    at = now or datetime.now(timezone.utc)
    weekend = at.weekday() == 4 and at.hour >= 20 or at.weekday() == 5 or at.weekday() == 6 and at.hour < 21
    return not weekend or (certified and re.fullmatch(r'(BTC|ETH|SOL)USD(?:[._-].*)?', str(symbol)) is not None)
