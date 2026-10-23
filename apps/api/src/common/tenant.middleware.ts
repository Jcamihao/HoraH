import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantContext } from './tenant-context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenant: TenantContext) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    this.tenant.abrir(() => next());
  }
}
