# 本机已验证参考入口

这些路径只帮助定位已跑通的参考实现。使用前检查文件是否存在、是否被修改，以及当前任务是否仍采用相同工程和接口。

## FPGA

```text
工程          D:\05-work\29_gpu_test\02_code\ph1a_proj_test
组合 top      src\ph1a_i2c_dsp_xintf_top.v
XINTF 模块    src\dsp_xintf_ctrl.v
参考 bit      ph1a_i2c_dsp_xintf_test.bit
下载 Tcl      D:\05-work\29_gpu_test\codex_proj\program_fpga_xintf_test.tcl
```

## DSP

```text
工程          D:\05-work\29_gpu_test\codex_proj\dsp_proj\MCU_2833x_Metre
构建目录      Debug
目标配置      XDS100V3.ccxml
XINTF 接口    APP\Comm\drv_fpga.h
桥验证 DSS    dsp_proj\xintf_hardware_verify.js
板级验收 DSS  dsp_proj\board_config_telemetry_verify.js
```

## 网络扩展

```text
PC 只读探测   D:\05-work\29_gpu_test\codex_proj\tools\modbus_tcp_probe.py
DSP 状态读取  D:\05-work\29_gpu_test\codex_proj\dsp_proj\w5500_status_read.js
```

不要复制参考工程的地址、测试常数、目标 IP 或临时协议。每次从当前源码、map、运行变量和寄存器表重新确认。

## 关联 Skill

```text
D:\05-work\demo_code\0_git\common_use\skills\ccs-c2000-debug
D:\05-work\demo_code\0_git\common_use\skills\anlogic-td-validation
```

本 Skill 只编排两者，不替代其工具链验证规则。
