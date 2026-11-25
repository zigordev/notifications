import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';

interface Service {
  readonly image: string;
  readonly user?: string;
  readonly init?: boolean;
  readonly read_only?: boolean;
  readonly cap_drop?: readonly string[];
  readonly security_opt?: readonly string[];
  readonly stop_grace_period?: string;
  readonly mem_limit?: string;
  readonly cpus?: number;
  readonly container_name?: string;
  readonly build?: { readonly context: string; readonly dockerfile: string };
  readonly environment?: Readonly<Record<string, string>>;
  readonly labels?: Readonly<Record<string, string>>;
  readonly ports?: readonly unknown[];
  readonly networks?: Readonly<Record<string, unknown>>;
  readonly healthcheck?: {
    readonly test?: readonly string[];
    readonly interval?: string;
    readonly retries?: number;
  };
  readonly tmpfs?: readonly string[];
  readonly command?: readonly string[];
  readonly restart?: string;
  readonly depends_on?: Readonly<Record<string, { readonly condition: string }>>;
  readonly volumes?: readonly { readonly source?: string; readonly target?: string }[];
}

interface Model {
  readonly name: string;
  readonly services: Readonly<Record<string, Service>>;
  readonly networks: Readonly<
    Record<string, { readonly name: string; readonly external?: boolean }>
  >;
  readonly volumes?: Readonly<Record<string, unknown>>;
}

const folder = fileURLToPath(new URL('.', import.meta.url));

function model(files: readonly string[], version?: string): Model {
  const { VERSION: _inherited, ...env } = process.env;
  const output = execFileSync(
    'docker',
    ['compose', ...files.flatMap((file) => ['--file', file]), 'config', '--format', 'json'],
    {
      cwd: folder,
      encoding: 'utf8',
      env: version === undefined ? env : { ...env, VERSION: version },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  return JSON.parse(output) as Model;
}

const everywhere = model(['compose.yaml']);
const laptop = model(['compose.yaml', 'compose.local.yaml']);
const production = model(['compose.yaml', 'compose.production.yaml']);
const released = model(['compose.yaml', 'compose.production.yaml'], '1f3a9c2');
const apps = ['notifications-api'];

function rule(from: Model, app: string): string | undefined {
  return from.services[app]?.labels?.[`traefik.http.routers.${app}.rule`];
}

describe('the scripts', () => {
  const manifest = JSON.parse(readFileSync(`${folder}package.json`, 'utf8')) as {
    readonly scripts: Readonly<Record<string, string>>;
    readonly devDependencies: Readonly<Record<string, string>>;
  };
  const product = 'docker compose --file compose.yaml --file compose.local.yaml';

  it('start the shared services first, from the package notifications depends on', () => {
    expect(manifest.scripts['local:up']).toBe(
      `zigordev-stack up && ${product} up --build --detach --wait`
    );
    expect(manifest.devDependencies['@zigordev/stack']).toBe('catalog:');
  });

  it('stop the product only, and leave the shared services to the other products', () => {
    expect(manifest.scripts['local:down']).toBe(`${product} down`);
    expect(manifest.scripts['local:reset']).toBe(`${product} down --volumes && pnpm run local:up`);
  });

  it('run the one app named on the command line with hot reload, and find it by its folder', () => {
    expect(manifest.scripts.dev).toBe(
      `sh -c 'test -n "$1" || { echo "Name the app: pnpm dev api" >&2; exit 2; }; exec pnpm --fail-if-no-match --filter "./apps/*-$1" run dev' --`
    );
  });

  it('say how to name the app when none is named', () => {
    const ran = spawnSync('pnpm', ['run', '--silent', 'dev'], { cwd: folder, encoding: 'utf8' });

    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('Name the app: pnpm dev api');
  });
});

describe.each(apps)('%s while it is edited', (app) => {
  const scripts = (
    JSON.parse(readFileSync(`${folder}apps/${app}/package.json`, 'utf8')) as {
      readonly scripts: Readonly<Record<string, string>>;
    }
  ).scripts;
  const development = parseEnv(readFileSync(`${folder}apps/${app}/.env.development`, 'utf8'));

  it('has a dev script that reloads it on a change, on this Mac only', () => {
    expect(scripts.dev).toBe(
      'node --env-file=.env.development --watch --import @zigordev/otel/register src/main.ts'
    );
  });

  it('takes the same name in its dev settings as in compose.yaml, and the version dev', () => {
    expect(development.OTEL_SERVICE_NAME).toBe(
      everywhere.services[app]?.environment?.OTEL_SERVICE_NAME
    );
    expect(development.OTEL_SERVICE_VERSION).toBe('dev');
  });
});

describe('the product', () => {
  it('is one Compose project named after the product: its apps, the job and the store', () => {
    expect(everywhere.name).toBe('notifications');
    expect(Object.keys(everywhere.services).sort()).toEqual([
      'notifications-api',
      'notifications-api-migrate',
      'notifications-postgres',
    ]);
  });

  it('joins the network of the shared services, and keeps its database on one of its own', () => {
    expect(Object.keys(everywhere.networks).sort()).toEqual(['notifications', 'zigordev']);
    expect(everywhere.networks.zigordev).toMatchObject({ name: 'zigordev', external: true });
    expect(everywhere.networks.notifications).toMatchObject({
      name: 'notifications_notifications',
    });
    expect(everywhere.networks.notifications?.external).toBeUndefined();
  });

  it('is built from its own Dockerfiles on the laptop, and only there', () => {
    for (const app of apps) {
      expect(laptop.services[app]?.build?.dockerfile).toBe(`apps/${app}/Dockerfile`);
      expect(everywhere.services[app]?.build).toBeUndefined();
      expect(production.services[app]?.build).toBeUndefined();
    }
  });

  it('answers at its whole address, on the laptop and in production, as it has no web app', () => {
    expect(rule(laptop, 'notifications-api')).toBe('Host(`notifications.localhost`)');
    expect(rule(production, 'notifications-api')).toBe('Host(`notifications.zigordev.com`)');
  });

  it('says which environment it runs in', () => {
    for (const app of apps) {
      expect(laptop.services[app]?.environment?.OTEL_RESOURCE_ATTRIBUTES).toBe(
        'deployment.environment.name=local'
      );
      expect(production.services[app]?.environment?.OTEL_RESOURCE_ATTRIBUTES).toBe(
        'deployment.environment.name=production'
      );
    }
  });
});

describe.each(apps)('%s', (app) => {
  const service = everywhere.services[app];

  it('runs our own image, under the version local when none is given', () => {
    expect(service?.image).toBe(`ghcr.io/zigordev/${app}:local`);
    expect(service?.environment?.OTEL_SERVICE_VERSION).toBe('local');
  });

  it('takes its version from VERSION, for the image and for its telemetry alike', () => {
    expect(released.services[app]?.image).toBe(`ghcr.io/zigordev/${app}:1f3a9c2`);
    expect(released.services[app]?.environment?.OTEL_SERVICE_VERSION).toBe('1f3a9c2');
  });

  it('has one name: its service, its image and its telemetry agree', () => {
    expect(service?.environment?.OTEL_SERVICE_NAME).toBe(app);
    expect(service?.container_name).toBeUndefined();
  });

  it('sends its telemetry to the agent, and listens on the port it is given', () => {
    expect(service?.environment?.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://alloy:4318');
    expect(service?.environment?.PORT).toBe('3000');
  });

  it('has a health check that asks its health route, and fails while /tmp/drain exists', () => {
    expect(service?.healthcheck?.test).toEqual([
      'CMD-SHELL',
      'test ! -e /tmp/drain && wget -q -T 4 -O /dev/null http://127.0.0.1:3000/health',
    ]);
  });

  it('drains before it stops: the pre-stop hook waits until the health check has failed, plus 5 seconds', () => {
    const interval = Number.parseInt(service?.healthcheck?.interval ?? '', 10);
    const retries = service?.healthcheck?.retries ?? 0;

    expect(service?.healthcheck?.interval).toBe('10s');
    expect(service?.labels?.['docker-rollout.pre-stop-hook']).toBe(
      `touch /tmp/drain && sleep ${interval * retries + 5}`
    );
  });

  it('restarts unless it was stopped, because the host restarts itself at night', () => {
    expect(service?.restart).toBe('unless-stopped');
  });

  it('has a memory limit and a CPU limit', () => {
    expect(Number(service?.mem_limit)).toBeGreaterThan(0);
    expect(service?.cpus).toBeGreaterThan(0);
  });

  it('runs under an init, as a user that is not root, on a read-only file system', () => {
    expect(service?.init).toBe(true);
    expect(service?.user).toBe('1000:1000');
    expect(service?.read_only).toBe(true);
  });

  it('writes only to memory, and to no more of it than a size it names: /tmp for the drain, and its own folders', () => {
    for (const mount of service?.tmpfs ?? []) {
      expect(mount).toMatch(/^\/(?:tmp|app\/[\w./-]+):uid=1000,gid=1000,size=\d+m$/);
    }
    expect(service?.tmpfs?.[0]).toBe('/tmp:uid=1000,gid=1000,size=1m');
    expect(service?.tmpfs?.length ?? 0).toBe(1);
  });

  it('can gain no privilege, holds no capability, and gets 30 seconds to stop', () => {
    expect(service?.security_opt).toEqual(['no-new-privileges:true']);
    expect(service?.cap_drop).toEqual(['ALL']);
    expect(service?.stop_grace_period).toBe('30s');
  });

  it('is reached through the ingress only: a route, its port, and no published port', () => {
    expect(service?.labels?.['traefik.enable']).toBe('true');
    expect(service?.labels?.[`traefik.http.services.${app}.loadbalancer.server.port`]).toBe('3000');
    expect(service?.ports).toBeUndefined();
    expect(Object.keys(service?.networks ?? {}).sort()).toEqual(['notifications', 'zigordev']);
  });

  it('has a Dockerfile that ends as the user node, with its own ignore file', () => {
    const dockerfile = readFileSync(`${folder}apps/${app}/Dockerfile`, 'utf8');
    const ignored = readFileSync(`${folder}apps/${app}/Dockerfile.dockerignore`, 'utf8');

    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).toMatch(/^CMD \["node", "--import", "@zigordev\/otel\/register", /m);
    expect(ignored.split('\n')).toEqual(
      expect.arrayContaining(['.git', '**/node_modules', '**/.env*'])
    );
  });

  it('is built on one exact Node.js image, of the major version its package asks for', () => {
    const dockerfile = readFileSync(`${folder}apps/${app}/Dockerfile`, 'utf8');
    const manifest = JSON.parse(readFileSync(`${folder}apps/${app}/package.json`, 'utf8')) as {
      readonly engines: { readonly node: string };
    };
    const bases = dockerfile.split('\n').filter((line) => line.startsWith('FROM '));
    const images = new Set(bases.map((line) => line.split(' ')[1]));
    const [image] = images;

    expect(bases).toHaveLength(2);
    expect(images.size).toBe(1);
    expect(image).toMatch(/^node:\d+\.\d+\.\d+-alpine\d+\.\d+$/);
    expect(manifest.engines.node).toBe(`>=${image?.match(/^node:(\d+)\./)?.[1]}`);
  });
});

describe('notifications-api-migrate, the one-shot job', () => {
  const job = everywhere.services['notifications-api-migrate'];

  it('runs the image of the API once, with the command of the migrations, under the job label', () => {
    expect(job?.image).toBe('ghcr.io/zigordev/notifications-api:local');
    expect(released.services['notifications-api-migrate']?.image).toBe(
      'ghcr.io/zigordev/notifications-api:1f3a9c2'
    );
    expect(job?.command).toEqual(['node', 'src/migrate.ts']);
    expect(job?.restart).toBe('no');
    expect(job?.labels).toEqual({ 'com.zigordev.job': 'migrate' });
  });

  it('waits for a healthy database, and the API waits for it on the laptop only', () => {
    expect(job?.depends_on?.['notifications-postgres']?.condition).toBe('service_healthy');
    expect(
      laptop.services['notifications-api']?.depends_on?.['notifications-api-migrate']?.condition
    ).toBe('service_completed_successfully');
    expect(production.services['notifications-api']?.depends_on).toBeUndefined();
  });

  it('is boxed like an app, and reaches the database and the agent, with no route', () => {
    expect(job?.user).toBe('1000:1000');
    expect(job?.read_only).toBe(true);
    expect(job?.cap_drop).toEqual(['ALL']);
    expect(job?.security_opt).toEqual(['no-new-privileges:true']);
    expect(Number(job?.mem_limit)).toBeGreaterThan(0);
    expect(job?.labels?.['traefik.enable']).toBeUndefined();
    expect(Object.keys(job?.networks ?? {}).sort()).toEqual(['notifications', 'zigordev']);
  });
});

describe('notifications-postgres, the store', () => {
  const store = everywhere.services['notifications-postgres'];

  it('runs PostgreSQL 18, pinned by its digest, and the API tests run the same image', async () => {
    const { postgresImage } = await import('./apps/notifications-api/global-setup.ts');

    expect(store?.image).toMatch(/^postgres:18\.\d+-alpine\d+\.\d+@sha256:[0-9a-f]{64}$/);
    expect(postgresImage).toBe(store?.image);
  });

  it('restarts unless it was stopped, because the host restarts itself at night', () => {
    expect(store?.restart).toBe('unless-stopped');
  });

  it('is found by the backup through its label, and keeps its data in a volume of its own', () => {
    expect(store?.labels).toEqual({ 'com.zigordev.backup': 'postgres' });
    expect(store?.volumes).toEqual([
      expect.objectContaining({
        source: 'notifications-postgres-data',
        target: '/var/lib/postgresql',
      }),
    ]);
    expect(Object.keys(everywhere.volumes ?? {})).toEqual(['notifications-postgres-data']);
  });

  it('is reached only on the network of the product, and from this Mac on the laptop', () => {
    expect(Object.keys(store?.networks ?? {})).toEqual(['notifications']);
    expect(store?.ports).toBeUndefined();
    expect(laptop.services['notifications-postgres']?.ports).toEqual([
      expect.objectContaining({ host_ip: '127.0.0.1', published: '5435', target: 5432 }),
    ]);
    expect(production.services['notifications-postgres']?.ports).toBeUndefined();
  });

  it('has a health check, limits, an init, and 30 seconds to stop', () => {
    expect(store?.healthcheck?.test?.slice(0, 2)).toEqual(['CMD', 'pg_isready']);
    expect(Number(store?.mem_limit)).toBeGreaterThan(0);
    expect(store?.cpus).toBeGreaterThan(0);
    expect(store?.init).toBe(true);
    expect(store?.security_opt).toEqual(['no-new-privileges:true']);
    expect(store?.stop_grace_period).toBe('30s');
  });
});

describe('the secrets of production', () => {
  it('are named in .env.production.example, and only named', () => {
    const example = parseEnv(readFileSync(`${folder}.env.production.example`, 'utf8'));

    expect(Object.keys(example).sort()).toEqual([
      'NOTIFICATIONS_API_DATABASE_PASSWORD',
      'NOTIFICATIONS_API_KEYS',
      'POSTGRES_PASSWORD',
    ]);
    expect(Object.values(example).every((value) => value === '')).toBe(true);
  });
});
