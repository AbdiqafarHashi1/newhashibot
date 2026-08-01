import { runService } from "../../shared/service/runtime.ts";
export * from "../../runtime/index.ts";
if(import.meta.url===`file://${process.argv[1]}`)await runService("trade-runtime");
