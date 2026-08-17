# CCS 7.2 DSS debugging reference

Use this reference for DSS connection, program loading, runtime observation, breakpoints, stepping, call-stack analysis, or a persistent interactive debug service.

## DSS basics

CCS Debug Server Scripting (DSS) lets an agent control the CCS debug server from JavaScript without opening the CCS GUI.

Typical setup:

```javascript
importPackage(Packages.com.ti.debug.engine.scripting);
importPackage(Packages.com.ti.ccstudio.scripting.environment);
importPackage(Packages.java.lang);

var env = ScriptingEnvironment.instance();
var server = env.getServer("DebugServer.1");
server.setConfig(ccxml);
```

Set an explicit timeout appropriate for connect/program/verify/run operations:

```javascript
env.setScriptTimeout(300000);
```

## Session selection

For a `.ccxml` already confirmed to expose a single target, the verified CCS 7.2 pattern is:

```javascript
session = server.openSession();
```

Do not guess a device-name regex such as:

```javascript
server.openSession(".*<DEVICE_NAME>.*");
```

CCS's internal session name does not necessarily contain the displayed chip name.

For multi-core targets, do not use the no-argument form blindly. Resolve the actual sessions and open the required core explicitly.

## Connect and program options

After opening the session:

```javascript
session.target.connect();

session.options.setBoolean("AddCIOBreakpointAfterLoad", false);
session.options.setBoolean("AddCEXITbreakpointAfterLoad", false);
session.options.setBoolean("AutoRunToLabelOnRestart", false);
session.options.setString("VerifyAfterProgramLoad", "Full verification");

session.memory.loadProgram(program);
```

`AutoRunToLabelOnRestart=false` avoids a common load timeout when the application uses custom startup and CCS tries to auto-run to `main`.

For Flash programming, allow enough script timeout for erase, program, verify, and restart.

For RAM-only loading, first prove through the map that the executable's loadable sections are in RAM. See `ram-only.md`.

## Writable TI application data

In a restricted/sandboxed environment, CCS tools may fail to write normal AppData and emit text similar to:

```text
Access denied
If this continues, please run fsclean or set TI_APPDATA_DIR to directory you have permissions to access
```

Set a workspace-local writable directory before invoking DSS:

```powershell
$env:TI_APPDATA_DIR = '<WRITABLE_DIR>\ti-appdata'
New-Item -ItemType Directory -Force -Path $env:TI_APPDATA_DIR | Out-Null
```

Do not accept a nominally successful outer command when the DSS log only contains an access error.

## Prefer live reads for ordinary globals

For counters, state values, heartbeats, and ordinary globals in readable memory, prefer keeping the target running when real-time memory access works:

```javascript
session.target.runAsynch();
var value = session.expression.evaluate("<EXPRESSION>");
```

On C2000, real-time debug may require application/target support such as `ERTM;` and the corresponding CCS target configuration.

The expression path is conceptually:

```text
expression/symbol
→ debugger resolves address/type from the loaded symbols
→ XDS reads target memory
→ DSS returns the typed value
```

No application UART/CAN protocol is required just to inspect a symbol through JTAG.

### Limits of live reads

- multiple expressions are not an atomic snapshot
- the CPU can modify a multi-word object while it is being read
- locals/call stack/register inspection may require halt
- some memory/registers do not support useful live access
- high-rate JTAG reads can perturb real-time behavior
- read-to-clear or other side-effect registers must not be polled casually

Use halt/read/resume when the task requires a consistent snapshot or debug state:

```javascript
session.target.halt();
var value = session.expression.evaluate("<EXPRESSION>");
```

## Bulk memory reads

For arrays, sample buffers, or waveform blocks, avoid one expression evaluation per element.

Resolve a symbol once:

```javascript
var address = session.symbol.getAddress("<BUFFER_SYMBOL>");
```

Then read a contiguous block:

```javascript
var data = session.memory.readData(
    Memory.Page.DATA,
    address,
    16,
    count,
    false
);
```

When using direct memory reads, account for:

- correct `Memory.Page`
- C28x 16-bit word addressing semantics
- element width
- signedness/endian/multi-word consistency
- symbol file matching the program actually running on target

## One-shot validation vs persistent interactive debug

Use one-shot DSS when the success predicate is already known and stable:

```text
connect
→ load
→ run
→ sample known evidence
→ PASS/FAIL
→ cleanup
```

Use a persistent session for an unknown bug:

```text
connect once
→ load RAM image
→ set breakpoint
→ continue
→ inspect PC/call stack/locals/globals
→ step or add another breakpoint
→ modify code
→ rebuild/reload
→ reproduce and verify
```

A persistent debug service should retain:

```text
ScriptingEnvironment
DebugServer
DebugSession
loaded symbols
breakpoint IDs
current run/halt state
```

CCS 7.2 includes a reference server concept under:

```text
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\examples\TestServer
```

For an AI-facing service, expose a small explicit command surface instead of a general arbitrary shell.

## Useful interactive operations

Suggested command set:

```text
connect
load-ram <out>
load-flash <out>
symbols <out>

break <symbol>
break <file>:<line>
breaks
delete <id>
delete-all

continue
halt
status
restart
reset

step
next
finish
stepi
nexti

print <expression>
x <address> <bits> <count>
set <expression>=<value>

pc
reg <name>
regs
bt
disasm <address> <count>

detach
quit
```

Representative DSS mappings:

```javascript
session.target.runAsynch();
session.target.halt();
session.target.isHalted();

session.target.sourceStep.into();
session.target.sourceStep.over();
session.target.sourceStep.out();

session.target.asmStep.into();
session.target.asmStep.over();

session.breakpoint.add("<SYMBOL>");
session.breakpoint.add("<SOURCE_FILE>", <LINE>);
session.breakpoint.remove(<ID>);
session.breakpoint.removeAll();

session.expression.evaluate("<EXPRESSION>");
session.callStack.print();
```

### `run()` vs `runAsynch()`

```javascript
session.target.run();
```

is synchronous and blocks until the target stops. Use it only when a stop is expected and a timeout protects the call.

```javascript
session.target.runAsynch();
```

returns immediately and is the preferred primitive for an interactive service that later issues `status`, `halt`, or reads.

## Verified capabilities on CCS 7.2 + XDS100V3 + F28335

The reference environment has successfully demonstrated:

- symbol breakpoint hit
- source-file/line breakpoint hit
- PC/global/local reads
- call stack printing
- source Step Over with observed variable changes
- removing one/all breakpoints
- restoring target execution after debug

Treat these as evidence that the API path works on that environment, not as proof that every target configuration exposes every feature identically.

## Cleanup

Always protect cleanup with `try/finally` behavior:

```javascript
try {
    // debug operations
} finally {
    if (session !== null) {
        if (session.target.isConnected()) {
            session.target.disconnect();
        }
        session.terminate();
    }
    if (server !== null) {
        server.stop();
    }
}
```

If the user's task requires the target to continue running after the debug operation, resume it before disconnecting when that is safe and intended.

## Machine-readable responses

For an agent-controlled persistent server, prefer structured events such as:

```json
{
  "event": "breakpoint_hit",
  "breakpoint_id": 3,
  "pc": "0x00A955",
  "file": "Main.c",
  "line": 101,
  "function": "main",
  "locals": {
    "index": 2
  }
}
```

Useful event types include:

```text
connected
program_loaded
running
halted
breakpoint_hit
step_complete
expression_result
memory_result
target_error
disconnected
```

Each response should state success/failure, any error text/code, and the current target state so the agent can decide the next action reliably.