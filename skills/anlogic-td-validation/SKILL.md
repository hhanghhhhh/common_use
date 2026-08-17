---
name: anlogic-td-validation
description: 使用安陆 TD 对 FPGA 工程进行综合、布局布线、时序/SDC/PLL 时钟检查、资源与 DRC 报告、bitstream 生成，以及可选的 JTAG SRAM 下载和 ChipWatcher 下板观察。适用于安陆 FPGA/TD 工程综合实现、时序收敛、WNS/TNS、PLL 生成时钟约束、资源检查、bitgen、AL-Link 下载和硬件验证。如果只是 RTL 功能仿真，不需要实现或硬件验证，则不要使用本 Skill。
---

# 安陆 TD 综合实现、时序与下板验证

本 Skill 验证 RTL 仿真无法证明的实现事实：真实器件能否综合、布局布线、满足时序、生成 bitstream，并在用户要求时完成 SRAM 下载和运行观察。

实现通过不等于 RTL 功能正确；可以先由仿真判断的逻辑行为应先仿真。

## 一、开始前确认

从当前工程重新确认，不沿用其他工程假设：

- 权威 RTL、include 和实际 top
- `.al` 工程、target device database、package、speed
- 真实 ADC/pin 和 SDC/timing 约束
- PLL/生成 IP 的 `.ipc` 与唯一有效 HDL wrapper
- synthesis/physical run、最终 database 和 bitstream 路径
- 本次 PASS 判据；下板时再确认 cable、driver 和观察路径

如果存在 validation copy，先与权威源码比较；除非用户明确要求，否则验证权威源码。

## 二、任务路由

| 目标 | 执行范围 | 资料 |
|---|---|---|
| 综合、P&R、资源、bitgen | 完整 implementation | `references/implementation.md` |
| 时钟/时序专项 | implementation + clock/check_timing/final timing 证据 | `references/implementation.md` |
| SRAM 下载、ChipWatcher、运行观察 | 正确 implementation/debug build 后再下板 | `references/programming-debug.md` |

Legacy AL-Link 可使用 `scripts/program_fpga.tcl`，但必须先确认 cable 类型。临时 compile-only pin 未经用户确认不得用于真实板卡。

## 三、执行顺序

1. 解析 `.al`、source/include、device/package/speed、ADC/SDC 和 IP 配置。
2. 确认待测逻辑可观察且不会被合理优化；不要为“看见资源”随意加 `keep`。
3. 约束所有 primary clock，并通过当前 TD 支持的机制推导 PLL/clock-buffer generated clock。
4. 使用工程已有脚本完成 analyze/elaborate、synthesis、place、route 和按需 bitgen。
5. 导入最终 physical database，更新 final timing，收集 timing/check/area/DRC/clock/route 报告。
6. 检查最新 log 和产物时间戳；只有用户要求且 pin/cable/bitstream 安全匹配时才 SRAM 下载。

## 四、硬性规则

- 不沿用 reference run 的 device、package、pin、clock、IP 或 bitstream 路径。
- 真实使用但未约束的 clock domain 存在时，即使 WNS 为正也不能报告 timing PASS。
- generated clock 必须在最终 clock/timing report 中以预期频率出现。
- TD 内部报错后外层 process 仍可能返回 `0`；必须检查最新 log 中的 `ERROR`、`CRITICAL-WARNING`、`WARNING` 和产物时间戳。
- P&R 必须没有 open/unrouted net 和 blocking DRC error。
- warning 必须分类，不能静默忽略或跨工程沿用豁免。
- ChipWatcher `.bit` 与 `.cwc` 必须来自同一次 debug build。
- bitgen 或下载成功只证明实现/配置阶段成功；应用正确性需要运行时证据。
- 临时 pin 只能标为 `compile-only constraints`，不能描述成真实板卡接线。
- 下板前确认 cable/driver mode、JTAG chain、板卡供电/VREF 和 bitstream 来源。

## 五、PASS 门槛

Implementation PASS 至少要求：

- 预期 top/source/IP 被实际使用，综合和 P&R 完成
- 所有工作时钟受约束，generated clock 频率正确
- setup/hold WNS 均不为负，TNS 和 failing endpoints 为 0
- 无 open/unrouted net、blocking DRC，资源数量合理
- warning 已分类；按任务要求生成了本次新 bitstream

硬件验证还要求：

- 选择了正确 bitstream/debug metadata 和真实 cable/target
- Tcl download 明确成功且无 programming error
- 通过计数器、状态、返回数据、波形或其他路径观察到预期行为

详细报告命令和版本坑点见对应 reference，不在主文件重复。

## 六、Reference 路由

- TD 安装、run 生成问题、PLL/SDC、报告和完整 implementation 验收 → `references/implementation.md`
- cable 识别、AL-Link SRAM、ChipWatcher、运行证据和下载排障 → `references/programming-debug.md`

## 七、经验沉淀

只沉淀已经由真实日志、报告或硬件验证、可跨工程复用的结论：

- 决策、禁止事项和验收门槛写入 `SKILL.md`。
- 版本差异、命令和排障写入 reference。
- 重复操作优先固化为参数化 Tcl/PowerShell。
- 板卡私有 device/package/pin/clock/IP 留在工程内。
- 只留最小可审阅 diff；除非用户明确要求，不 commit、不 push。

## 八、最终报告

```text
PROJECT/TOP: 实际工程与 top
DEVICE: device/package/speed
SYNTHESIS: PASS | FAIL | NOT RUN
PLACE/ROUTE: PASS | FAIL | NOT RUN
CLOCKS: input/generated clocks
TIMING: setup WNS/TNS、hold WNS、failing endpoints
RESOURCES: 关键资源 / hard IP
DRC/WARNINGS: 分类后的问题
BITGEN: PASS | FAIL | NOT RUN，以及新生成路径
PROGRAM: PASS | FAIL | NOT RUN
RUNTIME EVIDENCE: 实际观察结果 | NOT RUN
VALIDATION: PASS | FAIL | INCONCLUSIVE
```

失败时只报告第一个可执行故障点和造成停止的证据。
