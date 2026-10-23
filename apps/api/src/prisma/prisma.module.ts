import { Global, Module } from '@nestjs/common';
import { TenantContext } from '../common/tenant-context';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [TenantContext, PrismaService],
  exports: [TenantContext, PrismaService],
})
export class PrismaModule {}
