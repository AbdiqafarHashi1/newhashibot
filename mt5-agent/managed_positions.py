"""Execute one approved two-leg plan once; retain native protection and manage its runner.

The journal contains no credentials. An uncertain send is never automatically repeated.
Only source-confirmed TP1 exits allow breakeven on that plan's exact remaining ticket.
"""
import hashlib
import json
import math
import os
import time
from pathlib import Path
from config import Config


class ManagedPositions:
    def __init__(self, client, cloud, directory=None):
        self.client, self.cloud = client, cloud
        scope = hashlib.sha256(f"{Config.OWNER_ID}:{Config.ACCOUNT_ID}:{Config.BRIDGE_ID}".encode()).hexdigest()[:24]
        self.directory = Path(directory or os.getenv('HASHIBOT_STATE_DIR', 'hashibot-state')) / scope

    def _scope(self):
        info = self.client.get_account_info()
        if Config.DATA_ONLY or info.get('environment') != 'demo' or info.get('login') != Config.ACCOUNT_NUMBER or info.get('server') != Config.SERVER:
            raise RuntimeError('MANAGED_POSITION_TERMINAL_SCOPE_REQUIRED')
        return info

    def _save(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix('.pending')
        with open(temporary, 'w', encoding='utf8') as stream:
            json.dump(value, stream, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)

    def _position(self, leg, positions):
        rows = [p for p in positions if p['comment'] == leg['comment'] and p['symbol'] == leg['symbol'] and p['side'].lower() == leg['side'].lower()]
        if len(rows) > 1:
            raise RuntimeError('AMBIGUOUS_MANAGED_POSITION')
        if rows and leg.get('position_id') and str(rows[0]['ticket']) != str(leg['position_id']):
            raise RuntimeError('MANAGED_POSITION_ID_CHANGED')
        return rows[0] if rows else None

    def execute(self, command_id, payload):
        account = self._scope()
        if account.get('hedging') is not True:
            raise RuntimeError('MT5_TWO_TARGETS_REQUIRE_HEDGING_DEMO')
        children = payload.get('native_child_orders')
        if not payload.get('certified') or not isinstance(children, list) or len(children) != 2:
            raise RuntimeError('CERTIFIED_TWO_LEG_PLAN_REQUIRED')
        quantity = float(payload['quantity'])
        if not math.isfinite(quantity) or quantity <= 0 or abs(sum(float(c['quantity']) for c in children) - quantity) > 1e-9:
            raise RuntimeError('CHILD_APPROVED_QUANTITY_MISMATCH')
        legs = []
        for index, child in enumerate(children):
            if child.get('action','market') != 'market':
                raise RuntimeError('MT5_AUTOMATIC_MARKET_ENTRY_REQUIRED')
            if child.get('role') != ('ENTRY_TP1' if index == 0 else 'ENTRY_TP2') or child['symbol'] != payload['symbol'] or child['side'].upper() != payload['side'] or float(child['sl']) != float(payload['stop_loss']) or float(child['tp']) != float(payload['take_profit_1' if index == 0 else 'take_profit_2']):
                raise RuntimeError('CHILD_PROTECTION_LINEAGE_MISMATCH')
            if not all(math.isfinite(float(child[k])) and float(child[k]) > 0 for k in ('quantity','sl','tp')):
                raise RuntimeError('INVALID_CHILD_PLAN')
            spec = self.client.get_symbol_info(child['symbol'])
            if not spec or abs(self.client.normalize_volume(float(child['quantity']), spec['volume_min'], spec['volume_max'], spec['volume_step']) - float(child['quantity'])) > 1e-9:
                raise RuntimeError('CHILD_VOLUME_NOT_PROVIDER_EXACT')
            comment = 'hb:' + hashlib.sha256(str(child['client_order_id']).encode()).hexdigest()[:24]
            tick=float(spec['tick_size'])
            if not math.isfinite(tick) or tick<=0:
                raise RuntimeError('NATIVE_TICK_SIZE_REQUIRED')
            buy=child['side'].lower()=='buy'
            stop=(math.ceil(float(child['sl'])/tick-1e-9) if buy else math.floor(float(child['sl'])/tick+1e-9))*tick
            target=(math.floor(float(child['tp'])/tick+1e-9) if buy else math.ceil(float(child['tp'])/tick-1e-9))*tick
            legs.append({**child, 'sl':round(stop,spec['digits']), 'tp':round(target,spec['digits']), 'symbol':spec['broker_symbol'], 'comment':comment, 'state':'NEW'})
        key = hashlib.sha256(str(payload['phase_d_intent_id']).encode()).hexdigest()
        path = self.directory / (key + '.json')
        if path.exists():
            record = json.loads(path.read_text())
            if record['payload'] != payload:
                raise RuntimeError('MANAGED_PLAN_CONTENT_CHANGED')
            return record['result']  # No re-submission after restart or an uncertain request.
        current = self.client.get_positions()
        history = self.client.get_history()
        if not isinstance(history,list):
            raise RuntimeError('NATIVE_PLAN_HISTORY_UNAVAILABLE')
        if any(p.get('comment') in {l['comment'] for l in legs} for p in current + history):
            raise RuntimeError('NATIVE_PLAN_EXISTS_JOURNAL_RECONCILIATION_REQUIRED')
        record = {'command_id':command_id,'payload':payload,'legs':legs,'result':{'success':True,'lifecycle_event':'SUBMISSION_UNCERTAIN'},'completed':False}
        self._save(path, record)
        for leg in legs:
            leg['state'] = 'SUBMITTING'
            self._save(path, record)
            result = self.client.place_order({**leg,'volume':leg['quantity']})
            leg['receipt'] = result
            if not result.get('success'):
                leg['state'] = 'UNCERTAIN_OR_REJECTED'
                record['result'] = {'success':True,'lifecycle_event':'PARTIAL_FILL' if any(l.get('position_id') for l in legs) else 'SUBMISSION_UNCERTAIN','children':legs,'error_code':'CHILD_SUBMISSION_REQUIRES_RECONCILIATION'}
                self._save(path, record)
                return record['result']
            position = self._position(leg, self.client.get_positions())
            if not position or float(position['quantity']) > float(leg['quantity']) + 1e-9:
                leg['state'] = 'RECONCILIATION_REQUIRED'
                record['result'] = {'success':True,'lifecycle_event':'SUBMISSION_UNCERTAIN','children':legs}
                self._save(path, record)
                return record['result']
            leg['position_id'], leg['entry_price'], leg['filled_quantity'] = str(position['ticket']),float(position['entry_price']),float(position['quantity'])
            if not position.get('sl') or not position.get('tp') or (float(position['sl'])+1e-8<float(leg['sl']) if leg['side'].lower()=='buy' else float(position['sl'])-1e-8>float(leg['sl'])) or abs(float(position['tp'])-float(leg['tp'])) > 1e-8:
                leg['state'] = 'PROTECTION_INCIDENT'
                record['result'] = {'success':True,'lifecycle_event':'PROTECTION_MISSING','children':legs}
                self._save(path, record)
                return record['result']
            leg['state'] = 'PROTECTED'
            self._save(path, record)
            if abs(leg['filled_quantity']-float(leg['quantity'])) > 1e-9:
                record['result'] = {'success':True,'lifecycle_event':'PARTIAL_FILL','children':legs}
                self._save(path, record)
                return record['result']
        record['result'] = {'success':True,'lifecycle_event':'PROTECTION_CONFIRMED','children':legs,'provider_position_ids':[l['position_id'] for l in legs]}
        self._save(path, record)
        return record['result']

    def monitor(self):
        self._scope()
        if not self.directory.exists():
            return
        positions = self.client.get_positions()
        for path in self.directory.glob('*.json'):
            record = json.loads(path.read_text())
            if record.get('completed') and record.get('reported_lifecycle') == record['result'].get('lifecycle_event'):
                continue
            legs = record['legs']
            for leg in legs:
                position = self._position(leg, positions)
                if not position:
                    continue
                leg['position_id'] = str(position['ticket'])
                # Repair absent protection without loosening a better existing stop.
                current_stop = float(position.get('sl') or 0)
                buy = leg['side'].lower() == 'buy'
                target = float(leg['sl'])
                safe_stop = max(current_stop,target) if buy else min(current_stop,target) if current_stop else target
                if not current_stop or not position.get('tp'):
                    leg.setdefault('protection_incident_at',time.time())
                    self.client.modify_position(str(position['ticket']), sl=safe_stop, tp=leg['tp'])
                    if time.time()-leg['protection_incident_at']>30:
                        self.client.close_position(str(position['ticket']),volume=None)
                    record['result']={'success':True,'lifecycle_event':'PROTECTION_MISSING','children':legs}
            first, runner = legs
            first_open = self._position(first, positions)
            runner_open = self._position(runner, positions)
            if not first_open and first.get('position_id'):
                deals = self.client.position_deals(first['position_id'])
                closed = sum(float(d['volume']) for d in deals if d.get('is_tp_exit') and str(d['position_id']) == first['position_id'])
                if closed + 1e-9 >= float(first.get('filled_quantity', first['quantity'])):
                    record['result']={'success':True,'lifecycle_event':'TP1_FILLED','children':legs}
                    if runner_open:
                        entry = float(runner_open['entry_price'])
                        stop = float(runner_open.get('sl') or 0)
                        better = stop >= entry if runner['side'].lower() == 'buy' else 0 < stop <= entry
                        if not better:
                            self.client.modify_position(str(runner_open['ticket']), sl=entry, tp=float(runner['tp']))
                        observed = self._position(runner,self.client.get_positions())
                        if observed and (float(observed.get('sl') or 0) >= entry if runner['side'].lower() == 'buy' else 0 < float(observed.get('sl') or 0) <= entry):
                            record['result']={'success':True,'lifecycle_event':'BREAKEVEN_CONFIRMED','children':legs}
            if not first_open and not runner_open and all(l.get('position_id') for l in legs):
                closed_all = True
                runner_tp = False
                for leg in legs:
                    deals = self.client.position_deals(leg['position_id'])
                    exited = sum(float(d['volume']) for d in deals if d.get('is_exit') and str(d['position_id']) == leg['position_id'])
                    closed_all = closed_all and exited + 1e-9 >= float(leg.get('filled_quantity',leg['quantity']))
                    if leg is runner:
                        runner_tp = sum(float(d['volume']) for d in deals if d.get('is_tp_exit') and str(d['position_id']) == leg['position_id']) + 1e-9 >= float(leg.get('filled_quantity',leg['quantity']))
                if closed_all:
                    record['result']={'success':True,'lifecycle_event':'TP2_FILLED' if runner_tp else 'POSITION_CLOSED','children':legs}
                    record['completed']=True
            record['result']['provider_position_ids']=[l['position_id'] for l in legs if l.get('position_id')]
            self._save(path, record)
            event=record['result'].get('lifecycle_event')
            if record.get('reported_lifecycle') != event and self.cloud.ack_command(record['command_id'],True,result_data=record['result']):
                record['reported_lifecycle']=event
                self._save(path,record)
