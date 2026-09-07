import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_SHIFTS,
  assignShift,
  evaluateDay,
  needsManualResolution,
  punchImportDto,
  toSummaryRow,
  type PunchEvaluation,
  type PunchImportDto,
  type RawPunch,
} from '@newport/domain';
import { PrismaService } from '../common/prisma.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentAccess, RequirePermission, type AccessContext } from '../security/access.guard.js';

/**
 * شعبة البصمة والانضباط:
 *   استيراد سجلات الأجهزة → تقييم يومي (منطق @newport/domain المشترك مع الهاتف/سطح المكتب)
 *   → معالجة الاستثناءات → تصدير كشوط إلى الرواتب.
 * كل العمليات idempotent عبر (employeeId, workDate) و reconciliationHash، فيمكن تكرار الحساب بأمان.
 */
@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** استيراد خام من أجهزة البصمة (ZKTeco/ما شابه) — يتطلب hr.att.import (خدمة التكامل فقط) */
  async importPunches(input: PunchImportDto, access: AccessContext) {
    const device = await this.prisma.biometricDevice.findUnique({ where: { id: input.deviceId } });
    if (!device) throw new NotFoundException('biometric device not found');

    const employees = await this.prisma.employee.findMany({
      where: { punchId: { in: input.records.map((r) => r.employeePunchId) } },
      select: { id: true, punchId: true, subDeptId: true },
    });
    const byPunchId = new Map(employees.map((e) => [e.punchId, e] as const));

    let inserted = 0;
    let duplicates = 0;
    let unmatched = 0;

    for (const r of input.records) {
      await this.prisma
        .$transaction(async (tx) => {
          const emp = byPunchId.get(r.employeePunchId);
          if (!emp) {
            unmatched++;
            throw new SkipError(`UNMATCHED:${r.employeePunchId}`);
          }
          const exists = await tx.attendancePunch.findFirst({ where: { deviceId: device.id, rawRecordId: r.devicePunchId }, select: { id: true } });
          if (exists) {
            duplicates++;
            return;
          }
          await tx.attendancePunch.create({
            data: {
              deviceId: device.id,
              employeeId: emp.id,
              punchedAt: new Date(r.punchedAt),
              punchType: r.punchType,
              verifyMode: r.verifyMode ?? null,
              rawRecordId: r.devicePunchId,
              source: 'IMPORT',
              matchStatus: r.status,
            },
          });
          inserted++;
        })
        .catch((e: unknown) => {
          if (e instanceof SkipError) return; // بصمة لموظف غير مُسجَّل: تُتجاهل وتُبلَّغ
          throw e;
        });
    }

    await this.prisma.biometricDevice.update({ where: { id: device.id }, data: { lastPullAt: new Date(), status: 'ONLINE' } });
    await this.prisma
      .audit(this.prisma, {
        facilityId: access.profile.facilityId,
        actorId: access.userId,
        action: 'CREATE',
        entityType: 'attendancePunch',
        entityId: device.id,
        meta: { inserted, duplicates, unmatched, total: input.records.length },
      })
      .catch(() => undefined);

    return { inserted, duplicates, unmatched, total: input.records.length };
  }

  /** إعادة حساب ملخصات يوم عمل — تُشغَّل من مُجدوّل كل 15 دقيقة ومن زر "إعادة الحساب" */
  async recalculateDay(workDate: string, filter: { subDeptId?: string; employeeIds?: string[] } = {}, access?: AccessContext) {
    const employees = await this.prisma.employee.findMany({
      where: {
        terminationDate: null,
        ...(filter.subDeptId ? { subDeptId: filter.subDeptId } : {}),
        ...(filter.employeeIds?.length ? { id: { in: filter.employeeIds } } : {}),
      },
      select: { id: true, subDeptId: true },
      take: 5000,
    });
    if (!employees.length) return { employees: 0, updated: 0, unresolved: 0, workDate };

    const from = new Date(`${workDate}T00:00:00Z`);
    const to = new Date(from.getTime() + 30 * 3_600_000); // يغطي نهاية الوردية الليلية الممتدة
    const punches = await this.prisma.attendancePunch.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        punchedAt: { gte: new Date(`${workDate}T00:00:00Z`), lt: new Date(Date.parse(`${workDate}T00:00:00Z`) + 2 * 86_400_000) },
      },
      orderBy: { punchedAt: 'asc' },
      take: 200_000,
    });
    const assignments = await this.prisma.shiftAssignment.findMany({ where: { workDate: from }, include: { shift: true } });
    const corrections = await this.prisma.attendanceCorrection.findMany({ where: { workDate: from, status: 'APPROVED' } });
    const leaves = await this.prisma.leaveRequest.findMany({
      where: { fromAt: { lte: to }, toAt: { gte: from }, status: 'APPROVED' },
      select: { employeeId: true, type: true },
    });

    const punchesByEmployee = new Map<string, RawPunch[]>();
    for (const p of punches) {
      const arr = punchesByEmployee.get(p.employeeId) ?? [];
      arr.push({
        id: p.id,
        employeeId: p.employeeId,
        punchedAt: p.punchedAt.toISOString(),
        punchType: p.punchType as RawPunch['punchType'],
        source: p.source as RawPunch['source'],
      });
      punchesByEmployee.set(p.employeeId, arr);
    }
    const corrByEmployee = new Map(corrections.map((c) => [c.employeeId, c] as const));
    const assignByEmployee = new Map(assignments.map((a) => [a.employeeId, a] as const));
    const leaveByEmployee = new Map(leaves.map((l) => [l.employeeId, l] as const));

    let updated = 0;
    let unresolved = 0;
    for (const emp of employees) {
      const defaultShift = await this.defaultShiftOf(emp.id);
      const shiftCode = assignByEmployee.get(emp.id)?.shift.code ?? defaultShift;
      const punchesForShift: RawPunch[] = [];
      for (const p of punchesByEmployee.get(emp.id) ?? []) {
        const assigned = assignShift(p, DEFAULT_SHIFTS, workDate);
        if (!assigned || assigned.shiftCode === shiftCode) punchesForShift.push(p);
      }
      const corr = corrByEmployee.get(emp.id);
      const leave = leaveByEmployee.get(emp.id);
      const evaluation: PunchEvaluation = evaluateDay({
        punches: punchesForShift,
        shiftCode,
        workDate,
        overrides: {
          expectedAbsence: leave ? (leave.type === 'MISSION' ? 'MISSION' : 'LEAVE') : undefined,
          manualIn: corr?.inTimeOverride?.toISOString(),
          manualOut: corr?.outTimeOverride?.toISOString(),
          approvedOvertimeMinutes: corr?.otMinutesApproved ?? undefined,
        },
      });
      const row = toSummaryRow(emp.id, evaluation);
      const payload = {
        shiftCode: row.shiftCode,
        firstInAt: row.firstInAt ? new Date(row.firstInAt) : null,
        lastOutAt: row.lastOutAt ? new Date(row.lastOutAt) : null,
        workedMinutes: row.workedMinutes,
        scheduledMinutes: row.scheduledMinutes,
        lateMinutes: row.lateMinutes,
        earlyOutMinutes: row.earlyOutMinutes,
        overtimeMinutes: row.overtimeMinutes,
        nightDiffPct: row.nightDiffPct,
        fridayMultiplier: row.fridayMultiplier,
        status: row.statusCode,
        punchCount: row.punchCount,
        reconciliationHash: row.reconciliationHash,
      };
      await this.prisma.attendanceDailySummary.upsert({
        where: { employeeId_workDate: { employeeId: emp.id, workDate: from } },
        create: { ...payload, employeeId: emp.id, workDate: from, exceptionsJson: JSON.parse(row.exceptionsJson) as Prisma.InputJsonValue },
        update: { ...payload, exceptionsJson: JSON.parse(row.exceptionsJson) as Prisma.InputJsonValue, calculatedAt: new Date() },
      });
      updated++;
      if (needsManualResolution(evaluation)) unresolved++;
    }

    await this.prisma
      .audit(this.prisma, {
        facilityId: access?.profile.facilityId ?? null,
        actorId: access?.userId ?? null,
        action: 'UPDATE',
        entityType: 'attendanceSummary',
        meta: { workDate, updated, unresolved },
      })
      .catch(() => undefined);

    return { employees: employees.length, updated, unresolved, workDate };
  }

  private async defaultShiftOf(employeeId: string): Promise<string> {
    const user = await this.prisma.user.findFirst({ where: { employeeId }, include: { shift: true } });
    return user?.shift?.code ?? 'A';
  }

  /** معالجة استثنائية (بصمة ناقصة/تبرير تأخير/ساعات إضافية معتمدة) */
  async resolveCorrection(id: string, decision: 'APPROVED' | 'REJECTED', access: AccessContext, commentAr?: string) {
    const corr = await this.prisma.attendanceCorrection.findUnique({ where: { id } });
    if (!corr) throw new NotFoundException('correction not found');
    if (corr.status !== 'PENDING') throw new ConflictException({ statusCode: 409, messageAr: 'الطلب مُعالَج مسبقًا' });
    const updated = await this.prisma.attendanceCorrection.update({
      where: { id },
      data: {
        status: decision,
        decidedById: access.userId,
        decidedAt: new Date(),
        reasonAr: commentAr ? `${corr.reasonAr}\n— قرار: ${commentAr}` : corr.reasonAr,
      },
    });
    if (decision === 'APPROVED') await this.recalculateDay(corr.workDate.toISOString().slice(0, 10), { employeeIds: [corr.employeeId] }, access);
    return { id: updated.id, status: updated.status };
  }

  async requestCorrection(
    input: { employeeId: string; workDate: string; type: string; reasonAr: string; inTime?: string; outTime?: string; otMinutes?: number },
    access: AccessContext,
  ) {
    if (!input.reasonAr || input.reasonAr.length < 5) throw new BadRequestException({ statusCode: 400, messageAr: 'سبب المعالجة مطلوب (٥ أحرف فأكثر)' });
    return this.prisma.attendanceCorrection.create({
      data: {
        employeeId: input.employeeId,
        workDate: new Date(input.workDate),
        type: input.type,
        reasonAr: input.reasonAr,
        inTimeOverride: input.inTime ? new Date(input.inTime) : null,
        outTimeOverride: input.outTime ? new Date(input.outTime) : null,
        otMinutesApproved: input.otMinutes ?? null,
        requestedById: access.userId,
        status: 'PENDING',
      },
    });
  }

  async dailyRows(date: string, subDeptId: string | undefined, scopedSubDept: string | null) {
    const where: Prisma.AttendanceDailySummaryWhereInput = {
      workDate: new Date(date),
      ...(subDeptId ? { employee: { subDeptId } } : scopedSubDept ? { employee: { subDeptId: scopedSubDept } } : {}),
    };
    return this.prisma.attendanceDailySummary.findMany({
      where,
      include: { employee: { select: { employeeNumber: true, jobTitleAr: true, subDept: { select: { code: true, nameAr: true } } } } },
      take: 1000,
    });
  }

  /** كشط الحضور الشهري المُصدَّر إلى الرواتب (يتطلب hr.att.export_payroll) */
  async payrollExport(month: string, subDeptCode?: string) {
    const from = new Date(`${month}-01T00:00:00Z`);
    const to = new Date(from.getUTCFullYear(), from.getUTCMonth() + 1, 1);
    const where: Prisma.AttendanceDailySummaryWhereInput = { workDate: { gte: from, lt: to } };
    const rows = await this.prisma.attendanceDailySummary.findMany({
      where,
      include: { employee: { select: { employeeNumber: true, subDept: { select: { code: true } } } } },
      take: 60_000,
    });
    const filtered = subDeptCode ? rows.filter((r) => r.employee.subDept?.code === subDeptCode) : rows;
    const agg = new Map<string, { employeeNumber: string; days: number; otHours: number; lateMinutes: number; absent: number }>();
    for (const r of filtered) {
      const cur = agg.get(r.employeeId) ?? { employeeNumber: r.employee.employeeNumber, days: 0, otHours: 0, lateMinutes: 0, absent: 0 };
      if (['PRESENT', 'LATE_IN', 'EARLY_OUT'].includes(r.status)) cur.days += 1;
      if (r.status === 'ABSENT') cur.absent += 1;
      cur.otHours += r.overtimeMinutes / 60;
      cur.lateMinutes += r.lateMinutes;
      agg.set(r.employeeId, cur);
    }
    return {
      month,
      employees: agg.size,
      rows: [...agg.entries()].map(([employeeId, v]) => ({ employeeId, ...v })),
      generatedAt: new Date().toISOString(),
      noteAr: 'أرقام أولية — تُقفل بعد اعتماد شعبة البصمة ثم تُحوَّل إلى payroll_lines',
    };
  }
}

class SkipError extends Error {}

@Controller('v1/time')
export class AttendanceController {
  constructor(private readonly att: AttendanceService) {}

  @RequirePermission(['hr.att.import'])
  @Post('punches/import')
  importPunches(@Body(new ZodPipe(punchImportDto)) body: PunchImportDto, @CurrentAccess() access: AccessContext) {
    return this.att.importPunches(body, access);
  }

  @RequirePermission(['hr.att.correct', 'hr.att.import'], { anyOf: true })
  @Post('recalculate')
  recalc(@Query('date') date: string, @Query('subDeptId') subDeptId: string | undefined, @CurrentAccess() access: AccessContext) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new BadRequestException({ statusCode: 400, messageAr: 'date يجب أن تكون YYYY-MM-DD' });
    return this.att.recalculateDay(date, { subDeptId }, access);
  }

  @RequirePermission(['hr.att.view', 'hr.att.all'], { anyOf: true })
  @Get('daily')
  async daily(@Query('date') date: string, @Query('subDeptId') subDeptId: string | undefined, @CurrentAccess() access: AccessContext) {
    const scoped = !access.profile.isFacilityWide;
    if (scoped && subDeptId && subDeptId !== access.profile.subDeptId && !access.can('hr.att.all' as never)) {
      throw new ForbiddenException({ statusCode: 403, messageAr: 'أنت مخوّل بعرض بصمة شعبتك فقط' });
    }
    const rows = await this.att.dailyRows(date, subDeptId, scoped ? access.profile.subDeptId : null);
    return rows.map((r) => ({
      employeeId: r.employeeId,
      employeeNumber: r.employee.employeeNumber,
      jobTitle: r.employee.jobTitleAr,
      subDept: r.employee.subDept?.nameAr ?? null,
      date: r.workDate.toISOString().slice(0, 10),
      shift: r.shiftCode,
      firstIn: r.firstInAt?.toISOString() ?? null,
      lastOut: r.lastOutAt?.toISOString() ?? null,
      workedHours: +(r.workedMinutes / 60).toFixed(2),
      lateMinutes: r.lateMinutes,
      overtimeHours: +(r.overtimeMinutes / 60).toFixed(2),
      status: r.status,
      exceptions: Array.isArray(r.exceptionsJson) ? r.exceptionsJson : [],
      isLocked: r.isLocked,
    }));
  }

  @RequirePermission(['hr.att.correct'])
  @Post('corrections')
  requestCorrection(
    @Body() body: { employeeId: string; workDate: string; type: string; reasonAr: string; inTime?: string; outTime?: string; otMinutes?: number },
    @CurrentAccess() access: AccessContext,
  ) {
    return this.att.requestCorrection(body, access);
  }

  @RequirePermission(['hr.att.correct'])
  @Post('corrections/:id/decide')
  decide(@Param('id') id: string, @Body() body: { decision: 'APPROVED' | 'REJECTED'; commentAr?: string }, @CurrentAccess() access: AccessContext) {
    return this.att.resolveCorrection(id, body.decision, access, body.commentAr);
  }

  @RequirePermission(['hr.att.export_payroll'])
  @Get('payroll-export')
  payrollExport(@Query('month') month: string, @Query('subDeptCode') subDeptCode?: string) {
    if (!/^\d{4}-\d{2}$/.test(month ?? '')) throw new BadRequestException({ statusCode: 400, messageAr: 'month يجب أن يكون YYYY-MM' });
    return this.att.payrollExport(month, subDeptCode);
  }
}

@Module({ controllers: [AttendanceController], providers: [AttendanceService], exports: [AttendanceService] })
export class TimeModule {}
