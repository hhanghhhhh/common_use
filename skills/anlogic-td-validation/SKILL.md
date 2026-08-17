---
name: anlogic-td-validation
description: 使用安陆 TD 对 FPGA 工程进行综合、布局布线、时序/SDC/PLL 时钟检查、资源与 DRC 报告、bitstream 生成，以及可选的 JTAG SRAM 下载和 ChipWatcher 下板观察。适用于安陆 FPGA/TD 工程综合实现、时序收敛、WNS/TNS、PLL 生成时钟约束、资源检查、bitgen、AL-Link 下载和硬件验证。如果只是 RTL 功能仿真，不需要实现或硬件验证，则不要使用本 Skill。
---

# 安陆 TD 综合实现、时序与下板验证

本 Skill 用来回答 RTL 仿真本身无法回答的问题：

- 当前 RTL 用真实 TD 工程和目标器件能否正常 elaborate / synthesis？
- 能否完成 place & route？
- 输入时钟和 PLL/时钟缓冲产生的时钟是否都被正确约束？
- setup / hold 时序是否通过？
- 最终使用了多少资源、哪些 hard IP？
- 是否还有 DRC / warning？
- 能否生成本次构建的新 bitstream？
- 用户要求时，能否将 bitstream 下载到 FPGA SRAM，并在真实硬件上观察结果？

**实现通过不能代替 RTL 功能验证。** 如果问题首先可以通过仿真判断逻辑行为，应先走仿真；只有涉及综合实现、时序、约束或真实硬件时才使用本 Skill。

## 一、开始前必须确认的输入

从当前工程中确认：

- 权威 RTL 源码目录
- 已有 `.al` 工程
- 实际 top module
- target device / device database
- package / speed grade
- 当前 ADC / pin 约束
- 当前 SDC / timing 约束
- PLL 等生成 IP 的 `.ipc` 和 HDL wrapper
- synthesis / physical run 目录
- 最终 physical database
- 本次 bitstream 输出路径
- 本次验证目标和 PASS 判据
- 只有用户要求下板时，才确认 cable / debug 配置

不要沿用另一个工程的 top、器件、package、pin、时钟频率、PLL 参数或 bitstream 路径。

## 二、先选择任务范围

### 1. 综合实现验证

用户询问以下问题时使用完整 implementation 流程：

- 能否综合
- 能否布局布线
- 时序是否通过
- 约束是否完整
- 资源占用如何
- 能否生成 bitstream

读取：

`references/implementation.md`

### 2. 时钟 / 时序专项检查

仍使用 implementation 流程，但证据重点放在：

- primary input clocks
- PLL / clock-buffer generated clocks
- `derive_clocks` 或当前 TD 版本等效机制
- 实际报告中的生成时钟频率和周期
- setup WNS / TNS / failing endpoints
- hold WNS / failing endpoints
- unconstrained paths / endpoints
- `check_timing` 结果

**如果真实工作的 generated clock domain 没有被约束，即使 WNS 为正，也不能报告 timing PASS。**

### 3. SRAM 下载 / ChipWatcher 下板验证

只有在已经确认 bitstream 对应本次正确源码、约束和 debug 配置后，才读取：

`references/programming-debug.md`

Legacy AL-Link 直接 SRAM 下载时，可以以：

`scripts/program_fpga.tcl`

作为起点，但必须先确认实际 cable 类型匹配。

**禁止把 compile-only 的临时 pin 约束直接用于真实板卡下载，除非用户明确确认这些 pin 对当前硬件安全。**

## 三、必须遵守的实现流程

### Step 1：先确认工程真实配置

检查：

- `.al` 工程
- source / include list
- device / package / speed
- ADC
- SDC
- 生成 IP 配置

如果工程中存在一份用于 validation 的 RTL copy，先与权威源码比较。

除非用户明确要求验证 copy，否则以权威源码为准。

### Step 2：保证待验证逻辑不会被合理优化掉

如果需要制作小型 validation top，应把待测状态/输出连接到可观察位置，避免 synthesis 合理地删除逻辑。

不要为了让资源数“看起来存在”而随意加入 `keep`。

只有以下情况才使用 `keep`：

- 当前问题本身就是研究优化行为
- 调试方法确实要求保留信号

### Step 3：为了 P&R 可临时配 pin，但必须明确是 compile-only

place / route / bitgen 需要合法 pin 与 I/O standard 时，可以为“纯编译验证”分配临时合法 pin。

但必须明确标记：

```text
compile-only constraints
```

绝不能把任意临时 pin 当成真实板卡接线结果。

### Step 4：约束所有真正使用的时钟

所有 primary input clock 都必须建立约束。

PLL 或 clock-buffer 产生时钟时，使用 TD 当前版本支持的 generated-clock 推导流程，例如：

```tcl
create_clock -name clk_in -period <PERIOD_NS> [get_ports {clk_in}]
derive_clocks
```

最终必须从 clock / timing report 中看到实际生成时钟的预期频率与周期。

### Step 5：执行真实实现流程

根据任务执行需要的完整阶段：

```text
analyze / elaborate
→ synthesis
→ physical optimization / place
→ route
→ bitgen
→ 导入最终 physical database
→ final timing / check / area / DRC / clock / route report
```

已有可靠的工程脚本时优先使用现有脚本。

如果 TD 自动生成的 run wrapper 有问题，而内部 Tcl 本身有效，优先直接使用真实 `td_commands_prompt.exe` 执行生成 Tcl，不要无理由重造一套 implementation flow。

### Step 6：不能只看进程退出码

已验证的 TD 版本存在：

```text
内部 Tcl/tool 已报错
但外层 process exit code = 0
```

因此必须检查本次最新 log，至少搜索：

```text
ERROR
CRITICAL-WARNING
WARNING
```

同时检查输出文件时间戳，防止把上一次旧 `.bit` / report 当成本次成功结果。

### Step 7：收集最终 physical evidence

至少收集与检查：

- timing summary
- timing check / unconstrained path
- area / resource
- DRC
- clock summary
- route status
- 涉及异步同步器时的 MTBF

有些 TD report 在“无内容可报告”时可能不生成空文件。

因此不能单纯根据“文件不存在”判断工具失败，要结合 console / log 一起判断。

### Step 8：只有用户要求且确认安全时才下板

SRAM programming 前必须确认：

- 实际 cable / driver mode
- bitstream 来自当前正确 implementation/debug build
- 文件时间戳属于本次构建
- 真实板卡 pin 约束安全
- 如果 sandbox 看不到 USB/JTAG，只为当前 TD 命令申请最小必要的硬件访问权限

“下载成功”只说明 FPGA 配置成功，不代表应用逻辑正确。

应用正确性必须由运行时可观察证据证明。

## 四、不可违反的规则

- 不得沿用 reference run 的 device / package / pin / clock / IP 假设。
- 存在正在使用但未约束的 clock domain 时，不得报告 timing PASS。
- 不得只凭 TD process exit code `0` 报告成功。
- bitgen 成功不能当成功能正确证据。
- ChipWatcher `.bit` 与 `.cwc` 必须来自同一次 debug build。
- warning 必须分类为 blocking、相关但 non-blocking、或无关噪声，不能静默忽略。
- 临时 compile-only pin 不得描述成真实板卡有效约束。

## 五、Implementation PASS 验收条件

只有当前任务适用的条件全部满足，才能报告 implementation PASS：

- 使用预期 top 和完整权威 source list
- 预期 hard IP 出现在 elaboration/resource 证据中
- synthesis 无阻塞错误
- place & route 完成
- 不存在 open / unrouted nets
- 不存在 blocking DRC error
- 每个实际使用的 input/generated clock 都被约束
- final clock/timing report 中存在预期 generated clock 及其频率
- setup WNS >= 0
- setup TNS = 0
- setup failing endpoints = 0
- hold WNS >= 0
- hold failing endpoints = 0
- 资源数量合理，关键逻辑没有被意外优化掉
- 用户要求 bitgen 时 bitgen 成功
- `.bit` 时间戳晚于本次 build 开始时间
- ERROR / CRITICAL-WARNING / WARNING 均已检查和分类

## 六、硬件验证额外验收条件

如果用户还要求下板，则额外要求：

- 选择了正确的 bitstream / debug metadata 组合
- 找到了预期 cable / target
- download Tcl 正常完成且无 programming error
- 通过有效观察路径看到了预期 target behavior

## 七、Reference 按需加载规则

只加载当前任务需要的资料：

- TD 安装、run 坑点、PLL/SDC、report、timing、实现验收 → `references/implementation.md`
- AL-Link / AL-LINK-FT、SRAM programming、ChipWatcher、运行时观察 → `references/programming-debug.md`

## 八、Skill 自我维护与经验沉淀

执行本 Skill 时，如果发现新的、具有复用价值的工程经验，可以在**已经获得实际验证证据后**更新本 Skill，使后续 Agent 直接复用。

适合沉淀的内容包括：

- 新发现且可稳定复现的 TD / IP / implementation / programming 工具行为
- 新的通用故障模式及已经验证有效的处理方法
- 能明显提高实现、时序检查或下板验证可靠性的执行顺序
- 新的严格 PASS / FAIL 判据
- 已经重复使用、适合固定下来的确定性 Tcl / PowerShell / programming 脚本

### 写入前必须满足

- 结论已经由本次真实 TD 日志、report、bitstream、硬件行为或可重复实验验证；只有猜测、一次偶发现象或尚未证实的推断时，不得写入 Skill。
- 能明确区分“通用经验”和“当前工程特例”。工程私有 device/package/pin/clock/IP 参数、路径和 top 名称不能被错误泛化。
- 新规则不会与已有已验证规则冲突；如果发生冲突，先保留证据并记录版本/条件差异，不要静默覆盖旧结论。

### 内容应放在哪里

- 会影响 Agent 决策、执行顺序、禁止事项或验收标准的通用规则 → 更新 `SKILL.md`。
- 详细 TD 版本差异、PLL/SDC、report、programming、ChipWatcher 与排障知识 → 更新对应 `references/*.md`。
- 已稳定验证、输入输出明确、每次重复执行的确定性操作 → 优先更新或新增 `scripts/`。
- 只属于某一块板、某一颗 FPGA 或某一个工程的 pin/device/top/IP 参数 → 留在该工程自己的文档/约束中，不写入通用 Skill。

### 修改方式

1. 先确认实际被 Codex 使用的 Skill 源目录，不要猜测复制目录、junction 或 Git 工作区之间的同步关系。
2. 如果当前 Skill 直接位于或指向 Git 工作区中的源目录，可以直接修改该源文件。
3. 如果当前 Skill 只是从 Git 仓库复制出来的独立副本，可以修改本地副本，但必须明确报告“本地 Skill 已变化、Git 源仓库尚未同步”。
4. 只做与本次新经验相关的最小修改，不顺手重写无关章节。
5. 除非新经验改变了 Skill 的触发边界，否则不要随意修改 YAML 中的 `name` / `description`。
6. 修改后说明：新增了什么、为什么新增、依据什么证据、写到了哪个文件。
7. 如果 Skill 由 Git 管理，默认只留下可审阅的工作区 diff；**不要自动 commit 或 push，除非用户明确要求。**

目标是让 Skill 随实际工程使用逐步变得更可靠，而不是把每次会话的临时状态全部累积进去。

## 九、最终输出格式

最终给出简洁的证据报告：

```text
PROJECT/TOP: 实际工程与 top
DEVICE: device/package/speed
SYNTHESIS: PASS | FAIL | NOT RUN
PLACE/ROUTE: PASS | FAIL | NOT RUN
CLOCKS: 已约束时钟域及 generated clock 频率
TIMING: setup WNS/TNS、hold WNS、failing endpoints
RESOURCES: 关键资源数量 / 预期 hard IP
DRC/WARNINGS: 分类后的剩余问题
BITGEN: PASS | FAIL | NOT RUN，以及本次新生成路径
PROGRAM: PASS | FAIL | NOT RUN
RUNTIME EVIDENCE: 实际观察到的信号/状态/结果 | NOT RUN
VALIDATION: PASS | FAIL | INCONCLUSIVE
```

验证失败时，指出**第一个可执行的失败点和造成停止的证据**，不要只给一大段 TD 日志。