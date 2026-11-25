import { start, stopOnSignals } from './start.ts';

stopOnSignals(await start());
