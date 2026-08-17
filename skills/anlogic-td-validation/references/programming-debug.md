# 安陆 TD SRAM 下载与运行时调试参考

用于在正确 implementation/debug build 之后，通过 JTAG 写 FPGA configuration SRAM 或使用 ChipWatcher/其他路径观察运行状态。

SRAM 下载不会烧录 configuration Flash，断电后配置消失。下载成功只证明配置传输完成，不证明应用逻辑正确。

## Cable 识别

- Legacy `Anlogic AL-Link`：常见 VID/PID `336C:1001`，驱动 `ANLOCYUSB`，可用数字 `-cable` index 直连。
- `AL-LINK-FT`：常见 VID/PID `0403:6042`，通常通过 TD HwServer。
- USB-Blaster/remote cable：需要对应 server/protocol；TCP listen 不代表协议匹配。

Windows 可先检查：

```powershell
Get-PnpDevice -PresentOnly |
    Where-Object { $_.FriendlyName -match 'AL.?Link|Anlogic|USB.*Blaster|JTAG' } |
    Select-Object Status, Class, FriendlyName, InstanceId
```

Windows 看得到但 TD 看不到时，先查 driver/provider、板卡供电、JTAG VREF、排线、进程占用和 cable mode，不要先改 FPGA 工程。

## Bitstream 选择

下载前确认：

- 文件属于当前 active implementation/debug build，时间戳晚于本次源码/约束修改
- 需要追溯时记录 hash
- 当前 pin constraint 对真实板卡有效且安全
- ChipWatcher 使用同一次 debug build 的 `.bit` 与 `.cwc`

不要下载普通 pre-ChipWatcher bitstream 后配另一份 `.cwc`。

## Legacy AL-Link SRAM 下载

使用 `../scripts/program_fpga.tcl`：

```powershell
$env:ANLOGIC_BIT_FILE = 'D:/absolute/path/to/final_or_debug.bit'
$env:ANLOGIC_CABLE_INDEX = '0'
$env:ANLOGIC_JTAG_MHZ = '5'

& '<TD_INSTALL>\bin\td_commands_prompt.exe' `
    'D:/absolute/path/to/program_fpga.tcl'
```

`ANLOGIC_BIT_FILE` 必填；cable 和 speed 默认 `0`、`5`。路径使用绝对路径和 `/`。

TD 2026.1 SP2 实测不要追加脚本 argv：

```text
td_commands_prompt.exe program_fpga.tcl <bit> <cable> <speed>
```

附加参数会交给内部 `source`，脚本执行前报：

```text
wrong # args: should be "source ?-encoding name? fileName"
```

外层仍可能返回 `0`，应判定为“未下载”。反斜杠脚本路径还可能把 `\u` 等解释为 Tcl 转义，导致 `no such file or directory`。

## JTAG 参数

`-spd 5` 表示请求 5 MHz；信号质量不确定时从保守速度开始。不要猜非零 cable index。

多器件链还要按真实拓扑确认：

```text
-total_dev
-cur_dev
-bypass
```

## Sandbox 和权限

文件系统沙箱可能能综合但看不到 USB/JTAG。只为最小 TD 下载命令申请硬件权限，并尽量使用当前交互用户的 driver/service 环境，不要放开任意 shell。

## Programming PASS

至少同时满足：

- 找到预期 cable、chain 和 chip family
- Tcl `catch` 返回 `DOWNLOAD_RC=0`，并输出 `PROGRAM_RESULT=PASS`
- 无 `PRG-... ERROR`、device-not-found、cable-busy、ID mismatch 或 debug code mismatch
- 下载的是本次确认过的 bitstream

不能只看 TD process 退出码。

## Runtime evidence

下载后必须通过已有观察路径证明应用行为。适合自动判断的证据包括：

- transaction counter 或 completion sticky flag
- 返回数据、expected-value match
- sticky error flag 和 error code
- ChipWatcher waveform/CSV

单周期 pulse 更适合 trigger，不适合作为唯一 PASS 证据；LED 只能做粗略 sanity check。

ChipWatcher 最短流程：加入 probe → 生成匹配 `.bit/.cwc` → 下载 → trigger/capture → 保存 waveform/CSV。无人值守时优先 power-on trigger，或通过 UART/host register/Virtual Probe 暴露稳定状态。

## 常见失败

### `device not found`

检查供电/VREF、排线方向、driver binding、cable ownership 和 JTAG continuity。

### `wrong # args: should be "source ..."`

不要重试带 argv 的调用；改用三个 `ANLOGIC_*` 环境变量，只传一个使用 `/` 的 Tcl 脚本路径。

### Tcl 路径异常或 `no such file or directory`

把脚本路径和 bitstream 路径中的 `\` 改为 `/`。

### Legacy `336C:1001` 却在寻找 `0403:6042`

选择了错误的 AL-LINK-FT/HwServer mode；改用 legacy direct mode。

### Server 端口打开但仍连接失败

检查 server protocol/provider，不要只验证 TCP reachability。

### ChipWatcher bit/code 不匹配

重新选择同一次 debug build 的 `.bit` 与 `.cwc`。

### 下载成功但应用错误

停止重复下载，转查 reset、clock、pinout、bus/protocol state、sticky error 和实际 runtime 数据/波形。
