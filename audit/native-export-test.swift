import Foundation

@main struct ExportTest {
    static func main() async {
        do {
            guard [4, 5].contains(CommandLine.arguments.count) else { throw CaptureFileError.invalid("Uso: export source config.json output.mp4 [cancelAfterSeconds]") }
            let source = URL(fileURLWithPath: CommandLine.arguments[1])
            let edit = try JSONDecoder().decode(MovieEdit.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])))
            let output = URL(fileURLWithPath: CommandLine.arguments[3]), began = Date()
            let control = MovieExportControl()
            if CommandLine.arguments.count == 5, let seconds = Double(CommandLine.arguments[4]) {
                Task { try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)); control.cancel() }
            }
            let result = try await NativeVideoRenderer.render(source: source, destination: output, edit: edit, control: control) { progress in
                fputs("progress \(Int(progress * 100))\n", stderr)
            }
            var report = result.json; report["elapsedSeconds"] = Date().timeIntervalSince(began)
            print(String(data: try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]), encoding: .utf8)!)
        } catch { fputs("Export failed: \(error)\n", stderr); exit(1) }
    }
}
