import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentAccess, RequirePermission, type AccessContext } from '../security/access.guard.js';
import { WorkOrderService } from './work-order.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  workOrderCreateDto,
  workOrderListQueryDto,
  workOrderTransitionDto,
  type WorkOrderCreateDto,
  type WorkOrderListQueryDto,
  type WorkOrderTransitionDto,
} from '@newport/domain';

@Controller('v1/maintenance/work-orders')
export class WorkOrderController {
  constructor(private readonly wo: WorkOrderService) {}

  @RequirePermission(['maint.wo.view'])
  @Get()
  list(@Query(new ZodPipe(workOrderListQueryDto)) query: WorkOrderListQueryDto, @CurrentAccess() access?: AccessContext) {
    return this.wo.list(query, access!);
  }

  @RequirePermission(['maint.wo.view'])
  @Get(':id')
  detail(@Param('id') id: string, @CurrentAccess() access: AccessContext) {
    return this.wo.detail(id, access);
  }

  @RequirePermission(['maint.wo.create'], { scopes: ['SUBDEPT', 'DEPT', 'ALL'] })
  @Post()
  create(@Body(new ZodPipe(workOrderCreateDto)) body: WorkOrderCreateDto, @CurrentAccess() access: AccessContext) {
    return this.wo.create(body, access);
  }

  @RequirePermission(['maint.wo.execute', 'maint.wo.assign', 'maint.wo.close', 'maint.wo.cancel'], { anyOf: true })
  @Post(':id/transition')
  transition(@Param('id') id: string, @Body(new ZodPipe(workOrderTransitionDto)) body: WorkOrderTransitionDto, @CurrentAccess() access: AccessContext) {
    return this.wo.transition(id, body, access);
  }

  @RequirePermission(['maint.wo.execute'])
  @Post(':id/labor')
  addLabor(
    @Param('id') id: string,
    @Body() body: { entries: Array<{ employeeId: string; hours: number; workDate: string; isOvertime?: boolean; shiftCode?: string }> },
    @CurrentAccess() access: AccessContext,
  ) {
    return this.wo.addLabor(id, body.entries ?? [], access);
  }
}
