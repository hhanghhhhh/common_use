# CCS Managed Build 与新增源文件

当任务新增、删除或移动 `.c`，或者构建日志没有出现预期源文件时，读取本文件。

## 一、文件组织

临时验证文件统一放入 `.project` 管理的 `APP/validation/`：

```text
APP/validation/
├── feature_validation.h   # 声明、extern、类型接口
├── feature_validation.c   # 定义；首先包含自己的 .h
└── verify_feature.py      # 上位机、通信或结果检查脚本
```

调用方只写：

```c
#include "validation/feature_validation.h"
```

`.py`、日志模板等不会成为 C2000 编译单元，可以和验证源码集中管理。需要验证时让对应 `.c` 参与当前配置；退出验证或生成正式配置时，同时移除/宏控调用点并按配置排除 `APP/validation`，不能只排除 `.c` 后留下未解析调用。

不得用下列写法把源文件“加入工程”：

```c
#include "feature_validation.c"
```

CCS 会把源码树中的 `.c` 当作独立编译单元。若 `Main.c` 同时包含该 `.c`，会出现以下一种或两种故障：

- 该 `.c` 缺少独立编译所需头文件，编译时报类型或声明未定义；
- `Main.obj` 与该 `.c` 对应的 `.obj` 同时定义函数/全局量，链接时报重复符号。

发现这种旧代码时，优先整理为 `.c + .h`。只有明确设计的 unity build 才允许包含 `.c`，并必须在当前 build configuration 中把被包含文件设置为 `Exclude from Build`。

## 二、谁维护 makefile

以下文件属于 CCS generated build，不得手工加入源文件或对象：

```text
Debug/makefile
Debug/sources.mk
Debug/objects.mk
Debug/subdir_vars.mk
Debug/subdir_rules.mk
```

手改可能暂时生效，但下一次 Refresh、Clean 或配置变化会被覆盖。源文件集合应由 CCS 工程资源模型和 `.cproject` 配置决定。

头文件不会成为独立编译单元；保证 include path 正确即可。工程树外的源文件优先移入已有源码树；必须外置时，通过 CCS linked resource 或工程配置正式加入，并检查路径可移植性，不要只修改 generated makefile。

CCS 还会递归发现工程资源树内的 linker `.cmd`。生成包或其他非工程资源目录若位于工程根目录内，应在 `.cproject` 中排除，避免把额外源码或 linker cmd 混入默认 `Debug`。

## 三、刷新与构建

### CCS GUI

1. 对工程执行 `Refresh`（通常为 F5），确认新增文件出现在工程树。
2. 检查 `Resource Configurations > Exclude from Build`，确认本次需要的 `.c` 未被默认 `Debug` 排除。
3. 执行一次 `Clean Project` 或目标配置的 clean build。
4. 再进行普通增量 build。

### Headless Managed Build

外部工具写入源码后，不要把 `Debug/gmake` 作为发现新文件的入口。使用 CCS 的 Managed Builder：

```powershell
eclipsec.exe -noSplash `
  -data <专用工作区> `
  -application org.eclipse.cdt.managedbuilder.core.headlessbuild `
  -import <权威工程目录> `
  -cleanBuild <工程名>/<配置名>
```

工程已存在于该工作区时，不要重复导入；在资源已刷新的前提下执行：

```powershell
eclipsec.exe -noSplash `
  -data <专用工作区> `
  -application org.eclipse.cdt.managedbuilder.core.headlessbuild `
  -cleanBuild <工程名>/<配置名>
```

自动化优先使用独立 CCS workspace，但源码和工程配置仍使用权威工程目录。不要复制带旧 `Debug` 目录的整个工程来规避刷新或写权限。

## 四、加入成功的证据

新增 `APP/validation/feature_validation.c` 后，必须同时看到：

```text
Building file: ../APP/validation/feature_validation.c
...
./feature_validation.obj
```

并检查：

- 每个新增 `.c` 只编译一次；
- 最终链接命令包含对应 `.obj`；
- 最终链接命令只包含默认 `Debug` 预期的源码、对象和 linker cmd；
- `.obj` 和 `.out` 时间戳属于本次构建；
- 没有 duplicate symbol、unresolved symbol 或源文件独立编译错误。

如果构建成功但日志没有新增文件，不得继续拿旧 `.out` 下板。先依次检查：工程是否刷新、文件是否位于工程资源树、当前配置是否排除、`.cproject` 是否记录了正确配置。
