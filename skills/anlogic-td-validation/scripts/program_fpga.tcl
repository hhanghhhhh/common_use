# Legacy 安陆 AL-Link 直接 SRAM 下载辅助脚本。
#
# TD 2026.1 SP2 命令行用法：
#   td_commands_prompt.exe program_fpga.tcl <bit_file> ?cable_index? ?jtag_mhz?
#
# 本脚本仅用于已经验证过的 legacy Anlogic AL-Link 数字 -cable 直连模式。
# 不要直接套用到 AL-LINK-FT/HwServer 或远程 cable 配置。

if {$argc < 1 || $argc > 3} {
    puts "ERROR: usage: program_fpga.tcl <bit_file> ?cable_index? ?jtag_mhz?"
    exit 2
}

set bit_file [lindex $argv 0]
set cable_index 0
set jtag_mhz 5

if {$argc >= 2} {
    set cable_index [lindex $argv 1]
}
if {$argc >= 3} {
    set jtag_mhz [lindex $argv 2]
}

if {![string is integer -strict $cable_index] || $cable_index < 0} {
    puts "ERROR: cable_index must be a non-negative integer"
    exit 2
}

if {![string is integer -strict $jtag_mhz] || $jtag_mhz <= 0} {
    puts "ERROR: jtag_mhz must be a positive integer"
    exit 2
}

set bit_file [file normalize $bit_file]

if {![file exists $bit_file]} {
    puts "ERROR: bit file not found: $bit_file"
    exit 2
}

puts "PROGRAM_BIT=$bit_file"
puts "PROGRAM_CABLE=$cable_index"
puts "PROGRAM_JTAG_MHZ=$jtag_mhz"

set rc [catch {
    download \
        -bit $bit_file \
        -mode jtag_burst \
        -spd $jtag_mhz \
        -cable $cable_index
} result options]

puts "DOWNLOAD_RC=$rc"
puts "DOWNLOAD_RESULT=$result"

if {$rc != 0} {
    if {[dict exists $options -errorinfo]} {
        puts [dict get $options -errorinfo]
    }
    puts "PROGRAM_RESULT=FAIL"
    exit 1
}

puts "PROGRAM_RESULT=PASS"
exit 0
