---
name: ccs-c2000-debug
description: Build, load, run, validate, and debug TI C2000/F28335 firmware with Code Composer Studio (CCS), Debug Server Scripting (DSS), and XDS100/XDS110 on Windows. Use for CCS工程编译、F28335/2833x下板验证、RAM-only下载、Flash烧录、运行变量读取、断点/单步调试、JTAG/仿真器排障。Do not use for source-only code review when no CCS toolchain or target-hardware execution is needed.
---

# TI C2000 CCS/DSS hardware validation

Use this skill to turn a C2000 firmware change into evidence from the real CCS toolchain and, when requested, the real target.

The default loop is:

```text
inspect current project
→ build with the project's own configuration
→ choose RAM or Flash validation
→ connect through DSS
→ run
→ observe task-specific evidence
→ decide PASS/FAIL
→ leave the target/session in the requested state
```

Do not treat this skill as a generic C2000 tutorial. Execute the shortest applicable workflow and load detailed references only when the current branch of work needs them.

## Inputs to resolve

Before executing tools, resolve these from the current project instead of carrying values from another project:

- `PROJECT_DIR`: CCS project root containing `.project` / `.cproject` when applicable.
- `BUILD_DIR`: active generated build directory such as `Debug`.
- `COMPILER_DIR`: compiler version actually selected by this project.
- `CCXML`: target configuration matching the device and probe.
- `FLASH_OUT`: normal CCS-linked output.
- `RAM_OUT`: RAM-only output when RAM validation is used.
- `MAP_FILE`: map corresponding to the output being validated.
- `VALIDATION_EVIDENCE`: variable, state, waveform, breakpoint condition, communication result, or other behavior that proves the requested change.
- `SAMPLE_MS` / timeout when runtime sampling is required.

If some values are not provided, inspect the project and derive them. Do not ask the user for values that the repository or tool output can resolve safely.

## Local defaults vs project facts

This workstation has known CCS paths and a verified F28335 reference setup. Read `references/local-defaults.md` when those defaults can save discovery time.

Treat installation paths as defaults. Treat the following as project facts that must be rechecked every time:

- compiler version
- `.ccxml`
- linker command files
- output filenames
- entry point
- target session name
- validation variable/expression

## Choose the validation mode

### Build only

Use when the user only asks whether the project compiles or links.

Stop after checking the build exit status, linker completion, generated output, and relevant warnings/errors. Do not touch target hardware without a reason.

### RAM-only functional validation

Prefer RAM for fast edit-build-run-debug loops when the requested behavior does not depend on Flash layout or boot behavior.

Typical uses:

- algorithms and control logic
- state machines
- interrupt behavior
- most peripheral/application logic
- variable observation
- breakpoint and step debugging

Read `references/ram-only.md` before creating or changing a RAM linker flow.

Never call a build "RAM-only" merely because the filename contains `ram`. Inspect the map and prove that loadable sections do not land in Flash.

### Flash validation

Use Flash when the requested behavior depends on any of these:

- BootROM or reset/boot path
- `code_start`
- Flash-to-RAM section copy
- Flash wait states or execution timing
- linker/storage layout
- firmware update/erase/program/verify
- power-cycle persistence
- standalone operation without the probe

For release-like validation, include reset/power-cycle/standalone checks when they are relevant to the user's request.

### Interactive debug

For an unknown bug, prefer a persistent DSS session over a one-shot script. Keep breakpoints, PC, call stack, and target state alive while narrowing the fault.

Read `references/dss-debug.md` before implementing or modifying an interactive DSS service.

### Fixed regression check

For a known behavior with a stable success predicate, prefer a small one-shot DSS script or test wrapper. `scripts/dss_verify_monotonic.js` is available only for the specific case where a numeric expression is expected to increase while the target keeps running.

Do not force every validation target into the "counter increases" predicate.

## Required workflow

### 1. Inspect before modifying

Inspect the current project structure, `.cproject`, generated makefile, linker command files, `.ccxml`, existing `.out`/`.map`, and the code that produces the validation evidence.

Prefer the project's existing generated build system. Do not hand-reconstruct dozens of `cl2000` commands unless the generated build is missing or the task is explicitly to rebuild the build system.

Do not edit generated `Debug/makefile` as a durable configuration change; CCS can regenerate it.

### 2. Build with the project's configuration

Use the compiler version selected by the project. If a generated makefile is valid, invoke CCS's bundled `gmake` from the active build directory.

A successful build requires all applicable evidence:

- build process succeeds
- link completes
- expected output exists
- output timestamp is from this run
- no blocking compiler/linker errors remain

Classify warnings instead of silently ignoring them.

### 3. Protect the existing Flash configuration

For fast RAM validation, prefer a second link output that reuses the normal build's fresh object files rather than changing the project's normal Flash configuration back and forth.

Do not silently remove Flash startup objects, change `.cproject`, or switch the human-facing CCS build into a RAM configuration just to let the agent run a test.

### 4. Check probe ownership before diagnosing hardware

Before treating XDS connection failure as a driver/hardware problem, check whether CCS GUI or another debug process already owns the probe.

Do not force-kill a GUI that may contain unsaved work. Prefer a normal close/end-debug action or tell the user which process is holding the probe when a safe automatic release is not possible.

Read `references/troubleshooting.md` for XDS100/FTDI/JTAG failures.

### 5. Load and run with DSS

Set a writable `TI_APPDATA_DIR` when the execution environment cannot write TI's normal application-data directory.

For a single-target `.ccxml`, prefer the verified no-argument `openSession()` pattern instead of guessing a session regex from the displayed device name. For multi-core targets, resolve the actual session names first.

Disable inappropriate automatic run-to-label behavior before program load when the project uses a custom startup path.

### 6. Observe evidence without perturbing the target unnecessarily

For ordinary RAM-resident globals and counters, prefer live expression reads while the target runs when real-time access is supported.

Use halt/read/resume only when required by consistency, unsupported live access, registers/locals/call-stack inspection, or the requested debug operation.

For arrays and contiguous buffers, prefer bulk `memory.readData()` over many individual expression evaluations.

Do not repeatedly read registers with read-to-clear or other side effects.

### 7. Decide PASS from behavior, not from process exit code alone

A zero `dss.bat` exit code is not sufficient evidence on the verified CCS 7.2 setup. Parse the tool/script output and require the task-specific success condition.

For the bundled monotonic script, require an explicit `[CCS-DSS] PASS:` line. For other scripts, define an equally explicit machine-readable success marker.

If the requested condition is not met, report FAIL or INCONCLUSIVE with the observed evidence. Do not upgrade "program loaded" into "application works".

### 8. Clean up intentionally

Use `try/finally`-style cleanup for DSS resources.

At completion, leave the target running or halted according to the task, then release/retain the debug session accordingly. Report which state was left behind.

## Acceptance criteria

Report PASS only when all applicable items are true:

- the intended source/configuration was built
- the build output is fresh
- the intended probe/target was connected
- the intended RAM or Flash image was actually loaded
- RAM-only validation has no unintended Flash-loadable sections
- the program reached the requested runtime state
- task-specific evidence changed or matched as expected
- tool logs contain no unclassified blocking errors
- the final target/session state is known

## Reference loading rules

Load only what the current task needs:

- RAM linker / RAM-only download / dual-output flow → `references/ram-only.md`
- DSS API, live variables, breakpoints, stepping, persistent session → `references/dss-debug.md`
- XDS100/FTDI/target-connect and CCS 7.2 quirks → `references/troubleshooting.md`
- workstation paths and the already-proven F28335 project example → `references/local-defaults.md`

## Output

End hardware/toolchain work with a compact evidence report containing:

```text
BUILD: PASS | FAIL | NOT RUN
LOAD: RAM | FLASH | NOT RUN
TARGET: connected device/probe or NOT RUN
RUN: PASS | FAIL | INCONCLUSIVE | NOT RUN
VALIDATION: PASS | FAIL | INCONCLUSIVE
EVIDENCE: concrete observed values/events
WARNINGS: remaining relevant warnings
FINAL STATE: target running/halted/disconnected and why
```

When a step fails, include the first actionable failure and the next best diagnostic action rather than dumping the entire CCS log.