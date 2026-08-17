# CCS / XDS 排障参考

当编译、下载、调试执行失败，或者工具状态不明确时读取本文件。

## 先检查仿真器是否被占用

在怀疑驱动或硬件前，先检查可能占用 debug probe 的进程：

```powershell
Get-Process | Where-Object {
    $_.ProcessName -match 'ccstudio|eclipsec|java|DebugServer|DSLite'
} | Select-Object ProcessName,Id,Path
```

CCS GUI 的活动 debug session 可能独占 XDS100 JTAG 通道。

如果用户可能有未保存内容，不要强杀 `ccstudio.exe`。优先正常结束 debug session / 关闭 CCS，或者明确告诉用户哪个进程正在占用 probe。

## 确认 XDS100 是否可见

使用 TI 自带工具：

```powershell
& 'D:\04-software\CCSv720\ccsv7\ccs_base\common\uscif\xds100serial.exe'
```

如果提示没有 emulator，按以下顺序排查：

1. 释放 CCS 或其他调试工具对 probe 的占用。
2. 再运行一次 `xds100serial.exe`。
3. 检查 Windows 设备枚举。
4. 检查驱动绑定。
5. 最后再考虑 USB 线、目标供电、probe EEPROM 或硬件故障。

Windows 检查命令：

```powershell
pnputil /enum-devices /connected | Select-String -Pattern 'XDS|FTDI|VID_0403' -Context 2,4
pnputil /enum-drivers | Select-String -Pattern 'xds100|ftdi|Texas Instruments' -Context 3,5
```

## `Error -151` / `SC_ERR_FTDI_OPEN`

典型信息：

```text
One of the FTDI driver functions used during the connect returned bad status or an error.
```

推荐排查顺序：

1. CCS GUI / 其他进程占用 probe。
2. probe serial-number 配置错误。
3. FTDI / XDS100 驱动问题。
4. EEPROM 配置问题。
5. USB 线、目标供电、probe 硬件问题。

不要一看到 `-151` 就直接重装驱动。

## 连接成功，但 load 后等待 `main` 超时

程序装载会 restart target，CCS 可能自动 run 到一个自定义 startup 无法及时到达的 label。

在 `loadProgram()` 前设置：

```javascript
session.options.setBoolean("AutoRunToLabelOnRestart", false);
```

如果超时信息提示可能残留 breakpoint opcode，下一次应重新 load / verify，不要假定上一次镜像完整有效。

## 变量 / expression 读取失败

检查：

- `.out` 是否包含 debug symbols。
- 变量是否被优化掉。
- symbol 名称、作用域、compiler 前缀是否正确。
- 当前加载的 symbol 是否与 target 正在运行的程序匹配。
- 运行中读取时，对应 memory 是否支持 live access。
- 变量类型是否能正确经过 DSS JavaScript 层转换。

需要时用 map 查 symbol：

```powershell
Select-String -Path '<MAP_FILE>' -Pattern '<VARIABLE>'
```

如果 live expression 不支持，则按任务需要执行 halt → read → resume。

## `TI_APPDATA_DIR` / 权限错误

受限环境中，TI 工具可能发生权限错误，但外层 launcher 状态仍具有误导性。

设置：

```powershell
$env:TI_APPDATA_DIR = '<WRITABLE_DIR>\ti-appdata'
New-Item -ItemType Directory -Force -Path $env:TI_APPDATA_DIR | Out-Null
```

然后重试同一个最小范围 DSS 命令。

## 不能只相信 `dss.bat` 退出码

在已经验证的 CCS 7.2 环境中，JavaScript 内部失败或执行 `System.exit(1)` 后，外层 PowerShell 仍可能看到 exit code `0`。

因此必须捕获输出并要求明确 PASS 标记。

正确形式：

```powershell
$dssText = $dssOutput -join [Environment]::NewLine
if ($dssText -notmatch '\[CCS-DSS\] PASS:') {
    throw 'DSS verification failed; inspect output above.'
}
```

避免直接：

```powershell
if ($dssOutput -notmatch 'PASS') { ... }
```

因为 `$dssOutput` 是数组，PowerShell 对数组执行 `-notmatch` 时可能在明明存在 PASS 行的情况下仍产生错误判断。

## 冷启动后验证变量可能暂时不变化

程序刚 load/reset 后还要执行时钟、外设、section copy、中断等初始化，验证变量可能暂时保持初值。

不要只采样一次就判 FAIL。

没有更合适的任务参数时，可以：

- 从约 1000 ms 间隔开始。
- 有限次数重试。
- 设置总 timeout。
- 只有符合变量/事件真实语义时才判 PASS。

## RAM-only 镜像意外触发 Flash programming

大概率是 executable 仍包含 Flash LOAD 地址。

检查 map；文件名中出现 `ram` 没有证明力。

F28335 参考流程中，需要确认 `.text/.cinit/.econst/...` 等真正可装载 section 没有落在主要 Flash 范围 `0x300000-0x33FFFF`。

发现后应修正 RAM linker cmd / object set，而不是继续下载。

## Linker 找不到 RTS / `_c_int00`

例如：

```text
cannot find file "rts2800_fpu32.lib"
undefined symbol _c_int00
```

通常说明：

- 正确 RTS library 缺失。
- library search path 缺失。
- options 顺序错误。

实际可行时优先使用 RTS 绝对路径，并确认 linker mode/options 顺序正确。

## Cleanup 失败 / probe 下一次仍 busy

所有 DSS 路径都应使用 `try/finally` 保证：

- disconnect
- terminate session
- stop server

异常后残留的 DSS/CCS session 会让下一次连接看起来像新的硬件故障。

升级到驱动/硬件排查前，先检查是否存在残留 CCS/DSS 进程。