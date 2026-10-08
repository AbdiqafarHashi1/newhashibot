import {setImmediate} from 'node:timers/promises';
import type {TaskContext} from './runtime.ts';
/** Yield to shutdown/cancellation and the slice timer before advancing shared pure engines. */
export async function computationCheck(context:TaskContext){await setImmediate();await context.check();}
export async function consumeSteps<T>(steps:Generator<unknown,T>,context:TaskContext){
  let count=0,step=steps.next();
  while(step.done===false){if(count++%16===0)await computationCheck(context);step=steps.next();}
  await computationCheck(context);return step.value;
}
export class ComputationYield extends Error {}
