import Foundation

/// 日志写到 ~/Library/Logs/DeskWorld.log（同时输出到标准错误）。
enum Log {
    static let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/DeskWorld.log")

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MM-dd HH:mm:ss.SSS"
        return f
    }()

    private static let handle: FileHandle? = {
        let fm = FileManager.default
        if let size = (try? fm.attributesOfItem(atPath: url.path))?[.size] as? NSNumber, size.intValue > 400_000 {
            try? fm.removeItem(at: url)   // 日志太大就从头开始
        }
        if !fm.fileExists(atPath: url.path) { fm.createFile(atPath: url.path, contents: nil) }
        let h = try? FileHandle(forWritingTo: url)
        h?.seekToEndOfFile()
        return h
    }()

    static func write(_ text: String) {
        let line = "\(formatter.string(from: Date())) \(text)\n"
        guard let data = line.data(using: .utf8) else { return }
        handle?.write(data)
        FileHandle.standardError.write(data)
    }
}

/// 启动参数。平时不需要任何参数；下面这些只用于调试。
///   --demo                 不问访达，用一组假的图标位置
///   --offscreen            窗口保持全透明（不打扰真实桌面），配合 --snapshot 检查渲染
///   --snapshot <路径>      启动若干秒后把主屏的壁纸存成图片
///   --snapshot-delay <秒>  默认 6
///   --quit-after <秒>      到时间自动退出
///   --web-root <目录>      从指定目录加载场景文件
struct Options {
    var demo = false
    var offscreen = false
    var snapshotPath: String?
    var snapshotDelay = 6.0
    var quitAfter: Double?
    let supportDir: URL
    var webRoot: URL

    static func parse() -> Options {
        let fm = FileManager.default
        let support = fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/DeskWorld")
        // 场景文件：优先用「应用程序支持」目录里的那份（改场景时不用重建程序），否则用程序包里自带的
        let live = support.appendingPathComponent("web")
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("web")
        var root = live
        if !fm.fileExists(atPath: live.appendingPathComponent("wallpaper.html").path), let b = bundled { root = b }
        var o = Options(supportDir: support, webRoot: root)

        var args = Array(CommandLine.arguments.dropFirst())
        while !args.isEmpty {
            let a = args.removeFirst()
            func value() -> String? { args.isEmpty ? nil : args.removeFirst() }
            switch a {
            case "--demo": o.demo = true
            case "--offscreen": o.offscreen = true
            case "--snapshot": o.snapshotPath = value()
            case "--snapshot-delay": if let v = value(), let d = Double(v) { o.snapshotDelay = d }
            case "--quit-after": if let v = value(), let d = Double(v) { o.quitAfter = d }
            case "--web-root": if let v = value() { o.webRoot = URL(fileURLWithPath: v, isDirectory: true) }
            default: break
            }
        }
        return o
    }
}
