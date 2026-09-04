import process from "node:process";
import console from "node:console";
import { startHarness } from "./support/harness.mjs";

if (process.env.NODE_ENV !== "test" || process.env.YOGODA_TEST_SERVER !== "1") {
  throw new Error("This server is only for isolated Playwright tests");
}
const harness = await startHarness(Number(process.env.TEST_PORT ?? 8100));
console.log("E2E fixture ready at " + harness.url);
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await harness.close();
  process.exit(0);
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
