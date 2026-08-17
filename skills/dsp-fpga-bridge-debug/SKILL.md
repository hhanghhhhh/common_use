---
name: dsp-fpga-bridge-debug
description: 通过 DSP 调试器和 XINTF/EMIF 等并行总线，把 FPGA 内部状态映射为 DSP 可观察变量，并以受控命令邮箱向 FPGA 下发参数或动作，完成 DSP–FPGA 联合编译、下载、分层验收和自动故障定位。适用于同时涉及 DSP 与 FPGA、需要由 XDS/DSS 间接观测或有限控制 FPGA、构建跨器件自动调试桥、联合回归或冷启动稳定性验证的任务。单独的 DSP 调试或单独的 FPGA 综合下载不要使用本 Skill。
---

# DSP–FPGA 调试桥与联合自动验证

把本 Skill 作为跨器件编排层。DSP 工具链细节交给 `ccs-c2000-debug`，FPGA 实现和下载细节交给 `anlogic-td-validation`；本 Skill 只负责桥接接口、联合顺序、分层证据和问题归因。

## 一、开始前确认

从当前两侧工程重新确认：

- DSP/FPGA 权威源码、当前分支和实际 top/入口
- DSP compiler、makefile、linker、`.ccxml`、`.out/.map`
- FPGA device/package、ADC/SDC、IP、run 和 `.bit`
- `DataR/DataW` 或等价总线访问入口、基地址和已占用地址
- 当前 FPGA 读写映射、identity、map version 和链路自检能力
- AL-Link、XDS probe、板卡供电/VREF 和实际下载模式
- 本次要观察的状态、允许控制的参数以及 PASS/FAIL/timeout

不能假设板上仍运行上次的 bit 或 DSP 程序。记录本轮两侧输出的绝对路径、时间戳和按需 hash。

## 二、调试桥架构

```text
AI / DSS
  ↕ DSP 符号、全局变量、命令邮箱
DSP 调试任务
  ↕ DataR/DataW 或等价总线事务
FPGA 独立调试窗口
  ↕ 状态、计数、错误、参数提交和结果
FPGA 业务逻辑
```

AI 不能自动扫描任意 FPGA 内部信号。要观察或控制的对象必须显式加入 FPGA 映射，并由 DSP 镜像或命令任务发布为稳定符号。

## 三、任务路由

| 任务 | 动作 | 按需读取 |
|---|---|---|
| 新增 FPGA 状态观察 | FPGA 只读映射 + DSP `volatile` 镜像 | `references/xintf-bridge-design.md` |
| 新增安全参数/动作 | 暂存参数 + commit/done 序号 + DSP 命令邮箱 | `references/xintf-bridge-design.md` |
| 联合编译、下载和回归 | 先确认接口版本，再 FPGA 先下载、DSP 后启动 | `references/joint-debug-workflow.md` |
| 判断失败属于哪一层 | 按 DSP、bridge、FPGA 业务、外部器件分层 | `references/failure-localization.md` |
| 通过 W5500/Modbus 延伸到 PC | 只发布受控状态和白名单命令 | `references/w5500-modbus-extension.md` |
| 查找本机已验证参考入口 | 只作为候选路径，重新确认当前版本 | `references/local-defaults.md` |

## 四、联合执行顺序

1. 搜索所有现有总线访问和寄存器映射，划分不冲突的业务、调试和链路自检窗口。
2. 先定义 identity、map version、状态/错误/计数、snapshot 及命令提交协议，再修改两侧代码。
3. 编译 DSP，确认调试变量和命令邮箱进入当前 map；再完整实现 FPGA，检查时钟、时序、DRC 和新 bitstream。
4. 先把正确 FPGA bit 下载到 SRAM，确认器件和 download 明确成功。
5. 再通过 DSS/XDS 装载并运行 DSP，使 XINTF 初始化后开始读取镜像或处理命令。
6. 先检查 DSP 心跳，再检查 identity/map version、读写回环、事务计数，最后判断 FPGA 业务结果。
7. 修改受影响一侧后重新编译；按依赖重新下载，直到分层验收满足或得到明确故障层。

DSP 先于 FPGA 启动可能在 FPGA 尚未配置时锁存一次失败；除非测试专门覆盖该场景，否则保持上述下载顺序。

## 五、分层 PASS 门槛

不要只输出一个总 PASS。至少分别报告：

1. DSP：程序已启动、符号匹配、心跳增长。
2. Bridge：FPGA identity/map version 正确，固定标识、32 位回环和事务计数正确。
3. FPGA 业务：done 出现，pass/error/首错索引与预期一致。
4. 数据：配置数量、结果、遥测有效位和更新计数满足判据。
5. 系统：两侧保持运行，无新增错误或异常复位。

DSS 使用有界轮询等待业务 `done`，同时打印原始状态、失败阶段和 timeout。工具外层 exit code、program-load completed 或 bit 下载成功都不能替代业务证据。

## 六、安全与一致性规则

- 单周期 FPGA 事件转换为 sticky flag 或计数器；多字段使用一致快照协议。
- 跨时钟域单 bit 用同步器，多 bit 用握手快照、Gray/FIFO 或等效安全机制；`keep` 不能解决 CDC。
- 调试地址与业务地址分离；映射变化必须增加 version，未知 version 不解释数据。
- DSS 写命令时先写参数，最后更新 `cmd_seq`；DSP/FPGA 返回 `done_seq`、实际生效值和错误码。
- 参数写入使用范围检查、动作白名单、commit、timeout 和恢复状态。
- 电源输出、保护阈值、复位、Flash/EEPROM/MTP 等危险或持久化动作需要额外板级授权，不因调试桥可写就自动允许。
- 首次失败后保留现场；不改代码完成至少两次独立复位/冷启动复测，再判断稳定性。
- 高频波形、窄脉冲、CDC 或逐周期关系仍使用 ChipWatcher；DSP bridge 适合稳定状态、参数和长期回归。

## 七、底层 Skill 协作

- DSP 编译、RAM/Flash 装载、DSS 变量和断点 → 使用 `ccs-c2000-debug`。
- FPGA 综合、generated clock、P&R、bitgen、AL-Link/ChipWatcher → 使用 `anlogic-td-validation`。

不要把两套底层工具命令复制进本 Skill；只保留跨器件依赖和联合判据。

## 八、最终报告

```text
DSP BUILD/LOAD: PASS | FAIL | NOT RUN，输出与模式
FPGA BUILD/PROGRAM: PASS | FAIL | NOT RUN，bit 与 cable
DSP EVIDENCE: 心跳、符号和运行状态
BRIDGE EVIDENCE: identity、map version、回环、事务计数
FPGA BUSINESS: done/pass/error/首错/结果
REPEATABILITY: reset/cold-start 样本
VALIDATION: PASS | FAIL | INCONCLUSIVE
WARNINGS: 分层后的剩余问题
FINAL STATE: DSP/FPGA 当前版本、running/halted、session 状态
```

失败时指出最先失败的层和下一步最有效动作，不把下游连锁失败当根因。
