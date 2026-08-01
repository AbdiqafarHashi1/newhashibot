export interface ReportRequest {reportId:string;kind:"SCANNER"|"SIGNAL"|"TRADE"|"RECOVERY"|"PROVIDER";from:string;to:string;correlationId:string;}
export interface ReportResult<T=unknown>{reportId:string;generatedAt:string;complete:boolean;data:T;unknowns:readonly string[];}
export interface ReportingTruthPort {build<T>(request:ReportRequest):Promise<ReportResult<T>>;}
