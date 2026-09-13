/* Headless smoke test — loads the app, asserts the module booted, inline-handler
   globals are exposed, every page switches, and there are no JS errors.
   Run against a dev/preview server:  SMOKE_URL=http://localhost:8091/ npm run test:smoke */
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL || 'http://localhost:8091/';
const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(2000); // let the module init + firebase boot

// 1) critical inline-handler globals present
const globals = await page.evaluate(() => {
  const names = [
    'showPage', 'saveFreshPurchase', 'addFreshBuyItem', 'handleDrop',
    'loadXLSX', 'loadShopeeXLSX', 'exportExcel', 'addManualItem',
    'saveManualSale', 'renderAll', 'initApp', 'loginWithGoogle', 'logout',
  ];
  const out = {};
  names.forEach((n) => (out[n] = typeof window[n]));
  return out;
});

// 2) login overlay shown (not authed yet)
const loginShown = await page.evaluate(() => {
  const el = document.getElementById('login-overlay');
  return el ? getComputedStyle(el).display : 'no-element';
});

// 2b) sidebar built from the registry (7 items)
const sidebarCount = await page.evaluate(
  () => document.querySelectorAll('#side-menu .side-item').length
);

// 2c) profile chip present and hidden until authed
const chip = await page.evaluate(() => {
  const c = document.getElementById('user-chip');
  return {
    exists: !!(c && document.getElementById('uc-avatar') && document.getElementById('uc-name')),
    hidden: c ? getComputedStyle(c).display === 'none' : false,
  };
});

// 3) switch to every page via the global showPage (proves handlers work).
//    Seed a default state first via loadState() — the real app does this in
//    initApp() after login; page render functions read the global S.
const PAGES = ['p-stock', 'p-import', 'p-manual', 'p-profit', 'p-customers', 'p-settings', 'p-backup'];
const navResult = await page.evaluate((pages) => {
  const res = {};
  try { window.loadState(); } catch (e) { res._loadState = 'ERROR: ' + e.message; }
  for (const id of pages) {
    try {
      window.showPage(id);
      const el = document.getElementById(id);
      const pageOk = el && el.classList.contains('active');
      // sidebar active item + topbar title must track the shown page
      const sideOk = document.querySelector('#side-menu .side-item.active')?.dataset.page === id;
      const titleOk = !!document.getElementById('topbar-title')?.textContent;
      res[id] = pageOk && sideOk && titleOk ? 'active' : `page:${!!pageOk} side:${sideOk} title:${titleOk}`;
    } catch (e) {
      res[id] = 'ERROR: ' + e.message;
    }
  }
  return res;
}, PAGES);

// ── Report ──────────────────────────────────────────────────────────
let failed = false;
console.log('=== GLOBALS (expect "function") ===');
for (const [k, v] of Object.entries(globals)) {
  const ok = v === 'function';
  if (!ok) failed = true;
  console.log(`  ${ok ? '✓' : '✗'} ${k}: ${v}`);
}
console.log('\n=== LOGIN OVERLAY display ===\n  ', loginShown, '(expect "flex")');

console.log('\n=== SIDEBAR items ===');
{ const ok = sidebarCount === 7; if (!ok) failed = true; console.log(`  ${ok ? '✓' : '✗'} ${sidebarCount} items (expect 7)`); }

console.log('\n=== PROFILE CHIP ===');
{ const ok = chip.exists && chip.hidden; if (!ok) failed = true; console.log(`  ${ok ? '✓' : '✗'} exists:${chip.exists} hidden-until-login:${chip.hidden}`); }

console.log('\n=== PAGE NAV (expect active) ===');
for (const [k, v] of Object.entries(navResult)) {
  const ok = v === 'active';
  if (!ok) failed = true;
  console.log(`  ${ok ? '✓' : '✗'} ${k}: ${v}`);
}

console.log('\n=== PAGE ERRORS ===');
if (errors.length) { failed = true; console.log(errors.join('\n')); }
else console.log('  none ✓');

console.log('\n=== console error-level logs (filtered) ===');
const noisy = logs.filter((l) => /uncaught|is not defined|cannot read|syntaxerror|referenceerror|typeerror/i.test(l));
if (noisy.length) { failed = true; console.log(noisy.slice(0, 20).join('\n')); }
else console.log('  none ✓');

await browser.close();
console.log('\n' + (failed ? '✗ SMOKE FAILED' : '✓ SMOKE PASSED'));
process.exit(failed ? 1 : 0);
