import { runService } from "../../shared/service/runtime.ts";
if(import.meta.url===`file://${process.argv[1]}`)await runService("protection");
export { createService } from "../../shared/service/runtime.ts";
