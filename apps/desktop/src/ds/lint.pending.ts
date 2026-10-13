// What lint.test.ts found when the ds laws came in (designer m_18343): the work left in
// raw-controls.md section 2 (amb-win: app/, thread/, spotlight/, palette; amb-home: settings/,
// setup/, inbox/, the add sheet). It may only shrink: lower a count, drop a class, as each lands.

/** bare controls per file (path under src/) */
export const PENDING_RAW: Readonly<Record<string, number>> = {
};

/** classes a .tsx names that no .css has a rule for (some are test hooks: they become data-testid) */
export const PENDING_CLASSES: readonly string[] = [
  'ag-model-group',
  'ag-model-label',
  'app-hint',
  'art-day',
  'hit',
  'lab',
  'lab-sent',
  'pearl',
  'pr-branch',
  'pr-dot',
  'q-copy',
  'q-key',
  'sch-asks',
  'tag',
  'th-answered',
  'th-code-lang',
  'th-gauge',
  'th-link-off',
  'th-queued',
  'th-restored',
  'th-tail',
  'th-tool',
  'th-voice',
  'vm-said',
];
