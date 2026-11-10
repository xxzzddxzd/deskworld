import AppKit
import WebKit

/// 铺在桌面图标下面的窗口：不抢焦点，也不拦鼠标（点击会直接落到访达的桌面上）。
final class WallWindow: NSWindow {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// WKUserContentController 会强引用消息处理者，用一个弱引用的中转避免循环引用。
private final class MessageProxy: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

/// 一块屏幕上的壁纸：一个桌面层窗口 + 里面跑场景页的 WKWebView。
final class Wall: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    let screen: NSScreen
    let index: Int
    let window: WallWindow
    let web: WKWebView
    /// 场景页发来的消息：(壁纸, 类型, 内容)
    var onMessage: ((Wall, String, [String: Any]) -> Void)?

    private(set) var ready = false
    private var lastPayload: String?
    private let webRoot: URL
    private let offscreen: Bool

    init(screen: NSScreen, index: Int, webRoot: URL, offscreen: Bool) {
        self.screen = screen
        self.index = index
        self.webRoot = webRoot
        self.offscreen = offscreen

        let frame = screen.frame
        window = WallWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)

        let proxy = MessageProxy()
        let controller = WKUserContentController()
        controller.add(proxy, name: "wall")
        let config = WKWebViewConfiguration()
        config.userContentController = controller
        let fullRate = Self.allowFullRefreshRate(config.preferences)
        web = WKWebView(frame: NSRect(origin: .zero, size: frame.size), configuration: config)
        super.init()
        proxy.target = self

        // 桌面层：在系统壁纸之上、访达的桌面图标之下；所有空间都在，调度中心里不跟着动
        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        window.ignoresMouseEvents = true
        window.isOpaque = true
        window.hasShadow = false
        window.backgroundColor = NSColor(srgbRed: 0.055, green: 0.165, blue: 0.235, alpha: 1)
        window.isReleasedWhenClosed = false
        window.hidesOnDeactivate = false
        window.isExcludedFromWindowsMenu = true
        window.animationBehavior = .none
        window.alphaValue = 0          // 场景页画好第一帧之前保持透明，露出原来的壁纸

        web.autoresizingMask = [.width, .height]
        web.navigationDelegate = self
        if web.responds(to: NSSelectorFromString("_setDrawsBackground:")) {
            web.setValue(false, forKey: "drawsBackground")
        }
        if #available(macOS 13.3, *) { web.isInspectable = true }   // 可以用 Safari 的「开发」菜单检查场景页

        window.contentView = web
        window.setFrame(frame, display: true)
        window.orderFront(nil)
        if index == 0 { Log.write(fullRate ? "已关闭网页内核的 60 帧限制：过渡跟随屏幕刷新率" : "没找到网页内核的 60 帧开关：过渡最多每秒 60 帧") }
        load()
    }

    /// WebKit 默认把页面的重画限制在每秒 60 次左右。在 120 Hz 的屏幕上把这个限制关掉，过渡才能跑满刷新率。
    /// 这是 WebKit 的内部开关（PreferPageRenderingUpdatesNear60FPSEnabled），找不到就保持默认，不影响别的功能。
    private static func allowFullRefreshRate(_ prefs: WKPreferences) -> Bool {
        let listSel = NSSelectorFromString("_features")
        let setSel = NSSelectorFromString("_setEnabled:forFeature:")
        guard WKPreferences.responds(to: listSel), prefs.responds(to: setSel),
              let features = WKPreferences.perform(listSel)?.takeUnretainedValue() as? [NSObject] else { return false }
        for feature in features {
            guard feature.responds(to: NSSelectorFromString("key")),
                  let key = feature.value(forKey: "key") as? String,
                  key == "PreferPageRenderingUpdatesNear60FPSEnabled" else { continue }
            typealias Setter = @convention(c) (AnyObject, Selector, Bool, AnyObject) -> Void
            let setter = unsafeBitCast(prefs.method(for: setSel), to: Setter.self)
            setter(prefs, setSel, false, feature)
            return true
        }
        return false
    }

    func load() {
        ready = false
        let page = webRoot.appendingPathComponent("wallpaper.html")
        guard FileManager.default.fileExists(atPath: page.path) else {
            Log.write("屏幕 \(index)：找不到场景文件 \(page.path)（先运行 app/sync-web.sh）")
            return
        }
        web.loadFileURL(page, allowingReadAccessTo: webRoot)
    }

    func reload() {
        ready = false
        web.reloadFromOrigin()
    }

    func close() {
        web.stopLoading()
        web.configuration.userContentController.removeScriptMessageHandler(forName: "wall")
        window.orderOut(nil)
    }

    /// 把访达数据送进场景页；页面还没就绪就先记着，就绪后补送。
    func push(_ payload: String) {
        lastPayload = payload
        guard ready else { return }
        let index = self.index
        web.evaluateJavaScript("Wall.update(\(payload))") { _, error in
            if let error { Log.write("屏幕 \(index)：送图标位置失败 \(error.localizedDescription)") }
        }
    }

    func run(_ js: String) {
        guard ready else { return }
        web.evaluateJavaScript(js, completionHandler: nil)
    }

    /// 把当前画面存成 JPEG（调试用）。markers 为真时带上校准标记。
    func snapshot(to url: URL, markers: Bool, restoreMarkers: Bool) {
        let index = self.index
        let prepare = (markers ? "Wall.debug(true);" : "") + "Wall.settle(); Wall.info()"
        web.evaluateJavaScript(prepare) { [weak self] info, error in
            Log.write("屏幕 \(index) 快照前状态：\(info ?? "?") \(error.map { $0.localizedDescription } ?? "")")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                guard let self else { return }
                self.web.takeSnapshot(with: nil) { image, error in
                    if markers { self.web.evaluateJavaScript("Wall.debug(\(restoreMarkers))", completionHandler: nil) }
                    guard let image, let data = Self.jpeg(image, maxWidth: 1600) else {
                        Log.write("屏幕 \(index) 快照失败：\(error?.localizedDescription ?? "没有图像")")
                        return
                    }
                    do {
                        try data.write(to: url)
                        Log.write("屏幕 \(index) 快照已保存：\(url.path)（原始 \(Int(image.size.width))×\(Int(image.size.height)) pt）")
                    } catch {
                        Log.write("屏幕 \(index) 快照写入失败：\(error.localizedDescription)")
                    }
                }
            }
        }
    }

    private static func jpeg(_ image: NSImage, maxWidth: CGFloat) -> Data? {
        let scale = min(1, maxWidth / max(1, image.size.width))
        let w = Int(image.size.width * scale), h = Int(image.size.height * scale)
        guard w > 0, h > 0, let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
            hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
        rep.size = NSSize(width: w, height: h)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        image.draw(in: NSRect(x: 0, y: 0, width: w, height: h))
        NSGraphicsContext.restoreGraphicsState()
        return rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85])
    }

    private func reveal() {
        guard !offscreen, window.alphaValue < 1 else { return }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.9
            window.animator().alphaValue = 1
        }
    }

    // MARK: WKScriptMessageHandler

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "ready" {
            ready = true
            if let payload = lastPayload { push(payload) }
            reveal()
        }
        onMessage?(self, type, body)
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Log.write("屏幕 \(index)：场景页加载失败 \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        Log.write("屏幕 \(index)：场景页打不开 \(error.localizedDescription)")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Log.write("屏幕 \(index)：渲染进程退出了，重新载入")
        load()
    }
}
