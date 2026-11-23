import Foundation

@main struct ValidateCapture {
    static func main() async {
        do {
            guard CommandLine.arguments.count == 2 else { throw CaptureFileError.invalid("Informe um arquivo de vídeo local.") }
            let source = URL(fileURLWithPath: CommandLine.arguments[1])
            guard FileManager.default.fileExists(atPath: source.path) else { throw CaptureFileError.invalid("Arquivo local não encontrado.") }
            let result = try await CaptureFileValidator.inspect(source)
            let data = try JSONSerialization.data(withJSONObject: result.json, options: [.prettyPrinted, .sortedKeys])
            print(String(data: data, encoding: .utf8)!)
            if !result.healthy { exit(2) }
        } catch {
            fputs("Validação falhou: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }
}
