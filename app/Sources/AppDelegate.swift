import AppKit
import ServiceManagement

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let opts = Options.parse()
    private var walls: [Wall] = []
    private var watcher: IconWatcher!
    private var statusItem: NSStatusItem?
    private let statusLine = NSMenuItem(title: "正在启动…", action: nil, keyEquivalent: "")
    private let authItem = NSMenuItem(title: "打开「自动化」授权设置…", action: nil, keyEquivalent: "")
    private let pauseItem = NSMenuItem(title: "暂停动画", action: nil, keyEquivalent: "")
    private let debugItem = NSMenuItem(title: "显示校准标记", action: nil, keyEquivalent: "")
    private let loginItem = NSMenuItem(title: "登录时启动", action: nil, keyEquivalent: "")

    private var lastRaw: String?
    private var paused = false
    private var debugOn = false
    private var webSignature = ""
    private var pendingSignature: String?
    private var tick: Timer?
    private var signalSource: DispatchSourceSignal?
    private var rebuildWork: DispatchWorkItem?
    private var screenSignature = ""

    func applicationDidFinishLaunching(_ notification: Notification) {
        let pid = ProcessInfo.processInfo.processIdentifier
        Log.write("—— 桌面世界启动 pid=\(pid) demo=\(opts.demo) offscreen=\(opts.offscreen)")
        Log.write("场景文件目录：\(opts.webRoot.path)")

        if !opts.demo, let id = Bundle.main.bundleIdentifier,
           NSRunningApplication.runningApplications(withBundleIdentifier: id).contains(where: { $0.processIdentifier != pid }) {
            Log.write("已经有一个桌面世界在运行，这个实例退出")
            NSApp.terminate(nil)
            return
        }

        if !opts.offscreen { buildMenu() }
        watcher = IconWatcher(demo: opts.demo, overrideURL: opts.supportDir.appendingPathComponent("query.applescript"))
        watcher.onReading = { [weak self] reading in self?.apply(reading) }

        rebuildWalls()
        NotificationCenter.default.addObserver(self, selector: #selector(screensChanged),
                                               name: NSApplication.didChangeScreenParametersNotification, object: nil)

        webSignature = signature()
        tick = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in self?.checkWebFiles() }
        // 正常情况下场景页一就绪就开始问访达；万一页面迟迟没就绪，4 秒后也照样开始
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in self?.watcher.start() }

        installSnapshotSignal()
        if let path = opts.snapshotPath {
            DispatchQueue.main.asyncAfter(deadline: .now() + opts.snapshotDelay) { [weak self] in
                self?.walls.first?.snapshot(to: URL(fileURLWithPath: path), markers: true, restoreMarkers: false)
            }
        }
        if let seconds = opts.quitAfter {
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { NSApp.terminate(nil) }
        }
    }

    // MARK: 壁纸窗口

    /// 各块屏幕的位置、尺寸、缩放。只有它变了才需要重建壁纸窗口。
    private func currentScreenSignature() -> String {
        NSScreen.screens.map { s in
            let f = s.frame
            return "\(Int(f.minX)),\(Int(f.minY)),\(Int(f.width)),\(Int(f.height))@\(s.backingScaleFactor)"
        }.joined(separator: ";")
    }

    private func rebuildWalls() {
        walls.forEach { $0.close() }
        walls = []
        screenSignature = currentScreenSignature()
        let top = NSScreen.screens.first?.frame.maxY ?? 0
        for (i, screen) in NSScreen.screens.enumerated() {
            let f = screen.frame
            Log.write("屏幕 \(i)：\(Int(f.width))×\(Int(f.height)) pt，缩放 \(screen.backingScaleFactor)，左上角的全局坐标 (\(Int(f.minX)), \(Int(top - f.maxY)))")
            let wall = Wall(screen: screen, index: i, webRoot: opts.webRoot, offscreen: opts.offscreen)
            wall.onMessage = { [weak self] wall, type, body in self?.handle(wall, type, body) }
            walls.append(wall)
        }
        pushAll()
    }

    @objc private func screensChanged() {
        rebuildWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            // 这个通知很爱误报（显示器休眠唤醒、程序坞变化、色彩配置……）：屏幕的位置尺寸没变就不动
            guard self.currentScreenSignature() != self.screenSignature else { return }
            Log.write("屏幕配置变了，重建壁纸窗口")
            self.rebuildWalls()
        }
        rebuildWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: work)
    }

    private func handle(_ wall: Wall, _ type: String, _ body: [String: Any]) {
        switch type {
        case "ready":
            Log.write("屏幕 \(wall.index)：场景页就绪 \(body["w"] ?? "?")×\(body["h"] ?? "?") @\(body["dpr"] ?? "?")x")
            if debugOn { wall.run("Wall.debug(true)") }
            if paused { wall.run("Wall.pause(true)") }
            watcher.start()
        case "log":
            Log.write("屏幕 \(wall.index) 页面：\(body["msg"] ?? "")")
        case "synced":
            Log.write("屏幕 \(wall.index)：对账完成，这块屏幕上 \(body["onScreen"] ?? "?") 个图标（全部 \(body["total"] ?? "?") 个），新增 \(body["added"] ?? 0)，消失 \(body["removed"] ?? 0)")
        default:
            break
        }
    }

    // MARK: 访达数据

    private func apply(_ reading: IconWatcher.Reading) {
        switch reading {
        case .positions(let raw):
            authItem.isHidden = true
            let count = raw.split(separator: "|", omittingEmptySubsequences: false).first.map { $0.split(separator: ";").count } ?? 0
            statusLine.title = "桌面上有 \(count) 个图标"
            if raw != lastRaw {
                lastRaw = raw
                Log.write("访达数据（\(count) 个图标）：\(raw.count > 1200 ? String(raw.prefix(1200)) + "…" : raw)")
                pushAll()
            }
        case .waiting:
            statusLine.title = "等待你在授权窗口里点「允许」…"
        case .denied:
            statusLine.title = "还没有获得「控制访达」的授权"
            authItem.isHidden = false
        case .failed(let message):
            statusLine.title = "读不到图标位置：\(message)"
        }
    }

    /// 每块屏幕都收到完整的数据，外加它自己左上角的全局坐标；哪些图标落在自己身上由场景页判断。
    private func pushAll() {
        guard let raw = lastRaw else { return }
        let top = NSScreen.screens.first?.frame.maxY ?? 0
        for wall in walls {
            let f = wall.screen.frame
            let object: [String: Any] = ["raw": raw, "screen": ["x": f.minX, "y": top - f.maxY, "w": f.width, "h": f.height]]
            guard let data = try? JSONSerialization.data(withJSONObject: object), let json = String(data: data, encoding: .utf8) else { continue }
            wall.push(json)
        }
    }

    // MARK: 场景文件热更新

    private func signature() -> String {
        let keys: [URLResourceKey] = [.contentModificationDateKey, .fileSizeKey, .isRegularFileKey]
        guard let files = FileManager.default.enumerator(at: opts.webRoot, includingPropertiesForKeys: keys) else { return "" }
        var parts: [String] = []
        for case let url as URL in files {
            guard let v = try? url.resourceValues(forKeys: Set(keys)), v.isRegularFile == true else { continue }
            parts.append("\(url.lastPathComponent):\(v.fileSize ?? 0):\(v.contentModificationDate?.timeIntervalSince1970 ?? 0)")
        }
        return parts.sorted().joined(separator: "|")
    }

    /// 每秒看一眼场景文件；变了并且已经稳定一秒（同步脚本写完了），就重新载入。
    private func checkWebFiles() {
        let now = signature()
        if now == webSignature { pendingSignature = nil; return }
        if pendingSignature == now {
            webSignature = now
            pendingSignature = nil
            Log.write("场景文件有更新，重新载入")
            walls.forEach { $0.reload() }
        } else {
            pendingSignature = now
        }
    }

    // MARK: 调试快照（kill -USR1 触发，存到 ~/Library/Logs/DeskWorld-snapshot-<屏幕>.jpg）

    private func installSnapshotSignal() {
        signal(SIGUSR1, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)
        source.setEventHandler { [weak self] in
            guard let self else { return }
            let dir = Log.url.deletingLastPathComponent()
            for wall in self.walls {
                wall.snapshot(to: dir.appendingPathComponent("DeskWorld-snapshot-\(wall.index).jpg"), markers: true, restoreMarkers: self.debugOn)
            }
        }
        source.resume()
        signalSource = source
    }

    // MARK: 菜单栏

    private func buildMenu() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            if let image = NSImage(systemSymbolName: "mountain.2.fill", accessibilityDescription: "桌面世界") {
                image.isTemplate = true
                button.image = image
            } else {
                button.title = "山"
            }
        }
        let menu = NSMenu()
        let title = NSMenuItem(title: "桌面世界 · 纸雕群山", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        statusLine.isEnabled = false
        menu.addItem(statusLine)
        authItem.target = self
        authItem.action = #selector(openAutomationSettings)
        authItem.isHidden = true
        menu.addItem(authItem)
        menu.addItem(.separator())
        pauseItem.target = self
        pauseItem.action = #selector(togglePause)
        menu.addItem(pauseItem)
        debugItem.target = self
        debugItem.action = #selector(toggleDebug)
        menu.addItem(debugItem)
        loginItem.target = self
        loginItem.action = #selector(toggleLogin)
        loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
        menu.addItem(loginItem)
        menu.addItem(.separator())
        menu.addItem(withTitle: "重新载入场景", action: #selector(reloadScene), keyEquivalent: "").target = self
        menu.addItem(withTitle: "打开日志", action: #selector(openLog), keyEquivalent: "").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "退出桌面世界", action: #selector(quit), keyEquivalent: "q").target = self
        item.menu = menu
        statusItem = item
    }

    @objc private func togglePause() {
        paused.toggle()
        pauseItem.title = paused ? "继续动画" : "暂停动画"
        walls.forEach { $0.run("Wall.pause(\(paused))") }
    }

    @objc private func toggleDebug() {
        debugOn.toggle()
        debugItem.title = debugOn ? "隐藏校准标记" : "显示校准标记"
        walls.forEach { $0.run("Wall.debug(\(debugOn))") }
    }

    /// 登录时启动：由你在菜单里手动打开；程序自己不会去动登录项。
    @objc private func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
                Log.write("已取消登录时启动")
            } else {
                try SMAppService.mainApp.register()
                Log.write("已设为登录时启动")
            }
        } catch {
            Log.write("设置登录时启动没有成功：\(error.localizedDescription)")
        }
        loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
    }

    @objc private func reloadScene() {
        Log.write("手动重新载入场景")
        walls.forEach { $0.reload() }
    }

    @objc private func openLog() {
        NSWorkspace.shared.open(Log.url)
    }

    @objc private func openAutomationSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}
