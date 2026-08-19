/**
 * Commander adapter for the `dsh` command line.
 *
 * The launcher parses only what it owns — which profile to boot, which extra
 * patch overlays to apply, and the config dumps — and hands **everything after
 * its own flags** to the booted tree verbatim, where injected app plugins parse
 * their own flag families and print their own `--help` (see
 * `@deepseek-ai/dsh-cmdline`). Launcher flags therefore come first: the first
 * token this parser does not recognize starts the inner arguments, so
 * `dsh --profile tui --resume abc` boots the tui profile with `--resume abc`,
 * and `dsh --profile web -h` prints the web app's help, not this one's.
 *
 * `web` is a hardcoded alias for `--profile web`; `plugin` manages a profile's
 * plugin dependencies by forwarding to pnpm. `recovery` owns boot-independent
 * control-plane checkpoints.
 * @module @deepseek-ai/dsh/args
 */

import { Command, CommanderError } from 'commander'

/** Boot a named profile and hand it the invocation's inner arguments. */
interface ProfileInvocation {
  mode: 'profile'
  profile: string
  /** Extra patch-list overlays applied after the profile's own layer, in argv order. */
  patches: string[]
  /** Everything after the launcher's own flags, verbatim, for injected app plugins. */
  args: string[]
}

/** Print a composed profile tree and exit without booting. */
interface DumpConfigInvocation {
  mode: 'dump-config'
  profile: string
  /** Omit the profile's user layer and --patch overlays; print bundle layers only. */
  defaultOnly: boolean
  patches: string[]
}

/** Manage a profile's plugins: forward `args` to pnpm inside the profile directory. */
interface PluginInvocation {
  mode: 'plugin'
  profile: string
  /** Raw pnpm arguments, verbatim. */
  args: string[]
}

/** Paths shared by recovery operations. The runner resolves omitted paths. */
interface RecoveryPaths {
  source?: string
  dshHome?: string
  store?: string
  json: boolean
}

/** Create an immutable recovery checkpoint. */
interface RecoveryCreateInvocation extends RecoveryPaths {
  mode: 'recovery'
  action: 'create'
  label?: string
}

/** List recovery checkpoints without booting DSH. */
interface RecoveryListInvocation {
  mode: 'recovery'
  action: 'list'
  store?: string
  json: boolean
}

/** Verify one recovery checkpoint and all of its payload hashes. */
interface RecoveryVerifyInvocation {
  mode: 'recovery'
  action: 'verify'
  snapshot: string
  store?: string
  json: boolean
}

/** Restore one checkpoint after an explicit offline acknowledgement. */
interface RecoveryRestoreInvocation extends RecoveryPaths {
  mode: 'recovery'
  action: 'restore'
  snapshot: string
  confirm?: string
  offline: boolean
}

/** Internal detached guardian: wait for the Host, restore, then restart it. */
interface RecoveryGuardianRestoreInvocation extends RecoveryPaths {
  mode: 'recovery'
  action: 'guardian-restore'
  snapshot: string
  parentPid: number
  restartSpec: string
}

/** A boot-independent recovery command. */
export type RecoveryInvocation =
  | RecoveryCreateInvocation
  | RecoveryListInvocation
  | RecoveryVerifyInvocation
  | RecoveryRestoreInvocation
  | RecoveryGuardianRestoreInvocation

/** The resolved `dsh` invocation. Help, version, and errors exit inside {@link parseDshArgs}. */
export type DshInvocation = ProfileInvocation | DumpConfigInvocation | PluginInvocation | RecoveryInvocation

/** Launcher flags shared by the default command and the `web` alias. */
interface BootOptions {
  patch?: string[]
  dumpConfig?: boolean
  dumpDefaultConfig?: boolean
}

/**
 * Repeatable single-value collector: `--patch a.yml --patch b.yml`. Never
 * variadic — a variadic `--patch` would swallow the inner arguments.
 */
const collect = (value: string, previous: string[] = []): string[] => [...previous, value]

/** The launcher's own help text; each app prints its own. */
const HELP_EXAMPLES = `
Examples:
  dsh --profile web                          boot the web profile (same as: dsh web)
  dsh --profile headless "run the tests"     answer one task, print the result, and exit
  dsh --profile tui --patch ./extra.yml      boot a custom profile with one extra overlay
  dsh --profile tui --resume <session>       arguments after the launcher flags reach the app
  dsh --profile web --help                   the web app's own flags and help
  dsh plugin --profile tui add <package>     install a plugin into the tui profile
  dsh recovery create --source /path/to/dsh  checkpoint source and DSH control files
  dsh recovery list                          list checkpoints without booting DSH
`

/**
 * Resolve a boot or dump invocation from the launcher flags and the leftover
 * inner arguments.
 * @param program - the command whose options were parsed (the root, or the `web` alias).
 * @param profile - the profile these flags boot.
 * @param options - the launcher flags commander collected.
 * @param args - the leftover arguments, in argv order.
 * @returns the resolved invocation.
 */
function resolveBoot(program: Command, profile: string, options: BootOptions, args: string[]): DshInvocation {
  const patches = options.patch ?? []
  if (patches.includes('')) program.error('error: --patch needs a path')
  if (options.dumpConfig !== true && options.dumpDefaultConfig !== true) {
    return { mode: 'profile', profile, patches, args }
  }
  if (options.dumpConfig === true && options.dumpDefaultConfig === true) {
    program.error('error: --dump-config and --dump-default-config are mutually exclusive')
  }
  // The dump is boot-free: it never runs app command-line providers, so it
  // cannot show what those flags would decide, and printing a tree that differs
  // from the same invocation's boot would mislead.
  if (args.length > 0) {
    program.error(`error: config dumps take no app arguments, got ${args.map(argument => JSON.stringify(argument)).join(' ')}`)
  }
  const defaultOnly = options.dumpDefaultConfig === true
  if (defaultOnly && patches.length > 0) {
    program.error('error: --dump-default-config prints the bundle layers and takes no --patch')
  }
  return { mode: 'dump-config', profile, defaultOnly, patches }
}

/**
 * Resolve argv into one invocation, or print and exit for help, version, or an
 * error.
 * @param argv - arguments after the Node binary and script.
 * @param version - version string printed by `--version`.
 * @returns the resolved invocation.
 */
export function parseDshArgs(argv: readonly string[], version: string): DshInvocation {
  let resolved: DshInvocation | undefined
  // Annotated, not inferred: the actions below call back into `program`, and an
  // inferred type would be circular through its own chain.
  const program: Command = new Command()
  program
    .name('dsh')
    .version(version, '-V, --version', 'output the version number')
    .description('dsh: boot a DeepSeek Harness profile — an ordered stack of plugin-bundle patch layers under your own overrides.')
    .addHelpText('after', HELP_EXAMPLES)
    .exitOverride()
    // The launcher's flags come first and end at the first token it does not
    // know; everything from there on belongs to the booted app, including
    // its -h. `dsh -h` with no profile still prints this help, below.
    .helpOption(false)
    .allowUnknownOption()
    .passThroughOptions()
    .enablePositionalOptions()
    .argument('[args...]', 'arguments for the booted profile\'s app (see: dsh --profile <name> --help)')
    .option('--profile <name>', 'the profile under $DSH_HOME/profiles to boot')
    .option('--patch <path>', 'extra patch-list overlay applied after the profile layer (repeatable)', collect)
    .option('--dump-config', 'print the composed profile tree and exit')
    .option('--dump-default-config', 'print the profile tree without its user layer or --patch overlays and exit')
    .action((args: string[], options: BootOptions & { profile?: string }) => {
      // With the app owning -h, the launcher's own help is what a bare
      // `dsh -h` (no profile to hand it to) must print.
      if (options.profile === undefined) {
        if (args.some(argument => argument === '-h' || argument === '--help')) program.help()
        program.error('error: --profile <name> is required')
      }
      const profile = options.profile
      if (profile === '') program.error('error: --profile needs a name')
      resolved = resolveBoot(program, profile, options, args)
    })

  /** Reject parent options supplied before a subcommand. */
  const rejectParentOptions = (command: string): void => {
    const parent = program.opts<BootOptions & { profile?: string }>()
    if (parent.profile !== undefined || parent.patch !== undefined
      || parent.dumpConfig !== undefined || parent.dumpDefaultConfig !== undefined) {
      program.error(`error: ${command} takes none of parent --profile, --patch, --dump-config, or --dump-default-config`)
    }
  }

  const web = program.command('web').description('boot the web profile (alias of --profile web); the web app\'s own flags follow')
  web
    .helpOption(false)
    .allowUnknownOption()
    .passThroughOptions()
    .enablePositionalOptions()
    .argument('[args...]', 'arguments for the web app (see: dsh web --help)')
    .option('--patch <path>', 'extra patch-list overlay applied after the profile layer (repeatable)', collect)
    .option('--dump-config', 'print the composed web-profile tree (with the user layer and any --patch) and exit')
    .option('--dump-default-config', 'print the web profile\'s bundle layers (no user layer) and exit')
    .action((args: string[], options: BootOptions) => {
      rejectParentOptions('web')
      resolved = resolveBoot(web, 'web', options, args)
    })

  const plugin = program.command('plugin').description('manage a profile\'s plugins by forwarding the remaining arguments to pnpm in the profile directory')
  plugin
    .requiredOption('--profile <name>', 'the profile whose plugins to manage (initialized on first use)')
    .allowUnknownOption()
    .argument('[args...]', 'pnpm arguments, forwarded verbatim (add <pkg>, remove <pkg>, why <pkg>, ...)')
    .action((args: string[], options: { profile: string }) => {
      rejectParentOptions('plugin')
      if (options.profile === '') program.error('error: --profile needs a name')
      if (args.length === 0) program.error('error: plugin needs pnpm arguments to forward (e.g. add <package>)')
      resolved = { mode: 'plugin', profile: options.profile, args }
    })

  /** Add explicit recovery-root selection and machine-readable output. */
  const addRecoveryOutputOptions = (command: Command): Command => command
    .option('--store <path>', 'recovery store (default: $DSH_RECOVERY_HOME or ~/.dsh-recovery)')
    .option('--json', 'print machine-readable JSON')

  /** Add the two mutable roots captured or restored by recovery. */
  const addRecoveryPathOptions = (command: Command): Command => addRecoveryOutputOptions(command)
    .option('--source <path>', 'DSH source checkout (or set $DSH_SOURCE_HOME)')
    .option('--dsh-home <path>', 'DSH user-data root (default: $DSH_HOME or ~/.dsh)')

  interface RecoveryPathOptions {
    source?: string
    dshHome?: string
    store?: string
    json?: boolean
  }

  const recovery = program.command('recovery').description('create and restore boot-independent recovery checkpoints')
  recovery.action(() => recovery.help())

  addRecoveryPathOptions(recovery.command('create').description('create an immutable checkpoint'))
    .option('--label <text>', 'human-readable checkpoint label')
    .action((options: RecoveryPathOptions & { label?: string }) => {
      rejectParentOptions('recovery create')
      resolved = {
        mode: 'recovery',
        action: 'create',
        json: options.json === true,
        ...options.source === undefined ? {} : { source: options.source },
        ...options.dshHome === undefined ? {} : { dshHome: options.dshHome },
        ...options.store === undefined ? {} : { store: options.store },
        ...options.label === undefined ? {} : { label: options.label },
      }
    })

  addRecoveryOutputOptions(recovery.command('list').description('list published checkpoints'))
    .action((options: Pick<RecoveryPathOptions, 'store' | 'json'>) => {
      rejectParentOptions('recovery list')
      resolved = {
        mode: 'recovery',
        action: 'list',
        json: options.json === true,
        ...options.store === undefined ? {} : { store: options.store },
      }
    })

  addRecoveryOutputOptions(recovery.command('verify').description('verify one checkpoint and every payload hash'))
    .argument('<snapshot>', 'checkpoint id')
    .action((snapshot: string, options: Pick<RecoveryPathOptions, 'store' | 'json'>) => {
      rejectParentOptions('recovery verify')
      resolved = {
        mode: 'recovery',
        action: 'verify',
        snapshot,
        json: options.json === true,
        ...options.store === undefined ? {} : { store: options.store },
      }
    })

  addRecoveryPathOptions(recovery.command('restore').description('restore one checkpoint after creating a rescue checkpoint'))
    .argument('<snapshot>', 'checkpoint id')
    .option('--confirm <snapshot>', 'repeat the checkpoint id to confirm the mutation')
    .option('--offline', 'acknowledge that the target DSH Host is stopped')
    .action((snapshot: string, options: RecoveryPathOptions & { confirm?: string; offline?: boolean }) => {
      rejectParentOptions('recovery restore')
      resolved = {
        mode: 'recovery',
        action: 'restore',
        snapshot,
        json: options.json === true,
        offline: options.offline === true,
        ...options.source === undefined ? {} : { source: options.source },
        ...options.dshHome === undefined ? {} : { dshHome: options.dshHome },
        ...options.store === undefined ? {} : { store: options.store },
        ...options.confirm === undefined ? {} : { confirm: options.confirm },
      }
    })

  addRecoveryPathOptions(recovery.command('guardian-restore').description('internal detached restore guardian'))
    .requiredOption('--snapshot <snapshot>', 'checkpoint id')
    .requiredOption('--parent-pid <pid>', 'Host process id')
    .requiredOption('--restart-spec <base64url>', 'encoded restart specification')
    .action((options: RecoveryPathOptions & { snapshot: string; parentPid: string; restartSpec: string }) => {
      rejectParentOptions('recovery guardian-restore')
      const parentPid = Number(options.parentPid)
      if (!Number.isSafeInteger(parentPid) || parentPid <= 0) {
        program.error('error: --parent-pid must be a positive integer')
      }
      resolved = {
        mode: 'recovery',
        action: 'guardian-restore',
        snapshot: options.snapshot,
        parentPid,
        restartSpec: options.restartSpec,
        json: options.json === true,
        ...options.source === undefined ? {} : { source: options.source },
        ...options.dshHome === undefined ? {} : { dshHome: options.dshHome },
        ...options.store === undefined ? {} : { store: options.store },
      }
    })

  try {
    program.parse(argv, { from: 'user' })
  } catch (error) {
    return process.exit(error instanceof CommanderError ? error.exitCode : 1)
  }
  /* v8 ignore next -- an action resolves or Commander throws */
  if (resolved === undefined) throw new Error('dsh: no invocation resolved')
  return resolved
}
