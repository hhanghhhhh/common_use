# CCS 7.2 DSS 调试参考

当任务涉及 DSS 连接、程序下载、运行变量读取、断点、单步、调用栈或常驻交互式调试服务时读取本文件。

## DSS 基本用途

CCS Debug Server Scripting（DSS）允许 Agent 通过 JavaScript 控制 CCS Debug Server，而不需要打开 CCS GUI。

典型初始化：

```javascript
importPackage(Packages.com.ti.debug.engine.scripting);
importPackage(Packages.com.ti.ccstudio.scripting.environment);
importPackage(Packages.java.lang);

var env = ScriptingEnvironment.instance();
var server = env.getServer("DebugServer.1");
server.setConfig(ccxml);
```

为连接、烧录、校验和运行设置明确超时：

```javascript
env.setScriptTimeout(300000);
```

## Session 选择

如果已经确认 `.ccxml` 只有一个目标，CCS 7.2 已验证的优先方式是：

```javascript
session = server.openSession();
```

不要随意猜：

```javascript
server.openSession(".*<DEVICE_NAME>.*");
```

因为 CCS 内部 session name 不一定包含界面显示的芯片名称。

多核目标不能盲目用无参数形式，应先确认真实 session，再显式打开需要的核。

## 连接与程序装载选项

```javascript
session.target.connect();

session.options.setBoolean("AddCIOBreakpointAfterLoad", false);
session.options.setBoolean("AddCEXITbreakpointAfterLoad", false);
session.options.setBoolean("AutoRunToLabelOnRestart", false);
session.options.setString("VerifyAfterProgramLoad", "Full verification");

session.memory.loadProgram(program);
```

`AutoRunToLabelOnRestart=false` 可以避免自定义 startup 工程在 load 后被 CCS 自动 run-to-main 导致超时。

Flash programming 时要给 erase/program/verify/restart 留足 timeout。

RAM-only 下载前必须先通过 map 证明 executable 的可装载 section 都在 RAM，见 `ram-only.md`。

## TI AppData 写权限

受限环境中可能出现：

```text
Access denied
If this continues, please run fsclean or set TI_APPDATA_DIR to directory you have permissions to access
```

执行 DSS 前设置工作区内可写目录：

```powershell
$env:TI_APPDATA_DIR = '<WRITABLE_DIR>\ti-appdata'
New-Item -ItemType Directory -Force -Path $env:TI_APPDATA_DIR | Out-Null
```

如果 DSS 日志只有权限错误，即使外层命令看起来“成功”，也不能算通过。

## 普通全局变量优先运行中读取

计数器、状态值、心跳和普通全局变量，在 real-time memory access 可用时优先让 target 保持运行：

```javascript
session.target.runAsynch();
var value = session.expression.evaluate("<EXPRESSION>");
```

C2000 的实时调试通常还要求程序/目标配置支持，例如执行：

```c
ERTM;
```

expression 读取的本质：

```text
变量/表达式
→ CCS 根据已加载符号解析地址和类型
→ XDS 通过 JTAG 读取目标内存
→ DSS 返回对应值
```

因此读取普通符号不依赖应用层 UART/CAN 协议。

### 运行中读取的限制

- 多个 expression 依次读取，不是原子快照。
- CPU 可能在读取多字变量时同时更新它，出现撕裂读。
- 局部变量、调用栈、寄存器检查可能需要 halt。
- 某些内存/寄存器不支持合适的实时访问。
- 高频 JTAG 读取可能对实时性产生扰动。
- read-to-clear 等有副作用寄存器不能随意轮询。

需要一致快照时再使用：

```javascript
session.target.halt();
var value = session.expression.evaluate("<EXPRESSION>");
```

## 连续大块数据使用批量读取

数组、采样 buffer、波形数据不要逐元素 `expression.evaluate()`。

先解析首地址：

```javascript
var address = session.symbol.getAddress("<BUFFER_SYMBOL>");
```

再批量读取：

```javascript
var data = session.memory.readData(
    Memory.Page.DATA,
    address,
    16,
    count,
    false
);
```

直接读内存时必须自己保证：

- `Memory.Page` 正确
- C28x 16-bit word addressing 语义正确
- element width 正确
- signedness / endian / 多字一致性正确
- 当前 `.out` 符号和 target 真正运行的程序一致

## 一次性验证 vs 常驻交互式调试

成功条件已经明确时，用一次性 DSS：

```text
connect
→ load
→ run
→ 采样已知证据
→ PASS/FAIL
→ cleanup
```

未知 Bug 用常驻 session：

```text
connect 一次
→ load RAM image
→ 设置断点
→ continue
→ 查看 PC / call stack / locals / globals
→ step 或增加断点
→ 修改源码
→ rebuild / reload
→ 复现并验证
```

常驻服务应保留：

```text
ScriptingEnvironment
DebugServer
DebugSession
loaded symbols
breakpoint IDs
当前 run/halt 状态
```

CCS 7.2 自带参考概念：

```text
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\examples\TestServer
```

给 AI 用时，建议暴露一个小而明确的命令集，不要变成任意 shell。

## 推荐交互命令集

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

对应 DSS API 示例：

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

## `run()` 与 `runAsynch()`

```javascript
session.target.run();
```

同步执行，会一直阻塞直到 target 停止。只有预期会命中断点/停止并且有 timeout 保护时才使用。

```javascript
session.target.runAsynch();
```

启动后立即返回，更适合常驻交互服务，之后再执行 `status`、`halt`、变量读取等操作。

## 已在 CCS 7.2 + XDS100V3 + F28335 验证的能力

已实际验证：

- 按符号设置断点并命中
- 按源码文件/行设置断点并命中
- 读取 PC、全局变量、局部变量
- 打印调用栈
- 源码级 Step Over，并观察执行后的变量变化
- 删除单个/全部断点
- 调试结束后恢复目标运行

这些结果证明当前参考环境中的 API 路径可用，不代表所有芯片/配置都完全一致。

## Cleanup

所有 DSS 操作都应保证异常路径也释放资源：

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

如果任务要求目标在调试结束后继续运行，应在安全且符合任务要求时先恢复运行，再断开连接。

## 给 Agent 的结构化返回

常驻调试服务最好返回机器可解析事件，例如：

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

推荐事件类型：

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

每个返回至少包含：成功/失败、错误文本/错误码、当前 target 状态。这样 Agent 才能可靠决定下一步。