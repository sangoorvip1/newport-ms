import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  labOosUpdateDto,
  labResultEntryDto,
  labSampleCreateDto,
  labVerifyDto,
  type LabOosUpdateDto,
  type LabResultEntryDto,
  type LabSampleCreateDto,
  type LabVerifyDto,
} from '@newport/domain';
import { CurrentAccess, RequirePermission, type AccessContext } from '../security/access.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { LabService } from './lab.service.js';

/**
 * مسارات المختبر. القواعد المتّبعة هنا كما في بقية الـ API:
 *  - لا منطق أعمال في المتحكم (كل شيء في LabService).
 *  - كل مسار مقيّد برمز صلاحية مستقل، والقراءة برمز قراءة (لا تُستعمل صلاحيات الكتابة للعرض).
 *  - POST يعيد 201 (سلوك Nest) — الفحوص السلبية تتوقع 403/404/409 لا 200.
 */
@Controller('v1/lab')
export class LabController {
  constructor(private readonly lab: LabService) {}

  /* ── المراجع ─────────────────────────────────────────────────────────── */

  @RequirePermission(['lab.result.view'])
  @Get('parameters')
  parameters(@Query('unitCode') unitCode?: string, @Query('q') q?: string, @CurrentAccess() access?: AccessContext) {
    return this.lab.parameters({ unitCode, q }, access!);
  }

  @RequirePermission(['lab.result.view'])
  @Get('stats')
  stats(@CurrentAccess() access: AccessContext) {
    return this.lab.stats(access);
  }

  /* ── العينات ─────────────────────────────────────────────────────────── */

  @RequirePermission(['lab.sample.view'])
  @Get('samples')
  listSamples(
    @Query('status') status?: string,
    @Query('subDeptCode') subDeptCode?: string,
    @Query('unitCode') unitCode?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('onlyMine') onlyMine?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @CurrentAccess() access?: AccessContext,
  ) {
    return this.lab.listSamples(
      {
        status,
        subDeptCode,
        unitCode,
        q,
        from,
        to,
        onlyMine: onlyMine === 'true',
        take: take ? Number(take) : undefined,
        skip: skip ? Number(skip) : undefined,
      },
      access!,
    );
  }

  @RequirePermission(['lab.sample.view'])
  @Get('samples/:id')
  detail(@Param('id') id: string, @CurrentAccess() access: AccessContext) {
    return this.lab.sampleDetail(id, access);
  }

  @RequirePermission(['lab.sample.create'], { scopes: ['SUBDEPT', 'DEPT', 'ALL'] })
  @Post('samples')
  create(@Body(new ZodPipe(labSampleCreateDto)) body: LabSampleCreateDto, @CurrentAccess() access: AccessContext) {
    return this.lab.createSample(body, access);
  }

  /* ── النتائج ─────────────────────────────────────────────────────────── */

  @RequirePermission(['lab.result.enter'], { scopes: ['SUBDEPT', 'DEPT', 'ALL'] })
  @Post('samples/:id/results')
  enterResults(@Param('id') id: string, @Body(new ZodPipe(labResultEntryDto)) body: LabResultEntryDto, @CurrentAccess() access: AccessContext) {
    return this.lab.enterResults(id, body, access);
  }

  @RequirePermission(['lab.result.verify'], { scopes: ['SUBDEPT', 'DEPT', 'ALL'] })
  @Post('results/:id/verify')
  verify(@Param('id') id: string, @Body(new ZodPipe(labVerifyDto)) body: LabVerifyDto, @CurrentAccess() access: AccessContext) {
    return this.lab.verifyResult(id, body, access);
  }

  /* ── خارج المطابقة ────────────────────────────────────────────────────── */

  @RequirePermission(['lab.oos.view'])
  @Get('oos')
  listOos(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @CurrentAccess() access?: AccessContext,
  ) {
    return this.lab.listOos({ status, severity, take: take ? Number(take) : undefined, skip: skip ? Number(skip) : undefined }, access!);
  }

  @RequirePermission(['lab.oos.manage'])
  @Post('oos/:id')
  updateOos(@Param('id') id: string, @Body(new ZodPipe(labOosUpdateDto)) body: LabOosUpdateDto, @CurrentAccess() access: AccessContext) {
    return this.lab.updateOos(id, body, access);
  }

  /* ── شهادة التحليل ───────────────────────────────────────────────────── */

  @RequirePermission(['lab.report.export'])
  @Get('certificates/:sampleId')
  certificate(@Param('sampleId') sampleId: string, @CurrentAccess() access: AccessContext) {
    return this.lab.certificate(sampleId, access);
  }
}
