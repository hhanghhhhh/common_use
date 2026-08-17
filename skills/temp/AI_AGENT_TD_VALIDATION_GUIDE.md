# AI Agent: Anlogic TD compile/implementation validation guide

Purpose: use an Anlogic TD project to answer only the implementation questions that RTL simulation cannot answer: can the design elaborate/synthesize/place/route, are generated clocks constrained, does timing pass, what resources are used, what warnings/DRCs remain, and can a bitstream be generated.

This is a reusable workflow. Do not assume the example top, FPGA part, clock frequency, pinout, or IP configuration applies to another project.

## Minimum workflow

1. Inspect the existing `.al` project, top module, device/package/speed, source/include directories, ADC and SDC files.
2. Copy or reference the authoritative RTL. If a validation copy already exists, compare it with the authoritative source first and use the authoritative version.
3. Make a small top that keeps the RTL observable so synthesis cannot remove the logic under test. Do not add fake `keep` attributes unless removal is the behavior being investigated.
4. Give every top-level port a legal temporary pin and I/O standard so place/route and bitgen can finish. Mark the pinout as compile-only; never treat arbitrary pins as board constraints.
5. Constrain all input clocks. If PLL/clock-buffer IP creates clocks, also run `derive_clocks` in the SDC.
6. Run synthesis, physical implementation and bitgen.
7. Import the final physical database and produce timing, timing-check, area, DRC, clock and route-status reports.
8. Parse TD logs as well as the process exit code. Confirm that the bit file and reports were regenerated during this run.

## TD installation and license checks

Example installation used here:

```text
D:\04-software\TD_2601_sp2
TD Release 2026.1 SP2
build 6.2.2.200067
```

Command-line executable:

```text
D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe
```

The license was loaded from:

```text
D:\04-software\TD_2601_sp2\license\Anlogic.lic
```

Do not infer that a license is valid merely because TD starts. Check the synthesis log for successful license opening and for license-related errors.

## Project/run generation pitfalls observed in TD 2026.1 SP2

- `launch_runs` generated a bad executable name, `td_commands_prompt_commands_prompt.exe`, in the run batch file. The reliable workaround was to execute each generated run Tcl directly with `td_commands_prompt.exe`.
- Generated `settings.cfg` files initially had empty device/package fields. Resolve the actual device database and patch/verify these fields before running:

```tcl
set device_name ph1_400.db
set package_name PH1A400SFX900
set speed 2
```

- `PH1A400SFX900` is the package/device selection shown in the project, but the direct-flow `import_device` database argument is `ph1_400.db`.
- A physical run beginning at `opt_place` loads additional ADC constraints through `bkaADCList`, not only `ADCList`:

```tcl
set bkaADCList {"../../constraints/top.adc"}
set SDCList {"../../constraints/top.sdc"}
```

- TD can return process exit code 0 after an internal Tcl/tool error. Search the newest run log for `ERROR`, `CRITICAL-WARNING`, and `WARNING`; verify output timestamps independently.

## PLL/IP workflow

For this TD release, the dependable flow was:

1. Select the correct FPGA device in the TD project.
2. Use TD IP Generator to create/configure the PLL.
3. Preserve the generated `.ipc` and generated HDL wrapper under `al_ip/<ip_name>/`.
4. Add the `.ipc` to the project and ensure the enabled generated HDL wrapper is included in synthesis. Do not compile both Verilog and VHDL versions of the same wrapper.
5. Instantiate the generated wrapper in the top; do not hand-edit its primitive parameters unless explicitly diagnosing the IP generator.
6. Regenerate the IP after changing input/output frequencies or device selection.

Example generated configuration in this validation:

```text
Device       : PH1A400SFX900
Input        : 50 MHz
Output       : 100 MHz
Wrapper      : PLL_0
Primitive    : PH1_PHY_PLL
Clock buffer : PH1_LOGIC_BUFG
```

The essential SDC pattern is:

```tcl
create_clock -name clk_in -period 20.000 -waveform {0.000 10.000} [get_ports {clk_in}]
derive_clocks
```

Without `derive_clocks`, TD may still place, route and generate a bitstream, but the PLL output is unconstrained. A positive WNS from that run is invalid evidence for the generated-clock domain. Confirm the timing report explicitly lists the generated clock frequency and period.

For reset release from PLL lock, use asynchronous assertion and synchronous deassertion in the generated clock domain. If MTBF reporting is required, an RTL `async_reg` attribute alone was not enough in this flow; enable TD's synthesis/place handling as instructed by the tool:

```tcl
set_param rtl directive:async_reg on
set_param place async_reg on
```

Apply the equivalent run-property settings when using project multi-run mode.

## Direct command-line execution

This project contains `build_td.ps1`. Its effective sequence is:

```powershell
Push-Location 'test1_Runs\syn_1'
& 'D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe' 'test1.tcl'
Pop-Location
Push-Location 'test1_Runs\phy_1'
& 'D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe' 'test1.tcl'
Pop-Location
& 'D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe' 'post_route_reports.tcl'
```

Run commands from the directories expected by their relative paths. The supplied script handles those working-directory changes and rejects error/critical-warning lines in the newest run log.

Post-route reporting should import the final database and run at least:

```tcl
import_device <device_db> -package <package> -speed <speed>
import_db ./test1_Runs/phy_1/test1_pr.db
update_timing -mode final
report_timing_summary -file ./reports/timing_summary.rpt
check_timing -verbose -file ./reports/check_timing.rpt
report_area -io_info -file ./reports/area.rpt
report_drc -file ./reports/drc.rpt
report_clock_summary -file ./reports/clock_summary.rpt
report_route_status -fanout_stat -drc -file ./reports/route_status.rpt
report_mtbf -file ./reports/mtbf.rpt
```

Some TD report commands can create no file when there is nothing to report. Treat log output and report existence/content together; do not assume a missing empty DRC report is a tool failure.

## Reusable command-line SRAM programming workflow

Use this flow after bitgen when the goal is to load a volatile bitstream into an FPGA over JTAG. It programs FPGA SRAM only; it does not program external configuration flash, and the design is lost after power-off unless the board has a separate boot image.

### 1. Identify the cable before choosing a connection mode

Do not treat all Anlogic cables as interchangeable. Check the connected Windows device and driver first.

Typical cases are:

- Legacy `Anlogic AL-Link`: often appears with USB VID/PID `336C:1001` and the `ANLOCYUSB` driver. TD can access this cable directly with a numeric `-cable` index. Do not require an AL-LINK-FT hardware server for this mode.
- `AL-LINK-FT`: normally appears as FTDI channels with VID/PID `0403:6042`. It uses WinUSB for the JTAG channel and TD's local/remote HwServer configuration.
- A USB-Blaster-compatible or remote cable: may use a separately configured server. Confirm that the server protocol, address and port are actually supported by the selected TD debug mode; an open TCP port alone does not prove that TD can use it.

On Windows, a useful read-only identification check is:

```powershell
Get-PnpDevice -PresentOnly |
    Where-Object {
        $_.FriendlyName -match 'AL.?Link|Anlogic|USB.*Blaster|JTAG'
    } |
    Select-Object Status, Class, FriendlyName, InstanceId
```

If a cable is present in Device Manager but TD cannot see it, inspect its bound service/provider/version with `Get-PnpDeviceProperty`. Check the cable driver, target-board power, JTAG VREF, cable orientation and whether another tool currently owns the cable before changing project files.

### 2. Select the correct bitstream

Program the bitstream that matches the intended runtime debug configuration:

- Normal implementation: use the final physical-run `.bit`.
- ChipWatcher: use the ChipWatcher-generated/exported `.bit`, commonly `cw/compiled.bit`, together with its matching `.cwc` file.
- Never program the pre-ChipWatcher bit and then expect ChipWatcher capture to work. The debug logic and the `.cwc` metadata must match the programmed bitstream.

Before programming, verify that the file exists, comes from the active run, has a fresh timestamp, and was generated after the latest source/debug changes. Record a hash when traceability matters.

### 3. Use a small Tcl programming script

For a legacy AL-Link connected as cable index 0, the following pattern was verified with TD 2026.1 SP2:

```tcl
set bit_file {D:/absolute/path/to/final_or_debug.bit}

if {![file exists $bit_file]} {
    error "Bit file not found: $bit_file"
}

puts "Programming: $bit_file"
set rc [catch {
    download \
        -bit $bit_file \
        -mode jtag_burst \
        -spd 5 \
        -cable 0
} result options]

puts "DOWNLOAD_RC=$rc"
puts "DOWNLOAD_RESULT=$result"

if {$rc != 0} {
    puts [dict get $options -errorinfo]
    exit 1
}

exit
```

Run it with:

```powershell
& '<TD_INSTALL>\bin\td_commands_prompt.exe' 'program_fpga.tcl'
```

Use forward slashes or Tcl-braced paths inside the Tcl script. Keep the bit path absolute so the operation does not depend on the caller's working directory.

`-spd 5` requests a 5 MHz JTAG clock. Start conservatively if the cable, ribbon length or board signal integrity is uncertain. The valid speed range is device/cable dependent.

Do not guess a nonzero cable index. Use the index shown by TD when multiple cables are attached. For daisy-chained JTAG devices, also supply and verify the applicable `-total_dev`, `-cur_dev` and `-bypass` arguments instead of assuming a one-device chain.

### 4. Hardware access may require running outside an agent sandbox

Compilation can succeed inside a filesystem sandbox while USB/JTAG access fails. Local hardware services, USB drivers and localhost debug-server connections may require an unsandboxed process. If a cable operation fails only in the sandbox, rerun the same narrowly scoped TD command with explicit hardware-access approval; do not broaden permissions to an arbitrary shell.

Run the TD process as the interactive user when possible. A service account or sandbox identity can have a different driver/device view from the desktop user.

### 5. Decide success from command status and TD diagnostics

A successful invocation should satisfy all of the following:

- TD validates the intended chip family rather than silently selecting a different device.
- The `download` Tcl call returns normally (`catch` result `0`).
- The TD process exits successfully.
- No `PRG-... ERROR`, cable-busy, device-not-found, ID-mismatch or bit/ChipWatcher-code-mismatch message appears.
- The board shows the expected post-configuration behavior.

TD commands can sometimes return process exit code 0 even after an internal tool error, so parse the console/log text as well as `DOWNLOAD_RC`. A zero return code proves that TD completed the operation; it does not prove that the application logic is functionally correct.

### 6. Reading runtime results

Programming and observing are separate steps. A bitstream without an observability path cannot expose internal registers after download.

For ChipWatcher:

1. Add the required internal signals before the final debug build.
2. Generate the matching debug `.bit` and `.cwc` files.
3. Program the debug bit.
4. Open ChipWatcher `Watch`.
5. Use `Single Trigger` for a configured event or `Instant Trigger` for an immediate snapshot.
6. Save the `.cwc` waveform or export CSV for automated parsing and archival.

Useful generic debug signals include transaction counters, a completion pulse, returned data, sticky error flags, error codes and an expected-value match flag. Prefer sticky status registers for software-like inspection; one-cycle pulses should normally be trigger signals rather than the only evidence of an event.

If unattended capture is required, configure and validate ChipWatcher's power-on trigger before bitgen, or expose a machine-readable result through a stable interface such as UART, a host register bus or a Virtual Probe Interface. LEDs are useful for coarse pass/fail status but are not a substitute for detailed error/data readback.

### 7. Common failure classification

- `device not found`: verify target power/VREF, cable orientation, driver binding, cable ownership and JTAG continuity.
- TD searches for `0403:6042` while a legacy `336C:1001` AL-Link is connected: the wrong cable/debug-server mode is selected.
- A localhost/remote debug server port is open but TD cannot connect: verify the server type and protocol, not only the TCP listener.
- `bit file does not match ChipWatcher`: use the `.bit` and `.cwc` produced by the same debug build.
- ChipWatcher triggers but the expected pulse is absent: confirm the probe clock exists and is running, the trigger condition is correct, and the observed signal was not optimized or remapped unexpectedly.
- Download succeeds but application behavior is wrong: move to runtime observation; do not repeat programming as a substitute for checking reset, clocks, pins, buses and error/status signals.

## Acceptance checks

Do not report PASS until all applicable items are true:

- RTL analyze and elaborate completed with the intended top and complete source list.
- The expected hard IP appears in the elaboration/resource report (for example, one PLL rather than zero).
- Place and route completed; no open/unrouted nets or DRC errors remain.
- Every PLL/clock-buffer output used as a clock has a clock constraint.
- The timing report shows the intended generated frequency, not only the input clock.
- Setup WNS and hold WNS are non-negative; TNS and failing endpoints are zero.
- Resource counts are plausible and the logic under test was not optimized away.
- Bitgen completed and the bit file timestamp is newer than the build start.
- All errors, critical warnings and ordinary warnings have been listed and classified rather than silently ignored.

## Result from the reference run

This proves the flow, not the board pinout:

```text
PLL output clock : 100.000 MHz / 10.000 ns
Setup WNS        : +4.244 ns
Hold WNS         : +0.107 ns
Failing endpoints: 0
LUT6             : 147
Registers        : 122
Slices           : 164
PLL              : 1
GCLK             : 1
Bitgen            : PASS
```

One non-blocking physical warning remained:

```text
PHY-5016 WARNING: PLL clkc is driving an IO without location.
```

The PLL was subsequently placed, its output used a GCLK, all routing and final timing checks passed, and bitgen completed. Record this warning but do not generalize it away in another design.

Reference artifacts in this project:

```text
VALIDATION_REPORT.md
build_td.ps1
post_route_reports.tcl
reports/timing_summary.rpt
reports/check_timing.rpt
reports/area.rpt
test1_Runs/phy_1/test1.bit
```
