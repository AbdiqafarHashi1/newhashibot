"""Account-class policy resolution and fail-closed MT5 execution gates."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List


DEFAULTS: Dict[str, Dict[str, Any]] = {
    "demo": {"risk_per_trade_pct": 0.25, "daily_loss_pct": 2.0, "weekly_loss_pct": 5.0,
             "monitoring_enabled": True, "controlled_execution_allowed": True},
    "personal": {"risk_per_trade_pct": 0.5, "daily_loss_pct": 2.0, "weekly_loss_pct": 5.0,
                 "max_positions_per_symbol": 1, "max_exposure_pct": 20.0},
    "prop": {"risk_per_trade_pct": 0.25, "daily_loss_pct": 4.0, "maximum_loss_pct": 8.0,
             "max_simultaneous_exposure_pct": 10.0, "kill_switch_buffer_pct": 0.5},
}


def resolve_policy(account_class: str, account_rules: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Resolve independent defaults, overlaid by the canonical account's structured rules."""
    kind = account_class.lower()
    if kind not in DEFAULTS:
        raise ValueError("MT5_POLICY_NOT_CONFIGURED")
    policy = {**DEFAULTS[kind], **(account_rules or {})}
    policy["account_class"] = kind
    policy["execution_default"] = False
    if kind == "prop":
        required = ("starting_balance", "daily_loss_pct", "maximum_loss_pct")
        missing = [key for key in required if policy.get(key) is None]
        if missing:
            raise ValueError("MT5_PROP_RULES_INCOMPLETE:" + ",".join(missing))
    return policy


@dataclass(frozen=True)
class ExecutionContext:
    account_configured: bool = False
    bridge_healthy: bool = False
    terminal_authenticated: bool = False
    credential_capability: str = "investor"
    trade_permission: bool = False
    autotrading: bool = False
    operational: bool = False
    monitor_healthy: bool = False
    execution_enabled: bool = False
    risk_policy_resolved: bool = False
    capital_allocation_resolved: bool = False
    drawdown_locked: bool = False
    account_kill_switch: bool = False
    provider_kill_switch: bool = False
    command_account_matches: bool = False
    command_expires_at: str = ""
    terminal_initialized: bool = True
    canonical_login_match: bool = True
    canonical_server_match: bool = True
    provider_adopted: bool = True
    global_kill_switch: bool = False
    policy_account_class_valid: bool = True


def execution_blockers(context: ExecutionContext) -> List[str]:
    checks = (
        (context.account_configured, "MT5_ACCOUNT_NOT_CONFIGURED"),
        (context.bridge_healthy, "MT5_BRIDGE_OFFLINE"),
        (context.terminal_authenticated, "MT5_LOGIN_FAILED"),
        (context.terminal_initialized, "MT5_INITIALIZE_FAILED"),
        (context.canonical_login_match, "ACCOUNT_MISMATCH"),
        (context.canonical_server_match, "SERVER_MISMATCH"),
        (context.credential_capability == "master", "MT5_INVESTOR_ONLY"),
        (context.trade_permission, "MT5_TRADE_PERMISSION_DISABLED"),
        (context.autotrading, "MT5_AUTOTRADING_DISABLED"),
        (context.operational, "MT5_ACCOUNT_NOT_OPERATIONAL"),
        (context.monitor_healthy, "MT5_MONITOR_UNHEALTHY"),
        (context.execution_enabled, "MT5_EXECUTION_DISABLED"),
        (context.risk_policy_resolved, "MT5_RISK_POLICY_UNRESOLVED"),
        (context.capital_allocation_resolved, "MT5_CAPITAL_ALLOCATION_UNRESOLVED"),
        (not context.drawdown_locked, "MT5_DRAWDOWN_LOCKED"),
        (not context.account_kill_switch, "MT5_ACCOUNT_KILL_SWITCH"),
        (not context.provider_kill_switch, "MT5_PROVIDER_KILL_SWITCH"),
        (not context.global_kill_switch, "MT5_GLOBAL_KILL_SWITCH"),
        (context.provider_adopted, "MT5_PROVIDER_NOT_ADOPTED"),
        (context.policy_account_class_valid, "MT5_POLICY_NOT_CONFIGURED"),
        (context.command_account_matches, "MT5_ACCOUNT_MISMATCH"),
    )
    blockers = [code for passed, code in checks if not passed]
    try:
        expires = datetime.fromisoformat(context.command_expires_at.replace("Z", "+00:00"))
        if expires <= datetime.now(timezone.utc):
            blockers.append("MT5_COMMAND_EXPIRED")
    except (TypeError, ValueError):
        blockers.append("MT5_COMMAND_EXPIRY_INVALID")
    return blockers
