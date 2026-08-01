import { runService } from "../../shared/service/runtime.ts";
if(import.meta.url===`file://${process.argv[1]}`)await runService("customer");
export { createService } from "../../shared/service/runtime.ts";
