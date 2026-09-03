import fs from "node:fs";
import path from "node:path";

import { swaggerSpec } from "../src/core/config/swagger.js";

const prefixes: Record<string, string> = {
  admin: "/api/admin",
  auth: "/api/auth",
  benefit: "/api/benefits",
  chat: "/api/chats",
  coupon: "/api/coupons",
  mission: "/api/missions",
  notification: "/api/notifications",
  persona: "/api/persona",
  plan: "/api/plans",
  prompt: "/api/admin/prompts",
  reward: "/api/rewards",
  store: "/api/stores",
  subscription: "/api/subscriptions",
  usage: "/api/usage",
};
const methods = ["get", "post", "put", "patch", "delete"] as const;
const routePattern =
  /router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gs;
const routeDirectory = path.resolve("src/api/routes");
const actual = new Set<string>();

for (const file of fs
  .readdirSync(routeDirectory)
  .filter((name) => name.endsWith(".routes.ts"))) {
  const key = file.replace(".routes.ts", "");
  const prefix = prefixes[key];
  if (!prefix) throw new Error(`라우트 prefix가 등록되지 않았습니다: ${key}`);

  const source = fs.readFileSync(path.join(routeDirectory, file), "utf8");
  for (const match of source.matchAll(routePattern)) {
    const route = match[2] === "/" ? "" : match[2];
    const openApiPath = `${prefix}${route}`.replace(/:([^/]+)/g, "{$1}");
    actual.add(`${match[1].toUpperCase()} ${openApiPath}`);
  }
}

const documented = new Set<string>();
const paths = (swaggerSpec.paths ?? {}) as Record<
  string,
  Record<string, unknown>
>;
for (const [openApiPath, operations] of Object.entries(paths)) {
  for (const method of methods) {
    if (operations[method])
      documented.add(`${method.toUpperCase()} ${openApiPath}`);
  }
}

const missing = [...actual].filter((operation) => !documented.has(operation));
const extra = [...documented].filter((operation) => !actual.has(operation));

console.log(
  `Swagger coverage: ${documented.size}/${actual.size} operations documented`,
);
if (missing.length) console.error("누락:", missing);
if (extra.length) console.error("실제 라우트 없음:", extra);
if (missing.length || extra.length) process.exitCode = 1;
