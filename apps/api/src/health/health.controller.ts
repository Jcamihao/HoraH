import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Publico } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Publico()
  @SkipThrottle()
  @Get()
  async health() {
    await this.prisma.semTenant.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
