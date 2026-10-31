import {hashValidationDataset} from '../../../supabase/functions/_shared/validation-dataset-integrity';
import {normalizeUploadBars} from '../../../supabase/functions/_shared/validation-dataset-upload';
export interface DatasetRegistration {datasetId:string;datasetHash:string;status:'READY'|'PARTIAL';bars:number}
export async function registerHistoricalDataset(dataset:{metadata:Record<string,unknown>;bars:unknown[]},send:(body:Record<string,unknown>)=>Promise<Record<string,unknown>>):Promise<DatasetRegistration>{
 const normalized=normalizeUploadBars(dataset.metadata,dataset.bars as Record<string,unknown>[]);if(!normalized.length)throw Error('DATASET_EMPTY');
 const datasetHash=await hashValidationDataset(normalized),start=await send({action:'begin_dataset',metadata:dataset.metadata,rowCount:normalized.length,datasetHash,firstOpenTime:normalized[0].open_time,lastOpenTime:normalized.at(-1)!.open_time});
 if(typeof start.datasetId!=='string')throw Error('UPLOAD_BEGIN_RESPONSE_INVALID');
 for(let offset=0;offset<dataset.bars.length;offset+=500)await send({action:'append_dataset',datasetId:start.datasetId,bars:dataset.bars.slice(offset,offset+500)});
 const result=await send({action:'finish_dataset',datasetId:start.datasetId});
 if(result.datasetId!==start.datasetId||result.datasetHash!==datasetHash||!['READY','PARTIAL'].includes(String(result.status))||result.bars!==normalized.length)throw Error('UPLOAD_FINAL_RESPONSE_INVALID');
 return result as unknown as DatasetRegistration;
}
