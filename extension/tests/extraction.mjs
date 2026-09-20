// Run with node tests/extraction.mjs. Uses installed Chrome for native DOM parsing.
import { build } from "esbuild";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const fixtures = {};
for (const name of ["s4p-left", "s4p-right", "released-left", "released-right"]) {
  fixtures[name] = await readFile(new URL(`fixtures/${name}.html`, import.meta.url), "utf8");
}
const script = `
import { extractDetail } from './src/content/extract.ts';
const fixtures = ${JSON.stringify(fixtures)};
const parse = (left, right) => new DOMParser().parseFromString(left + right, 'text/html');
let passed = 0;
function equal(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message + ': ' + JSON.stringify(actual));
  passed++;
}
try {
  const s4p = parse(fixtures['s4p-left'], fixtures['s4p-right']);
  const url = 'https://www.floridaresourcemap.org/resource/6731049ac332c8ac3a1c250f?distance=';
  equal(extractDetail(s4p, url), {
    listingId:'6731049ac332c8ac3a1c250f', name:'S4P Synergy, Inc.',
    website:'https://www.strivinghome.org/synergy/home-synergy',
    address:'24 Bass Avenue Southwest, Fort Walton Beach, FL 32548',
    phone:'(850) 862-3899', serviceType:'Soup Kitchen, Food Pantry'
  }, 'S4P fields');
  const released = parse(fixtures['released-left'], fixtures['released-right']);
  // Synthetic ID for parser testing only; the user has not supplied Released's URL.
  equal(extractDetail(released, 'https://www.floridaresourcemap.org/resource/test-released'), {
    listingId:'test-released', name:'Released', website:'https://releasedreentry.org',
    address:'2602 Northwest 6th Street, Gainesville, FL 32609',
    phone:'(352) 432-8600', serviceType:null
  }, 'Released: no Services, trust badge not name');
  for (const label of ['Website', 'Phone']) {
    const heading = [...released.querySelectorAll('p')].find(p => p.textContent === label);
    heading.parentElement.nextElementSibling.remove();
  }
  const missing = extractDetail(released, url);
  equal([missing.website, missing.phone], [null, null], 'Missing contacts');
  const link = s4p.querySelector('.resource-page__right a');
  link.setAttribute('href', 'javascript:alert(1)');
  equal(extractDetail(s4p, url).website, null, 'Unsafe URL');
  equal(extractDetail(s4p, 'https://www.floridaresourcemap.org/'), null, 'Not a detail route');
  s4p.querySelector('.resource-page__right').remove();
  equal(extractDetail(s4p, url), null, 'Incomplete page');
  document.body.textContent = 'PASS ' + passed + ' extraction checks';
} catch(error) { document.body.textContent = 'FAIL ' + error.message; }
`;
const bundle = await build({ stdin: { contents: script, resolveDir: process.cwd() }, bundle: true,
  write: false, platform: "browser", format: "iife" });
const directory = await mkdtemp(join(tmpdir(), "genie-extraction-"));
const page = join(directory, "test.html");
await writeFile(page, '<!doctype html><body><script>' + bundle.outputFiles[0].text.replaceAll('</script', '<\\/script') + '</script>');
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const result = spawnSync(chrome, ['--headless', '--disable-gpu', '--no-first-run',
  '--user-data-dir=' + join(directory, 'profile'), '--dump-dom', pathToFileURL(page).href],
  { encoding: 'utf8', timeout: 30000, windowsHide: true });
const outcome = result.stdout?.match(/(?:PASS|FAIL)[^<]+/)?.[0];
console.log(outcome || result.error?.message || result.stderr);
if (!outcome?.startsWith('PASS')) process.exitCode = 1;
