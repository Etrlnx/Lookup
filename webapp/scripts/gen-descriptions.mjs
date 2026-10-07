import { data } from "../src/data.js";
import { writeFileSync, readFileSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const OUT = new URL("../src/data.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CACHE_PATH = new URL("./descriptions.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function buildPrompt(bucketName, category) {
  const outline = category.groups
    .map((g) => `  - Group "${g.heading}": items = [${g.items.map((i) => `"${i}"`).join(", ")}]`)
    .join("\n");

  return `You are building short reference descriptions for a technology/finance learning roadmap mind-map.
Context: top-level area "${bucketName}", category "${category.name}".
Category contains these groups and items:
${outline}

For the category itself, AND for every group, AND for every single item listed above, write EXACTLY two short bullet points:
1. "what": one concise sentence defining what it is.
2. "useful": one concise sentence on how/why it is useful in practice for an engineer following this roadmap (toward full-stack -> devops/ML systems -> finance ML applications).

Use your own knowledge; only search the web if you are not confident about a term's meaning.
Keep each sentence under 25 words. Be factually precise, no filler.

Respond with ONLY raw JSON (no markdown fences, no commentary) in exactly this shape:
{
  "category": {"what": "...", "useful": "..."},
  "groups": {
    "<group heading exactly as given>": {
      "what": "...", "useful": "...",
      "items": {
        "<item exactly as given>": {"what": "...", "useful": "..."}
      }
    }
  }
}`;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object found in output");
  return JSON.parse(text.slice(start, end + 1));
}

function askNemotron(prompt, tag) {
  const promptFile = join(tmpdir(), `nemotron-prompt-${tag}.txt`);
  writeFileSync(promptFile, prompt, "utf8");
  const raw = execFileSync(
    "opencode",
    [
      "run",
      "--auto",
      "-m",
      "opencode/nemotron-3-ultra-free",
      "follow the attached instructions exactly and reply with ONLY raw JSON, no markdown fences, no commentary",
      `--file=${promptFile}`,
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 20, timeout: 180000, shell: true }
  );
  return extractJson(raw);
}

async function main() {
  const cache = loadCache();
  const testOnly = process.env.TEST_ONE_CATEGORY;

  for (const bucket of data) {
    for (const category of bucket.categories) {
      if (testOnly && category.name !== testOnly) continue;
      if (cache[category.name]) {
        console.log(`skip (cached): ${category.name}`);
        continue;
      }
      console.log(`asking nemotron: ${category.name} ...`);
      const prompt = buildPrompt(bucket.name, category);
      try {
        const result = askNemotron(prompt, category.name.replace(/[^a-z0-9]+/gi, "-"));
        cache[category.name] = result;
        saveCache(cache);
        console.log(`  ok: ${category.name}`);
      } catch (err) {
        console.error(`  FAILED: ${category.name}: ${err.message}`);
      }
    }
  }

  console.log("done. Cached descriptions at scripts/descriptions.json");
}

main();
