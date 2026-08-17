# Anlogic TD implementation reference

Use this reference for synthesis, place/route, clock/timing validation, reports, and bitstream generation.

## Verified local installation

Reference installation:

```text
D:\04-software\TD_2601_sp2
TD Release 2026.1 SP2
build 6.2.2.200067
```

Command-line executable:

```text
D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe
```

Reference license location:

```text
D:\04-software\TD_2601_sp2\license\Anlogic.lic
```

Do not infer that a license is valid just because TD starts. Check the synthesis/tool log for successful license opening and license-related errors.

Treat these paths as workstation defaults, not as facts for every environment.

## Known TD 2026.1 SP2 run-generation pitfalls

### Bad generated executable name

In the reference setup, `launch_runs` generated a batch file containing:

```text
td_commands_prompt_commands_prompt.exe
```

The reliable workaround was to execute each generated run Tcl directly with the real executable:

```text
D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe
```

Prefer correcting/avoiding the broken wrapper rather than rebuilding the entire implementation flow from scratch.

### Empty device/package fields in generated settings

Generated `settings.cfg` files were observed with empty device/package values. Resolve and verify the actual device database, package, and speed before implementation.

Reference example only:

```tcl
set device_name ph1_400.db
set package_name PH1A400SFX900
set speed 2
```

The project-visible device/package string and the database passed to `import_device` are not necessarily identical. In the reference flow:

```text
project/package selection: PH1A400SFX900
direct import database:    ph1_400.db
```

Do not reuse those values for another project.

### Physical run constraint lists

A physical run beginning around `opt_place` was observed to load additional ADC constraints through `bkaADCList`, not only `ADCList`.

Reference structure:

```tcl
set bkaADCList {"../../constraints/top.adc"}
set SDCList {"../../constraints/top.sdc"}
```

When pins or clocks appear missing in physical implementation despite being present in the project, inspect the generated run Tcl/settings to see which constraint lists are actually consumed.

### Exit code can lie

TD can return process exit code `0` after internal Tcl/tool errors. Always inspect the newest run log for:

```text
ERROR
CRITICAL-WARNING
WARNING
```

Also verify output timestamps so an old bit/report cannot be mistaken for a fresh successful run.

## PLL/IP workflow

For the verified release, the dependable flow was:

1. Select the correct FPGA device in the TD project.
2. Generate/configure the PLL with TD IP Generator.
3. Preserve the generated `.ipc` and generated HDL wrapper under the generated IP directory.
4. Add the `.ipc` to the project and include the intended generated HDL wrapper in synthesis.
5. Do not compile both Verilog and VHDL versions of the same wrapper.
6. Instantiate the generated wrapper instead of hand-editing primitive parameters for normal use.
7. Regenerate the IP after changing device or requested input/output frequencies.

Reference example only:

```text
Device       : PH1A400SFX900
Input        : 50 MHz
Output       : 100 MHz
Wrapper      : PLL_0
Primitive    : PH1_PHY_PLL
Clock buffer : PH1_LOGIC_BUFG
```

## Clock constraints

At minimum, constrain the primary input clock:

```tcl
create_clock -name clk_in -period 20.000 -waveform {0.000 10.000} [get_ports {clk_in}]
```

When PLL/clock-buffer IP creates clocks, derive the generated clocks using the release-supported flow:

```tcl
derive_clocks
```

Do not accept a positive WNS when the actual PLL output domain is not constrained. Confirm the final timing/clock report explicitly lists the generated clock's expected frequency/period.

## Reset synchronization around PLL lock

For reset release from PLL lock, use asynchronous assertion and synchronous deassertion in the generated clock domain.

When MTBF reporting is required, the reference flow needed TD's synthesis/place async-reg handling in addition to RTL intent:

```tcl
set_param rtl directive:async_reg on
set_param place async_reg on
```

Use the equivalent run properties in project multi-run mode. Verify against the current TD release instead of assuming every release uses identical parameter names.

## Direct command-line implementation

A reference project used this effective sequence:

```powershell
Push-Location 'test1_Runs\syn_1'
& 'D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe' 'test1.tcl'
Pop-Location

Push-Location 'test1_Runs\phy_1'
& 'D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe' 'test1.tcl'
Pop-Location

& 'D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe' 'post_route_reports.tcl'
```

Run generated Tcl from the working directory expected by its relative paths.

If the project already has a working `build_td.ps1`, prefer using it and inspecting its behavior over generating another parallel build entrypoint.

## Final physical reports

After place/route, import the final physical database and update final timing before generating evidence.

Reference command set:

```tcl
import_device <device_db> -package <package> -speed <speed>
import_db <final_pr_db>
update_timing -mode final

report_timing_summary -file <reports>/timing_summary.rpt
check_timing -verbose -file <reports>/check_timing.rpt
report_area -io_info -file <reports>/area.rpt
report_drc -file <reports>/drc.rpt
report_clock_summary -file <reports>/clock_summary.rpt
report_route_status -fanout_stat -drc -file <reports>/route_status.rpt
report_mtbf -file <reports>/mtbf.rpt
```

Some report commands may create no file when there is nothing to report. Use console/log output together with file existence/content.

## Implementation acceptance checks

Do not report PASS until all applicable items hold:

- authoritative RTL and intended top were used
- source/include lists are complete
- expected hard IP appears in elaboration/resource evidence
- synthesis completed
- place and route completed
- no open/unrouted nets remain
- no blocking DRC errors remain
- every used clock domain is constrained
- generated PLL/clock-buffer clocks appear in the final clock/timing report
- setup WNS >= 0
- setup TNS = 0 and setup failing endpoints = 0
- hold WNS >= 0
- hold failing endpoints = 0
- resource counts are plausible and required logic was not optimized away
- bitgen completed when requested
- bitstream is fresh for this run
- errors/critical warnings/warnings were reviewed and classified

## Reference run evidence

A known-good reference run produced:

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

One non-blocking warning remained:

```text
PHY-5016 WARNING: PLL clkc is driving an IO without location.
```

That reference design still placed the PLL, used a GCLK, routed successfully, passed final timing, and generated a bitstream. Record and classify such a warning in another project; do not automatically waive it just because it was non-blocking once.

Reference project artifacts included:

```text
VALIDATION_REPORT.md
build_td.ps1
post_route_reports.tcl
reports/timing_summary.rpt
reports/check_timing.rpt
reports/area.rpt
test1_Runs/phy_1/test1.bit
```

These filenames demonstrate a working evidence layout only; resolve the active project's actual paths.