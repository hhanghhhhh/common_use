# C2000 RAM-only validation

Read this reference when the task needs fast target validation without erasing/programming Flash.

## When RAM validation is appropriate

RAM download is a good default for frequent edit-build-load-run-observe loops when behavior does not depend on the boot medium or Flash placement.

Usually suitable:

- algorithms and business/control logic
- interrupts and state machines
- most peripheral drivers and communication logic
- variable observation, breakpoints, and step debugging

Do not use RAM-only as final evidence for:

- BootROM, reset, or power-on boot behavior
- `code_start` and Flash-to-RAM copy behavior
- Flash wait-state/pipeline timing
- linker address/layout bugs tied to Flash
- Flash erase/program/update/checksum behavior
- persistence across power loss
- standalone operation with the probe removed

## Do not load a Flash-linked `.out` and call it RAM-only

The loader follows the section LOAD addresses encoded in the executable. A typical Flash linker command can contain:

```text
.text/.cinit/.econst:
LOAD = FLASH
RUN  = RAM
```

Calling:

```javascript
session.memory.loadProgram("<FLASH_OUT>");
```

will still program the LOAD addresses in Flash before the application copies/executes code in RAM.

A true RAM-only flow requires a separate executable whose loadable sections are linked to RAM.

## Prefer dual output with one source/build configuration

Keep the human-facing CCS Flash configuration intact:

```text
normal CCS Flash build
├─ compiles current C/ASM sources
├─ produces the fresh normal object files
└─ links the normal Flash output

independent RAM re-link
├─ reuses the fresh objects
├─ excludes Flash startup/section-copy objects as required
├─ uses an independent RAM linker command file
├─ uses an appropriate RAM entry point
└─ creates a separate RAM-only output for agent validation
```

This avoids a common failure mode where an agent switches the CCS configuration to RAM and leaves the next manual Flash build broken.

Do not edit generated `Debug\makefile` to maintain this flow. Generated files can be recreated by CCS.

## Check available RAM before linking

Use the existing map to estimate program/data requirements before moving everything into on-chip RAM.

Typical sections to inspect:

```powershell
Select-String -Path '<FLASH_MAP>' `
    -Pattern '^\.text\s|^\.cinit\s|^\.const\s|^\.econst\s|^\.pinit\s|^\.switch\s|^\.ebss\s|^\.stack\s|^\.esysmem\s'
```

For F28335 in particular:

- fit code/constants/init tables into memory allocated to PAGE 0
- fit `.ebss`, stack, heap, and user data into PAGE 1 allocations
- do not map the same physical RAM block into both PAGE 0 and PAGE 1 for overlapping use
- preserve regions needed by BootROM conventions, stacks, peripheral structures, DMA, or application-specific memory
- if external RAM is used, guarantee its interface is initialized before code/data there is accessed

Do not ignore linker overflow just to obtain an executable.

## RAM linker structure

The exact addresses must come from the target datasheet/project memory map, but the structure is typically:

```text
MEMORY
{
PAGE 0:
    PROGRAM_RAM : origin = <PROGRAM_RAM_ORIGIN>, length = <PROGRAM_RAM_LENGTH>
    ADC_CAL     : origin = <ADC_CAL_ORIGIN>,     length = <ADC_CAL_LENGTH>
    IQTABLES    : origin = <IQTABLES_ORIGIN>,    length = <IQTABLES_LENGTH>
    FPUTABLES   : origin = <FPUTABLES_ORIGIN>,   length = <FPUTABLES_LENGTH>

PAGE 1:
    STACK_RAM   : origin = <STACK_RAM_ORIGIN>, length = <STACK_RAM_LENGTH>
    DATA_RAM    : origin = <DATA_RAM_ORIGIN>,  length = <DATA_RAM_LENGTH>
}

SECTIONS
{
    .text       : > PROGRAM_RAM, PAGE = 0
    .cinit      : > PROGRAM_RAM, PAGE = 0
    .const      : > PROGRAM_RAM, PAGE = 0
    .econst     : > PROGRAM_RAM, PAGE = 0
    .pinit      : > PROGRAM_RAM, PAGE = 0
    .switch     : > PROGRAM_RAM, PAGE = 0
    IQmath      : > PROGRAM_RAM, PAGE = 0

    .stack      : > STACK_RAM, PAGE = 1
    .ebss       : > DATA_RAM,  PAGE = 1
    .esysmem    : > DATA_RAM,  PAGE = 1

    IQmathTables : > IQTABLES,  PAGE = 0, TYPE = NOLOAD
    FPUmathTables: > FPUTABLES, PAGE = 0, TYPE = NOLOAD
    .adc_cal     : > ADC_CAL,   PAGE = 0, TYPE = NOLOAD
}
```

If startup/security/Flash-only objects declare unwanted sections, either exclude those objects from the RAM link or deliberately map their irrelevant sections as `DSECT`/`NOLOAD` when that is semantically correct.

## Entry point and Flash section-copy code

A typical Flash application can start like:

```text
code_start
→ watchdog/startup handling
→ copy_sections from Flash to RAM
→ _c_int00
→ main
```

A RAM-only image must not blindly execute Flash section-copy logic, because it can overwrite the just-loaded RAM program with stale Flash content.

For the verified F28335 non-BIOS project, the RAM link:

1. excluded `CodeStartBranch` and Flash `SectionCopy` objects
2. linked with:

```text
--entry_point=_c_int00
```

3. loaded the resulting RAM executable directly

Do not assume `_c_int00` for every project. If the application has a custom RAM startup path, use the project's actual required entry.

## Re-link fresh objects instead of recompiling with divergent flags

An options file can list the existing objects, header linker command, RAM linker command, project libraries, and the correct RTS library.

Example structure:

```text
-z
"<HEADER_LINKER_CMD>"
"<OBJECT_1>"
"<OBJECT_2>"
"<RAM_LINKER_CMD>"
"<PROJECT_LIBRARY>"
"<COMPILER_DIR>/lib/rts2800_fpu32.lib"
```

The `-z` linker mode must take effect before linker command files/options that would otherwise be interpreted as source input.

Example re-link shape:

```powershell
& '<COMPILER_DIR>\bin\cl2000.exe' `
    -v28 -ml --float_support=fpu32 -g `
    '--cmd_file=<RAM_LINK_OPTIONS>' `
    -m'<RAM_MAP>' `
    --heap_size=<HEAP_SIZE> `
    --stack_size=<STACK_SIZE> `
    --warn_sections `
    --entry_point=_c_int00 `
    --rom_model `
    -o '<RAM_OUT>'
```

Use the actual project ABI/options/library set. Do not mechanically copy F28335 flags to another C2000 target.

## Prove there are no Flash-loadable sections

Inspect major sections in the RAM map:

```powershell
Select-String -Path '<RAM_MAP>' `
    -Pattern '^\.text\s|^\.cinit\s|^\.const\s|^\.econst\s|^\.pinit\s|^\.switch\s|^\.ebss\s|^\.stack\s'
```

For F28335, the verified Flash range check used the main Flash address region `0x300000-0x33FFFF`:

```powershell
Select-String -Path '<RAM_MAP>' -Pattern '^\S.*\s+[01]\s+003[0-3][0-9a-f]{4}\s+[0-9a-f]{8}'
```

Interpret matches rather than blindly rejecting every address-like line. `DSECT`, `NOLOAD`, and peripheral mapping declarations are different from loadable `.text/.cinit/.econst` output sections.

Do not proceed with RAM-only validation while a loadable program/constant section still resolves to Flash.

## Loading the RAM image

Once the map proves RAM placement, DSS can use the same loader API:

```javascript
session.memory.loadProgram("<RAM_OUT>");
```

The API name `loadProgram` does not inherently mean Flash programming. The executable's load addresses determine whether the loader writes RAM or invokes Flash programming.

## After validation

Remember the RAM image is volatile. Reset or power loss removes it, and the device returns to whatever persistent boot/Flash image is present.

When the RAM workflow is implemented as a second link output, re-check that the normal Flash configuration still has its intended entry point, startup objects, linker file, and excluded RAM-test helper directory.