// HashiBot V2 MT5 Agent EA - execution only. No indicators, scanner, strategies, risk, sizing, RR, or signal generation.
#property strict
input string BridgeId = "";
input string AgentVersion = "hashi-agent-ea-1.0.0";
input long MagicNumber = 500519;
// Production implementation contract: poll HashiBridge queue, execute market/pending/modify/cancel/close/partial/breakeven/trailing commands, send acknowledgements, heartbeat, version, connection state, ticket mapping, and reconciliation.
bool IsDuplicate(string commandId) { return GlobalVariableCheck("hashi_" + commandId); }
void MarkExecuted(string commandId) { GlobalVariableSet("hashi_" + commandId, TimeCurrent()); }
void SendHeartbeat() { Print("HASHIBOT_HEARTBEAT bridge=", BridgeId, " version=", AgentVersion, " connected=", TerminalInfoInteger(TERMINAL_CONNECTED)); }
void Ack(string commandId, bool ok, string ticket, string error) { Print("HASHIBOT_ACK command=", commandId, " ok=", ok, " ticket=", ticket, " error=", error); }
int OnInit() { SendHeartbeat(); return(INIT_SUCCEEDED); }
void OnTick() { SendHeartbeat(); /* Commands are execution directives from HashiCore via worker/provider/bridge only. */ }
