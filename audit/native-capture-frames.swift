import AVFoundation
import Foundation
import ImageIO
import UniformTypeIdentifiers

@main struct NativeCaptureFrames {
    static func main() async throws {
        guard CommandLine.arguments.count == 3 else { return }
        let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
        let folder = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let duration = try await asset.load(.duration).seconds
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 240, height: 320)
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.1, preferredTimescale: 600)
        let times = Array(Set([1, 16, 60, 120, max(0, duration - 0.5)].filter { $0 < duration })).sorted()
        var output: [[String: Any]] = []
        for time in times {
            let (frame, actual) = try await generator.image(at: CMTime(seconds: time, preferredTimescale: 600))
            let name = String(format: "frame-%06.2f.jpg", time)
            let file = folder.appendingPathComponent(name)
            guard let destination = CGImageDestinationCreateWithURL(file as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { throw NSError(domain: "CaptureQA", code: 1) }
            CGImageDestinationAddImage(destination, frame, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { throw NSError(domain: "CaptureQA", code: 2) }
            output.append(["requested": time, "actual": actual.seconds, "file": file.path, "width": frame.width, "height": frame.height])
        }
        let json = try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys])
        print(String(data: json, encoding: .utf8)!)
    }
}
