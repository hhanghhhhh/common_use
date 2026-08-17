# XINTF/EMIF 调试桥设计

## 只读状态映射

优先暴露稳定、可判断的信息：状态机、done、sticky error、首错码、事务计数、最新结果、心跳和当前配置版本。单周期 pulse 先锁存或计数。

```verilog
case (bus_addr)
  ADDR_IDENTITY:    bus_read_data <= DESIGN_ID;
  ADDR_MAP_VERSION: bus_read_data <= MAP_VERSION;
  ADDR_STATUS:      bus_read_data <= status_snapshot;
  ADDR_ERROR:       bus_read_data <= first_error;
  ADDR_COUNT:       bus_read_data <= transaction_count;
  default:          bus_read_data <= 32'd0;
endcase
```

DSP 使用全局 `volatile` 镜像，并确认符号进入当前 `.out/.map`：

```c
volatile Uint32 dbg_fpga_identity;
volatile Uint32 dbg_fpga_status;
volatile Uint32 dbg_fpga_error;

void FpgaDebugReadTask(void)
{
    dbg_fpga_identity = DataR(ADDR_IDENTITY);
    dbg_fpga_status   = DataR(ADDR_STATUS);
    dbg_fpga_error    = DataR(ADDR_ERROR);
}
```

## 地址窗口

至少分离：

- 业务窗口：保持现有协议含义。
- 调试数据窗口：只读状态、错误、计数和结果。
- 链路自检窗口：identity、map version、回环和写事务计数。
- 受控命令窗口：参数暂存、commit、done 和 error。

DSP 在解释任何调试数据前先检查 identity/map version。

## CDC 和一致快照

- 单 bit：同步器。
- 多 bit 状态/计数：握手快照、Gray 或异步 FIFO。
- 多字段结果：源域锁存整组数据后发布完成序号。
- 高频采样：RAM/FIFO 或 ChipWatcher，不逐点映射寄存器。

DSP 发布多变量时可用奇偶序号：更新前加一变奇数，全部写完后再加一变偶数。DSS 只有在前后序号相同且为偶数时接受快照。

## 命令邮箱

不要要求 DSS 直接执行 C 函数。使用参数 + 序号协议：

```c
volatile Uint32 dbg_cmd_seq;
volatile Uint32 dbg_cmd_addr;
volatile Uint32 dbg_cmd_data;
volatile Uint32 dbg_done_seq;
volatile Uint32 dbg_cmd_result;
```

AI 先写参数，最后更新 `cmd_seq`。DSP 只处理新序号，执行安全的 `DataW`/读回，再更新 `done_seq` 和结果。

FPGA 侧把参数暂存与动作分离：

```text
写候选参数 → 写 commit 序号 → 范围/权限校验 → 原子采用 → 更新 applied/done 序号和错误码
```

## 安全边界

拒绝非法地址/命令，限制参数范围，设置有界 timeout 和恢复状态。危险动作独立使能；持久化写入和电源相关控制不得只依赖调试变量授权。
