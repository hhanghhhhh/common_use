# 分层故障定位

## DSS 无法读取 DSP 变量

问题仍在 DSP 工具/符号层：确认 `.out`、map、全局 `volatile`、XDS 占用、symbols 和当前 PC/运行状态。

## DSP 心跳不增长

检查 DSP 装载、入口、watchdog、异常/断点和 startup；不要继续解释 FPGA 镜像。

## DSP 正常但 identity 错误

检查 FPGA bit、时钟/reset、XINTF 初始化顺序、读路径和当前 top 是否包含调试映射。

## identity 正确但回环失败

检查总线地址、32 位宽度/字寻址、读写时序、方向切换、写使能和事务计数。此时业务结果无效。

## 回环正确但命令无效

检查 `cmd_seq/done_seq`、参数写入顺序、commit、范围校验、动作白名单、写事务计数和错误码。

## FPGA 镜像不变化

分别检查：

- DSP 镜像任务是否持续执行。
- FPGA 源状态是否变化。
- CDC/snapshot 是否发布。
- DSP 变量是否被其他任务覆盖。
- DSS 是否使用匹配的符号。

联合观察 DSP read count 和 FPGA heartbeat，区分“没有读取”和“读到了不变值”。

## 偶发或高速错误

检查 XINTF 时序裕量、事务间隔、双向切换、DSP 中断/DMA/多任务竞争、CDC、原子提交和 JTAG 读取扰动。保留错误计数、首错数据和事务序号，不用无限加延时掩盖根因。

## 首次失败随后通过

保留首次证据并执行独立复位/冷启动复测。bridge 自检持续通过且 FPGA 业务错误码有效时，把问题定位到业务逻辑或外部器件，而不是通信桥。

## 结论格式

```text
FIRST_FAILED_LAYER: DSP | BRIDGE | FPGA_BUSINESS | EXTERNAL_DEVICE | NETWORK
EVIDENCE: 原始变量、计数、首错、工具日志
REPRODUCIBILITY: 稳定 | 冷启动 | 偶发 | 未确认
NEXT_ACTION: 最小且能区分假设的诊断动作
```
