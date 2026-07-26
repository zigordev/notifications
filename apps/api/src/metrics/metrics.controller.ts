import { Controller, Get, Header } from '@nestjs/common';
import { NotificationMetricsService } from './notification-metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metrics: NotificationMetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  renderMetrics(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
