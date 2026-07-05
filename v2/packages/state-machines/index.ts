export type SignalState='Created'|'Candidate'|'Approved'|'Dispatched'|'Executed'|'Closed'|'Cancelled'|'Expired'|'Rejected';
export type CommandState='Queued'|'Sent'|'Acknowledged'|'Completed'|'Verified'|'Failed'|'Cancelled'|'Archived';
export type TradeState='Pending'|'Opening'|'Open'|'Managing'|'Closing'|'Closed'|'Repairing'|'Failed'|'SafeClosed';
export type ExecutorState='PendingApproval'|'Configured'|'Starting'|'Running'|'Paused'|'Stopped'|'Error'|'Recovering'|'Disabled';
export type ProtectionState='Pending'|'Submitted'|'Verified'|'RepairNeeded'|'Repairing'|'Failed'|'SafeClosed';
export type RecoveryState='Idle'|'Required'|'Started'|'Retrying'|'Completed'|'Failed'|'Escalated';
type Map<T extends string> = Record<T, readonly T[]>;
export const signalTransitions:Map<SignalState>={Created:['Candidate','Rejected'],Candidate:['Approved','Rejected','Expired'],Approved:['Dispatched','Cancelled','Expired'],Dispatched:['Executed','Cancelled'],Executed:['Closed'],Closed:[],Cancelled:[],Expired:[],Rejected:[]};
export const commandTransitions:Map<CommandState>={Queued:['Sent','Cancelled'],Sent:['Acknowledged','Failed'],Acknowledged:['Completed','Failed'],Completed:['Verified','Failed'],Verified:['Archived'],Failed:['Queued','Archived'],Cancelled:['Archived'],Archived:[]};
export const tradeTransitions:Map<TradeState>={Pending:['Opening','Failed'],Opening:['Open','Failed'],Open:['Managing','Closing','Repairing'],Managing:['Closing','Repairing'],Closing:['Closed','SafeClosed','Failed'],Closed:[],Repairing:['Managing','SafeClosed','Failed'],Failed:['Repairing','SafeClosed'],SafeClosed:[]};
export const executorTransitions:Map<ExecutorState>={PendingApproval:['Configured','Disabled'],Configured:['Starting','Disabled'],Starting:['Running','Error'],Running:['Paused','Stopped','Error','Recovering'],Paused:['Running','Stopped','Disabled'],Stopped:['Starting','Disabled'],Error:['Recovering','Disabled'],Recovering:['Running','Error','Disabled'],Disabled:[]};
export const protectionTransitions:Map<ProtectionState>={Pending:['Submitted','Failed'],Submitted:['Verified','RepairNeeded','Failed'],Verified:['RepairNeeded'],RepairNeeded:['Repairing','SafeClosed'],Repairing:['Verified','Failed','SafeClosed'],Failed:['Repairing','SafeClosed'],SafeClosed:[]};
export const recoveryTransitions:Map<RecoveryState>={Idle:['Required'],Required:['Started','Escalated'],Started:['Retrying','Completed','Failed'],Retrying:['Completed','Failed','Escalated'],Completed:['Idle'],Failed:['Retrying','Escalated'],Escalated:[]};
export function canTransition<T extends string>(map:Map<T>, from:T, to:T):boolean { return map[from]?.includes(to) ?? false; }
