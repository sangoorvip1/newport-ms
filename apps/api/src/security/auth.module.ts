import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { PermissionService } from './permission.service.js';
import { AccessGuard } from './access.guard.js';
import { CONFIG } from '../config.js';

@Global()
@Module({
  imports: [JwtModule.register({ secret: CONFIG.jwtSecret, signOptions: { expiresIn: CONFIG.jwtAccessTtlSec } })],
  controllers: [AuthController],
  providers: [AuthService, PermissionService, AccessGuard],
  exports: [AuthService, PermissionService, AccessGuard, JwtModule],
})
export class AuthModule {}
