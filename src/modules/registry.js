/* ═══════════════════════════════════════════════════════════════════
   Module registry — single source of truth for the app's pages.

   Phase 3: a static descriptor list (nav order + labels + icons). It already
   drives showPage()'s active-tab logic in core/legacy.js, so the page order
   lives in exactly one place.

   Phase 4 (like ../little-hamster-home): move each page's engine + screen
   template into src/modules/<id>/ and switch this file to Vite glob
   auto-discovery of each folder's index.js, with per-descriptor lifecycle
   hooks (show / onRemote / dashboard).

   Descriptor shape:
     id    string  matches the DOM id of the page (#p-<id>) and nav button
     name  string  nav / breadcrumb label
     icon  string  emoji shown in the nav button
     order number  display + nav order (lower first)
   ═══════════════════════════════════════════════════════════════════ */
export const PAGES = [
  { id: 'p-stock', name: 'สต็อกผักผลไม้', icon: '🌿', order: 1 },
  { id: 'p-import', name: 'นำเข้า TikTok', icon: '📂', order: 2 },
  { id: 'p-manual', name: 'บันทึกขายเอง', icon: '📝', order: 3 },
  { id: 'p-profit', name: 'วิเคราะห์กำไร', icon: '📊', order: 4 },
  { id: 'p-customers', name: 'ลูกค้า', icon: '👥', order: 5 },
  { id: 'p-settings', name: 'ตั้งค่า', icon: '⚙️', order: 6 },
  { id: 'p-backup', name: 'Export/Import', icon: '💾', order: 7 },
].sort((a, b) => a.order - b.order);

export const PAGE_IDS = PAGES.map((p) => p.id);
export const PAGE_BY_ID = Object.fromEntries(PAGES.map((p) => [p.id, p]));
