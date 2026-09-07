import { Module } from '@nestjs/common';
import { WorkOrderController } from './work-order.controller.js';
import { WorkOrderService } from './work-order.service.js';

@Module({ controllers: [WorkOrderController], providers: [WorkOrderService], exports: [WorkOrderService] })
export class WorkOrderModule {}
