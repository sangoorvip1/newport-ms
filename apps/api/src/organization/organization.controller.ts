import { orgUserListQueryDto, type OrgUserListQueryDto } from '@newport/domain';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ZodPipe } from '../common/zod.pipe.js';
import { RequirePermission } from '../security/access.guard.js';
import { OrganizationService } from './organization.service.js';
import { CONFIG } from '../config.js';

@Controller('v1/org')
export class OrganizationController {
  constructor(private readonly org: OrganizationService) {}

  @RequirePermission(['org.dept.view'])
  @Get('tree')
  tree() {
    return this.org.tree();
  }

  @RequirePermission(['org.dept.view'])
  @Get('sub-departments')
  subDepartments() {
    return this.org.subDepartments();
  }

  /** فحص دوري في CI/بيئة الاختبار: هل الهيكل في القاعدة مطابق لمرجع الكود؟ */
  @RequirePermission(['org.dept.manage'])
  @Get('drift')
  drift() {
    return this.org.driftReport(CONFIG.facilityCode);
  }

  @RequirePermission(['org.user.view'])
  @Get('users')
  users(@Query(new ZodPipe(orgUserListQueryDto)) query: OrgUserListQueryDto) {
    return this.org.listUsers(query);
  }

  @RequirePermission(['org.role.manage'])
  @Post('users/assign-role')
  assignRole(
    @Body() body: { userId: string; roleCode: string; scopeKind: 'SELF' | 'TEAM' | 'SUBDEPT' | 'DEPT' | 'ALL'; subDeptId?: string; departmentId?: string },
    @Query('actorId') _ignored: undefined,
  ) {
    return this.org.assignRole({ ...body, actorId: 'system' });
  }

  @RequirePermission(['org.role.manage'])
  @Get('permissions-matrix')
  matrix() {
    return this.org.permissionsMatrix();
  }

  @RequirePermission(['org.role.manage'])
  @Get('permissions-verify')
  verify() {
    return this.org.verifyAgainstDomain();
  }
}
