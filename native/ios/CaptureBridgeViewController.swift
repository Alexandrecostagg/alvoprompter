import AVFoundation
import Capacitor
import UIKit

final class NativeCameraSurface: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

final class CaptureBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        guard let web = webView else { return }
        let host = UIView(frame: web.bounds)
        host.backgroundColor = .black
        let surface = NativeCameraSurface(frame: .zero)
        surface.isUserInteractionEnabled = false; surface.clipsToBounds = true
        surface.previewLayer.videoGravity = .resizeAspectFill
        host.addSubview(surface)
        web.frame = host.bounds; web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.addSubview(web)
        view = host
        bridge?.registerPluginInstance(NativeCameraPlugin(surface: surface, web: web))
        bridge?.registerPluginInstance(NativeVideoExportPlugin())
    }
}
