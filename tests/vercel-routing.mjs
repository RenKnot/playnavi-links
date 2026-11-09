// TASK-20261107-002: a small model of how Vercel applies this repo's vercel.json to one request, for the tests.
// Order on Vercel: redirects (first match answers) → static files (a file wins over rewrites) → rewrites (first match).
// Sources are compiled the way @vercel/routing-utils does (path-to-regexp 6.1.0, strict, case-sensitive, "/" delimiter),
// limited to the shapes this repo uses: literal text, ":name", ":name(pattern)", "(pattern)" and the "?", "*", "+" modifiers.
// The compiled patterns were checked against routing-utils' own sourceToRegex for every rule (TASK-20261107-002, 11/9).
// The query string is not modelled (Vercel matches the path only).
import { existsSync, statSync } from "node:fs";

const escape = (text) => text.replace(/[.+*?=^!:${}()[\]|/\\]/g, "\\$&");

export function sourceToRegex(source) {
  const tokens = [];
  for (let i = 0; i < source.length;) {
    const char = source[i];
    if (char === ":" || char === "(") {
      let name = null;
      if (char === ":") {
        let j = i + 1;
        while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
        name = source.slice(i + 1, j);
        i = j;
      }
      let pattern = "[^/]+?";
      if (source[i] === "(") {
        let depth = 1;
        let j = i + 1;
        while (j < source.length && depth > 0) {
          if (source[j] === "\\") { j += 2; continue; }
          if (source[j] === "(") depth += 1;
          if (source[j] === ")") depth -= 1;
          j += 1;
        }
        pattern = source.slice(i + 1, j - 1);
        i = j;
      }
      let modifier = "";
      if ("?*+".includes(source[i] ?? "x")) modifier = source[i++];
      const prefix = tokens.length && typeof tokens.at(-1) === "string" && tokens.at(-1).endsWith("/") ? "/" : "";
      if (prefix) tokens[tokens.length - 1] = tokens.at(-1).slice(0, -1);
      tokens.push({ name, pattern, modifier, prefix });
      continue;
    }
    if (typeof tokens.at(-1) === "string") tokens[tokens.length - 1] += char;
    else tokens.push(char);
    i += 1;
  }
  const names = [];
  let out = "^";
  for (const token of tokens) {
    if (typeof token === "string") { out += escape(token); continue; }
    names.push(token.name);
    const p = escape(token.prefix);
    if (!token.prefix) {
      out += `(${token.pattern})${token.modifier}`;
    } else if (token.modifier === "*" || token.modifier === "+") {
      out += `(?:${p}((?:${token.pattern})(?:${p}(?:${token.pattern}))*))${token.modifier === "*" ? "?" : ""}`;
    } else {
      out += `(?:${p}(${token.pattern}))${token.modifier}`;
    }
  }
  return { regex: new RegExp(`${out}$`), names };
}

function hostMatches(has, host) {
  for (const condition of has ?? []) {
    if (condition.type !== "host") return false;
    const value = condition.value;
    const re = typeof value === "string" ? new RegExp(`^${value}$`) : new RegExp(value.re);
    if (!re.test(host)) return false;
  }
  return true;
}

function match(rule, host, path) {
  if (!hostMatches(rule.has, host)) return null;
  const { regex, names } = sourceToRegex(rule.source);
  const found = regex.exec(path);
  if (!found) return null;
  let destination = rule.destination;
  names.forEach((name, index) => {
    if (name) destination = destination.replace(new RegExp(`:${name}\\*?(?![A-Za-z0-9_])`, "g"), found[index + 1] ?? "");
  });
  return destination;
}

// Returns { kind: "redirect", status, location } | { kind: "file", file } | { kind: "rewrite", destination } | { kind: "none" }
export function route(config, repoRoot, host, path) {
  for (const rule of config.redirects ?? []) {
    const location = match(rule, host, path);
    if (location !== null) return { kind: "redirect", status: rule.statusCode ?? (rule.permanent === false ? 307 : 308), location, rule };
  }
  const local = new URL(`.${path}`, repoRoot);
  if (path !== "/" && existsSync(local) && statSync(local).isFile()) return { kind: "file", file: path.slice(1) };
  for (const rule of config.rewrites ?? []) {
    const destination = match(rule, host, path);
    if (destination === null) continue;
    if (/^\/[^/?]+\.(?:html|txt)$/.test(destination)) return { kind: "file", file: destination.slice(1), rule };
    return { kind: "rewrite", destination, rule };
  }
  return { kind: "none" };
}
