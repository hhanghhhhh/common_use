# CCS 7.2 DSS 调试参考

用于 DSS 连接、程序装载、变量读取、固定回归以及断点/单步调试。

## 初始化和 session

```javascript
importPackage(Packages.com.ti.debug.engine.scripting);
importPackage(Packages.com.ti.ccstudio.scripting.environment);
importPackage(Packages.java.lang);

var env = ScriptingEnvironment.instance();
env.setScriptTimeout(300000);
var server = env.getServer("DebugServer.1");
server.setConfig(ccxml);
```

已确认 `.ccxml` 只有一个目标时使用：

```javascript
session = server.openSession();
```

不要根据界面芯片名猜 session regex。多核目标先确认真实 session，再显式选择核心。

## 连接和装载

```javascript
session.target.connect();
session.options.setBoolean("AddCIOBreakpointAfterLoad", false);
session.options.setBoolean("AddCEXITbreakpointAfterLoad", false);
session.options.setBoolean("AutoRunToLabelOnRestart", false);
session.options.setString("VerifyAfterProgramLoad", "Full verification");
session.memory.loadProgram(program);
```

`AutoRunToLabelOnRestart=false` 可避免自定义 startup 在 load 后被自动 run-to-main。Flash programming 要给 erase/program/verify 足够 timeout；RAM-only 装载前必须先通过 map 证明可装载 section 都在 RAM。

受限环境无法写 TI AppData 时：

```powershell
$env:TI_APPDATA_DIR = '<WRITABLE_DIR>\ti-appdata'
New-Item -ItemType Directory -Force -Path $env:TI_APPDATA_DIR | Out-Null
```

AppData 权限失败时，即使外层命令返回成功也不能判 PASS。

## 观察策略

普通全局状态和计数器在 real-time access 可用时优先运行中读取：

```javascript
session.target.runAsynch();
var value = session.expression.evaluate("<EXPRESSION>");
```

C2000 程序通常还需启用实时调试，例如执行 `ERTM`。

多个 expression 的运行中读取不是原子快照；多字变量可能撕裂。需要一致状态、局部变量、寄存器或调用栈时再 halt：

```javascript
session.target.halt();
var value = session.expression.evaluate("<EXPRESSION>");
```

高频 JTAG 读取会扰动实时性；不要轮询 read-clear 寄存器。

连续数组和波形使用批量内存读取：

```javascript
var address = session.symbol.getAddress("<BUFFER_SYMBOL>");
var data = session.memory.readData(Memory.Page.DATA, address, 16, count, false);
```

调用者必须确认 memory page、C28x 16-bit word addressing、元素宽度、符号版本和多字一致性。

## 固定回归

成功条件明确时使用一次性流程：

```text
connect → load → run/sample → PASS/FAIL → cleanup
```

### 单调表达式

`../scripts/dss_verify_monotonic.js` 用于确认计数器等表达式在采样窗口内增加。必须看到 `[CCS-DSS] PASS:`。

### 状态机终态

`../scripts/dss_verify_state_machine.js` 调用形式：

```powershell
& '<CCS>\ccs_base\scripting\bin\dss.bat' `
    '<SKILL>\scripts\dss_verify_state_machine.js' `
    '<CCXML>' '<PROGRAM>' `
    '<STATE_EXPR>' <PASS_STATE> <FAIL_STATE> `
    '<PASS_FLAG_EXPR>' '<ERROR_EXPR>' `
    '<PROGRESS_EXPR_OR_DASH>' <EXPECTED_PROGRESS> `
    [sample_ms] [timeout_ms]
```

不检查 progress 时传 `- 0`。脚本循环执行：

```text
runAsynch → 等待 → halt → 读取 state/pass/error/progress → 未到终态则继续
```

这种一致快照适合低频业务状态机，会短暂扰动目标；高实时性控制环应改用运行中实时访问、trace 或应用侧 sticky evidence。

已在 CCS 7.2 + XDS100V3 + F28335 RAM-only 联调中验证：首次快照可能仍为启动默认值；只有 PASS state、pass flag=1、error=0 和可选 progress 匹配时才输出 PASS。

## 交互式调试

未知 Bug 使用常驻 session，保留断点、PC、调用栈、符号和 target 状态。常用能力只需覆盖：

```text
load / symbols
break / delete
continue / halt / restart / reset
step / next / finish
print / memory / register
pc / backtrace / disassemble
detach / quit
```

核心 API：

```javascript
session.target.runAsynch();
session.target.halt();
session.target.sourceStep.into();
session.target.sourceStep.over();
session.breakpoint.add("<SYMBOL>");
session.breakpoint.removeAll();
session.expression.evaluate("<EXPRESSION>");
session.callStack.print();
```

`target.run()` 会阻塞直到目标停止，只在预期命中断点且有 timeout 时使用；持续调试优先 `runAsynch()`。

本机已验证按符号/源码行断点、PC/全局/局部变量读取、调用栈、源码步进、删除断点，以及周期性 run/halt 状态机快照。版本或目标改变后仍需重新确认。

## Cleanup 和返回

所有脚本都要在 `finally` 中释放资源：

```javascript
try {
    // operations
} finally {
    if (session !== null) {
        if (session.target.isConnected()) session.target.disconnect();
        session.terminate();
    }
    if (server !== null) server.stop();
}
```

任务要求目标继续运行时，先安全恢复运行，再断开连接。日志至少输出：连接/装载结果、业务证据、PASS/FAIL、最终 target 状态和 session 是否断开；不要只依赖 `dss.bat` 退出码。
