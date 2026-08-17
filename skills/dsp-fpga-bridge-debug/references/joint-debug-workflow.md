# DSP–FPGA 联合调试流程

## 构建前

1. 确认两侧源码版本和寄存器表一致。
2. 搜索现有总线访问，避免地址冲突和后台任务竞争。
3. 定义分层判据：DSP、bridge、FPGA 业务、数据、系统。
4. 确认 FPGA 侧 CDC/snapshot 和 DSP 侧 `volatile` 符号。

## 构建

推荐先编译 DSP，确认接口、调试变量和 map；再完整实现 FPGA，确认 source/top、generated clock、setup/hold、DRC、资源和 bitgen。两侧产物必须属于本轮构建。

底层操作分别使用：

- `ccs-c2000-debug`
- `anlogic-td-validation`

## 下载

```text
FPGA SRAM 下载并明确验证器件/返回值
→ DSP RAM/Flash 装载和校验
→ DSP 启动及 XINTF 初始化
→ DSP 调试任务开始镜像/处理命令
```

除非专门验证异常启动，避免让 DSP 在 FPGA 未配置时先访问桥。

## 分层验收

```text
DSP 心跳增长
→ FPGA identity/map version 正确
→ 固定标识、32 位回环、写事务计数正确
→ 业务 done
→ pass/error/首错索引正确
→ 数据数量、有效位和更新计数正确
→ 系统保持运行
```

使用有界轮询等待 done，不用单个固定短延时。输出每层失败阶段和原始变量；不能只看 TD/DSS 外层进程退出码。

## 迭代

- 只修改受影响的一侧，但重新确认接口版本。
- FPGA 改动后重新完整实现并先下载 FPGA。
- DSP 改动后重建并加载匹配符号的 `.out`。
- 未知问题优先常驻 DSS；成功条件稳定后再固化一次性回归。

## 重复性

首次失败、随后通过时：

1. 保留第一次错误、首错、bridge 自检和业务状态。
2. 不改代码，按相同顺序重新下载或复位。
3. 至少完成两次独立启动；需要时加入断电冷启动。
4. bridge 始终通过而业务失败时，不把问题归到 XINTF。
5. 样本不足时报告 INCONCLUSIVE，不宣称根治。

外部器件启动优先“最小稳定时间 + 无副作用探测 + 有界重试 + 首错锁存”，不要无限延时或无限重试。

## ChipWatcher 边界

DSP bridge 适合状态、错误、计数、结果、参数和长期回归。亚周期波形、窄脉冲历史、CDC、毛刺和握手时序仍使用 ChipWatcher，并确保 `.bit/.cwc` 匹配。
