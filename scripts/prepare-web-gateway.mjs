import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RESERVED = "(?:api|assets|\\.well-known|a|s|surveys|survey-login-error|auth/steam/callback)(?:/|$)|(?:logo\\.png|og-fallback\\.png|link\\.html|robots\\.txt)$|users/[^/]+/diagnosis(?:/|$)";
export const GATEWAY_SOURCE = `/:path((?!${RESERVED}).*)`;

export function prepareWebGateway({ config, html, previewSource, upstreamOrigin, gatewayOrigin }) {
  // This is an un-deployed candidate. There is deliberately no production
  // upstream default, no token, no credential forwarding, and no deploy command.
  if (typeof upstreamOrigin !== "string" || /[\u0000-\u0020\\]/.test(upstreamOrigin)) throw new Error("Unsafe upstream origin");
  const url = new URL(upstreamOrigin);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash ||
      !/^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(url.hostname) ||
      url.hostname === "playnavi-links.vercel.app") {
    throw new Error("A reviewed, distinct HTTPS Next Vercel origin is required");
  }
  if (typeof gatewayOrigin !== "string" || /[\u0000-\u0020\\]/.test(gatewayOrigin)) throw new Error("Reviewed gateway origin is required");
  const gateway = new URL(gatewayOrigin);
  if (gateway.protocol !== "https:" || gateway.username || gateway.password || gateway.port ||
      gateway.pathname !== "/" || gateway.search || gateway.hash ||
      !(gateway.hostname === "playnavi.app" || /^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(gateway.hostname)) ||
      gateway.hostname === "playnavi-links.vercel.app" || gateway.origin === url.origin) {
    throw new Error("Gateway must be reviewed apex or a distinct staging Vercel origin");
  }
  const host = [{ type: "host", value: gateway.hostname }];
  const webOrigin = gateway.hostname === "playnavi.app" ? "https://playnavi.app" : "https://playnavi-web-v2-stg.vercel.app";
  if (config.rewrites.at(-1)?.source !== "/(.*)" ||
      config.rewrites.at(-1)?.destination !== "/index.html" ||
      config.functions?.["api/share-preview.mjs"]?.includeFiles !== "index.html" ||
      !previewSource.includes('join(process.cwd(), "index.html")') ||
      !html.includes('<div class="actions">') || html.includes('name="pn-web-origin"')) {
    throw new Error("Existing entry/template contract changed; review before generating");
  }
  const candidate = structuredClone(config);
  candidate.functions["api/share-preview.mjs"].includeFiles = "link.html";
  for (const entry of candidate.rewrites) {
    if (entry.destination === "/index.html") entry.destination = "/link.html";
  }
  candidate.rewrites.splice(-1, 0,
    { source: "/index.html", has: structuredClone(host), destination: `${url.origin}/` },
    { source: "/survey-login-error", destination: "/link.html" },
    { source: "/users/:id/diagnosis", destination: "/link.html" },
    { source: GATEWAY_SOURCE, has: structuredClone(host), destination: `${url.origin}/:path*` },
  );
  candidate.headers.push({
    source: GATEWAY_SOURCE,
    has: structuredClone(host),
    headers: [
      { key: "x-vercel-enable-rewrite-caching", value: "0" },
      { key: "CDN-Cache-Control", value: "no-store" },
      { key: "Vercel-CDN-Cache-Control", value: "no-store" },
    ],
  });
  return {
    config: candidate,
    html: html.replace("</head>", `    <meta name="pn-web-origin" content="${webOrigin}">\n  </head>`)
      .replace('<div class="actions">', '<div class="actions">\n          <a id="web-btn" class="button secondary hidden" href="#">Webで見る</a>'),
    previewSource: previewSource.replace('join(process.cwd(), "index.html")', 'join(process.cwd(), "link.html")'),
  };
}

async function filesUnder(relative) {
  const entries = await readdir(join(ROOT, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not a release file: ${path}`);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function writeCandidate({ output, upstreamOrigin, gatewayOrigin }) {
  const requested = resolve(output);
  const parent = await realpath(dirname(requested));
  const target = join(parent, basename(requested));
  const checkout = await realpath(ROOT);
  const taskRoot = await realpath(resolve(ROOT, ".."));
  if (!(parent === "/tmp" || parent.startsWith(`/tmp${sep}`) ||
      parent === taskRoot || parent.startsWith(`${taskRoot}${sep}`)) ||
      target === taskRoot || target === checkout || target.startsWith(`${checkout}${sep}`)) {
    throw new Error("Output must be a new directory in task root or /tmp, outside this checkout");
  }
  const [config, html, previewSource] = await Promise.all([
    readFile(join(ROOT, "vercel.json"), "utf8"), readFile(join(ROOT, "index.html"), "utf8"),
    readFile(join(ROOT, "api/share-preview.mjs"), "utf8"),
  ]);
  const candidate = prepareWebGateway({ config: JSON.parse(config), html, previewSource, upstreamOrigin, gatewayOrigin });
  // mkdir refuses existing output. No overwrite or deletion is provided.
  await mkdir(target);
  const files = ["package.json", "package-lock.json", "logo.png", "og-fallback.png", "robots.txt",
    ...await filesUnder("assets"), ...await filesUnder("api"), ...await filesUnder(".well-known")];
  for (const file of files) {
    if (!(await stat(join(ROOT, file))).isFile()) throw new Error(`Not a regular release file: ${file}`);
    await mkdir(dirname(join(target, file)), { recursive: true });
    await writeFile(join(target, file), file === "api/share-preview.mjs" ? candidate.previewSource : await readFile(join(ROOT, file)), { flag: "wx" });
  }
  await writeFile(join(target, "vercel.json"), `${JSON.stringify(candidate.config, null, 2)}\n`, { flag: "wx" });
  await writeFile(join(target, "link.html"), candidate.html, { flag: "wx" });
  return { output: target, gateway: new URL(gatewayOrigin).origin, upstream: new URL(upstreamOrigin).origin, deployed: false, note: "Candidate only; actual Vercel routing, protection, origin and cache verification remain required" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== "--gateway" || args[2] !== "--upstream" || args[4] !== "--output") {
    throw new Error("Usage: node scripts/prepare-web-gateway.mjs --gateway <Agent-confirmed gateway origin> --upstream <reviewed Next origin> --output <new task/tmp directory>. Does not deploy.");
  }
  console.log(JSON.stringify(await writeCandidate({ gatewayOrigin: args[1], upstreamOrigin: args[3], output: args[5] })));
}
