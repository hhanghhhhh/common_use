# 安陆 TD 综合实现与时序参考

当任务涉及 synthesis、place/route、时钟/时序验证、report 或 bitstream 生成时读取本文件。

## 已验证的本机安装

参考安装：

```text
D:\04-software\TD_2601_sp2
TD Release 2026.1 SP2
build 6.2.2.200067
```

命令行工具：

```text
D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe
```

参考 license：

```text
D:\04-software\TD_2601_sp2\license\Anlogic.lic
```

不能因为 TD 能启动就认为 license 一定有效。必须从 synthesis/tool log 中确认 license 成功打开，并检查 license 相关 error。

这些路径只作为当前工作站默认值，不是所有环境的固定事实。

## TD 2026.1 SP2 已知 run 生成问题

### 自动生成的 executable 名称错误

参考环境中，`launch_runs` 曾生成：

```text
td_commands_prompt_commands_prompt.exe
```

可靠处理方式是直接使用真实 executable 执行各 run 生成的 Tcl：

```text
D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe
```

优先绕过/修正错误 wrapper，不要因此重新发明整套 implementation flow。

### 自动生成 settings 的 device/package 为空

曾观察到 generated `settings.cfg` 中 device/package 字段为空。

执行实现前必须解析并确认实际：

- device database
- package
- speed

仅作为参考的示例：

```tcl
set device_name ph1_400.db
set package_name PH1A400SFX900
set speed 2
```

工程界面中的 device/package 名称与 `import_device` 使用的 database 参数不一定相同。

参考工程中：

```text
project/package selection: PH1A400SFX900
direct import database:    ph1_400.db
```

不要把这些值复制到别的工程。

### Physical run 的约束清单

从 `opt_place` 附近开始的 physical run 曾通过 `bkaADCList` 加载附加 ADC constraint，而不只是 `ADCList`。

参考结构：

```tcl
set bkaADCList {"../../constraints/top.adc"}
set SDCList {"../../constraints/top.sdc"}
```

如果工程里明明有 pin/clock 约束，但 physical implementation 中却像没有加载，应直接检查 generated run Tcl/settings，确认实际消费的是哪些 constraint list。

### Exit code 可能误导

TD 在内部 Tcl/tool 报错后仍可能返回 process exit code `0`。

每次都要检查最新 run log：

```text
ERROR
CRITICAL-WARNING
WARNING
```

同时检查输出时间戳，避免把旧 `.bit` / report 当成本次构建结果。

## PLL / IP 工作流

在已验证 TD 版本中，可靠流程是：

1. 在 TD 工程中选择正确 FPGA device。
2. 使用 TD IP Generator 配置/生成 PLL。
3. 保留生成的 `.ipc` 和 HDL wrapper。
4. 把 `.ipc` 加入工程，并确保实际需要的 HDL wrapper 进入 synthesis。
5. 同一个 wrapper 不要同时编译 Verilog 和 VHDL 两个版本。
6. 正常使用时实例化生成 wrapper，不要手工修改 primitive 参数。
7. 修改 device 或输入/输出频率后重新生成 IP。

仅作参考的已验证配置：

```text
Device       : PH1A400SFX900
Input        : 50 MHz
Output       : 100 MHz
Wrapper      : PLL_0
Primitive    : PH1_PHY_PLL
Clock buffer : PH1_LOGIC_BUFG
```

## 时钟约束

至少先约束 primary input clock：

```tcl
create_clock -name clk_in -period 20.000 -waveform {0.000 10.000} [get_ports {clk_in}]
```

PLL / clock-buffer 产生新时钟时，使用当前版本支持的 generated-clock 推导机制：

```tcl
derive_clocks
```

**如果真实 PLL 输出 domain 没有被约束，即使 WNS 为正也不能认为 timing 通过。**

最终 clock/timing report 必须明确出现预期 generated clock 的频率和周期。

## PLL lock 相关 Reset 同步

PLL lock 释放 reset 时，使用：

```text
异步置位
+ 在 generated clock domain 同步释放
```

需要 MTBF report 时，参考流程除了 RTL 中的 async-reg 意图外，还需要 TD synthesis/place 对应设置：

```tcl
set_param rtl directive:async_reg on
set_param place async_reg on
```

project multi-run 模式使用等价 run property。

不同 TD release 可能参数名不同，应以当前版本为准。

## 命令行直接执行实现

参考工程的有效顺序：

```powershell
Push-Location 'test1_Runs\syn_1'
& 'D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe' 'test1.tcl'
Pop-Location

Push-Location 'test1_Runs\phy_1'
& 'D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe' 'test1.tcl'
Pop-Location

& 'D:\04-software\TD_2601_sp2\bin\td_commands_prompt.exe' 'post_route_reports.tcl'
```

generated Tcl 必须在它预期的工作目录执行，因为内部经常使用相对路径。

如果当前工程已经有可用 `build_td.ps1`，优先使用和检查现有脚本，不要再平行生成另一套 build entrypoint。

## 最终 Physical Report

place/route 后，导入最终 physical database，并先更新 final timing，再生成证据。

参考命令集：

```tcl
import_device <device_db> -package <package> -speed <speed>
import_db <final_pr_db>
update_timing -mode final

report_timing_summary -file <reports>/timing_summary.rpt
check_timing -verbose -file <reports>/check_timing.rpt
report_area -io_info -file <reports>/area.rpt
report_drc -file <reports>/drc.rpt
report_clock_summary -file <reports>/clock_summary.rpt
report_route_status -fanout_stat -drc -file <reports>/route_status.rpt
report_mtbf -file <reports>/mtbf.rpt
```

某些 report 在没有内容可输出时可能不生成空文件，因此要结合 console/log 判断。

## Implementation PASS 判据

只有当前任务适用项全部满足才能报告 PASS：

- 使用权威 RTL 和预期 top。
- source/include list 完整。
- 预期 hard IP 出现在 elaboration/resource 证据中。
- synthesis 完成。
- place & route 完成。
- 没有 open/unrouted net。
- 没有 blocking DRC error。
- 每个实际使用的 clock domain 都有约束。
- PLL/clock-buffer generated clock 出现在最终 clock/timing report。
- setup WNS >= 0。
- setup TNS = 0，setup failing endpoints = 0。
- hold WNS >= 0，hold failing endpoints = 0。
- 资源数量合理，关键逻辑没有被意外优化掉。
- 用户要求时 bitgen 完成。
- bitstream 为本次新生成。
- ERROR / CRITICAL-WARNING / WARNING 已检查和分类。

## 已验证参考结果

一次已知正常 reference run：

```text
PLL output clock : 100.000 MHz / 10.000 ns
Setup WNS        : +4.244 ns
Hold WNS         : +0.107 ns
Failing endpoints: 0
LUT6             : 147
Registers        : 122
Slices           : 164
PLL              : 1
GCLK             : 1
Bitgen            : PASS
```

当时还存在一个 non-blocking warning：

```text
PHY-5016 WARNING: PLL clkc is driving an IO without location.
```

该参考设计最终 PLL 正常放置、使用 GCLK、route 完成、final timing 通过、bitgen 成功。

这个结果只说明那次 warning 在那个工程中不阻塞，**不能把它自动豁免到其他工程。**

参考工程产物：

```text
VALIDATION_REPORT.md
build_td.ps1
post_route_reports.tcl
reports/timing_summary.rpt
reports/check_timing.rpt
reports/area.rpt
test1_Runs/phy_1/test1.bit
```

这些文件名只是展示一种已经跑通的 evidence layout；实际执行时仍应解析当前工程的真实路径。