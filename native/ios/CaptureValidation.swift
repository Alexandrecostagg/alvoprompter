import AVFoundation
import CoreVideo
import Foundation

struct CaptureValidation {
    let duration: Double
    let videoEnd: Double
    let audioEnd: Double
    let frames: Int
    let largestFrameGap: Double
    let fingerprints: [String]
    var healthy: Bool { frames > 1 && duration > 0 && abs(videoEnd - audioEnd) <= 1 && abs(videoEnd - duration) <= 1 && abs(audioEnd - duration) <= 1 && largestFrameGap <= 1 }
    var json: [String: Any] {
        ["duration": duration, "videoEnd": videoEnd, "audioEnd": audioEnd,
         "frames": frames, "largestFrameGap": largestFrameGap,
         "fingerprints": fingerprints, "healthy": healthy]
    }
}

enum CaptureFileError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case .invalid(let message) = self { return message }; return nil }
}

/// Decodes the full video track with bounded memory. Metadata alone is not proof of video.
enum CaptureFileValidator {
    static func inspect(_ url: URL, check: (() throws -> Void)? = nil) async throws -> CaptureValidation {
        try check?()
        let asset = AVURLAsset(url: url)
        let videos = try await asset.loadTracks(withMediaType: .video)
        let audios = try await asset.loadTracks(withMediaType: .audio)
        guard let video = videos.first, let audio = audios.first else {
            throw CaptureFileError.invalid("O arquivo não contém imagem e áudio completos.")
        }
        let duration = try await asset.load(.duration).seconds
        let nominal = Double(try await video.load(.nominalFrameRate))
        let frameDuration = 1 / max(1, nominal)
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: video, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        ])
        output.alwaysCopiesSampleData = false
        guard reader.canAdd(output) else { throw CaptureFileError.invalid("O aparelho não consegue conferir a imagem gravada.") }
        reader.add(output)
        guard reader.startReading() else { throw reader.error ?? CaptureFileError.invalid("Não foi possível abrir os quadros gravados.") }
        defer { if reader.status == .reading { reader.cancelReading() } }
        var frames = 0, previous: Double?, end = 0.0, largestGap = 0.0, nextFingerprint = 0.0
        var fingerprints: [String] = []
        while let sample = output.copyNextSampleBuffer() {
            if frames % 30 == 0 { try check?() }
            let time = CMSampleBufferGetPresentationTimeStamp(sample).seconds
            let rawDuration = CMSampleBufferGetDuration(sample).seconds
            let span = rawDuration.isFinite && rawDuration > 0 ? rawDuration : frameDuration
            guard time.isFinite else { reader.cancelReading(); throw CaptureFileError.invalid("O vídeo contém quadros sem tempo válido.") }
            if let last = previous { largestGap = max(largestGap, time - last) }
            else { largestGap = max(largestGap, time) }
            largestGap = max(largestGap, span)
            previous = time; end = max(end, time + span); frames += 1
            if time >= nextFingerprint, let pixels = CMSampleBufferGetImageBuffer(sample) {
                // Small irreversible sample for local QA, never a face/motion requirement.
                fingerprints.append(fingerprint(pixels)); nextFingerprint = time + 5
            }
        }
        guard reader.status == .completed else { throw reader.error ?? CaptureFileError.invalid("A leitura da imagem foi interrompida antes do fim.") }
        let audioEnd = try readAudioEnd(asset, track: audio)
        return CaptureValidation(duration: duration, videoEnd: end, audioEnd: audioEnd, frames: frames, largestFrameGap: largestGap, fingerprints: fingerprints)
    }

    private static func readAudioEnd(_ asset: AVAsset, track: AVAssetTrack) throws -> Double {
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
        output.alwaysCopiesSampleData = false
        guard reader.canAdd(output) else { throw CaptureFileError.invalid("Não foi possível conferir o áudio.") }
        reader.add(output)
        guard reader.startReading() else { throw reader.error ?? CaptureFileError.invalid("Não foi possível abrir o áudio.") }
        var end = 0.0
        while let sample = output.copyNextSampleBuffer() {
            let time = CMSampleBufferGetPresentationTimeStamp(sample).seconds
            let span = CMSampleBufferGetDuration(sample).seconds
            if time.isFinite { end = max(end, time + (span.isFinite ? max(0, span) : 0)) }
        }
        guard reader.status == .completed else { throw reader.error ?? CaptureFileError.invalid("O áudio não chegou até o fim.") }
        return end
    }

    private static func fingerprint(_ pixels: CVPixelBuffer) -> String {
        CVPixelBufferLockBaseAddress(pixels, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(pixels, 0) else { return "unavailable" }
        let width = CVPixelBufferGetWidthOfPlane(pixels, 0)
        let height = CVPixelBufferGetHeightOfPlane(pixels, 0)
        let row = CVPixelBufferGetBytesPerRowOfPlane(pixels, 0)
        let bytes = base.assumingMemoryBound(to: UInt8.self)
        var value: UInt64 = 14695981039346656037
        for y in stride(from: 0, to: height, by: max(1, height / 8)) {
            for x in stride(from: 0, to: width, by: max(1, width / 8)) { value = (value ^ UInt64(bytes[y * row + x])) &* 1099511628211 }
        }
        return String(value, radix: 16)
    }

    static func mp4Copy(from source: URL, to destination: URL) async throws {
        let asset = AVURLAsset(url: source)
        guard let exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough),
              exporter.supportedFileTypes.contains(.mp4) else {
            throw CaptureFileError.invalid("Não foi possível preparar o MP4. A tomada original permanece guardada.")
        }
        exporter.outputURL = destination; exporter.outputFileType = .mp4; exporter.shouldOptimizeForNetworkUse = true
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            exporter.exportAsynchronously {
                if exporter.status == .completed { continuation.resume() }
                else { continuation.resume(throwing: exporter.error ?? CaptureFileError.invalid("O MP4 não terminou de ser salvo.")) }
            }
        }
    }
}
