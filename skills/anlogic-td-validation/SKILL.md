---
name: anlogic-td-validation
description: Validate Anlogic FPGA projects with TD using synthesis, place-and-route, timing/SDC/PLL clock checks, resource/DRC reports, bitstream generation, and optional JTAG SRAM programming/ChipWatcher observation. Use for 安陆FPGA/TD工程综合实现、时序收敛、WNS/TNS、PLL生成时钟约束、资源检查、bitgen、AL-Link下载和下板验证。Do not use for RTL functional simulation alone unless implementation or hardware validation is also required.
---

# Anlogic TD implementation and hardware validation

Use this skill for questions that RTL simulation alone cannot answer:

- can the design elaborate and synthesize with the real TD project/device?
- can it place and route?
- are all real and generated clocks constrained?
- does setup/hold timing pass?
- what resources and hard IP are actually used?
- what DRC/warnings remain?
- can a fresh bitstream be generated?
- when requested, can that bitstream be loaded to FPGA SRAM and observed on hardware?

Do not use implementation success as a substitute for RTL functional verification. If the bug is behavioral and can be answered by simulation first, use the simulation workflow and invoke this skill only for implementation/hardware questions.

## Inputs to resolve

Inspect the current project and resolve:

- authoritative RTL source tree
- existing `.al` project when present
- intended top module
- target device database / device selection
- package and speed grade
- active ADC/pin constraint files
- active SDC/timing constraints
- generated IP files such as PLL `.ipc` and wrappers
- implementation run directories
- final physical database
- intended bitstream/output path
- validation goal and acceptance criteria
- cable/debug configuration only when hardware programming is requested

Do not inherit example top names, pins, package, clock frequencies, IP parameters, or bitstream paths from an earlier project.

## Choose the scope

### Compile/implementation validation

Use when the user asks whether RTL can be implemented, whether timing passes, whether constraints are complete, or whether a bitstream can be generated.

Read `references/implementation.md`.

### Timing/clock investigation

Use the implementation flow, but focus evidence on:

- all primary input clocks
- PLL/clock-buffer generated clocks
- `derive_clocks` or equivalent generated-clock derivation
- reported generated frequency/period
- setup WNS/TNS/failing endpoints
- hold WNS/failing endpoints
- unconstrained paths/endpoints and timing-check output

A positive WNS is not valid evidence when the actual generated clock domain is unconstrained.

### Hardware SRAM programming / ChipWatcher

Only after a bitstream is known to correspond to the intended source/debug configuration, read `references/programming-debug.md`.

Use `scripts/program_fpga.tcl` as a starting point for a legacy AL-Link direct SRAM download when its cable model matches the hardware.

Do not program arbitrary pins or a compile-only test pinout onto a real board unless the user explicitly confirms those constraints are safe for that board.

## Required implementation workflow

### 1. Inspect project truth

Read the existing `.al` project, source/include lists, device/package/speed, ADC constraints, SDC constraints, and generated IP configuration.

If a separate validation copy of RTL exists, compare it with the authoritative RTL first. Use the authoritative source unless the user explicitly wants to validate the copy.

### 2. Keep the logic under test observable

If a small validation top is needed, connect outputs/state so synthesis cannot legitimately remove the logic being measured.

Do not add artificial `keep` attributes merely to inflate resource counts. Use `keep` only when optimization behavior itself is the question or the debug methodology requires it.

### 3. Make place/route possible without pretending test pins are board pins

When implementation requires all ports to have legal pins/I/O standards, temporary legal assignments are acceptable for compile-only validation.

Clearly mark them as compile-only constraints. Never present arbitrary temporary pin assignments as valid board wiring.

### 4. Constrain every clock that matters

Create constraints for all primary input clocks.

When PLL or clock-buffer IP generates clocks, use the TD-supported generated-clock derivation flow such as:

```tcl
create_clock -name clk_in -period <PERIOD_NS> [get_ports {clk_in}]
derive_clocks
```

Confirm the final clock/timing report actually lists the expected generated frequency and period.

### 5. Run the real implementation stages

Run all stages needed by the question:

```text
analyze/elaborate
→ synthesis
→ physical optimization/place
→ route
→ bitgen
→ import final physical database
→ final timing/check/area/DRC/clock/route reports
```

Use the existing project/run scripts when they are trustworthy. When generated run wrappers are broken, execute the generated run Tcl directly with the known TD command-line executable rather than inventing a new flow unnecessarily.

### 6. Parse logs, not only process exit codes

TD can return a successful process exit code after an internal Tcl/tool error in the verified release.

Inspect the newest applicable logs for at least:

```text
ERROR
CRITICAL-WARNING
WARNING
```

Also verify that expected outputs were regenerated after the current run started.

### 7. Collect final physical evidence

At minimum, collect/apply the equivalent of:

- timing summary
- timing checks/unconstrained-path checks
- area/resource report
- DRC
- clock summary
- route status
- MTBF when asynchronous synchronizers are in scope

Do not claim a missing empty report is always a tool failure; some TD report commands may omit a file when there is nothing to report. Interpret report existence together with console/log output.

### 8. Validate hardware only when requested and safe

Before SRAM programming:

- identify the actual cable/driver mode
- select the bitstream from the current intended implementation/debug build
- verify file freshness
- ensure the pin constraints are appropriate for the real board
- obtain hardware access outside a restricted sandbox if the USB/JTAG path requires it

Programming success proves configuration transfer, not application correctness. Use runtime observability to validate behavior.

## Non-negotiable rules

- Do not reuse device/package/pin/clock/IP assumptions from a reference run.
- Do not report timing PASS when a used clock domain is unconstrained.
- Do not treat process exit code `0` as sufficient TD success evidence.
- Do not treat bitgen as proof that application behavior is correct.
- Do not use an ordinary implementation bitstream with ChipWatcher metadata from a different debug build.
- Do not silently ignore warnings; classify them as blocking, relevant non-blocking, or unrelated/noise.
- Do not report arbitrary temporary pins as board-valid constraints.

## Acceptance criteria

Report implementation PASS only when all applicable criteria are true:

- intended top and complete authoritative source list were analyzed/elaborated
- expected hard IP is present in elaboration/resource evidence
- synthesis completed without blocking errors
- place/route completed with no open/unrouted nets or blocking DRC errors
- every used input/generated clock is constrained
- final timing report shows the intended generated clocks/frequencies
- setup WNS is non-negative and setup TNS/failing endpoints are zero
- hold WNS is non-negative and hold failing endpoints are zero
- resource counts are plausible and required logic was not optimized away
- bitgen completed when requested
- bitstream timestamp is newer than the current build start
- all errors/critical warnings/warnings were inspected and classified

For hardware validation, additionally require:

- intended bitstream/debug metadata pair was selected
- intended cable/target was found
- download Tcl call completed without programming errors
- target behavior was observed through a valid evidence path

## Reference loading rules

Load only what the task needs:

- TD install quirks, project runs, PLL/SDC, reports, timing and acceptance → `references/implementation.md`
- AL-Link/AL-LINK-FT, SRAM programming, ChipWatcher and runtime observation → `references/programming-debug.md`

## Output

End with a concise evidence summary:

```text
PROJECT/TOP: resolved values
DEVICE: device/package/speed
SYNTHESIS: PASS | FAIL | NOT RUN
PLACE/ROUTE: PASS | FAIL | NOT RUN
CLOCKS: constrained domains and generated frequencies
TIMING: setup WNS/TNS, hold WNS, failing endpoints
RESOURCES: key counts / expected hard IP
DRC/WARNINGS: classified remaining issues
BITGEN: PASS | FAIL | NOT RUN, fresh output path
PROGRAM: PASS | FAIL | NOT RUN
RUNTIME EVIDENCE: observed signal/status/result or NOT RUN
VALIDATION: PASS | FAIL | INCONCLUSIVE
```

When validation fails, identify the first actionable failure and the evidence that caused the stop.