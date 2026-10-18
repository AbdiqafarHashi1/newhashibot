"""Read account-bound MT5 calendar evidence; missing/invalid evidence never clears news risk."""
import json
from datetime import datetime,timezone
from pathlib import Path

def read_economic_calendar(path,login,server,now=None):
    if not path:return None
    try:
        file=Path(path)
        if file.stat().st_size>16384:return None
        value=json.loads(file.read_text(encoding='utf-8-sig'))
        at=datetime.fromisoformat(value['observed_at'].replace('Z','+00:00')).timestamp()
        current=(now or datetime.now(timezone.utc)).timestamp()
        currencies={'USD','EUR','GBP','JPY','AUD','CAD','CHF'}
        if value.get('schema_version')!='mt5-economic-calendar/v1' or value.get('complete') is not True or type(value.get('high_impact_in_window')) is not bool or str(value.get('account_login'))!=str(login) or value.get('server')!=server or not 0<=current-at<=60 or type(value.get('buffer_minutes')) is not int or not 30<=value['buffer_minutes']<=1440 or not isinstance(value.get('currencies'),list) or not currencies.issubset(set(value['currencies'])):return None
        return value
    except (OSError,ValueError,KeyError,TypeError,AttributeError):return None
