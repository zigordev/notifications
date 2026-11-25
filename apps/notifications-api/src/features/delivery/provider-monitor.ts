import type { ComponentStatus, Logger } from '@zigordev/otel';
import type { EmailProvider, SendFailure } from './provider.ts';

export interface ProviderMonitorOptions {
  readonly provider: EmailProvider;
  readonly logger: Logger;
  readonly intervalMs: number;
}

type Listener = (status: ComponentStatus) => void;

export class ProviderMonitor {
  readonly #provider: EmailProvider;
  readonly #logger: Logger;
  readonly #intervalMs: number;
  readonly #listeners = new Set<Listener>();
  #status: ComponentStatus = 'unknown';
  #timer: NodeJS.Timeout | undefined;
  #checking: Promise<void> | undefined;

  constructor(options: ProviderMonitorOptions) {
    this.#provider = options.provider;
    this.#logger = options.logger;
    this.#intervalMs = options.intervalMs;
  }

  get status(): ComponentStatus {
    return this.#status;
  }

  onChange(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    await this.check();
    this.#timer ??= setInterval(() => {
      void this.check();
    }, this.#intervalMs);
    this.#timer.unref();
  }

  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  check(): Promise<void> {
    this.#checking ??= this.#verify().finally(() => {
      this.#checking = undefined;
    });
    return this.#checking;
  }

  reportUnavailable(failure: SendFailure): void {
    this.#change('down', failure);
  }

  async #verify(): Promise<void> {
    try {
      await this.#provider.verify();
      this.#change('up');
    } catch (error) {
      this.#change('down', this.#provider.classify(error));
    }
  }

  #change(next: ComponentStatus, failure?: SendFailure): void {
    const previous = this.#status;
    if (next === previous) {
      return;
    }
    this.#status = next;
    if (next === 'down') {
      this.#logger.error({
        event: 'provider.unavailable',
        provider: this.#provider.name,
        errorClass: failure?.errorClass,
        smtpCode: failure?.smtpCode,
      });
    } else if (previous === 'down') {
      this.#logger.info({ event: 'provider.recovered', provider: this.#provider.name });
    }
    for (const listener of this.#listeners) {
      listener(next);
    }
  }
}
