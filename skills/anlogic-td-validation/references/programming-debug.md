# 安陆 TD SRAM 下载与运行时调试参考

当 implementation 已经完成，并且任务需要通过 JTAG 把易失 bitstream 下载到 FPGA SRAM，或者使用 ChipWatcher/其他观察路径检查真实 FPGA 运行状态时读取本文件。

## SRAM programming 的范围

这里的流程只写 FPGA configuration SRAM。

它**不会**烧录外部 configuration Flash。断电后当前 SRAM 配置会消失，除非板卡还能从其他持久化器件重新启动。

JTAG 下载成功只能证明配置传输完成，不能证明应用逻辑功能正确。

## 先识别 cable，再选择连接模式

不同安陆 cable 不能混为一谈。

参考情况：

- Legacy `Anlogic AL-Link`：常见 USB VID/PID `336C:1001`，驱动 `ANLOCYUSB`。TD 可以用数字 `-cable` index 直接访问。
- `AL-LINK-FT`：通常表现为 VID/PID `0403:6042` 的 FTDI channel，JTAG channel 常使用 WinUSB，并通过 TD HwServer 模式工作。
- USB-Blaster 兼容或 remote cable：可能需要独立 server / protocol 配置。

TCP 端口处于 listen 状态，并不能证明 TD 与服务端使用的是正确 hardware-server protocol。

Windows 下可以先检查：

```powershell
Get-PnpDevice -PresentOnly |
    Where-Object {
        $_.FriendlyName -match 'AL.?Link|Anlogic|USB.*Blaster|JTAG'
    } |
    Select-Object Status, Class, FriendlyName, InstanceId
```

如果 Windows 看得到 cable，但 TD 看不到，优先检查：

- driver / service / provider binding
- 板卡供电
- JTAG VREF
- 排线方向
- 是否被其他进程占用
- 当前 TD cable/server mode 是否与真实硬件匹配

这些检查完成前，不要先去修改 FPGA 工程。

## 选择正确 bitstream

必须使用与当前预期 runtime configuration 完全匹配的 bitstream。

### 普通 implementation

使用当前源码和约束完成最终 physical run 后生成的 `.bit`。

### ChipWatcher

必须使用 ChipWatcher 同一次 debug build 生成/导出的 debug `.bit` 与对应 `.cwc`。

常见 debug 输出类似：

```text
cw/compiled.bit
```

不能下载一个 pre-ChipWatcher bitstream，却期望另一份/更新后的 `.cwc` 正常工作。

下载前确认：

- 文件存在
- 属于当前 active run/debug build
- 时间戳晚于本次源码/debug 修改
- 需要追溯时记录 hash
- 当前 pin constraint 对真实板卡有效且安全

## Legacy AL-Link 直接下载

Legacy AL-Link 使用 cable index `0` 时，TD 2026.1 SP2 已验证的基本形式：

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

执行：

```powershell
& '<TD_INSTALL>\bin\td_commands_prompt.exe' 'program_fpga.tcl'
```

Skill 内的 `../scripts/program_fpga.tcl` 已把 bit path、cable index 和 JTAG speed 参数化，用于这种 direct legacy AL-Link 模式。

Tcl 路径优先使用 `/` 或 `{}` 包裹，并尽量使用 bit 文件绝对路径，避免调用者当前工作目录不同造成歧义。

## JTAG 速度与 chain 参数

已验证示例：

```text
-spd 5
```

表示请求 5 MHz JTAG clock。

排线较长或 signal integrity 不确定时，从保守速度开始。有效速度范围与 cable/device 有关。

不要猜非零 cable index，应使用 TD 实际枚举出的目标 cable index。

存在 JTAG daisy-chain 时，还需要按真实链路确认：

```text
-total_dev
-cur_dev
-bypass
```

不要默认链上只有一个器件。

## Sandbox 与真实硬件访问

Agent 在 filesystem sandbox 中可能可以正常综合，但无法访问 USB/JTAG，因为 sandbox 看不到交互用户的 device/driver/HwServer 环境。

如果同一条最小 TD 下载命令在 sandbox 外可用，只提升这条命令所需的最小硬件访问权限。

不要因为 JTAG 需要 USB 权限就把任意 shell 全面放开。

可能时让 TD 以当前交互用户运行，因为 service/sandbox identity 看到的 device/driver 环境可能不同。

## SRAM 下载成功判据

一次 programming PASS 至少需要当前任务适用项全部成立：

- 选择了预期 chip family / target
- `download` Tcl 调用正常返回，`catch` result = `0`
- TD process 没有 programming error
- 没有 `PRG-... ERROR`
- 没有 cable-busy / device-not-found
- 没有 ID mismatch
- 没有 bit / ChipWatcher code mismatch
- 板卡进入预期配置后状态

由于 TD 外层 exit code 也可能误导，必须同时解析 Tcl 返回值和 console/log。

## Runtime observation 是独立阶段

bitstream 下载后，如果没有 observability path，就无法凭空读取任意内部寄存器。

适合给 Agent 的机器可读证据包括：

- transaction counter
- completion flag / pulse
- 返回数据
- sticky error flag
- error code
- expected-value match flag

软件式轮询优先使用 sticky status。

只有一个 clock 的 pulse 更适合作为 trigger，而不是唯一 PASS/FAIL 证据。

## ChipWatcher 流程

1. final debug build 前加入需要观察的内部信号。
2. 生成匹配的 debug `.bit` 和 `.cwc`。
3. 下载该 debug bitstream。
4. 打开 ChipWatcher `Watch`。
5. 已配置事件用 `Single Trigger`；立即快照用 `Instant Trigger`。
6. 自动分析或归档需要时保存 waveform / 导出 CSV。

需要无人值守 capture 时，可以：

- bitgen 前配置并验证 power-on trigger；或
- 通过 UART、host register、Virtual Probe Interface 等稳定接口暴露机器可读结果。

LED 可以做粗略 sanity check，但不能代替详细内部状态证据。

## 常见失败分类

### `device not found`

检查：

- target power / VREF
- cable 方向
- driver binding
- cable ownership
- JTAG continuity

### 接的是 legacy `336C:1001` AL-Link，但 TD 在找 `0403:6042`

说明选择了错误 cable/debug-server mode。

应使用 legacy AL-Link direct mode，而不是强行走 AL-LINK-FT/HwServer。

### Server TCP 端口已打开，但 TD 仍连不上

检查 server 实现/protocol 与 TD debug mode 是否匹配，而不是只检查 TCP reachability。

### `bit file does not match ChipWatcher`

使用**同一次 debug build** 生成的 `.bit` 和 `.cwc`。

### ChipWatcher 已触发，但预期事件不存在

检查：

- probe/debug clock 是否存在并运行
- trigger condition 是否正确
- observed net 是否被优化/重映射
- application reset/clock domain 是否真正工作
- 测试场景中目标事件是否实际发生

### Download 成功但应用行为错误

不要反复重新下载代替调试。

转而检查：

- reset
- clocks
- pinout
- buses
- protocol state
- sticky error/status
- 实际 runtime waveform / data