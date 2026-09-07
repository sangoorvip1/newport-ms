import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller.js';
import { SyncEngineService } from './sync-engine.service.js';

@Module({ controllers: [SyncController], providers: [SyncEngineService], exports: [SyncEngineService] })
export class SyncModule {}
