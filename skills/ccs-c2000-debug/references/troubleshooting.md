# CCS/XDS troubleshooting

Use this reference when build/load/debug execution fails or tool status is ambiguous.

## Check probe ownership first

Before diagnosing drivers or hardware, look for processes that can own the debug probe:

```powershell
Get-Process | Where-Object {
    $_.ProcessName -match 'ccstudio|eclipsec|java|DebugServer|DSLite'
} | Select-Object ProcessName,Id,Path
```

An active CCS GUI debug session can exclusively own the XDS100 JTAG channel.

Do not force-kill `ccstudio.exe` if the user may have unsaved work. Prefer ending the debug session/closing CCS normally, or report the owning process.

## Confirm XDS100 visibility

Use TI's tool:

```powershell
& 'D:\04-software\CCSv720\ccsv7\ccs_base\common\uscif\xds100serial.exe'
```

If it reports no emulator:

1. release CCS/other debug ownership
2. rerun `xds100serial.exe`
3. inspect Windows device enumeration
4. inspect driver binding
5. check USB cable, target power, probe EEPROM/hardware only after the simpler causes

Useful Windows checks:

```powershell
pnputil /enum-devices /connected | Select-String -Pattern 'XDS|FTDI|VID_0403' -Context 2,4
pnputil /enum-drivers | Select-String -Pattern 'xds100|ftdi|Texas Instruments' -Context 3,5
```

## `Error -151` / `SC_ERR_FTDI_OPEN`

Typical text:

```text
One of the FTDI driver functions used during the connect returned bad status or an error.
```

Diagnose in this order:

1. CCS GUI or another process already owns the probe
2. invalid probe serial-number configuration
3. FTDI/XDS100 driver issue
4. EEPROM configuration issue
5. USB cable/target power/probe hardware

Do not jump straight to reinstalling drivers.

## Connect succeeds but load waits for `main` and times out

When program load implicitly restarts the target, CCS can try to run automatically to a label that the custom startup path does not reach quickly enough.

Before `loadProgram()` use:

```javascript
session.options.setBoolean("AutoRunToLabelOnRestart", false);
```

If the timeout reports possible leftover breakpoint opcodes, reload/verify the program on the next attempt rather than assuming the previous image is valid.

## Variable/expression read fails

Check:

- output contains debug symbols
- variable was not optimized away
- symbol spelling/scope/compiler prefix is correct
- symbol file matches the image currently running
- the memory region supports live access if reading while running
- the type converts correctly through the DSS JavaScript layer

Use the map to confirm a symbol when useful:

```powershell
Select-String -Path '<MAP_FILE>' -Pattern '<VARIABLE>'
```

If live expression access is unsupported, halt the target, read, then resume according to the task.

## `TI_APPDATA_DIR` / permission errors

Restricted environments can make TI tools emit an access error while the outer launcher remains misleadingly successful.

Set:

```powershell
$env:TI_APPDATA_DIR = '<WRITABLE_DIR>\ti-appdata'
New-Item -ItemType Directory -Force -Path $env:TI_APPDATA_DIR | Out-Null
```

Then rerun the same narrowly scoped DSS command.

## Do not trust `dss.bat` exit code alone

On the verified CCS 7.2 setup, a JavaScript failure or `System.exit(1)` can still leave the outer PowerShell seeing process exit code `0`.

Capture output and require an explicit success marker.

Correct PowerShell pattern:

```powershell
$dssText = $dssOutput -join [Environment]::NewLine
if ($dssText -notmatch '\[CCS-DSS\] PASS:') {
    throw 'DSS verification failed; inspect output above.'
}
```

Avoid:

```powershell
if ($dssOutput -notmatch 'PASS') { ... }
```

because `$dssOutput` is an array and PowerShell's array `-notmatch` behavior can produce false failure logic even when one line contains PASS.

## Cold-start evidence can lag

Immediately after load/reset, clock, peripheral, section-copy, and interrupt initialization can delay the validation variable.

Use a finite retry window instead of declaring failure after the first sample:

- start around 1000 ms when no better task-specific interval is known
- sample a bounded number of times
- keep an overall timeout
- only call PASS when the variable/event behaves according to its actual semantics

## RAM-only image unexpectedly programs Flash

The executable probably still contains Flash load addresses.

Inspect its map. A filename containing `ram` proves nothing.

For the verified F28335 flow, check whether loadable `.text/.cinit/.econst/...` sections still land in `0x300000-0x33FFFF`. Fix the RAM linker command/object set before trying again.

## Linker cannot find RTS / `_c_int00`

Errors such as:

```text
cannot find file "rts2800_fpu32.lib"
undefined symbol _c_int00
```

usually mean the correct RTS library/search path is missing or appears too late in the link options.

Use an absolute RTS path when practical and ensure linker mode/options are ordered correctly.

## Cleanup failures / probe remains busy

Use `try/finally` to disconnect, terminate the session, and stop the server even after an exception.

A stale DSS process/session can make the next probe attempt look like a fresh hardware problem. Check for leftover CCS/DSS processes before escalating diagnostics.