from weekend_guard import weekend_management_allowed, weekend_entry_allowed
from expiry_guard import expiry_management_allowed
from prop_profit_guard import profit_cutoff_management_allowed
from managed_positions import ManagedPositions
"""
HashiBot MT5 Agent - Command Processor
Polls pending commands, dispatches execution to MT5, and returns execution acknowledgements.
"""

from typing import Dict, Any, List
from cloud_client import CloudClient
from mt5_client import MT5Client
from logging_config import logger
from config import Config
from policy import ExecutionContext, execution_blockers

class CommandProcessor:
    def __init__(self, cloud_client: CloudClient, mt5_client: MT5Client):
        self.cloud_client = cloud_client
        self.mt5_client = mt5_client
        self.managed_positions = ManagedPositions(mt5_client, cloud_client)

    def process_pending_commands(self) -> int:
        commands = self.cloud_client.poll_commands()
        if not commands:
            return 0

        logger.info(f"[CommandProcessor] Processing {len(commands)} polled command(s)")
        processed_count = 0

        for cmd in commands:
            cmd_id = cmd.get("id")
            operation = cmd.get("operation", "").lower()
            operation = {"open_position": "place_order", "modify_protection": "modify_position",
                         "partial_close": "close_position", "move_to_breakeven": "modify_position",
                         "recover_protection": "modify_position"}.get(operation, operation)
            payload = cmd.get("payload", {})
            if not isinstance(payload, dict):
                payload = {}

            logger.info(f"[CommandProcessor] Executing command #{cmd_id}: '{operation}'")
            
            success = False
            error_code = None
            error_message = None
            result_data: Dict[str, Any] = {}

            # Every mutating operation is fail-closed. Phase 5D deliberately has no path
            # that silently defaults execution on, including for master credentials.
            read_only = operation in ("test_connection", "sync_account", "fetch_history")
            if str(cmd.get("account_id", "")) != Config.ACCOUNT_ID:
                self.cloud_client.ack_command(cmd_id, False, "MT5_ACCOUNT_MISMATCH", "Command is scoped to another account", {})
                processed_count += 1
                continue
            if cmd.get("provider", "mt5").lower() != "mt5" or (cmd.get("bridge_id") and cmd["bridge_id"] != Config.BRIDGE_ID) or (cmd.get("owner_id") and cmd["owner_id"] != Config.OWNER_ID):
                self.cloud_client.ack_command(cmd_id, False, "MT5_COMMAND_SCOPE_MISMATCH", "Command provider/owner/bridge scope mismatch", {})
                processed_count += 1
                continue
            # Expiry applies to reads too; an old verification command is not useful truth.
            expires = cmd.get("expires_at") or cmd.get("execution_context", {}).get("command_expires_at")
            if expires:
                from datetime import datetime, timezone
                try:
                    if datetime.fromisoformat(str(expires).replace("Z", "+00:00")) <= datetime.now(timezone.utc):
                        self.cloud_client.ack_command(cmd_id, False, "MT5_COMMAND_EXPIRED", "Command expired", {})
                        processed_count += 1
                        continue
                except ValueError:
                    self.cloud_client.ack_command(cmd_id, False, "MT5_COMMAND_EXPIRY_INVALID", "Invalid command expiry", {})
                    processed_count += 1
                    continue
            if Config.DATA_ONLY and not read_only:
                self.cloud_client.ack_command(cmd_id, False, "DATA_ONLY_COMMAND_FORBIDDEN", "Dedicated scanner feed cannot execute trades", {})
                processed_count += 1
                continue
            if operation in ('place_order','place_entry') and not weekend_entry_allowed(payload.get('symbol',''), payload.get('certified') is True):
                self.cloud_client.ack_command(cmd_id,False,'WEEKEND_FX_METALS_ENTRY_BLOCKED','UTC rotation blocks new FX/Metals entries',{})
                processed_count += 1
                continue
            profit_management=False
            if cmd.get('profit_guard_authorization') and operation in ('close_position','cancel_order'):
                try:
                    self.mt5_client.assert_demo_execution_identity()
                    profit_management=profit_cutoff_management_allowed(cmd,self.mt5_client.get_account_info(),self.mt5_client.get_terminal_info(),{'account_id':Config.ACCOUNT_ID,'owner_id':Config.OWNER_ID,'bridge_id':Config.BRIDGE_ID,'login':Config.ACCOUNT_NUMBER,'server':Config.SERVER})
                except Exception:
                    self.cloud_client.ack_command(cmd_id,False,'PROP_PROFIT_MANAGEMENT_CONTEXT_UNAVAILABLE','Profit close needs a verified terminal context',{})
                    processed_count += 1
                    continue
            if cmd.get('weekend_authorization') and operation in ('close_position','cancel_order'):
                try:
                    self.mt5_client.assert_demo_execution_identity()
                    profit_management=weekend_management_allowed(cmd,self.mt5_client.get_account_info(),self.mt5_client.get_terminal_info(),{'account_id':Config.ACCOUNT_ID,'owner_id':Config.OWNER_ID,'bridge_id':Config.BRIDGE_ID,'login':Config.ACCOUNT_NUMBER,'server':Config.SERVER})
                except Exception:
                    profit_management=False
                if not profit_management:
                    self.cloud_client.ack_command(cmd_id,False,'WEEKEND_MANAGEMENT_CONTEXT_REQUIRED','Weekend close needs fresh account-bound authorization',{})
                    processed_count += 1
                    continue
            if cmd.get('expiry_authorization') and operation in ('close_position','cancel_order'):
                try:
                    self.mt5_client.assert_demo_execution_identity()
                    profit_management = expiry_management_allowed(cmd,self.mt5_client.get_account_info(),self.mt5_client.get_terminal_info(),{'account_id':Config.ACCOUNT_ID,'owner_id':Config.OWNER_ID,'bridge_id':Config.BRIDGE_ID,'login':Config.ACCOUNT_NUMBER,'server':Config.SERVER})
                except Exception:
                    profit_management = False
                if not profit_management:
                    self.cloud_client.ack_command(cmd_id,False,'EXPIRY_MANAGEMENT_CONTEXT_REQUIRED','Expiry close needs current account-bound authorization',{})
                    processed_count += 1
                    continue
            if not read_only and not profit_management:
                gate = cmd.get("execution_context", {})
                blockers = execution_blockers(ExecutionContext(**{
                    key: value for key, value in gate.items() if key in ExecutionContext.__dataclass_fields__
                }))
                if blockers:
                    self.cloud_client.ack_command(cmd_id, False, blockers[0], "Execution gate rejected command", {"blockers": blockers})
                    processed_count += 1
                    continue

            try:
                if operation in ["place_order", "place_entry"]:
                    turbo = getattr(self, 'local_turbo', None)
                    if turbo is not None:
                        with self.mt5_client.native_transaction():
                            turbo.guard_external_entry(payload)
                            res = self.managed_positions.execute(cmd_id,payload) if payload.get("certified") else self.mt5_client.place_order(payload)
                    else:
                        res = self.managed_positions.execute(cmd_id,payload) if payload.get("certified") else self.mt5_client.place_order(payload)
                    success = res.get("success", False)
                    error_code = res.get("error_code")
                    error_message = res.get("error")
                    result_data = res

                elif operation == "modify_position":
                    ticket = str(payload.get("ticket", payload.get("position_id", "")))
                    sl = payload.get("sl")
                    tp = payload.get("tp")
                    res = self.mt5_client.modify_position(ticket=ticket, sl=sl, tp=tp)
                    success = res.get("success", False)
                    error_code = res.get("error_code")
                    error_message = res.get("error")
                    result_data = res

                elif operation == "close_position":
                    ticket = str(payload.get("ticket", payload.get("position_id", "")))
                    volume = payload.get("volume")
                    res = self.mt5_client.close_position(ticket=ticket, volume=volume)
                    success = res.get("success", False)
                    error_code = res.get("error_code")
                    error_message = res.get("error")
                    result_data = res

                elif operation == "cancel_order":
                    ticket = str(payload.get("ticket", payload.get("order_id", "")))
                    res = self.mt5_client.cancel_order(ticket=ticket)
                    success = res.get("success", False)
                    error_code = res.get("error_code")
                    error_message = res.get("error")
                    result_data = res

                elif operation == "test_connection":
                    conn = self.mt5_client.check_connection()
                    acc = self.mt5_client.get_account_info()
                    term = self.mt5_client.get_terminal_info()
                    success = conn
                    result_data = {"connected": conn, "account": acc, "terminal": term}
                    if not conn:
                        error_code = "TERMINAL_DISCONNECTED"
                        error_message = "MT5 terminal is disconnected"

                elif operation == "sync_account":
                    conn = self.mt5_client.check_connection()
                    success = conn
                    result_data = {"triggered": True}

                elif operation == "fetch_history":
                    if str(payload.get("version", "")) != "1.0":
                        raise ValueError("MT5_HISTORY_CONTRACT_VERSION_UNSUPPORTED")
                    result_data = self.mt5_client.get_historical_bars(
                        str(payload.get("symbol", "")), str(payload.get("timeframe", "")),
                        str(payload.get("from", "")), str(payload.get("to", "")), payload.get("source_symbol"))
                    success = True

                else:
                    error_code = "UNSUPPORTED_OPERATION"
                    error_message = f"Unsupported command operation: '{operation}'"
                    logger.warning(f"[CommandProcessor] {error_message}")

            except Exception as e:
                success = False
                known_read_error = str(e) if operation == "fetch_history" and str(e) in (
                    "MT5_HISTORY_UNAVAILABLE", "MT5_SYMBOL_UNAVAILABLE", "MT5_TIMEFRAME_UNSUPPORTED",
                    "MT5_HISTORY_RANGE_INVALID", "MT5_HISTORY_CONTRACT_VERSION_UNSUPPORTED") else None
                error_code = known_read_error or "UNHANDLED_EXCEPTION"
                error_message = f"Unhandled exception during command execution: {str(e)}"
                logger.error(f"[CommandProcessor] Exception processing command #{cmd_id}: {e}")

            # Acknowledge command outcome to cloud
            self.cloud_client.ack_command(
                command_id=cmd_id,
                success=success,
                error_code=error_code,
                error_message=error_message,
                result_data=result_data
            )
            processed_count += 1

        return processed_count

