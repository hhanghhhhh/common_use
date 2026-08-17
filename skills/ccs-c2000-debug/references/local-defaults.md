# 本机 CCS / F28335 默认配置

这些只是当前工作站已验证的候选路径。每个工程仍必须从 `.cproject`、generated makefile、linker 和 `.ccxml` 重新确认实际配置。

## CCS 7.2 工具

安装根目录：

```text
D:\04-software\CCSv720\ccsv7
```

常用路径：

```text
GUI              eclipse\ccstudio.exe
GNU Make         utils\bin\gmake.exe
C2000 compilers  tools\compiler
DSS launcher     ccs_base\scripting\bin\dss.bat
XDS100 discovery ccs_base\common\uscif\xds100serial.exe
JTAG diagnostics ccs_base\common\uscif\dbgjtag.exe
DSS examples     ccs_base\scripting\examples
DSS API docs     ccs_base\scripting\docs\DS_API
```

不要自动选择 `tools\compiler` 中版本号最新的 compiler；读取当前工程的 `Debug\makefile` 和 `.cproject`。

## 已验证能力

本机已在 CCS 7.2 + XDS100V3 + F28335 上验证：

- 使用 generated makefile 构建正常 Flash 配置。
- 保持 Flash 配置不变，复用最新 `.obj` 独立链接 RAM-only `.out`。
- 通过 map 证明 `.text/.cinit/.econst/.ebss/.stack` 位于片内 RAM，且无 Flash 可装载段。
- DSS 能下载 RAM 镜像、运行目标、读取变量和状态机一致快照。
- RAM 验证结束后可恢复目标运行并断开 session；reset/掉电后 RAM 镜像消失。

这证明工具链路径和流程在本机可用，不提供其他工程的固定 memory map、对象清单、入口点或变量名。

## 受限环境

DSS 无法写默认 AppData 时：

```powershell
$env:TI_APPDATA_DIR = '<WRITABLE_DIR>\ti-appdata'
New-Item -ItemType Directory -Force -Path $env:TI_APPDATA_DIR | Out-Null
```

工程构建通常在实际 build 目录调用：

```powershell
& 'D:\04-software\CCSv720\ccsv7\utils\bin\gmake.exe' -j4 all
```

具体 compiler flags、RAM linker、`.ccxml`、输出文件和验证表达式必须来自当前工程。
