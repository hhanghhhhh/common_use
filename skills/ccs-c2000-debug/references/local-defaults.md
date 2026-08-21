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

不要自动选择 `tools\compiler` 中版本号最新的 compiler；读取当前工程的 `.cproject` 和默认 `Debug` 构建日志。

## 已验证能力

本机已在 CCS 7.2 + XDS100V3 + F28335 上验证：

- 使用 CCS Managed Builder clean build 工程默认 `Debug` 配置。
- DSS 能把默认 `.out` 烧录到 Flash、执行 Full verification、运行目标并读取变量。
- 单调计数器验证可用于证明程序和目标业务链路持续运行。
- 验证结束后可保持目标运行并断开 session。

这证明工具链路径和流程在本机可用，不提供其他工程的固定 memory map、对象清单、入口点或变量名。

## 受限环境

DSS 无法写默认 AppData 时：

```powershell
$env:TI_APPDATA_DIR = '<WRITABLE_DIR>\ti-appdata'
New-Item -ItemType Directory -Force -Path $env:TI_APPDATA_DIR | Out-Null
```

工程构建使用 CCS Managed Builder，让 CCS 刷新资源并维护 generated makefile：

```powershell
& 'D:\04-software\CCSv720\ccsv7\eclipse\eclipsec.exe' `
  -noSplash -data '<DEDICATED_WORKSPACE>' `
  -application org.eclipse.cdt.managedbuilder.core.headlessbuild `
  -cleanBuild '<PROJECT_NAME>/Debug'
```

具体工程名、compiler flags、linker、`.ccxml`、默认输出文件和验证表达式必须来自当前工程。
