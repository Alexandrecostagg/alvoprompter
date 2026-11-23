import Capacitor
import UIKit

@objc(NativeVideoExportPlugin)
final class NativeVideoExportPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NativeVideoExportPlugin"
    let jsName = "AlvoVideoExport"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "render", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)]
    private var active: (id: String, control: MovieExportControl)?

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.active?.id == call.getString("id") { self.active?.control.cancel() }
            call.resolve()
        }
    }

    @objc func render(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.active == nil else { call.reject("Já existe um vídeo sendo preparado."); return }
            guard let id = call.getString("id"), UUID(uuidString: id) != nil,
                  let config = call.getObject("config") else { call.reject("Configuração de exportação inválida."); return }
            let control = MovieExportControl(); self.active = (id, control)
            let idle = UIApplication.shared.isIdleTimerDisabled
            UIApplication.shared.isIdleTimerDisabled = true
            let observer = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
                control.cancel("A exportação foi interrompida porque o app saiu da tela. Sua edição foi mantida.")
            }
            Task {
                var outcome: [String: Any]?
                var failure: Error?
                do {
                    let edit = try JSONDecoder().decode(MovieEdit.self, from: JSONSerialization.data(withJSONObject: config))
                    let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                    let folder = support.appendingPathComponent("VideoExports", isDirectory: true)
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    let source = try self.source(call, support: support)
                    // Assets must belong to this app; never accept arbitrary external file URLs.
                    for uri in [edit.logo?.uri, edit.music?.uri].compactMap({ $0 }) { _ = try self.ownedFile(uri, support: support) }
                    let output = folder.appendingPathComponent(id).appendingPathExtension("mp4")
                    guard !FileManager.default.fileExists(atPath: output.path) else { throw CaptureFileError.invalid("Essa exportação já existe.") }
                    let validation = try await NativeVideoRenderer.render(source: source, destination: output, edit: edit, control: control) { fraction in
                        self.notifyListeners("progress", data: ["id": id, "fraction": fraction])
                    }
                    let bytes = try output.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    let result: [String: Any] = ["uri": output.absoluteString, "type": "video/mp4", "bytes": bytes, "validation": validation.json]
                    try JSONSerialization.data(withJSONObject: result).write(to: folder.appendingPathComponent(id).appendingPathExtension("json"), options: .atomic)
                    outcome = result
                } catch { failure = error }
                await MainActor.run {
                    NotificationCenter.default.removeObserver(observer)
                    UIApplication.shared.isIdleTimerDisabled = idle
                    self.active = nil
                    if let outcome { call.resolve(outcome) }
                    else { call.reject(failure?.localizedDescription ?? "Não foi possível concluir o vídeo.") }
                }
            }
        }
    }

    private func ownedFile(_ uri: String, support: URL) throws -> URL {
        guard let url = URL(string: uri), url.isFileURL,
              url.resolvingSymlinksInPath().path.hasPrefix(support.resolvingSymlinksInPath().path + "/"),
              FileManager.default.fileExists(atPath: url.path) else { throw CaptureFileError.invalid("Arquivo local indisponível para exportação.") }
        return url
    }
    private func source(_ call: CAPPluginCall, support: URL) throws -> URL {
        if let context = call.getObject("source"), let id = context["id"] as? String, UUID(uuidString: id) != nil,
           let scope = context["scope"] as? String {
            let folder = support.appendingPathComponent("CameraTakes")
            let journal = folder.appendingPathComponent(id).appendingPathExtension("json")
            if let data = try? Data(contentsOf: journal), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let saved = json["context"] as? [String: Any], saved["scope"] as? String == scope {
                for ext in ["mp4", "mov"] {
                    let url = folder.appendingPathComponent(id).appendingPathExtension(ext)
                    if FileManager.default.fileExists(atPath: url.path) { return url }
                }
            }
        }
        guard let uri = call.getString("uri") else { throw CaptureFileError.invalid("O original não está disponível para exportação.") }
        return try ownedFile(uri, support: support)
    }
}
