# HashiBridge MT5 Platform

MT5 is an execution provider in V2. Flow: HashiCore → Execution Planner → Command Queue → Execution Worker → Provider Adapter → MT5 Provider → HashiBridge → Desktop Agent → MT5 Expert Advisor → MetaTrader 5.

The EA is execution-only and must not calculate indicators, scan markets, run strategies, generate signals, calculate risk, sizing, RR, or protection. Passwords are never exposed to UI; only credential references are stored.
