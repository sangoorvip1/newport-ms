/**
 * منطق احتساب الحضور والانصراف من سجلات أجهزة البصمة (شعبة البصمة).
 * دالة نقية (Pure) يستخدمها:
 *   - خدمة التكامل على الخادم (توليد attendance_daily_summaries)
 *   - تطبيق سطح المكتب (معاينة/معالجة قبل الحفظ)
 *   - تطبيق الهاتف (شاشة "دفعاتي اليومية" دون اتصال)
 *
 * نظام الورديات المعتمد في الخط الأول: 4 وردیات (A/B/C/D) — دوّار 12 ساعة
 *   A: 08:00→20:00 (صباحي)          | B: 20:00→08:00 (مسائي، يمتد لليوم التالي)
 *   C: 08:00→16:00 (دعم نهاري/منتصف)| D: 09:00→17:00 (دوام إداري للموظفين/Admin)
 * قاعدة تصميم: لا تتداخل نوافذ الورديات المفعّلة (A/B) لتفادي إسناد غامض للبصمة؛
 * التداخل مقبول فقط للأدوار غير التشغيلية (C/D) لأن صاحبها مُقيَّد بـ shift_id في جدول المستخدمين.
 * ويمكن لكل شعبة تجاوز القيم عبر جدول shift_patterns.
 */

export type PunchType = 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN';

export interface RawPunch {
  id: string;
  employeeId: string;
  punchedAt: string; // ISO
  punchType: PunchType;
  source: 'DEVICE' | 'MOBILE' | 'MANUAL';
  deviceSerial?: string;
  verifyMode?: 'FINGER' | 'FACE' | 'CARD' | 'PASSWORD';
}

export interface ShiftWindowDef {
  shiftCode: string;
  startLocal: string; // 'HH:mm'
  endLocal: string; // 'HH:mm'
  overnight: boolean;
  graceMinutes: number;
  lateThresholdMinutes: number;
  otMinHours: number;
  nightDiffPct: number;
}

export const DEFAULT_SHIFTS: Record<string, ShiftWindowDef> = {
  A: { shiftCode: 'A', startLocal: '08:00', endLocal: '20:00', overnight: false, graceMinutes: 15, lateThresholdMinutes: 30, otMinHours: 1, nightDiffPct: 0 },
  B: { shiftCode: 'B', startLocal: '20:00', endLocal: '08:00', overnight: true, graceMinutes: 15, lateThresholdMinutes: 30, otMinHours: 1, nightDiffPct: 15 },
  C: { shiftCode: 'C', startLocal: '08:00', endLocal: '16:00', overnight: false, graceMinutes: 20, lateThresholdMinutes: 45, otMinHours: 1, nightDiffPct: 0 },
  D: { shiftCode: 'D', startLocal: '09:00', endLocal: '17:00', overnight: false, graceMinutes: 20, lateThresholdMinutes: 45, otMinHours: 1, nightDiffPct: 0 },
};

/** المنطقة الزمنية للموقع (آسيا/بغداد) — كل الحسابات تتم عليها */
export const SITE_TZ = 'Asia/Baghdad';
export const SITE_TZ_OFFSET_MIN = 180; // UTC+3 (بلا daylight saving في العراق)

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** يحوّل طابع UTC إلى دقائق منذ منتصف ليل تاريخ الموقع */
export function siteMinutes(punchedAt: string): { dayOffset: number; minutes: number } {
  const utcMs = Date.parse(punchedAt);
  const localMs = utcMs + SITE_TZ_OFFSET_MIN * 60_000;
  const d = new Date(localMs);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { dayOffset: Math.round((dayStart - Date.UTC(1970, 0, 1)) / 86_400_000), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function siteDateKey(punchedAt: string): string {
  const local = new Date(Date.parse(punchedAt) + SITE_TZ_OFFSET_MIN * 60_000);
  return local.toISOString().slice(0, 10);
}

export function isFriday(punchedAt: string): boolean {
  const local = new Date(Date.parse(punchedAt) + SITE_TZ_OFFSET_MIN * 60_000);
  return local.getUTCDay() === 5;
}

/** نافذة الوردية كبداية/نهاية مطلقتين نسبةً لتاريخ العمل */
export function shiftWindow(dateKey: string, shift: ShiftWindowDef): { fromMs: number; toMs: number } {
  const base = Date.parse(`${dateKey}T00:00:00Z`) - SITE_TZ_OFFSET_MIN * 60_000;
  const fromMs = base + minutesOf(shift.startLocal) * 60_000;
  const spanMin = shift.overnight ? minutesOf(shift.endLocal) + 1440 - minutesOf(shift.startLocal) : minutesOf(shift.endLocal) - minutesOf(shift.startLocal);
  return { fromMs, toMs: fromMs + spanMin * 60_000 };
}

export type AttendanceStatus = 'PRESENT' | 'LATE_IN' | 'EARLY_OUT' | 'MISSING_IN' | 'MISSING_OUT' | 'ABSENT' | 'LEAVE' | 'MISSION' | 'DAY_OFF';

export interface PunchEvaluation {
  shiftCode: string;
  workDate: string;
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  scheduledMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
  overtimeMinutes: number;
  nightDiffPct: number;
  fridayMultiplier: 1 | 2;
  status: AttendanceStatus;
  punchCount: number;
  exceptions: string[];
  /** بصمات خارج النافذة (ساعات إضافية مستقلة، أو بصمة لوردية تالية) */
  outOfWindowPunches: string[];
}

/** إسناد بصمة إلى أقرب وردية محتملة (تُجرَّب كل التعريفات المفعّلة) */
export function assignShift(punch: RawPunch, shifts: Record<string, ShiftWindowDef> = DEFAULT_SHIFTS, anchorDate?: string): { shiftCode: string; workDate: string } | null {
  const dateKey = anchorDate ?? siteDateKey(punch.punchedAt);
  const t = Date.parse(punch.punchedAt);
  const candidates: Array<{ shiftCode: string; workDate: string; exact: 0 | 1; distance: number }> = [];
  for (const key of [dateKey, previousDate(dateKey)]) {
    for (const s of Object.values(shifts)) {
      const { fromMs, toMs } = shiftWindow(key, s);
      const tolerance = 4 * 3_600_000; // ±4 ساعات حول النافذة تُقبل للإسناد
      if (t >= fromMs - tolerance && t <= toMs + tolerance) {
        const inside = t >= fromMs && t <= toMs;
        const exact = inside ? 0 : 1; // الأفضلية للبصمة الواقعة داخل النافذة فعلًا
        const distance = inside ? 0 : Math.min(Math.abs(t - fromMs), Math.abs(t - toMs));
        candidates.push({ shiftCode: s.shiftCode, workDate: key, exact, distance });
      }
    }
  }
  candidates.sort((a, b) => a.exact - b.exact || a.distance - b.distance || a.shiftCode.localeCompare(b.shiftCode));
  const first = candidates[0];
  return first ? { shiftCode: first.shiftCode, workDate: first.workDate } : null;
}

function previousDate(dateKey: string): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/**
 * التقييم اليومي لموظف ضمن وردية محددة.
 * input.punches: كل بصمات الموظف المرتبطة بنافذة الوردية (مرتبة زمنيًا).
 */
export function evaluateDay(input: {
  punches: RawPunch[];
  shiftCode: string;
  workDate: string;
  overrides?: { expectedAbsence?: 'LEAVE' | 'MISSION' | 'DAY_OFF'; approvedOvertimeMinutes?: number; manualIn?: string; manualOut?: string };
  shifts?: Record<string, ShiftWindowDef>;
}): PunchEvaluation {
  const shift = (input.shifts ?? DEFAULT_SHIFTS)[input.shiftCode];
  const exceptions: string[] = [];
  if (!shift) {
    return {
      shiftCode: input.shiftCode, workDate: input.workDate, firstIn: null, lastOut: null, workedMinutes: 0, scheduledMinutes: 0,
      lateMinutes: 0, earlyOutMinutes: 0, overtimeMinutes: 0, nightDiffPct: 0, fridayMultiplier: 1,
      status: 'ABSENT', punchCount: 0, exceptions: ['SHIFT_NOT_DEFINED'], outOfWindowPunches: [],
    };
  }
  const { fromMs, toMs } = shiftWindow(input.workDate, shift);
  const sorted = [...input.punches].sort((a, b) => Date.parse(a.punchedAt) - Date.parse(b.punchedAt));
  // نافذة الارتباط: كل بصمات يوم العمل ±6 ساعات (تتضمن ساعات العمل الإضافي بعد نهاية الوردية)
  const linked = sorted.filter((p) => Date.parse(p.punchedAt) >= fromMs - 6 * 3_600_000 && Date.parse(p.punchedAt) <= toMs + 6 * 3_600_000);
  // بصمات خارج الوردية = التي تقع فعليًا خارج النافذة (تُبلَّغ للمعالجة، ولا تُحسب ضمن العمل)
  const inWin = sorted.filter((p) => Date.parse(p.punchedAt) >= fromMs - 15 * 60_000 && Date.parse(p.punchedAt) <= toMs + 15 * 60_000);
  const outOfWindow = linked.filter((p) => !inWin.includes(p)).map((p) => p.punchedAt);
  const ins = linked.filter((p) => p.punchType === 'IN');
  const outs = linked.filter((p) => p.punchType === 'OUT');

  const firstIn = input.overrides?.manualIn ?? (ins[0]?.punchedAt ?? null);
  const lastOut = input.overrides?.manualOut ?? (outs[outs.length - 1]?.punchedAt ?? null);
  const scheduledMinutes = Math.round((toMs - fromMs) / 60_000);

  let workedMinutes = 0;
  if (firstIn && lastOut) workedMinutes = Math.max(0, Math.round((Date.parse(lastOut) - Date.parse(firstIn)) / 60_000));
  else if (firstIn && !lastOut) workedMinutes = Math.max(0, Math.round((Math.min(Date.now(), toMs) - Date.parse(firstIn)) / 60_000));

  let lateMinutes = 0;
  if (firstIn) {
    const diff = Math.round((Date.parse(firstIn) - fromMs) / 60_000);
    if (diff > shift.graceMinutes) lateMinutes = diff;
  }
  let earlyOutMinutes = 0;
  if (lastOut) {
    const diff = Math.round((toMs - Date.parse(lastOut)) / 60_000);
    if (diff > shift.graceMinutes) earlyOutMinutes = diff;
  }

  let overtimeMinutes = 0;
  const overWork = workedMinutes - scheduledMinutes;
  if (overWork >= shift.otMinHours * 60) overtimeMinutes = overWork;
  overtimeMinutes += input.overrides?.approvedOvertimeMinutes ?? 0;

  let status: AttendanceStatus = 'PRESENT';
  if (input.overrides?.expectedAbsence) status = input.overrides.expectedAbsence;
  else if (!firstIn && !lastOut) status = 'ABSENT';
  else if (!firstIn && lastOut) status = 'MISSING_IN';
  else if (firstIn && !lastOut) status = 'MISSING_OUT';
  else if (lateMinutes > shift.lateThresholdMinutes) status = 'LATE_IN';
  else if (earlyOutMinutes > shift.lateThresholdMinutes) status = 'EARLY_OUT';

  if (outOfWindow.length > 0) exceptions.push(`OUT_OF_WINDOW_PUNCHES:${outOfWindow.length}`);
  if (linked.length > 8) exceptions.push('TOO_MANY_PUNCHES');
  if (linked.some((p) => p.source === 'MANUAL')) exceptions.push('CONTAINS_MANUAL_PUNCH');
  if (linked.some((p) => p.source === 'MOBILE')) exceptions.push('CONTAINS_MOBILE_PUNCH');

  return {
    shiftCode: input.shiftCode,
    workDate: input.workDate,
    firstIn,
    lastOut,
    workedMinutes,
    scheduledMinutes,
    lateMinutes,
    earlyOutMinutes,
    overtimeMinutes,
    nightDiffPct: shift.nightDiffPct,
    fridayMultiplier: isFriday(firstIn ?? `${input.workDate}T06:00:00Z`) ? 2 : 1,
    status,
    punchCount: linked.length,
    exceptions,
    outOfWindowPunches: outOfWindow,
  };
}

/** تحويل التقييم إلى صفوف قاعدة البيانات (يستهلكها الـ repository) */
export interface DailySummaryRow {
  employeeId: string;
  workDate: string;
  shiftCode: string;
  firstInAt: string | null;
  lastOutAt: string | null;
  workedMinutes: number;
  scheduledMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
  overtimeMinutes: number;
  nightDiffPct: number;
  fridayMultiplier: number;
  statusCode: AttendanceStatus;
  exceptionsJson: string;
  punchCount: number;
  reconciliationHash: string;
}

export function toSummaryRow(employeeId: string, ev: PunchEvaluation): DailySummaryRow {
  return {
    employeeId,
    workDate: ev.workDate,
    shiftCode: ev.shiftCode,
    firstInAt: ev.firstIn,
    lastOutAt: ev.lastOut,
    workedMinutes: ev.workedMinutes,
    scheduledMinutes: ev.scheduledMinutes,
    lateMinutes: ev.lateMinutes,
    earlyOutMinutes: ev.earlyOutMinutes,
    overtimeMinutes: ev.overtimeMinutes,
    nightDiffPct: ev.nightDiffPct,
    fridayMultiplier: ev.fridayMultiplier,
    statusCode: ev.status,
    exceptionsJson: JSON.stringify(ev.exceptions),
    punchCount: ev.punchCount,
    reconciliationHash: simpleHash(`${employeeId}|${ev.workDate}|${ev.shiftCode}|${ev.firstIn}|${ev.lastOut}|${ev.punchCount}`),
  };
}

export function simpleHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** كشف الانحرافات التي تتطلب معالجة يدوية من شعبة البصمة */
export function needsManualResolution(ev: PunchEvaluation): boolean {
  return ['MISSING_IN', 'MISSING_OUT', 'ABSENT', 'LATE_IN', 'EARLY_OUT'].includes(ev.status) || ev.exceptions.length > 0;
}
