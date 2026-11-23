import AVFoundation
import Capacitor
import UIKit
import WebKit

@objc(NativeCameraPlugin)
final class NativeCameraPlugin: CAPPlugin, CAPBridgedPlugin, AVCaptureFileOutputRecordingDelegate {
    let identifier = "NativeCameraPlugin"
    let jsName = "AlvoCamera"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "release", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingTakes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recoverTake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledge", returnType: CAPPluginReturnPromise)
    ]
    private enum Phase { case idle, preparing, ready, starting, recording, finishing }
    private let cameraQueue = DispatchQueue(label: "com.alvoprompter.capture", qos: .userInitiated)
    private let surface: NativeCameraSurface
    private weak var web: WKWebView?
    private var session: AVCaptureSession?
    private var movie: AVCaptureMovieFileOutput?
    private var phase = Phase.idle
    private var generation = 0
    private var startingCall: CAPPluginCall?
    private var stoppingCalls: [CAPPluginCall] = []
    private var releaseCalls: [CAPPluginCall] = []
    private var observers: [NSObjectProtocol] = []
    private var completed: [String: Any]?
    private var interruption: String?
    private var journal: URL?
    private var ownsAudioSession = false
    private var backgroundTask = UIBackgroundTaskIdentifier.invalid

    init(surface: NativeCameraSurface, web: WKWebView) {
        self.surface = surface; self.web = web
        super.init()
    }

    @objc func prepare(_ call: CAPPluginCall) {
        cameraQueue.async {
            guard self.phase == .idle else { call.reject("A câmera já está sendo preparada ou usada."); return }
            self.phase = .preparing; self.generation += 1
            let generation = self.generation
            Task {
                let camera = await AVCaptureDevice.requestAccess(for: .video)
                let microphone = camera ? await AVCaptureDevice.requestAccess(for: .audio) : false
                self.cameraQueue.async {
                    guard generation == self.generation else { call.reject("A abertura da câmera foi cancelada."); return }
                    guard camera && microphone else { self.phase = .idle; call.reject("Permita câmera e microfone nos Ajustes do iPhone para gravar."); return }
                    do { try self.configure(); self.phase = .ready; call.resolve() }
                    catch { self.teardown(); call.reject(error.localizedDescription) }
                }
            }
        }
    }

    private func configure() throws {
        let session = AVCaptureSession()
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let microphone = AVCaptureDevice.default(for: .audio) else { throw CaptureFileError.invalid("Câmera ou microfone indisponível.") }
        let videoInput = try AVCaptureDeviceInput(device: camera)
        let audioInput = try AVCaptureDeviceInput(device: microphone)
        guard session.canAddInput(videoInput), session.canAddInput(audioInput) else { throw CaptureFileError.invalid("Não foi possível preparar a câmera e o áudio juntos.") }
        session.addInput(videoInput); session.addInput(audioInput)
        let movie = AVCaptureMovieFileOutput()
        // Periodic QuickTime fragments preserve completed portions after an OS interruption.
        movie.movieFragmentInterval = CMTime(seconds: 10, preferredTimescale: 600)
        movie.minFreeDiskSpaceLimit = 100 * 1024 * 1024
        guard session.canAddOutput(movie) else { throw CaptureFileError.invalid("O aparelho não disponibilizou a gravação nativa.") }
        session.addOutput(movie)
        session.commitConfiguration()
        try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .videoRecording, options: [.allowBluetooth])
        ownsAudioSession = true
        try AVAudioSession.sharedInstance().setActive(true)
        self.session = session; self.movie = movie
        let center = NotificationCenter.default
        observers = [
            center.addObserver(forName: AVCaptureSession.wasInterruptedNotification, object: session, queue: nil) { [weak self] _ in self?.interrupt("O iPhone interrompeu a câmera. A tomada foi encerrada para ser preservada.") },
            center.addObserver(forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: nil) { [weak self] _ in self?.interrupt("A sessão de câmera foi interrompida pelo iPhone.") },
            center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil) { [weak self] _ in self?.interrupt("O app saiu da tela. A tomada foi encerrada e permanece neste aparelho.") }
        ]
        DispatchQueue.main.sync {
            self.surface.previewLayer.session = session
            self.surface.isHidden = false
            self.web?.isOpaque = false; self.web?.backgroundColor = .clear; self.web?.scrollView.backgroundColor = .clear
        }
        session.startRunning()
        guard session.isRunning else { throw CaptureFileError.invalid("A câmera não iniciou. Tente novamente.") }
    }

    @objc func setPreview(_ call: CAPPluginCall) {
        let x = call.getDouble("x") ?? 0, y = call.getDouble("y") ?? 0
        let width = max(0, call.getDouble("width") ?? 0), height = max(0, call.getDouble("height") ?? 0)
        DispatchQueue.main.async {
            guard let web = self.web, let host = self.surface.superview else { call.resolve(); return }
            self.surface.frame = web.convert(CGRect(x: x, y: y, width: width, height: height), to: host)
            self.surface.layer.cornerRadius = call.getDouble("radius") ?? 0
            self.surface.isHidden = width < 1 || height < 1
            if let connection = self.surface.previewLayer.connection {
                if connection.isVideoOrientationSupported { connection.videoOrientation = self.videoOrientation() }
                if connection.isVideoMirroringSupported { connection.automaticallyAdjustsVideoMirroring = false; connection.isVideoMirrored = true }
            }
            call.resolve()
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), UUID(uuidString: id) != nil else { call.reject("Identificador da tomada inválido."); return }
        DispatchQueue.main.async {
            let orientation = self.videoOrientation()
            self.cameraQueue.async {
                guard self.phase == .ready, let movie = self.movie, self.session?.isRunning == true else { call.reject("A câmera não está pronta para gravar."); return }
                do {
                    let folder = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("CameraTakes", isDirectory: true)
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    let file = folder.appendingPathComponent(id).appendingPathExtension("mov")
                    guard !FileManager.default.fileExists(atPath: file.path) else { throw CaptureFileError.invalid("Essa tomada já existe; nenhuma gravação foi sobrescrita.") }
                    guard let context = call.getObject("context"), context["id"] as? String == id,
                          context["scope"] is String, JSONSerialization.isValidJSONObject(context) else { throw CaptureFileError.invalid("A identificação do espaço da gravação está indisponível.") }
                    let journal = folder.appendingPathComponent(id).appendingPathExtension("json")
                    try JSONSerialization.data(withJSONObject: ["context": context, "acknowledged": false]).write(to: journal, options: .atomic)
                    self.journal = journal
                    self.completed = nil; self.interruption = nil
                    if let connection = movie.connection(with: .video) {
                        if connection.isVideoOrientationSupported { connection.videoOrientation = orientation }
                        if connection.isVideoMirroringSupported { connection.automaticallyAdjustsVideoMirroring = false; connection.isVideoMirrored = false }
                        if movie.availableVideoCodecTypes.contains(.h264) { movie.setOutputSettings([AVVideoCodecKey: AVVideoCodecType.h264], for: connection) }
                    }
                    self.phase = .starting; self.startingCall = call
                    movie.startRecording(to: file, recordingDelegate: self)
                    let generation = self.generation
                    self.cameraQueue.asyncAfter(deadline: .now() + 15) {
                        guard generation == self.generation, self.phase == .starting else { return }
                        self.startingCall?.reject("A câmera não confirmou o início. Tente novamente."); self.startingCall = nil
                        if movie.isRecording { self.interrupt("A câmera não confirmou o início da tomada.") }
                        else { self.teardown() }
                    }
                } catch { call.reject(error.localizedDescription) }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        cameraQueue.async {
            if let completed = self.completed { call.resolve(completed); return }
            guard self.phase == .starting || self.phase == .recording || self.phase == .finishing else { call.reject("Não há tomada para encerrar."); return }
            self.stoppingCalls.append(call)
            if self.phase != .finishing { self.phase = .finishing; self.beginFinishing(); self.movie?.stopRecording() }
        }
    }

    @objc func release(_ call: CAPPluginCall) {
        cameraQueue.async {
            if self.phase == .starting || self.phase == .recording || self.phase == .finishing {
                self.releaseCalls.append(call)
                if self.phase != .finishing { self.phase = .finishing; self.beginFinishing(); self.movie?.stopRecording() }
            } else { self.teardown(); call.resolve() }
        }
    }

    private func beginFinishing() {
        DispatchQueue.main.async {
            guard self.backgroundTask == .invalid else { return }
            self.backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Preservar tomada") {
                if self.backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(self.backgroundTask); self.backgroundTask = .invalid }
            }
        }
    }

    private func interrupt(_ reason: String) {
        cameraQueue.async {
            guard self.phase == .recording || self.phase == .starting || self.phase == .ready else { return }
            self.interruption = reason
            DispatchQueue.main.async { self.notifyListeners("interrupted", data: ["reason": reason]) }
            if self.phase == .ready { self.teardown() }
            else { self.phase = .finishing; self.beginFinishing(); self.movie?.stopRecording() }
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        cameraQueue.async {
            if self.phase == .starting { self.phase = .recording }
            self.startingCall?.resolve(); self.startingCall = nil
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        cameraQueue.async {
            let unexpected = self.phase != .finishing
            self.phase = .finishing; self.beginFinishing()
            if unexpected { DispatchQueue.main.async { self.notifyListeners("interrupted", data: ["reason": "A câmera encerrou a tomada. O arquivo será preservado e conferido."]) } }
            self.session?.stopRunning()
            let warning = self.interruption
            Task {
                do {
                    if let error = error as NSError?, error.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool != true { throw error }
                    let mp4 = outputFileURL.deletingPathExtension().appendingPathExtension("mp4")
                    try await CaptureFileValidator.mp4Copy(from: outputFileURL, to: mp4)
                    let validation = try await CaptureFileValidator.inspect(mp4)
                    var result: [String: Any] = ["uri": mp4.absoluteString, "type": "video/mp4", "validation": validation.json]
                    if !validation.healthy { result["warning"] = "A imagem e o áudio desta tomada não ficaram completos. O original foi preservado; confira antes de usar e grave uma nova tomada." }
                    else if let warning { result["warning"] = warning }
                    self.cameraQueue.async { self.complete(result: result, error: nil) }
                } catch {
                    // Keep the original MOV. Do not discard a captured take on export/validation errors.
                    let result: [String: Any] = ["uri": outputFileURL.absoluteString, "type": "video/quicktime", "warning": "A tomada original foi preservada, mas não foi possível conferir ou preparar o MP4: \(error.localizedDescription)"]
                    self.cameraQueue.async { self.complete(result: result, error: nil) }
                }
            }
        }
    }

    private func complete(result: [String: Any]?, error: Error?) {
        if let result {
            completed = result
            if let journal, var record = try? self.readJournal(journal) {
                record["result"] = result
                try? JSONSerialization.data(withJSONObject: record).write(to: journal, options: .atomic)
            }
            stoppingCalls.forEach { $0.resolve(result) }
        }
        else { stoppingCalls.forEach { $0.reject(error?.localizedDescription ?? "Não foi possível encerrar a tomada.") } }
        stoppingCalls.removeAll()
        startingCall?.reject("A câmera foi interrompida antes de confirmar o início."); startingCall = nil
        teardown()
        releaseCalls.forEach { $0.resolve() }; releaseCalls.removeAll()
        DispatchQueue.main.async {
            self.notifyListeners("finished", data: result ?? [:])
            if self.backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(self.backgroundTask); self.backgroundTask = .invalid }
        }
    }

    private func teardown() {
        generation += 1
        observers.forEach { NotificationCenter.default.removeObserver($0) }; observers.removeAll()
        if session?.isRunning == true { session?.stopRunning() }
        session = nil; movie = nil; phase = .idle
        if ownsAudioSession {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            ownsAudioSession = false
        }
        DispatchQueue.main.async { self.surface.previewLayer.session = nil; self.surface.isHidden = true }
    }

    private func takeFolder() throws -> URL {
        try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("CameraTakes", isDirectory: true)
    }
    private func readJournal(_ url: URL) throws -> [String: Any] {
        guard let record = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else { throw CaptureFileError.invalid("Registro de tomada indisponível.") }
        return record
    }
    private func authorizedJournal(_ call: CAPPluginCall) throws -> (URL, [String: Any]) {
        guard let id = call.getString("id"), UUID(uuidString: id) != nil, let scope = call.getString("scope") else { throw CaptureFileError.invalid("Tomada inválida.") }
        let url = try takeFolder().appendingPathComponent(id).appendingPathExtension("json")
        let record = try readJournal(url)
        guard let context = record["context"] as? [String: Any], context["scope"] as? String == scope else { throw CaptureFileError.invalid("A tomada pertence a outro espaço.") }
        return (url, record)
    }
    @objc func pendingTakes(_ call: CAPPluginCall) {
        cameraQueue.async {
            do {
                guard let scope = call.getString("scope") else { throw CaptureFileError.invalid("Espaço indisponível.") }
                let folder = try self.takeFolder()
                let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
                let contexts = files.filter { $0.pathExtension == "json" }.compactMap { url -> [String: Any]? in
                    guard let record = try? self.readJournal(url), record["acknowledged"] as? Bool != true,
                          let context = record["context"] as? [String: Any], context["scope"] as? String == scope,
                          FileManager.default.fileExists(atPath: url.deletingPathExtension().appendingPathExtension("mov").path) else { return nil }
                    return context
                }
                call.resolve(["takes": contexts])
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func recoverTake(_ call: CAPPluginCall) {
        cameraQueue.async {
            do {
                guard self.phase == .idle else { throw CaptureFileError.invalid("Encerre a gravação antes de recuperar uma tomada.") }
                let (journal, record) = try self.authorizedJournal(call)
                if let result = record["result"] as? [String: Any] { call.resolve(result); return }
                let mov = journal.deletingPathExtension().appendingPathExtension("mov")
                Task {
                    do {
                        let validation = try await CaptureFileValidator.inspect(mov)
                        call.resolve(["uri": mov.absoluteString, "type": "video/quicktime", "validation": validation.json, "warning": "Tomada recuperada após interrupção. Confira a imagem e o áudio antes de usar."])
                    } catch { call.reject("O original permanece guardado, mas não foi possível recuperá-lo: \(error.localizedDescription)") }
                }
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func acknowledge(_ call: CAPPluginCall) {
        cameraQueue.async {
            do {
                let (url, source) = try self.authorizedJournal(call)
                var record = source; record["acknowledged"] = true
                try JSONSerialization.data(withJSONObject: record).write(to: url, options: .atomic)
                call.resolve()
            } catch { call.reject(error.localizedDescription) }
        }
    }

    private func videoOrientation() -> AVCaptureVideoOrientation {
        switch web?.window?.windowScene?.interfaceOrientation {
        case .landscapeLeft: return .landscapeLeft
        case .landscapeRight: return .landscapeRight
        case .portraitUpsideDown: return .portraitUpsideDown
        default: return .portrait
        }
    }
}
