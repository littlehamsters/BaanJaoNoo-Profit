/* ═══════════════════════════════════════════════════════════════════
   Entry point for บ้านเจ้าหนู — ระบบวิเคราะห์กำไร.

   Phase 2 of the modular refactor: the former inline <script> now lives in
   core/legacy.js as an ES module. Its top-level functions are re-exposed to
   window so the inline on* handlers in index.html keep working. Firebase,
   Chart.js and XLSX are still loaded as global CDN <script>s in <head>.

   Later phases split legacy.js into core/ + modules/<id>/ behind a registry
   (see ../little-hamster-home/MIGRATION.md).
   ═══════════════════════════════════════════════════════════════════ */
import './core/legacy.js';
