import AppKit

// 桌面世界：一个没有 Dock 图标的后台程序。
// 它在每块屏幕的「桌面图标之下、系统壁纸之上」铺一层窗口，里面跑场景；
// 再定时向访达询问桌面图标的位置，让场景跟着文件变化。
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
