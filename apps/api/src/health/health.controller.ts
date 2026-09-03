import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

/**
 * One endpoint, reporting everything.
 *
 * Unlike gpool and kini, this service CONSUMES its topic rather than producing
 * to it — a consumer that has dropped out of its group silently stops working,
 * with emails piling up and nothing erroring anywhere. So Kafka is required
 * here, not optional, and its loss is a 503 rather than a degradation.
 *
 * Note for the future: a single dependency-probing endpoint is fine as a Docker
 * healthcheck, which does not restart on failure. Used as a Kubernetes liveness
 * probe it would turn a dependency blip into a restart loop; a separate
 * liveness path would be needed then.
 */
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  async health(@Res() response: Response): Promise<void> {
    const body = await this.healthService.check();
    response.status(body.status === 'ok' ? 200 : 503).json(body);
  }
}
