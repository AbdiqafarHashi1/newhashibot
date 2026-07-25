"""
HashiBot MT5 Agent - Command Processor
Polls pending commands, dispatches execution to MT5, and returns execution acknowledgements.
"""

from typing import Dict, Any, List
from cloud_client import CloudClient
from mt5_client import MT5Client
from logging_config import logger

class CommandProcessor:
    def __init__(self, cloud_client: CloudClient, mt5_client: MT5Client):
        self.cloud_client = cloud_client
        self.mt5_client = mt5_client

    def process_pending_commands(self) -> int:
        commands = self.cloud_client.poll_commands()
        if not commands:
            return 0

        logger.info(f"[CommandProcessor] Processing {len(commands)} polled command(s)")
        processed_count = 0

        for cmd in commands:
            cmd_id = cmd.get("id")
            operation = cmd.get("operation", "").lower()
            payload = cmd.get("payload", {})
            if not isinstance(payload, dict):
                payload = {}

            logger.info(f"[CommandProcessor] Executing command #{cmd_id}: '{operation}'")
            
            success = False
            error_code = None
            error_message = None
            result_data: Dict[str, Any] = {}

            try:
                if operation in ["place_order", "place_entry"]:
                    res = self.mt5_client.place_order(payload)
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

                else:
                    error_code = "UNSUPPORTED_OPERATION"
                    error_message = f"Unsupported command operation: '{operation}'"
                    logger.warning(f"[CommandProcessor] {error_message}")

            except Exception as e:
                success = False
                error_code = "UNHANDLED_EXCEPTION"
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
