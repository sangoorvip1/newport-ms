import { describe, expect, it } from 'vitest';
import {
  WO_STATES,
  WO_TRANSITIONS,
  allowedNextStates,
  canTransition,
  computeSla,
  PERMIT_TRANSITIONS,
} from '../src/workorder.js';
import {
  SCHEMA_VERSION,
  SYNC_ENTITIES,
  SYNC_META,
  mergeFieldwise,
  appendValue,
  planPushBatches,
  resolveConflict,
  tableOf,
  validatePush,
  type ChangeOp,
} from '../src/sync.js';
import { DEFAULT_SHIFTS, assignShift, evaluateDay, isFriday, needsManualResolution, siteDateKey, toSummaryRow } from '../src/attendance.js';

/* ───────────── Work order state machine ───────────── */
describe('work order state machine', () => {
  const allPerms = new Set(Object.values(WO_TRANSITIONS).flat().map((t) => t.permission));

  it('every declared state has a transition entry', () => {
    for (const s of WO_STATES) expect(WO_TRANSITIONS[s], s).toBeDefined();
  });

  it('every target state of a transition is a declared state', () => {
    for (const [from, list] of Object.entries(WO_TRANSITIONS)) {
      for (const t of list) expect(WO_STATES).toContain(t.to);
      expect(from).toBeTruthy();
    }
  });

  it('a closed WO cannot jump back to ASSIGNED', () => {
    expect(canTransition('CLOSED', 'ASSIGNED', allPerms)).toBeNull();
    expect(canTransition('CLOSED', 'IN_PROGRESS', allPerms)).not.toBeNull();
  });

  it('transitions are permission-gated (executor cannot close)', () => {
    const executorOnly = new Set(['maint.wo.execute', 'maint.wo.create', 'maint.wo.view']);
    expect(canTransition('COMPLETED', 'CLOSED', executorOnly)).toBeNull();
    expect(canTransition('IN_PROGRESS', 'COMPLETED', executorOnly)).not.toBeNull();
    expect(allowedNextStates('COMPLETED', executorOnly)).toEqual(['IN_PROGRESS']);
    expect(allowedNextStates('COMPLETED', new Set(['maint.wo.close']))).toEqual(['CLOSED']);
  });

  it('no dead-end state other than terminal ones', () => {
    const terminal = ['CLOSED', 'CANCELLED', 'REJECTED'];
    for (const s of WO_STATES) {
      if (terminal.includes(s)) continue;
      expect(WO_TRANSITIONS[s].length, s).toBeGreaterThan(0);
    }
  });

  it('permit flow requires HSE then OPEN and never re-opens a closed permit', () => {
    expect(PERMIT_TRANSITIONS.OPEN.map((t) => t.to).sort()).toEqual(['CLOSED', 'EXTENDED']);
    expect(PERMIT_TRANSITIONS.CLOSED).toHaveLength(0);
  });
});

describe('SLA computation', () => {
  const day = 86_400_000;
  it('detects response breach when start is late', () => {
    const submittedAt = new Date(Date.UTC(2026, 8, 1, 6, 0)).toISOString();
    const startedAt = new Date(Date.UTC(2026, 8, 1, 12, 0)).toISOString();
    const r = computeSla({ priority: 'URGENT', submittedAt, startedAt, now: Date.parse(startedAt) + day });
    expect(r.responseHours).toBe(6);
    expect(r.breachedResponse).toBe(true);
  });

  it('marks an open WO as breaching when past resolve window', () => {
    const submittedAt = new Date(Date.UTC(2026, 8, 1)).toISOString();
    const r = computeSla({ priority: 'EMERGENCY', submittedAt, now: Date.parse(submittedAt) + 9 * 3_600_000 });
    expect(r.breachedResolve).toBe(true);
    expect(r.breachedResponse).toBe(true);
  });

  it('is not breached while inside the window', () => {
    const submittedAt = new Date(Date.UTC(2026, 8, 1, 6, 0)).toISOString();
    const startedAt = new Date(Date.UTC(2026, 8, 1, 6, 30)).toISOString();
    const closedAt = new Date(Date.UTC(2026, 8, 1, 12, 0)).toISOString();
    const r = computeSla({ priority: 'URGENT', submittedAt, startedAt, closedAt });
    expect(r.breachedResponse).toBe(false);
    expect(r.resolveHours).toBe(6);
    expect(r.breachedResolve).toBe(false);
  });
});

/* ───────────── Sync / conflict merge ───────────── */
describe('sync contract', () => {
  it('every sync entity maps to a physical table and has a merge policy', () => {
    for (const e of SYNC_ENTITIES) {
      expect(tableOf(e), e).toMatch(/^[a-z_]+$/);
      expect(SYNC_META[e].merge, e).toBeTruthy();
      expect(SYNC_META[e].descriptionAr.length, e).toBeGreaterThan(5);
    }
  });

  it('field merge keeps server protected fields and takes client free fields', () => {
    const meta = SYNC_META.workOrder;
    const d = mergeFieldwise(
      { status: 'IN_PROGRESS', approverId: 'u1', description: 'old', laborHours: 2 },
      { status: 'DRAFT', description: 'new description from technician', laborHours: 3 },
      meta,
    );
    expect(d.merged.status).toBe('IN_PROGRESS');
    expect(d.merged.availabilityPct ?? d.merged.laborHours).toBe(3);
    expect(d.merged.laborHours).toBe(3);
    expect(d.keptFromServer).toContain('status');
    // description مُعلَّنة appendFields في SYNC_META.workOrder: ملاحظات الميدان لا تُستبدل بل تُلحق
    expect(d.merged.description).toBe('old\nnew description from technician'); // يبقى نصًا (عمود TEXT) لا مصفوفة
    expect(d.merged.approverId).toBe('u1'); // حقل اعتماد لا يلمسه العميل
    // العميل حاول تعديل حقل محمي (status) بينما السجل قيد التنفيذ → يُبلَّغ تعارض وتبقى نسخة الخادم
    expect(d.conflict).toBe(true);
  });

  it('flags a conflict when the client touches protected, already-set fields', () => {
    const d = mergeFieldwise({ targetEndAt: '2026-09-01T10:00:00Z' }, { targetEndAt: '2026-09-02T10:00:00Z' }, SYNC_META.workOrder);
    expect(d.conflict).toBe(true);
    expect(d.merged.targetEndAt).toBe('2026-09-01T10:00:00Z');
  });

  it('append values are de-duplicated by id and order preserved', () => {
    const out = appendValue([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]) as Array<{ id: string }>;
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('approved shift log: client fields merge, status stays with server', () => {
    const r = resolveConflict({
      entity: 'shiftLog',
      server: { status: 'APPROVED', approvedById: 'sup1', notes: 'server note' },
      client: { status: 'DRAFT', availabilityPct: 97.5, notes: 'field note' },
      serverApproved: true,
    });
    expect(r.action).toBe('MERGE');
    expect(r.decision?.merged.status).toBe('APPROVED');
    expect(r.decision?.merged.availabilityPct).toBe(97.5);
  });

  it('permit conflicts are rejected (safety-critical, no automatic merge)', () => {
    const r = resolveConflict({ entity: 'permit', server: { status: 'OPEN' }, client: { status: 'CLOSED' }, serverApproved: true });
    expect(r.action).toBe('KEEP_SERVER');
    const r2 = resolveConflict({ entity: 'permit', server: { status: 'REQUESTED' }, client: { status: 'OPEN' }, serverApproved: false });
    expect(r2.action).toBe('REJECT');
  });

  it('rejects pushes with unknown entity, duplicate opId or bad schema version', () => {
    const op = (over: Partial<ChangeOp>): ChangeOp => ({
      opId: 'op-0001', entity: 'workOrder', recordId: 'r-0001', kind: 'UPSERT', data: { title: 'x' }, clientTimestamp: '2026-09-07T08:00:00Z', ...over,
    });
    expect(
      validatePush({ deviceId: 'd1', userId: 'u1', schemaVersion: 99, ops: [op({})] }).length,
    ).toBeGreaterThan(0);
    const dup = validatePush({ deviceId: 'd1', userId: 'u1', schemaVersion: SCHEMA_VERSION, ops: [op({}), op({})] });
    expect(dup.some((e) => e.includes('مكرر'))).toBe(true);
    const bad = validatePush({ deviceId: 'd1', userId: 'u1', schemaVersion: SCHEMA_VERSION, ops: [op({ entity: 'ghost' as never })] });
    expect(bad.some((e) => e.includes('ghost'))).toBe(true);
    expect(validatePush({ deviceId: 'd1', userId: 'u1', schemaVersion: SCHEMA_VERSION, ops: [op({})] })).toEqual([]);
  });

  it('blocks client-side deletes for server-owned entities', () => {
    const errs = validatePush({
      deviceId: 'd1',
      userId: 'u1',
      schemaVersion: SCHEMA_VERSION,
      ops: [{ opId: 'op-0002', entity: 'asset', recordId: 'r-1', kind: 'DELETE', clientTimestamp: '2026-09-07T08:00:00Z' }],
    });
    expect(errs.some((e) => e.includes('الخادم فقط'))).toBe(true);
  });

  it('plans push batches by priority (partIssue before attachments)', () => {
    const ops: ChangeOp[] = [
      { opId: 'a1', entity: 'document', recordId: 'x1', kind: 'UPSERT', clientTimestamp: '2026-09-07T08:00:00Z' },
      { opId: 'a2', entity: 'partIssue', recordId: 'x2', kind: 'UPSERT', clientTimestamp: '2026-09-07T08:01:00Z' },
      { opId: 'a3', entity: 'shiftLog', recordId: 'x3', kind: 'UPSERT', clientTimestamp: '2026-09-07T08:02:00Z' },
    ];
    const [first] = planPushBatches(ops, 2);
    expect(first!.map((o) => o.entity)).toEqual(['partIssue', 'shiftLog']);
    expect(planPushBatches(ops, 2).length).toBe(2);
  });
});

/* ───────────── Attendance / biometric ───────────── */
const P = (time: string, type: 'IN' | 'OUT' | 'BREAK_IN' | 'BREAK_OUT', id: string) => ({
  id,
  employeeId: 'emp-1',
  punchedAt: time,
  punchType: type,
  source: 'DEVICE' as const,
});

describe('attendance evaluation', () => {
  it('site date key uses Asia/Baghdad (UTC+3), not UTC', () => {
    expect(siteDateKey('2026-09-06T21:30:00Z')).toBe('2026-09-07');
    expect(siteDateKey('2026-09-06T20:30:00Z')).toBe('2026-09-06');
    expect(isFriday('2026-09-04T06:00:00Z')).toBe(true); // Fri 2026-09-04 in Baghdad
  });

  it('computes lateness inside grace threshold', () => {
    // Shift A 08:00->20:00 Baghdad = 05:00->17:00 UTC ; 08:10 local => inside 15-min grace
    const ev = evaluateDay({
      punches: [P('2026-09-07T05:10:00Z', 'IN', 'p1'), P('2026-09-07T17:05:00Z', 'OUT', 'p2')],
      shiftCode: 'A',
      workDate: '2026-09-07',
    });
    expect(ev.lateMinutes).toBe(0);
    expect(ev.status).toBe('PRESENT');
    expect(ev.workedMinutes).toBe(715);
    expect(ev.scheduledMinutes).toBe(720);
  });

  it('marks LATE_IN beyond threshold and counts overtime past scheduled hours', () => {
    const ev = evaluateDay({
      punches: [P('2026-09-07T05:45:00Z', 'IN', 'p1'), P('2026-09-07T18:45:00Z', 'OUT', 'p2')],
      shiftCode: 'A',
      workDate: '2026-09-07',
    });
    expect(ev.lateMinutes).toBe(45);
    expect(ev.status).toBe('LATE_IN');
    expect(ev.overtimeMinutes).toBe(60); // 13h00 - 12h00 = ساعة كاملة (الحد الأدنى المعتمد 60 دقيقة)
    expect(needsManualResolution(ev)).toBe(true);
  });

  it('handles overnight night shift B (20:00 -> 08:00 next day)', () => {
    const ev = evaluateDay({
      punches: [P('2026-09-07T17:00:00Z', 'IN', 'p1'), P('2026-09-08T05:00:00Z', 'OUT', 'p2')],
      shiftCode: 'B',
      workDate: '2026-09-07',
    });
    expect(ev.workedMinutes).toBe(720);
    expect(ev.status).toBe('PRESENT');
    expect(ev.nightDiffPct).toBe(DEFAULT_SHIFTS.B!.nightDiffPct);
  });

  it('detects a missing OUT punch and Friday multiplier', () => {
    const ev = evaluateDay({ punches: [P('2026-09-04T05:00:00Z', 'IN', 'p1')], shiftCode: 'A', workDate: '2026-09-04' });
    expect(ev.status).toBe('MISSING_OUT');
    expect(ev.fridayMultiplier).toBe(2);
    expect(needsManualResolution(ev)).toBe(true);
  });

  it('assigns a punch to the shift window that contains it', () => {
    const morning = assignShift(P('2026-09-07T05:05:00Z', 'IN', 'p1'));
    expect(morning).toEqual({ shiftCode: 'A', workDate: '2026-09-07' });
    const night = assignShift(P('2026-09-07T20:05:00Z', 'IN', 'p2'));
    expect(night!.shiftCode).toBe('B');
  });

  it('respects approved absence and manual correction overrides', () => {
    const leave = evaluateDay({ punches: [], shiftCode: 'A', workDate: '2026-09-07', overrides: { expectedAbsence: 'LEAVE' } });
    expect(leave.status).toBe('LEAVE');
    const corrected = evaluateDay({
      punches: [P('2026-09-07T05:00:00Z', 'IN', 'p1')],
      shiftCode: 'A',
      workDate: '2026-09-07',
      overrides: { manualOut: '2026-09-07T17:00:00Z', approvedOvertimeMinutes: 60 },
    });
    expect(corrected.status).toBe('PRESENT');
    expect(corrected.overtimeMinutes).toBe(60);
  });

  it('produces an idempotent reconciliation hash for the summary row', () => {
    const ev = evaluateDay({ punches: [P('2026-09-07T05:00:00Z', 'IN', 'p1'), P('2026-09-07T17:00:00Z', 'OUT', 'p2')], shiftCode: 'A', workDate: '2026-09-07' });
    const row = toSummaryRow('emp-1', ev);
    const again = toSummaryRow('emp-1', ev);
    expect(row.reconciliationHash).toBe(again.reconciliationHash);
    expect(row.workedMinutes).toBe(720);
  });
});
