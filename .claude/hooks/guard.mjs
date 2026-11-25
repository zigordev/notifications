import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const owner = { name: 'zigordev', email: 'zigordev@gmail.com', login: 'zigordev' };
export const attribution = /co-authored-by:|generated with \[?claude|claude\.com\/claude-code|🤖/i;

const person = `${owner.name} <${owner.email}>`;
const separators = new Set([';', '&', '|']);
const shells = new Set(['bash', 'sh', 'zsh', 'dash']);
const committing = new Set(['commit', 'merge', 'revert', 'cherry-pick', 'rebase', 'am', 'pull']);
const worded = new Set([...committing, 'tag', 'notes']);
const leading = new Set([
  'if',
  'then',
  'else',
  'elif',
  'do',
  'while',
  'until',
  '!',
  '{',
  '}',
  'time',
  'command',
  'builtin',
  'exec',
  'nohup',
  'noglob',
  'nice',
]);
const commitValues = new Set([
  '-m',
  '--message',
  '-F',
  '--file',
  '-C',
  '--reuse-message',
  '-c',
  '--reedit-message',
  '-t',
  '--template',
  '--author',
  '--date',
  '--fixup',
  '--squash',
  '--cleanup',
  '--trailer',
]);
const pushValues = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
const requestValues = new Set(['-f', '-F', '--field', '--raw-field', '--input']);
const requestOptions = new Set([
  '-H',
  '--header',
  '-q',
  '--jq',
  '-t',
  '--template',
  '--hostname',
  '--cache',
  '-p',
  '--preview',
]);
const harmless = new Set([
  'auth',
  'config',
  'help',
  'completion',
  'extension',
  'alias',
  'search',
  'browse',
  'status',
  'attestation',
  'version',
]);
const reads = {
  pr: ['view', 'list', 'checks', 'diff', 'status', 'checkout'],
  issue: ['view', 'list', 'status'],
  repo: ['view', 'list', 'clone'],
  run: ['view', 'list', 'watch', 'download'],
  workflow: ['view', 'list'],
  release: ['view', 'list', 'download'],
  label: ['list'],
  ruleset: ['view', 'list', 'check'],
  secret: ['list'],
  variable: ['list', 'get'],
  cache: ['list'],
  gist: ['view', 'list'],
};
const bodies = {
  pr: ['-F', '--body-file'],
  issue: ['-F', '--body-file'],
  release: ['-F', '--notes-file'],
  api: ['--input'],
};

function deny(reason) {
  return { verdict: 'deny', reason };
}

function ask(reason) {
  return { verdict: 'ask', reason };
}

export function parse(text) {
  const commands = [];
  const heredocs = [];
  let index = 0;

  function delimiter() {
    const strip = text[index] === '-';
    if (strip) {
      index += 1;
    }
    while (text[index] === ' ' || text[index] === '\t') {
      index += 1;
    }
    let tag = '';
    while (index < text.length && !/[\s;&|()<>]/.test(text[index])) {
      if (!'\'"\\'.includes(text[index])) {
        tag += text[index];
      }
      index += 1;
    }
    return { tag, strip };
  }

  function documents(pending) {
    for (const { tag, strip } of pending.splice(0)) {
      const lines = [];
      while (index < text.length) {
        const end = text.indexOf('\n', index);
        const stop = end === -1 ? text.length : end;
        const line = text.slice(index, stop);
        index = Math.min(stop + 1, text.length);
        if ((strip ? line.replace(/^\t+/, '') : line) === tag) {
          break;
        }
        lines.push(line);
      }
      heredocs.push(lines.join('\n'));
    }
  }

  function quoted(add) {
    while (index < text.length && text[index] !== '"') {
      const char = text[index];
      const next = text[index + 1];
      if (char === '\\' && next !== undefined) {
        add(next);
        index += 2;
      } else if (char === '$' && next === '(') {
        index += 2;
        list(')');
        add('$()');
      } else if (char === '`') {
        index += 1;
        list('`');
        add('$()');
      } else {
        add(char);
        index += 1;
      }
    }
    index += 1;
  }

  function escaped(add) {
    let piece = '';
    while (index < text.length && text[index] !== "'") {
      if (text[index] === '\\' && index + 1 < text.length) {
        index += 1;
      }
      piece += text[index];
      index += 1;
    }
    index += 1;
    add(piece);
  }

  function list(closer) {
    let words = [];
    let word;
    let from = index;
    let depth = 0;
    const pending = [];
    const add = (piece) => {
      word = (word ?? '') + piece;
    };
    const endWord = () => {
      if (word !== undefined) {
        words.push(word);
        word = undefined;
      }
    };
    const endCommand = (to) => {
      endWord();
      if (words.length > 0) {
        commands.push({ words, raw: text.slice(from, to) });
      }
      words = [];
    };
    while (index < text.length) {
      const char = text[index];
      const next = text[index + 1];
      if (char === closer && depth === 0) {
        endCommand(index);
        index += 1;
        return;
      }
      if (char === '\n') {
        endCommand(index);
        index += 1;
        documents(pending);
        from = index;
      } else if (char === ' ' || char === '\t') {
        endWord();
        index += 1;
      } else if (char === '\\') {
        if (next !== '\n') {
          add(next ?? '');
        }
        index += 2;
      } else if (char === "'") {
        const end = text.indexOf("'", index + 1);
        const stop = end === -1 ? text.length : end;
        add(text.slice(index + 1, stop));
        index = stop + 1;
      } else if (char === '"') {
        index += 1;
        add('');
        quoted(add);
      } else if (char === '$' && next === "'") {
        index += 2;
        escaped(add);
      } else if (char === '$' && next === '(') {
        index += 2;
        list(')');
        add('$()');
      } else if (char === '`') {
        index += 1;
        list('`');
        add('$()');
      } else if (char === '#' && word === undefined) {
        const end = text.indexOf('\n', index);
        index = end === -1 ? text.length : end;
      } else if (char === '<' && next === '<' && text[index + 2] === '<') {
        add('<<<');
        index += 3;
      } else if (char === '<' && next === '<') {
        index += 2;
        pending.push(delimiter());
      } else if (char === '>' || (char === '&' && next === '>')) {
        while ('>&'.includes(text[index] ?? ' ')) {
          add(text[index]);
          index += 1;
        }
      } else if (char === '(' || char === ')') {
        endCommand(index);
        depth = Math.max(0, depth + (char === '(' ? 1 : -1));
        index += 1;
        from = index;
      } else if (separators.has(char)) {
        endCommand(index);
        while (separators.has(text[index])) {
          index += 1;
        }
        from = index;
      } else {
        add(char);
        index += 1;
      }
    }
    endCommand(index);
  }

  list(undefined);
  return { commands, heredocs };
}

export function plain(words) {
  const env = {};
  let rest = words;
  while (rest.length > 0) {
    const [first, second] = rest;
    const assigned = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(first);
    if (assigned) {
      env[assigned[1]] = assigned[2];
      rest = rest.slice(1);
    } else if (leading.has(first)) {
      rest = rest.slice(1);
    } else if (first === 'env') {
      rest = rest.slice(1);
      while (rest[0]?.startsWith('-')) {
        rest = rest.slice(rest[0] === '-u' ? 2 : 1);
      }
    } else if (first === 'timeout' || first === 'gtimeout') {
      rest = rest.slice(1);
      while (rest[0]?.startsWith('-')) {
        rest = rest.slice(1);
      }
      rest = rest.slice(1);
    } else if (first === 'mise' && (second === 'exec' || second === 'x')) {
      const dashes = rest.indexOf('--');
      rest = rest.slice(dashes === -1 ? 2 : dashes + 1);
    } else {
      break;
    }
  }
  return { words: rest, env };
}

function nested(words) {
  const [program = '', ...args] = words;
  if (shells.has(basename(program))) {
    const flag = args.findIndex((arg) => /^-[a-z]*c$/.test(arg));
    return flag === -1 ? undefined : args[flag + 1];
  }
  return program === 'eval' ? args.join(' ') : undefined;
}

function move(dir, target) {
  const home = homedir();
  const path = (target ?? '~').replace(/^~(?=\/|$)/, home).replace(/^\$\{?HOME\}?(?=\/|$)/, home);
  if (path.includes('$') || path === '-') {
    return undefined;
  }
  if (path.startsWith('/')) {
    return resolve(path);
  }
  return dir === undefined ? undefined : resolve(dir, path);
}

function sort(rest, valued) {
  const flags = [];
  const positional = [];
  for (let at = 0; at < rest.length; at += 1) {
    const arg = rest[at];
    if (!arg.startsWith('-') || arg === '-') {
      positional.push(arg);
    } else {
      flags.push(arg);
      if (valued.has(arg)) {
        at += 1;
      }
    }
  }
  return { flags, positional };
}

function values(words, names) {
  const found = [];
  for (let at = 0; at < words.length; at += 1) {
    const long = names.find((name) => name.startsWith('--') && words[at].startsWith(`${name}=`));
    if (long !== undefined) {
      found.push(words[at].slice(long.length + 1));
    } else if (names.includes(words[at]) && words[at + 1] !== undefined) {
      found.push(words[at + 1]);
      at += 1;
    }
  }
  return found;
}

function texts(words, names, dir, probe) {
  if (dir === undefined) {
    return [];
  }
  return values(words, names)
    .filter((path) => path !== '-')
    .map((path) => probe.read(resolve(dir, path)) ?? '');
}

function short(flags, letter) {
  return flags.some((flag) => new RegExp(`^-[a-zA-Z]*${letter}[a-zA-Z]*$`).test(flag));
}

function identity(rest, where, configs, env, probe) {
  const found = probe.identity(where, configs, env);
  const [stated] = values(rest, ['--author']);
  const people = [stated ?? found.author, found.committer];
  if (people.every((who) => who === person)) {
    return [];
  }
  const wrong = people.find((who) => who !== person) ?? 'nobody';
  return [
    deny(
      `A commit here would be made as "${wrong}", not as "${person}". Set the identity in this repo: git config user.name ${owner.name} && git config user.email ${owner.email}`
    ),
  ];
}

function skipping(action, rest, configs, env) {
  const { flags } = sort(rest, action === 'push' ? pushValues : commitValues);
  const skipped =
    flags.includes('--no-verify') ||
    (action === 'commit' && flags.some((flag) => /^-[^-mFCct=]*n/.test(flag))) ||
    configs.some((config) => /^core\.hookspath=/i.test(config)) ||
    /^(0|false)$/i.test(env.LEFTHOOK ?? '');
  return skipped
    ? [ask('This skips the git hooks, which are part of the check. Only the owner can allow it.')]
    : [];
}

function account(probe) {
  const login = probe.login();
  return login === undefined || login === owner.login
    ? []
    : [
        deny(
          `gh is acting as "${login}", not as ${owner.login}. Run: gh auth switch -u ${owner.login}`
        ),
      ];
}

function push(rest, where, probe) {
  const { flags, positional } = sort(rest, pushValues);
  const verdicts = account(probe);
  const current = probe.branch(where);
  const removing = flags.includes('--delete') || short(flags, 'd');
  const specs = positional.slice(1);
  const targets =
    specs.length === 0
      ? [probe.destination(where)]
      : specs.map((spec) => {
          const bare = spec.replace(/^\+/, '');
          const end = removing || !bare.includes(':') ? bare : bare.slice(bare.indexOf(':') + 1);
          const target = end.replace(/^refs[/]heads[/]/, '');
          return target === 'HEAD' || target === '@' ? current : target;
        });
  if (flags.includes('--all') || flags.includes('--mirror') || targets.includes('main')) {
    verdicts.push(
      deny('Nothing is pushed to main. Push the working branch and open a pull request.')
    );
  }
  const forced =
    flags.includes('--force') ||
    flags.some((flag) => flag.startsWith('--force-with-lease')) ||
    short(flags, 'f') ||
    specs.some((spec) => spec.startsWith('+'));
  if (forced && targets.some((target) => target === undefined || target !== current)) {
    verdicts.push(
      ask('A force push goes only to your own working branch. This one reaches another branch.')
    );
  }
  return verdicts;
}

function git({ args, env, raw, heredocs, dir }, probe) {
  const configs = [];
  let where = dir;
  let at = 0;
  while (at < args.length && args[at].startsWith('-')) {
    if (args[at] === '-C') {
      where = move(where, args[at + 1]);
      at += 1;
    } else if (args[at] === '-c') {
      configs.push(args[at + 1] ?? '');
      at += 1;
    } else if (/^--(git-dir|work-tree|namespace|super-prefix|config-env)$/.test(args[at])) {
      at += 1;
    }
    at += 1;
  }
  const action = args[at];
  const rest = args.slice(at + 1);
  const verdicts = [];
  if (worded.has(action)) {
    const text = [raw, ...heredocs, ...texts(rest, ['-F', '--file'], where, probe)].join('\n');
    if (attribution.test(text)) {
      verdicts.push(
        deny(
          'This message carries an attribution line. Remove it: no commit credits a tool or a co-author.'
        )
      );
    }
  }
  if (where === undefined || !probe.scoped(where)) {
    return verdicts;
  }
  if (committing.has(action)) {
    verdicts.push(...identity(rest, where, configs, env, probe));
  }
  if (committing.has(action) || action === 'push') {
    verdicts.push(...skipping(action, rest, configs, env));
  }
  if (action === 'push') {
    verdicts.push(...push(rest, where, probe));
  }
  return verdicts;
}

function request(words) {
  let method;
  let path;
  const fields = [];
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at];
    if (word === '-X' || word === '--method') {
      method = words[at + 1];
      at += 1;
    } else if (word.startsWith('--method=')) {
      method = word.slice(9);
    } else if (/^-X./.test(word)) {
      method = word.slice(2);
    } else if (requestValues.has(word)) {
      fields.push(words[at + 1] ?? '');
      at += 1;
    } else if (/^--(field|raw-field|input)=/.test(word)) {
      fields.push(word.slice(word.indexOf('=') + 1));
    } else if (requestOptions.has(word)) {
      at += 1;
    } else if (!word.startsWith('-') && path === undefined) {
      path = word;
    }
  }
  const verb = (method ?? (fields.length > 0 ? 'POST' : 'GET')).toUpperCase();
  const query =
    path === 'graphql' &&
    fields.length > 0 &&
    fields.every((field) => !/\bmutation\b/i.test(field) && !field.includes('=@'));
  return { verb, path: path ?? '', write: verb !== 'GET' && !query };
}

function ours(group, options, dir, probe) {
  const [named] = values(options, ['-R', '--repo']);
  if (named !== undefined) {
    return /(^|[/])zigordev[/]/i.test(named);
  }
  return (
    options.some((word) => /(^|\/)(repos|orgs|users)\/zigordev(\/|$)/i.test(word)) ||
    (group === 'repo' && options.some((word) => /^zigordev[/]/i.test(word))) ||
    (dir !== undefined && probe.scoped(dir))
  );
}

function gh({ args, raw, heredocs, dir }, probe) {
  const [group = '', ...options] = args;
  const [action = ''] = options;
  if (group === '' || group.startsWith('-') || harmless.has(group)) {
    return [];
  }
  const call = group === 'api' ? request(options) : undefined;
  if (call === undefined ? (reads[group] ?? []).includes(action) : !call.write) {
    return [];
  }
  const verdicts = [];
  const text = [raw, ...heredocs, ...texts(options, bodies[group] ?? [], dir, probe)].join('\n');
  if (attribution.test(text)) {
    verdicts.push(
      deny(
        'This text carries an attribution line. Remove it: nothing credits a tool or a co-author.'
      )
    );
  }
  if (ours(group, options, dir, probe)) {
    verdicts.push(...account(probe));
  }
  const { flags } = sort(options, new Set());
  const approving =
    (group === 'pr' && action === 'review' && (flags.includes('--approve') || short(flags, 'a'))) ||
    (group === 'pr' && action === 'merge' && flags.includes('--admin')) ||
    /\/(pending_deployments|deployment_protection_rule)|\/actions\/runs\/\d+\/approve/.test(
      call?.path ?? ''
    );
  const labelling =
    flags.some((flag) => /^(--add-label|--remove-label|--label|-l)(=|$)/.test(flag)) ||
    /\/labels(\/|$)/.test(call?.path ?? '');
  if (approving) {
    verdicts.push(
      deny(
        "An approval is the owner's own click in GitHub, and a session never gives one. Say what is waiting, and stop."
      )
    );
  } else if (labelling) {
    verdicts.push(ask("A label can stand for an approval, so changing one needs the owner's yes."));
  } else if (call !== undefined) {
    verdicts.push(
      ask(
        `This changes something on GitHub with ${call.verb} ${call.path}. Settings, rulesets and repos wait for the owner's yes.`
      )
    );
  }
  return verdicts;
}

export function decide(event, probe = system) {
  const verdicts = [];
  const visit = (text, start) => {
    const { commands, heredocs } = parse(text);
    let dir = start;
    for (const command of commands) {
      const { words, env } = plain(command.words);
      const [program = '', ...args] = words;
      const inner = nested(words);
      if (program === 'cd' || program === 'pushd') {
        dir = move(dir, args[0]);
      } else if (inner !== undefined) {
        visit(inner, dir);
      } else if (basename(program) === 'git') {
        verdicts.push(...git({ args, env, raw: command.raw, heredocs, dir }, probe));
      } else if (basename(program) === 'gh') {
        verdicts.push(...gh({ args, raw: command.raw, heredocs, dir }, probe));
      }
    }
  };
  visit(
    String(event.tool_input?.command ?? ''),
    typeof event.cwd === 'string' ? event.cwd : undefined
  );
  return verdicts.find((verdict) => verdict.verdict === 'deny') ?? verdicts[0];
}

export function written(event) {
  const files = [];
  const path = event.tool_input?.file_path;
  if ((event.tool_name === 'Write' || event.tool_name === 'Edit') && typeof path === 'string') {
    files.push(path);
  }
  const changed = event.tool_response?.bashEditDiff?.changedFiles;
  if (event.tool_name === 'Bash' && Array.isArray(changed)) {
    files.push(...changed.filter((file) => typeof file === 'string'));
  }
  return files;
}

export function review(files, probe = system) {
  const groups = new Map();
  for (const file of files) {
    const root = probe.exists(file) ? probe.home(file) : undefined;
    if (root !== undefined && !probe.ignored(root, file)) {
      groups.set(root, [...(groups.get(root) ?? []), relative(root, file)]);
    }
  }
  const findings = [];
  for (const [root, paths] of groups) {
    const result = probe.check(root, paths);
    if (result.code === 1 && /^zigordev check: \d+ findings? /m.test(result.output)) {
      findings.push(result.output.trim());
    }
  }
  return findings;
}

export function respond(text, probe = system) {
  const quiet = { code: 0, stdout: '', stderr: '' };
  let event;
  try {
    event = JSON.parse(text);
  } catch {
    return quiet;
  }
  if (event?.hook_event_name === 'PreToolUse' && event.tool_name === 'Bash') {
    let verdict;
    try {
      verdict = decide(event, probe);
    } catch (error) {
      verdict = deny(`The guard could not read this command (${error}). Run it in simpler steps.`);
    }
    if (verdict === undefined) {
      return quiet;
    }
    return {
      ...quiet,
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: verdict.verdict,
          permissionDecisionReason: verdict.reason,
        },
      }),
    };
  }
  if (event?.hook_event_name === 'PostToolUse') {
    const findings = review(written(event), probe);
    if (findings.length > 0) {
      return {
        code: 2,
        stdout: '',
        stderr: [
          'A file that was just written holds a comment:',
          ...findings,
          'Remove it. The reasoning goes in the commit body, the pull request or the docs.',
          '',
        ].join('\n'),
      };
    }
  }
  return quiet;
}

function run(file, args, env) {
  try {
    return execFileSync(file, args, {
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
  } catch {
    return undefined;
  }
}

function command(root) {
  return join(root, 'node_modules', '@zigordev', 'dev', 'bin', 'zigordev.js');
}

export const system = {
  scoped(dir) {
    const url = run('git', ['-C', dir, 'remote', 'get-url', 'origin']);
    if (url !== undefined && /[:/]zigordev[/]/i.test(url)) {
      return true;
    }
    const top = run('git', ['-C', dir, 'rev-parse', '--show-toplevel']);
    return top !== undefined && existsSync(join(top, '.claude', 'hooks', 'guard.mjs'));
  },
  identity(dir, configs, env) {
    const flags = configs.flatMap((config) => ['-c', config]);
    const who = (kind) => {
      const ident = run('git', ['-C', dir, ...flags, 'var', kind], env) ?? '';
      return /^(.* <[^>]*>) \d+ [+-]\d{4}$/.exec(ident)?.[1];
    };
    return { author: who('GIT_AUTHOR_IDENT'), committer: who('GIT_COMMITTER_IDENT') };
  },
  branch(dir) {
    return run('git', ['-C', dir, 'symbolic-ref', '--quiet', '--short', 'HEAD']);
  },
  destination(dir) {
    const target = run('git', ['-C', dir, 'rev-parse', '--abbrev-ref', '@{push}']);
    return target === undefined ? system.branch(dir) : target.slice(target.indexOf('/') + 1);
  },
  login() {
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
      return undefined;
    }
    return run('gh', ['config', 'get', 'user', '-h', 'github.com']) || undefined;
  },
  read(path) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return undefined;
    }
  },
  exists(path) {
    return existsSync(path);
  },
  home(file) {
    let folder = dirname(file);
    while (!existsSync(command(folder))) {
      const parent = dirname(folder);
      if (parent === folder) {
        return undefined;
      }
      folder = parent;
    }
    return folder;
  },
  ignored(root, file) {
    return spawnSync('git', ['-C', root, 'check-ignore', '-q', file]).status === 0;
  },
  check(root, paths) {
    const result = spawnSync('node', [command(root), 'check', 'comments', ...paths], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
    });
    return { code: result.status, output: result.stdout ?? '' };
  },
};

if (
  process.argv[1] !== undefined &&
  existsSync(process.argv[1]) &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  const result = respond(readFileSync(0, 'utf8'));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
