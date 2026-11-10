import AppKit

/// 向访达询问桌面上每个图标的位置。
///
/// 结果是一段原样转给场景页的文本：`x,y;x,y;…|`（各图标的 desktop position，全局坐标）。
/// 坐标怎么换算、怎么对账都在场景页的 wall.js 里，这里只负责「问」，并且尽量少问：
///   · 在桌面上按下或松开鼠标之后马上问（拖动文件后几乎立刻有反应；
///     在别的窗口里的点击与桌面无关，不问——否则正常用电脑时访达会被问个不停）；
///   · 「桌面」文件夹的修改时间一变就问（别的程序往桌面存文件、键盘删除文件等）——
///     每秒只看一眼那个时间戳，不读文件夹的内容，所以不需要「桌面」文件夹的访问授权；
///   · 发现变化后的几秒内问得勤一点（0.5 秒一次）；
///   · 其余时间每 20 秒兜底问一次（右键菜单整理、桌面上出现的磁盘等；看不到时间戳时改为每 4 秒）。
///
/// 默认直接给访达发一个 Apple 事件（在后台队列上，不卡主线程，也不经过 AppleScript 解释器——
/// 后者每问一次要花几十毫秒的 CPU）。如果访达没按预期回答，自动退回 AppleScript。
final class IconWatcher {
    enum Reading {
        case positions(String)
        case waiting           // 还在等用户回答授权窗口
        case denied            // 用户没有允许「控制访达」
        case failed(String)
    }

    var onReading: ((Reading) -> Void)?

    private enum Outcome {
        case ok(String)
        case error(Int, String)   // 明确的 Apple 事件错误（未授权、超时、访达没运行…）
        case unusable(String)     // 直接发送这条路走不通
    }

    private let demo: Bool
    private let overrideURL: URL
    private let queue = DispatchQueue(label: "dev.deskworld.finder", qos: .utility)
    private var script: NSAppleScript?
    private var useScript = false
    private var timer: Timer?
    private var mouseMonitor: Any?
    private var inFlight = false
    private var started = false
    private var everAnswered = false
    private var lastText: String?
    private var lastProblem = ""
    private var fastUntil = Date.distantPast
    private var pressedOnDesktop = false
    private var pollCount = 0
    private var statTimer: Timer?

    private var idleInterval: TimeInterval = 4
    private let fastInterval: TimeInterval = 0.5
    private let desktopPath = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Desktop").path
    private var desktopStamp: Double?
    private var stampTimer: Timer?

    /// AppleScript 版本的查询（备用）。可以用「应用程序支持/DeskWorld/query.applescript」覆盖；
    /// 那个文件存在时一律走 AppleScript。
    static let builtinSource = """
    with timeout of 4 seconds
        tell application "Finder" to set ps to desktop position of every item of desktop
    end timeout
    set out to ""
    if (count of ps) > 0 then
        if class of (item 1 of ps) is not list then set ps to {ps}
        repeat with p in ps
            set out to out & (item 1 of p) & "," & (item 2 of p) & ";"
        end repeat
    end if
    return out & "|"
    """

    init(demo: Bool, overrideURL: URL) {
        self.demo = demo
        self.overrideURL = overrideURL
    }

    func start() {
        guard !started else { return }
        started = true
        if demo {
            onReading?(.positions(Self.demoReading()))
            return
        }
        if let custom = try? String(contentsOf: overrideURL, encoding: .utf8), !custom.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Log.write("使用自定义的访达查询脚本：\(overrideURL.path)")
            useScript = true
            prepareScript(custom)
        }
        Log.write("开始向访达询问图标位置（第一次系统会弹出授权窗口）…")
        if let stamp = desktopModified() {
            desktopStamp = stamp
            idleInterval = 20
            let t = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.checkDesktopStamp() }
            t.tolerance = 0.3
            stampTimer = t
            Log.write("能看到「桌面」文件夹的修改时间：文件增删时立刻询问，其余每 20 秒兜底")
        } else {
            Log.write("看不到「桌面」文件夹的修改时间（\(String(cString: strerror(errno)))）：改为每 4 秒兜底询问")
        }
        mouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .leftMouseUp]) { [weak self] event in
            guard let self else { return }
            let onDesktop = Self.pointerIsOverDesktop()
            if event.type == .leftMouseDown {
                self.pressedOnDesktop = onDesktop
                return
            }
            // 从桌面拖走，或者拖到桌面上放下，都可能改变图标
            let relevant = onDesktop || self.pressedOnDesktop
            self.pressedOnDesktop = false
            guard relevant else { return }
            for delay in [0.15, 0.6] {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.poll() }
            }
        }
        // 询问次数记进日志：启动一分钟后记一次，之后每 10 分钟一次
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) { [weak self] in
            guard let self else { return }
            Log.write("启动后第一分钟向访达询问了 \(self.pollCount) 次")
            self.pollCount = 0
            self.statTimer = Timer.scheduledTimer(withTimeInterval: 600, repeats: true) { [weak self] _ in
                guard let self else { return }
                Log.write("过去 10 分钟向访达询问了 \(self.pollCount) 次")
                self.pollCount = 0
            }
        }
        poll()
    }

    /// 指针下面是不是桌面（访达的桌面图标层、壁纸，或者干脆没有窗口）。
    private static func pointerIsOverDesktop() -> Bool {
        let number = NSWindow.windowNumber(at: NSEvent.mouseLocation, belowWindowWithWindowNumber: 0)
        guard number > 0,
              let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], CGWindowID(number)) as? [[String: Any]],
              let window = list.first else { return true }
        return (window[kCGWindowLayer as String] as? Int ?? 0) < 0
    }

    // MARK: 「桌面」文件夹的修改时间（只取时间戳，不读内容）

    private func desktopModified() -> Double? {
        var info = stat()
        guard stat(desktopPath, &info) == 0 else { return nil }
        return Double(info.st_mtimespec.tv_sec) + Double(info.st_mtimespec.tv_nsec) / 1e9
    }

    private func checkDesktopStamp() {
        guard let stamp = desktopModified(), stamp != desktopStamp else { return }
        desktopStamp = stamp
        fastUntil = max(fastUntil, Date().addingTimeInterval(2))
        poll()
    }

    // MARK: 调度

    private func schedule(after seconds: TimeInterval) {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in self?.poll() }
    }

    func poll() {
        guard started, !demo, !inFlight else { return }
        inFlight = true
        pollCount += 1
        if useScript {
            finish(askWithScript())
        } else {
            queue.async { [weak self] in
                let outcome = Self.askDirectly()
                DispatchQueue.main.async { self?.finish(outcome) }
            }
        }
    }

    private func finish(_ outcome: Outcome) {
        inFlight = false
        var next = idleInterval
        switch outcome {
        case .ok(let text):
            if !everAnswered {
                everAnswered = true
                Log.write("访达开始回答了（\(useScript ? "经 AppleScript" : "直接发送 Apple 事件")）")
            }
            lastProblem = ""
            if text != lastText {
                lastText = text
                fastUntil = max(fastUntil, Date().addingTimeInterval(3))
            }
            if Date() < fastUntil { next = fastInterval }
            onReading?(.positions(text))
        case .error(let number, let message):
            note("\(number) \(message)")
            if number == -1743 {
                onReading?(.denied)
                next = 5
            } else if number == -1712 && !everAnswered {
                onReading?(.waiting)      // 多半是授权窗口还开着
                next = 1.5
            } else {
                onReading?(.failed(message))
                next = 5
            }
        case .unusable(let why):
            Log.write("直接发送 Apple 事件这条路走不通（\(why)），改用 AppleScript")
            useScript = true
            prepareScript(Self.builtinSource)
            next = 0.2
        }
        schedule(after: next)
    }

    private func note(_ problem: String) {
        guard problem != lastProblem else { return }
        lastProblem = problem
        Log.write("访达没有给出图标位置：\(problem)")
    }

    // MARK: 直接发送 Apple 事件：get desktop position of every item of desktop

    private static func fcc(_ s: String) -> FourCharCode {
        var r: FourCharCode = 0
        for u in s.utf8 { r = (r << 8) | FourCharCode(u) }
        return r
    }

    private static func makeEvent() -> NSAppleEventDescriptor? {
        // 对象说明符：{想要的类型, 取法, 取什么, 从哪里取}
        func specifier(_ want: String, _ form: String, _ data: NSAppleEventDescriptor, _ from: NSAppleEventDescriptor) -> NSAppleEventDescriptor? {
            let record = NSAppleEventDescriptor.record()
            record.setDescriptor(NSAppleEventDescriptor(typeCode: fcc(want)), forKeyword: fcc("want"))
            record.setDescriptor(NSAppleEventDescriptor(enumCode: fcc(form)), forKeyword: fcc("form"))
            record.setDescriptor(data, forKeyword: fcc("seld"))
            record.setDescriptor(from, forKeyword: fcc("from"))
            return record.coerce(toDescriptorType: fcc("obj "))
        }
        var all = fcc("all ")
        guard let every = NSAppleEventDescriptor(descriptorType: fcc("abso"), bytes: &all, length: MemoryLayout<FourCharCode>.size),
              let desktop = specifier("prop", "prop", NSAppleEventDescriptor(typeCode: fcc("desk")), NSAppleEventDescriptor.null()),
              let items = specifier("cobj", "indx", every, desktop),
              let positions = specifier("prop", "prop", NSAppleEventDescriptor(typeCode: fcc("dpos")), items) else { return nil }
        let event = NSAppleEventDescriptor(
            eventClass: fcc("core"), eventID: fcc("getd"),
            targetDescriptor: NSAppleEventDescriptor(bundleIdentifier: "com.apple.finder"),
            returnID: AEReturnID(-1), transactionID: AETransactionID(0))
        event.setParam(positions, forKeyword: fcc("----"))
        return event
    }

    private static func askDirectly() -> Outcome {
        guard let event = makeEvent() else { return .unusable("事件构造失败") }
        do {
            let reply = try event.sendEvent(options: [.waitForReply], timeout: 4)
            if let code = reply.paramDescriptor(forKeyword: fcc("errn"))?.int32Value, code != 0 {
                let message = reply.paramDescriptor(forKeyword: fcc("errs"))?.stringValue ?? ""
                if code == -1728 { return .ok("|") }                       // 桌面上一个项目都没有
                if code == -1743 || code == -1712 { return .error(Int(code), message) }
                return .unusable("访达返回错误 \(code) \(message)")
            }
            guard let result = reply.paramDescriptor(forKeyword: fcc("----")) else { return .unusable("回答里没有结果") }
            guard let points = points(from: result) else { return .unusable("看不懂的结果（类型 \(typeName(result.descriptorType))）") }
            return .ok(points.map { "\($0.0),\($0.1);" }.joined() + "|")
        } catch {
            let e = error as NSError
            if [-1743, -1712, -600, -609, -10810].contains(e.code) { return .error(e.code, e.localizedDescription) }
            return .unusable("发送失败 \(e.code) \(e.localizedDescription)")
        }
    }

    private static func typeName(_ code: DescType) -> String {
        let bytes = [UInt8((code >> 24) & 0xff), UInt8((code >> 16) & 0xff), UInt8((code >> 8) & 0xff), UInt8(code & 0xff)]
        return String(bytes: bytes, encoding: .macOSRoman) ?? "\(code)"
    }

    private static func isNumber(_ d: NSAppleEventDescriptor?) -> Bool {
        guard let d else { return false }
        return ["long", "shor", "comp", "doub", "sing", "magn"].contains { fcc($0) == d.descriptorType }
    }

    /// 一个点：访达可能给 {x, y} 列表，也可能给 QuickDraw 的点（先纵后横，各 16 位）。
    private static func point(_ d: NSAppleEventDescriptor) -> (Int, Int)? {
        if d.descriptorType == fcc("QDpt") {
            let data = d.data
            guard data.count >= 4 else { return nil }
            let v = data.withUnsafeBytes { $0.loadUnaligned(as: Int16.self) }
            let h = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 2, as: Int16.self) }
            return (Int(h), Int(v))
        }
        guard d.descriptorType == fcc("list"), d.numberOfItems == 2,
              let a = d.atIndex(1), let b = d.atIndex(2), isNumber(a), isNumber(b) else { return nil }
        return (Int(a.int32Value), Int(b.int32Value))
    }

    /// 结果可能是：一串点、单独一个点（桌面上只有一个项目时）、空列表。
    private static func points(from d: NSAppleEventDescriptor) -> [(Int, Int)]? {
        if let single = point(d) { return [single] }
        guard d.descriptorType == fcc("list") else { return nil }
        var out: [(Int, Int)] = []
        let n = d.numberOfItems
        if n == 0 { return out }
        for i in 1...n {
            guard let item = d.atIndex(i), let p = point(item) else { return nil }
            out.append(p)
        }
        return out
    }

    // MARK: 备用：AppleScript（只能在主线程上用）

    private func prepareScript(_ source: String) {
        script = NSAppleScript(source: source)
        var error: NSDictionary?
        if script?.compileAndReturnError(&error) != true {
            Log.write("访达查询脚本编译失败：\(error ?? [:])")
        }
    }

    private func askWithScript() -> Outcome {
        guard let script else { return .error(0, "没有可用的查询脚本") }
        var error: NSDictionary?
        let result = script.executeAndReturnError(&error)
        if let error {
            let number = (error[NSAppleScript.errorNumber] as? Int) ?? 0
            let message = (error[NSAppleScript.errorMessage] as? String) ?? "\(error)"
            return .error(number, message)
        }
        guard let text = result.stringValue else { return .error(0, "回答不是文本") }
        return .ok(text)
    }

    // MARK: 演示数据

    /// 主屏右侧两列，加几处散落的文件。
    private static func demoReading() -> String {
        let f = NSScreen.screens.first?.frame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let w = f.width, h = f.height
        let pts: [(CGFloat, CGFloat)] = [
            (w - 70, 110), (w - 70, 222), (w - 70, 334), (w - 70, 446), (w - 178, 110), (w - 178, 222),
            (w * 0.30, h * 0.34), (w * 0.30 + 108, h * 0.34 + 40), (w * 0.30 + 20, h * 0.34 + 116),
            (w * 0.52, h * 0.62), (w * 0.52 + 110, h * 0.62 + 30),
            (w * 0.20, h * 0.76), (w * 0.68, h * 0.28),
        ]
        return pts.map { "\(Int($0.0)),\(Int($0.1));" }.joined() + "|"
    }
}
