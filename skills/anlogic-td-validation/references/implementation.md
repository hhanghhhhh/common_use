# 安陆 TD 综合实现与时序参考

用于 synthesis、place/route、时钟/时序、报告和 bitstream 生成。

## 本机已验证环境

```text
TD root    D:\04-software\TD_2601_sp2
Release    2026.1 SP2 / build 6.2.2.200067
CLI        bin\td_commands_prompt.exe
License    license\Anlogic.lic
```

这些只是本机候选路径。必须从实际 tool log 确认 license 成功打开；TD 能启动不代表 license 有效。

## TD 2026.1 SP2 已知问题

### run wrapper 名称错误

`launch_runs` 可能生成不存在的 `td_commands_prompt_commands_prompt.exe`。内部 Tcl 有效时，直接在其预期工作目录使用真实 `td_commands_prompt.exe` 执行，不要重建整套 flow。

### generated settings 缺少 device/package

执行前解析并确认：

```tcl
set device_name <device_db>
set package_name <package>
set speed <speed>
```

工程界面器件名与 `import_device` 使用的 database 名可能不同，不能从其他工程复制。

### physical run 约束清单不同

physical Tcl 可能从 `bkaADCList` 而不是 `ADCList` 加载附加 pin constraint。工程有约束但实现中未生效时，直接检查 generated Tcl/settings 实际读取的 ADC/SDC 变量。

### exit code 误导

内部 Tcl/tool 报错后外层 process 仍可能返回 `0`。每次检查最新日志中的：

```text
ERROR
CRITICAL-WARNING
WARNING
```

并核对 `.bit`、database 和 report 时间戳。

## PLL / IP

可靠流程：

1. 先选择正确 device，再用 TD IP Generator 生成 PLL。
2. 保留 `.ipc` 和一个实际使用的 HDL wrapper；不要同时编译同一 wrapper 的 Verilog/VHDL 两份实现。
3. 工程中同时加入 `.ipc` 和 wrapper，正常实例化生成模块，不手改 primitive 参数。
4. device 或频率变化后重新生成 IP。
5. 从 elaboration/resource 证据确认 PLL、clock buffer 和其他 hard IP 未被优化掉。

## 时钟和 reset

约束 primary input clock：

```tcl
create_clock -name clk_in -period <PERIOD_NS> [get_ports {clk_in}]
```

对 PLL/clock-buffer 输出使用当前版本支持的推导机制，例如：

```tcl
derive_clocks
```

最终 clock/timing report 必须出现预期 generated clock 频率。真实工作 domain 未约束时，即使 WNS 为正也不能判 PASS。

PLL lock 释放 reset 推荐“异步置位、generated clock 域同步释放”。需要 MTBF 时，除 RTL async-reg 意图外，还要确认 synthesis/place 对异步同步寄存器的处理确实启用。

TD 2026.1 SP2 已验证可使用：

```tcl
set_param rtl directive:async_reg on
set_param place async_reg on
```

这两条命令属于 **2026.1 SP2 已验证写法**，用于让 synthesis/place 正确认识同步链并支持相应 MTBF 分析；不要默认认为其他 TD release 的参数名和语义完全相同。版本变化时先从当前版本帮助、generated run Tcl 或实际 log 中重新确认，再决定是否沿用。

## 命令行实现

generated Tcl 通常依赖相对路径，必须在对应 run 目录执行：

```powershell
Push-Location '<PROJECT>_Runs\syn_1'
& '<TD>\bin\td_commands_prompt.exe' '<RUN>.tcl'
Pop-Location

Push-Location '<PROJECT>_Runs\phy_1'
& '<TD>\bin\td_commands_prompt.exe' '<RUN>.tcl'
Pop-Location
```

工程已有可靠 `build_td.ps1` 时优先复用，不要另建平行入口。

## 最终报告

place/route 后导入最终 database，更新 final timing，再生成证据：

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

无内容可报告时某些 report 可能不生成空文件；结合 console/log 判断。

## Implementation PASS 清单

- 权威 RTL、预期 top 和完整 source/include 实际参与实现
- 预期 hard IP 出现在 elaboration/resource 证据中
- synthesis、place 和 route 完成，无 open/unrouted net
- 无 blocking DRC error
- 所有实际 clock domain 受约束，generated clock 频率正确
- setup WNS >= 0、TNS = 0、failing endpoints = 0
- hold WNS >= 0、TNS = 0、failing endpoints = 0
- 资源合理，关键逻辑未被意外优化
- 按任务要求完成 bitgen，bitstream 属于本次构建
- `ERROR`、`CRITICAL-WARNING`、`WARNING` 已检查和分类

历史参考工程的具体资源数、WNS 和某条 warning 不能作为其他工程的固定基准；每次只使用当前 run 的报告。
