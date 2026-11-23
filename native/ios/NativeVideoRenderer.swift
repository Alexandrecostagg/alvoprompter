import AVFoundation
import CoreImage
import CoreText
import ImageIO
import Foundation

// Offline composition: no camera, player, microphone or web audio session participates.
struct MovieEdit: Decodable {
    struct Range: Decodable { let start: Double; let end: Double }
    struct Crop: Decodable { let sx: Double; let sy: Double; let sw: Double; let sh: Double }
    struct CropPoint: Decodable { let time: Double; let crop: Crop }
    struct Word: Decodable { let word: String; let start: Double; let end: Double }
    struct Cue: Decodable { let start: Double; let end: Double; let text: String; let words: [Word]? }
    struct Theme: Decodable { let key: String; let color: String; let stroke: String; let strokeWidth: Double; let fontSizePct: Double; let background: String? }
    struct Card: Decodable { let text: String; let seconds: Double }
    struct Logo: Decodable { let uri: String; let position: String; let widthPct: Double; let opacity: Double }
    struct Music: Decodable { let uri: String; let volume: Double }
    struct Chroma: Decodable { let color: String; let similarity: Double; let smoothness: Double; let bgColor: String }
    let targetWidth: Int; let targetHeight: Int; let crop: Crop; let cropPath: [CropPoint]?
    let keepRanges: [Range]; let captions: [Cue]; let theme: Theme
    let highlightWords: Bool?; let intro: Card?; let outro: Card?; let logo: Logo?; let music: Music?
    let motion: String?; let chroma: Chroma?; let brandGradient: [String]?; let fps: Int?
    let videoBitsPerSecond: Int?
}

final class MovieExportControl: @unchecked Sendable {
    private let lock = NSLock()
    private var exporter: AVAssetExportSession?
    private var reason: String?
    func attach(_ exporter: AVAssetExportSession) throws {
        lock.lock(); defer { lock.unlock() }
        if let reason { throw CaptureFileError.invalid(reason) }
        self.exporter = exporter
    }
    func cancel(_ reason: String = "Exportação cancelada.") {
        lock.lock(); self.reason = reason; let session = exporter; lock.unlock()
        session?.cancelExport()
    }
    func check() throws {
        lock.lock(); let error = reason; lock.unlock()
        if let error { throw CaptureFileError.invalid(error) }
    }
}

private final class MovieInstruction: NSObject, AVVideoCompositionInstructionProtocol {
    let timeRange: CMTimeRange
    let enablePostProcessing = false
    let containsTweening = true
    let requiredSourceTrackIDs: [NSValue]?
    let passthroughTrackID = kCMPersistentTrackID_Invalid
    let track: CMPersistentTrackID
    let transform: CGAffineTransform
    let sourceStart: Double
    let painter: MoviePainter
    init(range: CMTimeRange, track: CMPersistentTrackID, transform: CGAffineTransform, start: Double, painter: MoviePainter) {
        timeRange = range; self.track = track; self.transform = transform; sourceStart = start; self.painter = painter
        requiredSourceTrackIDs = [NSNumber(value: track)]
    }
}

@objc(AlvoMovieCompositor)
final class AlvoMovieCompositor: NSObject, AVVideoCompositing {
    private let queue = DispatchQueue(label: "com.alvoprompter.movie.frames", qos: .userInitiated)
    private let context = CIContext(options: [.cacheIntermediates: false])
    var sourcePixelBufferAttributes: [String: Any]? { [kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_32BGRA, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]] }
    var requiredPixelBufferAttributesForRenderContext: [String: Any] { [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferIOSurfacePropertiesKey as String: [:]] }
    func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {}
    func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        queue.async {
            autoreleasepool {
                guard let instruction = request.videoCompositionInstruction as? MovieInstruction,
                      let source = request.sourceFrame(byTrackID: instruction.track),
                      let output = request.renderContext.newPixelBuffer() else {
                    request.finish(with: CaptureFileError.invalid("Não foi possível compor um quadro do vídeo.")); return
                }
                // Track transforms use top-left coordinates; Core Image uses bottom-left.
                // Conjugating the transform preserves portrait orientation and mirroring.
                let raw = CIImage(cvPixelBuffer: source)
                let image = raw.transformed(by: CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: raw.extent.height)).transformed(by: instruction.transform)
                let origin = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
                let normalized = origin.transformed(by: CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: origin.extent.height))
                let elapsed = request.compositionTime.seconds - instruction.timeRange.start.seconds
                let result = instruction.painter.frame(normalized, time: instruction.sourceStart + elapsed,
                    fraction: elapsed / instruction.timeRange.duration.seconds)
                self.context.render(result, to: output, bounds: CGRect(origin: .zero, size: request.renderContext.size), colorSpace: CGColorSpaceCreateDeviceRGB())
                request.finish(withComposedVideoFrame: output)
            }
        }
    }
    func cancelAllPendingVideoCompositionRequests() { queue.sync {} }
}

private final class MoviePainter {
    let edit: MovieEdit
    let bounds: CGRect
    private let logo: CGImage?
    private let cube: Data?
    private var overlayKey = ""
    private var cachedOverlay: CGImage?
    init(_ edit: MovieEdit) throws {
        self.edit = edit; bounds = CGRect(x: 0, y: 0, width: edit.targetWidth, height: edit.targetHeight)
        if let item = edit.logo {
            guard let url = URL(string: item.uri), let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw CaptureFileError.invalid("Não foi possível abrir a logo escolhida.") }
            logo = image
        } else { logo = nil }
        if let key = edit.chroma {
            let color = Self.color(key.color).components ?? [0, 1, 0, 1]
            var values = [Float](); values.reserveCapacity(32 * 32 * 32 * 4)
            for b in 0..<32 { for g in 0..<32 { for r in 0..<32 {
                let rgb = [Double(r) / 31, Double(g) / 31, Double(b) / 31]
                let distance = sqrt(zip(rgb, color).reduce(0) { $0 + pow($1.0 - $1.1, 2) }) / sqrt(3)
                let maximum = rgb.max()!, minimum = rgb.min()!
                let saturation = maximum == 0 ? 0 : (maximum - minimum) / maximum
                let green = rgb[1] >= rgb[0] && rgb[1] >= rgb[2] ? rgb[1] - max(rgb[0], rgb[2]) : 0
                let keyness = min(1, green * 2) * saturation * (1 - distance)
                let threshold = 0.72 - 0.5 * max(0, min(1, key.similarity / 100))
                let softness = 0.08 + 0.45 * max(0, min(1, key.smoothness / 100))
                let alpha = max(0, min(1, (threshold - keyness) / max(0.01, softness)))
                values += rgb.map { Float($0 * alpha) } + [Float(alpha)]
            } } }
            cube = values.withUnsafeBytes { Data($0) }
        } else { cube = nil }
    }

    func frame(_ source: CIImage, time: Double, fraction: Double) -> CIImage {
        var crop = edit.crop
        if let path = edit.cropPath, !path.isEmpty {
            let upper = path.firstIndex { $0.time >= time } ?? path.count - 1
            let a = path[max(0, upper - 1)], b = path[upper]
            let f = max(0, min(1, (time - a.time) / max(0.001, b.time - a.time)))
            crop = .init(sx: a.crop.sx + (b.crop.sx - a.crop.sx) * f, sy: a.crop.sy + (b.crop.sy - a.crop.sy) * f,
                         sw: a.crop.sw + (b.crop.sw - a.crop.sw) * f, sh: a.crop.sh + (b.crop.sh - a.crop.sh) * f)
        }
        let f = max(0, min(1, fraction)), motion = edit.motion ?? "none"
        let scale = motion == "zoom-in" ? 1 + 0.25 * f : motion == "zoom-out" ? 1.25 - 0.25 * f : motion.hasPrefix("pan-") ? 1.25 : 1
        let dx = motion == "pan-left" ? -crop.sw * 0.1 * f : motion == "pan-right" ? crop.sw * 0.1 * f : 0
        let sw = min(source.extent.width, crop.sw / scale), sh = min(source.extent.height, crop.sh / scale)
        let sx = max(0, min(source.extent.width - sw, crop.sx + crop.sw / 2 - sw / 2 + dx))
        let sy = max(0, min(source.extent.height - sh, crop.sy + crop.sh / 2 - sh / 2))
        let rect = CGRect(x: sx, y: source.extent.height - sy - sh, width: sw, height: sh)
        var image = source
        if let cube, let chroma = edit.chroma {
            image = image.applyingFilter("CIColorCube", parameters: ["inputCubeDimension": 32, "inputCubeData": cube])
                .composited(over: CIImage(color: CIColor(cgColor: Self.color(chroma.bgColor))).cropped(to: source.extent))
        }
        image = image.cropped(to: rect).transformed(by: CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
            .transformed(by: CGAffineTransform(scaleX: bounds.width / sw, y: bounds.height / sh))
        if let overlay = overlay(time) { image = CIImage(cgImage: overlay).composited(over: image) }
        return image.cropped(to: bounds)
    }

    private func overlay(_ time: Double) -> CGImage? {
        let cue = edit.theme.key == "none" ? nil : edit.captions.first { time >= $0.start && time < $0.end }
        let first = edit.keepRanges.first!, last = edit.keepRanges.last!
        var card: MovieEdit.Card?, cardProgress = 0.0, ending = false
        if let intro = edit.intro, time >= first.start, time - first.start <= intro.seconds {
            card = intro; cardProgress = (time - first.start) / intro.seconds
        }
        if let outro = edit.outro, last.end - time >= 0, last.end - time <= outro.seconds {
            card = outro; cardProgress = 1 - (last.end - time) / outro.seconds; ending = true
        }
        guard cue != nil || card != nil || logo != nil else { return nil }
        var activeWord = -1
        if let cue, edit.highlightWords == true {
            let count = cue.text.split(whereSeparator: { $0.isWhitespace }).count
            if let words = cue.words, words.count == count { activeWord = words.firstIndex { time >= $0.start && time < $0.end } ?? -1 }
            else { activeWord = min(count - 1, max(0, Int((time - cue.start) / max(0.001, cue.end - cue.start) * Double(count)))) }
        }
        let key = "\(cue?.start ?? -1):\(cue?.text ?? ""):\(activeWord)"
        if card == nil, key == overlayKey, let cachedOverlay { return cachedOverlay }
        guard let ctx = CGContext(data: nil, width: edit.targetWidth, height: edit.targetHeight, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        let w = bounds.width, h = bounds.height
        if let card {
            let p = max(0, min(1, cardProgress)), ease = 1 - pow(1 - p, 3), appear = min(1, p * 4)
            ctx.saveGState(); ctx.setAlpha(appear)
            let colors = edit.brandGradient ?? ["#8B5CF6", "#22D3EE"]
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors.map(Self.color) as CFArray, locations: [0, 1]) {
                ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: h), end: CGPoint(x: w, y: 0), options: [])
            }
            ctx.translateBy(x: w / 2, y: h / 2 - (1 - ease) * h * 0.06)
            let scale = 1.14 - 0.14 * ease; ctx.scaleBy(x: scale, y: scale); ctx.translateBy(x: -w / 2, y: -h / 2)
            let size = min(h * 0.07, w / 12), lineHeight = size * 1.2
            var lines = [String](), current = ""
            for word in card.text.split(separator: " ") {
                let trial = current.isEmpty ? String(word) : current + " " + word
                if textWidth(trial, size) > w * 0.85 && !current.isEmpty { lines.append(current); current = String(word) } else { current = trial }
            }
            if !current.isEmpty { lines.append(current) }
            let startY = h / 2 + Double(lines.count - 1) * lineHeight / 2
            if let logo {
                let lw = min(w * 0.16, h * 0.18 * Double(logo.width) / Double(logo.height), Double(logo.width))
                ctx.draw(logo, in: CGRect(x: (w - lw) / 2, y: startY + size * 1.1, width: lw, height: lw * Double(logo.height) / Double(logo.width)))
            }
            for (index, line) in lines.enumerated() { text(ctx, line, size, w / 2, startY - Double(index) * lineHeight, "#ffffff", centered: true) }
            let subY = startY - Double(lines.count) * lineHeight - size * 0.9
            text(ctx, ending ? "Obrigado por assistir!" : "Seu roteiro no alvo. Seu olhar na câmera.", size * 0.4, w / 2, subY, "#ffffff", centered: true)
            let bar = w * 0.24 * ease
            ctx.setFillColor(Self.color("#ffffff")); ctx.fill(CGRect(x: (w - bar) / 2, y: subY - size * 0.8, width: bar, height: max(3, size * 0.07)))
            ctx.restoreGState()
        }
        if let cue {
            let words = cue.text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
            let size = min((h * edit.theme.fontSizePct / 100).rounded(), (w / max(1, Double(cue.text.count) * 0.6)).rounded())
            if size >= 10 {
                let width = textWidth(cue.text, size), y = max(h > w ? h * 0.2 : 28, size * 1.1)
                var x = (w - width) / 2, active = -1
                if edit.highlightWords == true && !words.isEmpty {
                    if let timed = cue.words, timed.count == words.count { active = timed.firstIndex { time >= $0.start && time < $0.end } ?? -1 }
                    else { active = min(words.count - 1, max(0, Int((time - cue.start) / max(0.001, cue.end - cue.start) * Double(words.count)))) }
                }
                if let bg = edit.theme.background {
                    ctx.setFillColor(Self.color(bg)); ctx.addPath(CGPath(roundedRect: CGRect(x: x - size * 0.5, y: y - size * 0.85, width: width + size, height: size * 1.7), cornerWidth: size * 0.3, cornerHeight: size * 0.3, transform: nil)); ctx.fillPath()
                }
                for (index, word) in words.enumerated() {
                    text(ctx, word, size, x, y, index == active ? "#22d3ee" : edit.theme.color,
                         stroke: edit.theme.background == nil ? edit.theme.stroke : nil, strokeWidth: edit.theme.strokeWidth)
                    x += textWidth(word + (index < words.count - 1 ? " " : ""), size)
                }
            }
        }
        if let logo, let item = edit.logo {
            let pad = max(16, w * 0.02), lw = min(w * item.widthPct / 100, Double(logo.width)), lh = lw * Double(logo.height) / Double(logo.width)
            let x = item.position.hasSuffix("right") ? w - lw - pad : pad
            let y = item.position.hasPrefix("bottom") ? pad : h - lh - pad
            ctx.saveGState(); ctx.setAlpha(max(0, min(1, item.opacity))); ctx.draw(logo, in: CGRect(x: x, y: y, width: lw, height: lh)); ctx.restoreGState()
        }
        let result = ctx.makeImage()
        if card == nil { overlayKey = key; cachedOverlay = result }
        return result
    }

    private func line(_ value: String, _ size: Double, _ color: String = "#ffffff") -> CTLine {
        let font = CTFontCreateWithName("Helvetica-Bold" as CFString, size, nil)
        return CTLineCreateWithAttributedString(NSAttributedString(string: value, attributes: [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): Self.color(color)
        ]))
    }
    private func textWidth(_ value: String, _ size: Double) -> Double { CTLineGetTypographicBounds(line(value, size), nil, nil, nil) }
    private func text(_ ctx: CGContext, _ value: String, _ size: Double, _ x: Double, _ y: Double, _ color: String, centered: Bool = false, stroke: String? = nil, strokeWidth: Double = 0) {
        let valueLine = line(value, size, color)
        ctx.saveGState(); ctx.textMatrix = .identity
        let position = CGPoint(x: centered ? x - textWidth(value, size) / 2 : x, y: y - size * 0.35)
        ctx.textPosition = position
        if let stroke, !stroke.isEmpty, strokeWidth > 0 {
            ctx.setTextDrawingMode(.stroke); ctx.setStrokeColor(Self.color(stroke)); ctx.setLineWidth(strokeWidth); ctx.setLineJoin(.round); CTLineDraw(valueLine, ctx)
        }
        ctx.textPosition = position; ctx.setTextDrawingMode(.fill); CTLineDraw(valueLine, ctx); ctx.restoreGState()
    }
    static func color(_ input: String) -> CGColor {
        if input.hasPrefix("rgba(") {
            let values = input.dropFirst(5).dropLast().split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            if values.count == 4 { return CGColor(red: values[0] / 255, green: values[1] / 255, blue: values[2] / 255, alpha: values[3]) }
        }
        var hex = input.replacingOccurrences(of: "#", with: "")
        if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
        let value = UInt64(hex, radix: 16) ?? 0
        return CGColor(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255, alpha: 1)
    }
}

enum NativeVideoRenderer {
    static func render(source: URL, destination: URL, edit: MovieEdit, control: MovieExportControl, progress: @escaping @Sendable (Double) -> Void) async throws -> CaptureValidation {
        try control.check()
        guard edit.targetWidth > 0, edit.targetHeight > 0, edit.targetWidth <= 3840, edit.targetHeight <= 3840,
              edit.targetWidth % 2 == 0, edit.targetHeight % 2 == 0, !edit.keepRanges.isEmpty,
              edit.crop.sw > 0, edit.crop.sh > 0 else { throw CaptureFileError.invalid("Configuração de exportação inválida.") }
        let asset = AVURLAsset(url: source), composition = AVMutableComposition()
        guard let sourceVideo = try await asset.loadTracks(withMediaType: .video).first,
              let video = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw CaptureFileError.invalid("O original não contém imagem.") }
        let sourceAudio = try await asset.loadTracks(withMediaType: .audio).first
        let duration = try await asset.load(.duration).seconds
        let transform = try await sourceVideo.load(.preferredTransform)
        let audio = sourceAudio == nil ? nil : composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        let painter = try MoviePainter(edit)
        var cursor = CMTime.zero, instructions = [MovieInstruction]()
        for range in edit.keepRanges {
            guard range.start.isFinite, range.end.isFinite, range.start >= 0, range.end > range.start, range.end <= duration + 0.1 else { throw CaptureFileError.invalid("Um corte está fora dos limites do original.") }
            let span = CMTimeRange(start: CMTime(seconds: range.start, preferredTimescale: 60000), end: CMTime(seconds: min(duration, range.end), preferredTimescale: 60000))
            try video.insertTimeRange(span, of: sourceVideo, at: cursor)
            if let audio, let sourceAudio { try audio.insertTimeRange(span, of: sourceAudio, at: cursor) }
            instructions.append(MovieInstruction(range: CMTimeRange(start: cursor, duration: span.duration), track: video.trackID, transform: transform, start: range.start, painter: painter))
            cursor = cursor + span.duration
        }
        let mix = AVMutableAudioMix(); var parameters = [AVAudioMixInputParameters]()
        if let audio { let p = AVMutableAudioMixInputParameters(track: audio); p.setVolume(1, at: .zero); parameters.append(p) }
        if let music = edit.music, let uri = URL(string: music.uri) {
            let musicAsset = AVURLAsset(url: uri)
            guard let musicSource = try await musicAsset.loadTracks(withMediaType: .audio).first,
                  let musicTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw CaptureFileError.invalid("Não foi possível abrir a música escolhida.") }
            let length = try await musicAsset.load(.duration)
            guard length.seconds.isFinite && length.seconds > 0 else { throw CaptureFileError.invalid("A música escolhida está vazia.") }
            var offset = CMTime.zero
            while offset < cursor { let remaining = CMTimeMinimum(length, cursor - offset); try musicTrack.insertTimeRange(CMTimeRange(start: .zero, duration: remaining), of: musicSource, at: offset); offset = offset + remaining }
            let p = AVMutableAudioMixInputParameters(track: musicTrack); p.setVolume(Float(max(0, min(1, music.volume))), at: .zero); parameters.append(p)
        }
        mix.inputParameters = parameters
        let vc = AVMutableVideoComposition(); vc.customVideoCompositorClass = AlvoMovieCompositor.self
        vc.renderSize = CGSize(width: edit.targetWidth, height: edit.targetHeight)
        vc.frameDuration = CMTime(value: 1, timescale: Int32(max(1, min(60, edit.fps ?? 30)))); vc.instructions = instructions
        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { throw CaptureFileError.invalid("O aparelho não disponibilizou a exportação.") }
        exporter.outputURL = destination; exporter.outputFileType = .mp4; exporter.shouldOptimizeForNetworkUse = true
        exporter.videoComposition = vc; exporter.audioMix = mix
        if let bps = edit.videoBitsPerSecond { exporter.fileLengthLimit = Int64(cursor.seconds * Double(max(1_000_000, bps) + 192_000) / 8 * 1.15) }
        try control.attach(exporter)
        let monitor = Task {
            var previous: Float = -1; var advanced = Date()
            let began = Date()
            while !Task.isCancelled {
                let current = exporter.progress
                if current > previous { previous = current; advanced = Date() }
                progress(Double(current) * 0.9)
                if Date().timeIntervalSince(advanced) > 45 || Date().timeIntervalSince(began) > max(90, cursor.seconds * 4 + 30) {
                    control.cancel("O processamento parou de responder. O original e sua edição foram preservados."); return
                }
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
        }
        defer { monitor.cancel() }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in exporter.exportAsynchronously { continuation.resume() } }
        try control.check()
        guard exporter.status == .completed else { throw exporter.error ?? CaptureFileError.invalid("Não foi possível concluir o vídeo.") }
        progress(0.92)
        let result = try await CaptureFileValidator.inspect(destination, check: control.check)
        try control.check()
        guard result.healthy, abs(result.duration - cursor.seconds) < 0.5 else { throw CaptureFileError.invalid("A conferência do vídeo final detectou imagem ou áudio incompletos. O original foi mantido.") }
        progress(1); return result
    }
}
