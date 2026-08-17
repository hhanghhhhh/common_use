# Anlogic TD SRAM programming and runtime debug

Use this reference after implementation when the task is to load a volatile bitstream over JTAG or inspect the running FPGA with ChipWatcher or another observability path.

## SRAM programming scope

This flow programs FPGA configuration SRAM only.

It does not program external configuration Flash. The loaded design disappears after power-off unless the board boots a persistent image from another device.

Do not call a successful JTAG download proof that the application logic is functionally correct.

## Identify the cable before choosing a connection mode

Do not treat every Anlogic cable as interchangeable.

Reference cases:

- Legacy `Anlogic AL-Link`: often enumerates with USB VID/PID `336C:1001` and the `ANLOCYUSB` driver. TD can access this directly using a numeric `-cable` index.
- `AL-LINK-FT`: normally appears as FTDI channels with VID/PID `0403:6042`, commonly using WinUSB for the JTAG channel and TD's HwServer mode.
- USB-Blaster-compatible or remote cable: can require a separately configured server/protocol.

An open TCP port does not prove TD is speaking the expected hardware-server protocol.

Useful Windows discovery:

```powershell
Get-PnpDevice -PresentOnly |
    Where-Object {
        $_.FriendlyName -match 'AL.?Link|Anlogic|USB.*Blaster|JTAG'
    } |
    Select-Object Status, Class, FriendlyName, InstanceId
```

If Windows sees the cable but TD does not, inspect:

- driver/service/provider binding
- board power
- JTAG VREF
- cable orientation
- another process owning the cable
- whether the selected TD cable/server mode matches the actual hardware

Do this before changing the FPGA project.

## Select the correct bitstream

Use a bitstream that matches the exact intended runtime configuration.

### Normal implementation

Use the final physical-run `.bit` produced after the current source/constraint changes.

### ChipWatcher

Use the ChipWatcher-generated/exported debug `.bit` together with the `.cwc` metadata from the same debug build.

A common debug output path is similar to:

```text
cw/compiled.bit
```

Do not program a pre-ChipWatcher bitstream and expect a newer/different `.cwc` capture configuration to work.

Before programming, verify:

- file exists
- file belongs to the active run/debug build
- timestamp is newer than the source/debug changes being tested
- hash when traceability matters
- board pin constraints are valid for the real hardware

## Legacy AL-Link direct download pattern

For a legacy AL-Link using cable index `0`, the verified TD 2026.1 SP2 pattern was:

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

Run with:

```powershell
& '<TD_INSTALL>\bin\td_commands_prompt.exe' 'program_fpga.tcl'
```

The bundled `../scripts/program_fpga.tcl` parameterizes the bit path, cable index, and JTAG speed for this direct legacy AL-Link mode.

Use forward slashes or Tcl-braced paths inside Tcl when practical.

Keep the bit path absolute to avoid caller-working-directory ambiguity.

## JTAG speed and chain parameters

The verified example used:

```text
-spd 5
```

which requests a 5 MHz JTAG clock.

Start conservatively if cable length/signal integrity is uncertain. Valid speeds are cable/device dependent.

Do not guess a nonzero cable index. Use the index TD reports for the intended cable.

For a daisy-chain, verify and pass the appropriate chain/device options such as:

```text
-total_dev
-cur_dev
-bypass
```

Do not assume a one-device chain when hardware says otherwise.

## Sandbox/hardware access

A filesystem build can succeed inside an agent sandbox while USB/JTAG access fails because the sandbox cannot see the interactive user's device/driver/HwServer environment.

When the same narrow TD programming command works outside the sandbox, request/perform only the minimum hardware-access escalation needed for that command.

Do not broaden permission to an arbitrary shell just because JTAG needs host USB access.

Run TD as the interactive user when possible; service/sandbox identities can see a different device/driver environment.

## Programming success criteria

A successful SRAM programming action requires all applicable evidence:

- intended chip family/target was selected
- `download` Tcl call completed (`catch` result `0`)
- TD process completed without programming error
- no `PRG-... ERROR`
- no cable-busy/device-not-found error
- no ID mismatch
- no bit/ChipWatcher-code mismatch
- board entered the expected post-configuration state

Because TD can report outer process success after internal tool errors, parse console/log text as well as the Tcl return code.

## Runtime observation is a separate stage

A bitstream without observability cannot reveal arbitrary internal state after download.

Useful machine-readable debug evidence includes:

- transaction counters
- completion flags/pulses
- returned data
- sticky error flags
- error codes
- expected-value match flags

Prefer sticky status for software-like polling. A one-cycle pulse is usually better used as a trigger than as the only pass/fail evidence.

## ChipWatcher flow

1. Add the required internal signals before the final debug build.
2. Generate the matching debug `.bit` and `.cwc`.
3. Program that debug bitstream.
4. Open ChipWatcher `Watch`.
5. Use `Single Trigger` for a configured event or `Instant Trigger` for an immediate snapshot.
6. Save the waveform or export CSV when automated parsing/archival is needed.

If unattended capture is required, configure and validate a power-on trigger before bitgen, or expose a stable machine-readable result through UART, host registers, Virtual Probe Interface, or another interface that the agent can read.

LEDs are useful for coarse sanity checks but are weak evidence for detailed internal behavior.

## Failure classification

### `device not found`

Check:

- target power/VREF
- cable orientation
- driver binding
- cable ownership
- JTAG continuity

### TD searches for `0403:6042` while legacy `336C:1001` AL-Link is connected

The wrong cable/debug-server mode is selected. Use the direct legacy AL-Link mode rather than forcing an AL-LINK-FT/HwServer path.

### Server TCP port is open but TD still cannot connect

Verify server implementation/protocol and TD debug mode, not only TCP reachability.

### `bit file does not match ChipWatcher`

Use the `.bit` and `.cwc` generated by the same debug build.

### ChipWatcher triggers but expected event is absent

Check:

- probe/debug clock exists and is running
- trigger condition
- observed net was not optimized/remapped unexpectedly
- the application reset/clock domain is active
- the event actually occurs in the tested scenario

### Download succeeds but application behavior is wrong

Stop repeating download as a substitute for debugging. Inspect reset, clocks, pinout, buses, protocol state, sticky error/status signals, and actual runtime waveforms/data.