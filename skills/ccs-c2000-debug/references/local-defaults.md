# Local CCS/F28335 defaults

Use these values as workstation defaults only. Re-check project-specific facts before each run.

## CCS installation

Verified installation:

```text
D:\04-software\CCSv720\ccsv7
```

Useful tools:

```text
CCS GUI
D:\04-software\CCSv720\ccsv7\eclipse\ccstudio.exe

GNU Make
D:\04-software\CCSv720\ccsv7\utils\bin\gmake.exe

C2000 compilers
D:\04-software\CCSv720\ccsv7\tools\compiler

DSS launcher
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\bin\dss.bat

XDS100 discovery
D:\04-software\CCSv720\ccsv7\ccs_base\common\uscif\xds100serial.exe

JTAG diagnostics
D:\04-software\CCSv720\ccsv7\ccs_base\common\uscif\dbgjtag.exe

DSS examples
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\examples

DSS API docs
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\docs\DS_API
```

Do not pick the newest compiler directory by default. Read the active project's `Debug\makefile` and/or `.cproject` and use the compiler version selected there.

## Verified F28335 dual-output example

A previously tested project used this layout:

```text
CCS project
D:\05-work\29_gpu_test\codex_proj\dsp_proj\MCU_2833x_Metre

CCS Flash build directory
Debug

Independent RAM directory
ram_test

RAM link object/options list
ram_test\ram_link.opt

RAM linker command file
ram_test\F28335_nonBIOS_ram.cmd

RAM output
ram_test\DSP_Meter_ram.out
```

The verified pattern was:

1. Keep the normal CCS Flash configuration unchanged.
2. Build the active CCS objects with the existing generated makefile.
3. Re-link those fresh objects outside the CCS Flash configuration into a RAM-only `.out`.
4. Verify the RAM map contains no loadable Flash sections.
5. Load the RAM image with DSS.
6. Observe a task-specific runtime variable.
7. Re-check that the normal Flash entry point and startup objects remain unchanged.

Example normal build from `Debug`:

```powershell
& 'D:\04-software\CCSv720\ccsv7\utils\bin\gmake.exe' -j4 all
```

Example RAM re-link from `Debug` for that project only:

```powershell
& 'D:\04-software\CCSv720\ccsv7\tools\compiler\ti-cgt-c2000_16.9.3.LTS\bin\cl2000.exe' `
    -v28 -ml --float_support=fpu32 -g `
    '--cmd_file=../ram_test/ram_link.opt' `
    '-m../ram_test/MCU_28335_ram.map' `
    --heap_size=1000 --stack_size=1000 --warn_sections `
    --entry_point=_c_int00 --rom_model `
    '--xml_link_info=../ram_test/MCU_28335_ram_linkInfo.xml' `
    -o '../ram_test/DSP_Meter_ram.out'
```

Example writable TI application-data location and DSS invocation used in that workspace:

```powershell
$env:TI_APPDATA_DIR = 'D:\05-work\29_gpu_test\codex_proj\.ti-appdata'
New-Item -ItemType Directory -Force -Path $env:TI_APPDATA_DIR | Out-Null

& 'D:\04-software\CCSv720\ccsv7\ccs_base\scripting\bin\dss.bat' `
    '<DSS_SCRIPT>' `
    '<CCXML>' `
    '<RAM_OUT>' `
    '<VARIABLE>' `
    1000
```

Do not copy these project paths, object lists, output names, linker files, or validation variables into another C2000 project without inspecting that project first.

## Evidence from the verified RAM-only run

The reference F28335 run proved the technique, not every future project:

- `.text/.cinit/.econst/.ebss/.stack` were in on-chip RAM.
- no loadable output section was placed in the F28335 Flash address range.
- DSS loaded the RAM image and started it successfully.
- `task_run_cnt` increased from `0` to `7072` in one measured run.
- the normal CCS Flash build still used `code_start`, `DSP28xxx_CodeStartBranch.obj`, `DSP28xxx_SectionCopy_nonBIOS.obj`, and `F2833x_nonBIOS_flash.cmd` afterward.
- reset or power loss discarded the RAM image and returned the target to the previously programmed Flash application.

Use this as a known-good reference when diagnosing the same workstation/project family, not as a universal C2000 memory map.