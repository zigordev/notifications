import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  async health(@Res() response: Response): Promise<void> {
    await this.writeReadiness(response);
  }

  @Get('health/liveness')
  liveness(): { status: 'UP' } {
    return { status: 'UP' };
  }

  @Get('health/readiness')
  async readiness(@Res() response: Response): Promise<void> {
    await this.writeReadiness(response);
  }

  private async writeReadiness(response: Response): Promise<void> {
    const body = await this.healthService.readiness();
    response.status(body.status === 'UP' ? 200 : 503).json(body);
  }
}
