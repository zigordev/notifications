import type { ComponentStatus } from '@zigordev/otel';
import type { Job, JobResult, JobResultStatus, PgBoss } from 'pg-boss';
import { type DeliveryDependencies, deliver, failDeadLetter } from './deliver.ts';
import { type DeliveryJob, deadLetterQueue, deliveryQueue } from './queues.ts';

export interface DeliveryWorkerOptions extends DeliveryDependencies {
  readonly boss: PgBoss;
  readonly pollingIntervalSeconds: number;
  readonly deadLetterPollingIntervalSeconds: number;
}

export class DeliveryWorker {
  readonly #options: DeliveryWorkerOptions;
  #delivering = false;
  #transitions: Promise<void> = Promise.resolve();
  #unsubscribe: (() => void) | undefined;

  constructor(options: DeliveryWorkerOptions) {
    this.#options = options;
  }

  async start(): Promise<void> {
    const { boss, monitor } = this.#options;
    await boss.work<DeliveryJob>(
      deadLetterQueue,
      { pollingIntervalSeconds: this.#options.deadLetterPollingIntervalSeconds },
      async (jobs) => {
        for (const job of jobs) {
          await failDeadLetter(job.data.emailId, this.#options);
        }
      }
    );
    this.#unsubscribe = monitor.onChange((status) => this.#follow(status));
    await monitor.start();
    this.#follow(monitor.status);
    await this.#transitions;
  }

  async stop(): Promise<void> {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#options.monitor.stop();
    await this.#transitions;
  }

  #follow(status: ComponentStatus): void {
    this.#transitions = this.#transitions
      .then(() => (status === 'up' ? this.#resume() : this.#pause()))
      .catch((error: unknown) => {
        this.#options.logger.error({ event: 'delivery.worker_failed', error });
      });
  }

  async #resume(): Promise<void> {
    if (this.#delivering) {
      return;
    }
    this.#delivering = true;
    await this.#options.boss.work<DeliveryJob>(
      deliveryQueue,
      {
        batchSize: 1,
        pollingIntervalSeconds: this.#options.pollingIntervalSeconds,
        perJobResults: true,
      },
      (jobs) => Promise.all(jobs.map((job) => this.#settle(job)))
    );
  }

  async #pause(): Promise<void> {
    if (!this.#delivering) {
      return;
    }
    this.#delivering = false;
    await this.#options.boss.offWork(deliveryQueue, { wait: false });
  }

  async #settle(job: Job<DeliveryJob>): Promise<JobResult> {
    let status: JobResultStatus;
    try {
      status = await deliver(job.data.emailId, this.#options);
    } catch (error) {
      this.#options.logger.error({
        event: 'email.delivery_failed',
        emailId: job.data.emailId,
        error,
      });
      status = 'failed';
    }
    return { id: job.id, status };
  }
}
