# Cocotb + Icarus 快速回归

## 环境检查

Windows 上检查：

```text
where.exe iverilog
where.exe vvp
python -c "import cocotb; print(cocotb.__version__)"
python -m py_compile run_cocotb.py test_*.py
```

若当前进程尚未继承新安装工具的 PATH，只在 runner 进程中补充已确认的安装路径，不把某台机器的绝对路径写成通用默认值。

## 独立编译

纯 Verilog 可先执行：

```text
iverilog -g2005 -Wall -s <top_module> <rtl_sources...>
```

根据源码实际语言选择 `-g2005`、`-g2012` 或其他模式。编译通过只证明语法和展开，不证明测试行为。

## Python runner

- 使用 `get_runner("icarus")`。
- `hdl_toplevel` 必须与 RTL 的 `module` 名完全一致。
- 显式传入源文件、build 目录、参数和 define。
- 构建参数加入 `-Wall`。
- 将 `results.xml` 放进本次独立构建目录。
- runner 必须把构建或测试失败传播为非零退出码。

## Wrapper

wrapper 可用于：

- 添加 `` `timescale 1ns/1ps ``；
- 覆盖加速参数；
- 暴露必要内部信号；
- 建模双向、开漏或原厂模型接口。

wrapper 只应适配测试边界，不改变 DUT 的业务逻辑。

## 波形

优先生成 FST。以下方式二选一：

1. runner 使用 `waves=True`；
2. wrapper/testbench 使用 `$dumpfile` 与 `$dumpvars`。

不要同时启用，以免重复 dump、文件冲突或警告。最终报告应给出波形路径和失败对应的仿真时间。
