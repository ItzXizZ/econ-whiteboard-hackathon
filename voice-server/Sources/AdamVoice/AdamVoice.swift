import Foundation
import Network
@preconcurrency import WhisperKit

/// Adam's speech-to-text server, built on Argmax's open-source Swift SDK (WhisperKit).
///
///     swift run -c release adam-voice --model tiny      ->  http://127.0.0.1:50060
///
/// It answers the two requests server/voice.js makes:
///     GET  /                          health check
///     POST /v1/audio/transcriptions   multipart form: file (WAV), prompt, language, temperature
///
/// The first run downloads the model; later runs load it from disk and need no network.
///
///     --model / ADAM_VOICE_MODEL   WhisperKit model, e.g. tiny, base, small (default tiny)
///     --port  / ADAM_VOICE_PORT    port on 127.0.0.1 (default 50060)
@main
struct AdamVoice {
    private static var server: HTTPServer?

    static func main() async {
        let options = Options.parse()
        let pipe: WhisperKit
        do {
            pipe = try await loadPipe(model: options.model)
        } catch {
            say("Could not load the Argmax model '\(options.model)': \(error)")
            exit(1)
        }
        do {
            let server = try HTTPServer(port: options.port, transcriber: Transcriber(pipe: pipe))
            server.start()
            Self.server = server
        } catch {
            say("Could not listen on port \(options.port): \(error)")
            exit(1)
        }
        say("Adam voice (Argmax WhisperKit, model \(options.model)) on http://127.0.0.1:\(options.port)")
        await withUnsafeContinuation { (_: UnsafeContinuation<Void, Never>) in }
    }
}

func say(_ message: String) {
    print(message)
    fflush(stdout)
}

struct Options {
    var model = "tiny"
    var port: UInt16 = 50060

    static func parse() -> Options {
        var options = Options()
        let env = ProcessInfo.processInfo.environment
        if let model = env["ADAM_VOICE_MODEL"], !model.isEmpty { options.model = model }
        if let port = env["ADAM_VOICE_PORT"].flatMap({ UInt16($0) }) { options.port = port }
        var args = Array(CommandLine.arguments.dropFirst())
        while !args.isEmpty {
            let arg = args.removeFirst()
            if arg == "--model", !args.isEmpty {
                options.model = args.removeFirst()
            } else if arg == "--port", let port = args.first.flatMap({ UInt16($0) }) {
                args.removeFirst()
                options.port = port
            }
        }
        return options
    }
}

// MARK: - Model loading

private struct SavedModel: Codable {
    var modelFolder: String
    var tokenizerFolder: String?
}

/// Loads the model from the folder saved by an earlier run, so it starts with WiFi off;
/// otherwise downloads it once and remembers where it went.
func loadPipe(model: String) async throws -> WhisperKit {
    let safeName = model.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "*", with: "_")
    let savedURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".adam-voice", isDirectory: true)
        .appendingPathComponent("model-\(safeName).json")

    if let data = try? Data(contentsOf: savedURL),
       let saved = try? JSONDecoder().decode(SavedModel.self, from: data),
       FileManager.default.fileExists(atPath: saved.modelFolder)
    {
        do {
            let config = WhisperKitConfig(
                modelFolder: saved.modelFolder,
                tokenizerFolder: saved.tokenizerFolder.map { URL(fileURLWithPath: $0) },
                verbose: false,
                prewarm: false,
                load: true,
                download: false
            )
            return try await WhisperKit(config)
        } catch {
            say("The saved model at \(saved.modelFolder) did not load (\(error)). Downloading it again.")
        }
    }

    let pattern = model.contains("whisper") ? model : "openai_whisper*" + model
    let config = WhisperKitConfig(model: pattern, verbose: false, prewarm: false, load: true, download: true)
    let pipe = try await WhisperKit(config)
    if let folder = pipe.modelFolder {
        let saved = SavedModel(modelFolder: folder.path, tokenizerFolder: pipe.tokenizerFolder?.path)
        try? FileManager.default.createDirectory(
            at: savedURL.deletingLastPathComponent(), withIntermediateDirectories: true
        )
        try? JSONEncoder().encode(saved).write(to: savedURL)
    }
    return pipe
}

// MARK: - Transcription

/// One transcription at a time; WhisperKit holds a single model in memory.
actor Transcriber {
    private let pipe: WhisperKit

    init(pipe: WhisperKit) {
        self.pipe = pipe
    }

    func transcribe(audio: Data, prompt: String?, language: String?, temperature: Float) async throws -> String {
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("adam-voice-\(UUID().uuidString).wav")
        try audio.write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }

        var options = DecodingOptions(language: language, temperature: temperature)
        if let prompt, !prompt.trimmingCharacters(in: .whitespaces).isEmpty, let tokenizer = pipe.tokenizer {
            options.promptTokens = tokenizer.encode(text: " " + prompt.trimmingCharacters(in: .whitespaces))
                .filter { $0 < tokenizer.specialTokens.specialTokenBegin }
            options.usePrefillPrompt = true
        }
        let results = try await pipe.transcribe(audioPath: file.path, decodeOptions: options)
        return results.map(\.text).joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - HTTP

final class HTTPServer {
    private let listener: NWListener
    private let transcriber: Transcriber
    private let queue = DispatchQueue(label: "adam-voice.http")

    init(port: UInt16, transcriber: Transcriber) throws {
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            throw NSError(domain: "AdamVoice", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid port \(port)"])
        }
        let parameters = NWParameters.tcp
        parameters.requiredInterfaceType = .loopback
        parameters.allowLocalEndpointReuse = true
        listener = try NWListener(using: parameters, on: nwPort)
        self.transcriber = transcriber
    }

    func start() {
        let transcriber = self.transcriber
        let queue = self.queue
        listener.newConnectionHandler = { connection in
            HTTPConnection(connection: connection, transcriber: transcriber).start(on: queue)
        }
        listener.stateUpdateHandler = { state in
            if case .failed(let error) = state {
                say("The voice server stopped: \(error)")
                exit(1)
            }
        }
        listener.start(queue: queue)
    }
}

struct HTTPRequest {
    var method: String
    var path: String
    var headers: [String: String]
    var body: Data
}

final class HTTPConnection {
    private enum ParseResult {
        case incomplete
        case complete(HTTPRequest)
        case invalid(Int, String)
    }

    private static let maxHeaderBytes = 64 * 1024
    private static let maxBodyBytes = 30 * 1024 * 1024

    private let connection: NWConnection
    private let transcriber: Transcriber
    private var queue: DispatchQueue?
    private var buffer = Data()

    init(connection: NWConnection, transcriber: Transcriber) {
        self.connection = connection
        self.transcriber = transcriber
    }

    func start(on queue: DispatchQueue) {
        self.queue = queue
        connection.start(queue: queue)
        receive()
    }

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 16) { [self] data, _, isComplete, error in
            if let data { buffer.append(data) }
            switch parse() {
            case .complete(let request):
                handle(request)
                return
            case .invalid(let status, let message):
                respond(status: status, json: ["error": message])
                return
            case .incomplete:
                break
            }
            if isComplete || error != nil {
                connection.cancel()
                return
            }
            receive()
        }
    }

    private func parse() -> ParseResult {
        let headerBreak = Data("\r\n\r\n".utf8)
        guard let headerEnd = buffer.range(of: headerBreak) else {
            return buffer.count > Self.maxHeaderBytes ? .invalid(431, "Headers too large.") : .incomplete
        }
        guard let head = String(data: buffer.subdata(in: buffer.startIndex..<headerEnd.lowerBound), encoding: .utf8) else {
            return .invalid(400, "Bad request.")
        }
        var lines = head.components(separatedBy: "\r\n")
        let requestLine = lines.removeFirst().split(separator: " ")
        guard requestLine.count >= 2 else { return .invalid(400, "Bad request.") }

        var headers: [String: String] = [:]
        for line in lines {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            headers[name] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }

        let rest = buffer.subdata(in: headerEnd.upperBound..<buffer.endIndex)
        let body: Data
        if headers["transfer-encoding"]?.lowercased().contains("chunked") == true {
            guard let decoded = Self.decodeChunked(rest) else {
                return rest.count > Self.maxBodyBytes ? .invalid(413, "Audio too large.") : .incomplete
            }
            body = decoded
        } else {
            let length = Int(headers["content-length"] ?? "0") ?? 0
            if length > Self.maxBodyBytes { return .invalid(413, "Audio too large.") }
            guard rest.count >= length else { return .incomplete }
            body = rest.subdata(in: rest.startIndex..<(rest.startIndex + length))
        }

        let target = String(requestLine[1])
        let path = target.split(separator: "?").first.map(String.init) ?? "/"
        return .complete(HTTPRequest(method: String(requestLine[0]).uppercased(), path: path, headers: headers, body: body))
    }

    /// Returns nil until the final zero-length chunk has arrived.
    private static func decodeChunked(_ data: Data) -> Data? {
        let crlf = Data("\r\n".utf8)
        var index = data.startIndex
        var out = Data()
        while true {
            guard let lineEnd = data.range(of: crlf, in: index..<data.endIndex) else { return nil }
            let sizeLine = String(data: data.subdata(in: index..<lineEnd.lowerBound), encoding: .utf8) ?? ""
            let sizeText = sizeLine.split(separator: ";").first.map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
            guard let size = Int(sizeText, radix: 16) else { return nil }
            index = lineEnd.upperBound
            if size == 0 { return out }
            guard data.endIndex - index >= size + 2 else { return nil }
            out.append(data.subdata(in: index..<(index + size)))
            index += size + 2
        }
    }

    private func handle(_ request: HTTPRequest) {
        switch (request.method, request.path) {
        case ("GET", "/"), ("GET", "/health"):
            respond(status: 200, json: ["ok": true, "engine": "argmax-whisperkit"])
        case ("POST", "/v1/audio/transcriptions"), ("POST", "/transcribe"):
            guard let form = MultipartForm(contentType: request.headers["content-type"], body: request.body),
                  let audio = form.files["file"]
            else {
                respond(status: 400, json: ["error": "Send the audio as a multipart form field named file."])
                return
            }
            let prompt = form.fields["prompt"]
            let language = form.fields["language"].flatMap { $0.isEmpty ? nil : $0 }
            let temperature = form.fields["temperature"].flatMap { Float($0) } ?? 0
            let transcriber = self.transcriber
            Task {
                do {
                    let text = try await transcriber.transcribe(
                        audio: audio, prompt: prompt, language: language, temperature: temperature
                    )
                    self.respond(status: 200, json: ["text": text])
                } catch {
                    self.respond(status: 500, json: ["error": "Transcription failed: \(error.localizedDescription)"])
                }
            }
        default:
            respond(status: 404, json: ["error": "Not found."])
        }
    }

    private func respond(status: Int, json: [String: Any]) {
        let body = (try? JSONSerialization.data(withJSONObject: json)) ?? Data("{}".utf8)
        let head = "HTTP/1.1 \(status) \(Self.reason(status))\r\n"
            + "Content-Type: application/json\r\n"
            + "Content-Length: \(body.count)\r\n"
            + "Connection: close\r\n\r\n"
        var payload = Data(head.utf8)
        payload.append(body)
        let message = payload
        let connection = self.connection
        let send = {
            connection.send(content: message, completion: .contentProcessed { _ in connection.cancel() })
        }
        if let queue { queue.async(execute: send) } else { send() }
    }

    private static func reason(_ status: Int) -> String {
        switch status {
        case 200: return "OK"
        case 400: return "Bad Request"
        case 404: return "Not Found"
        case 413: return "Payload Too Large"
        case 431: return "Request Header Fields Too Large"
        default: return "Internal Server Error"
        }
    }
}

// MARK: - Multipart form parsing

struct MultipartForm {
    var fields: [String: String] = [:]
    var files: [String: Data] = [:]

    init?(contentType: String?, body: Data) {
        guard let contentType, contentType.lowercased().hasPrefix("multipart/form-data") else { return nil }
        guard let boundaryParam = contentType
            .components(separatedBy: ";")
            .map({ $0.trimmingCharacters(in: .whitespaces) })
            .first(where: { $0.lowercased().hasPrefix("boundary=") })
        else { return nil }
        var boundary = String(boundaryParam.dropFirst("boundary=".count))
        if boundary.count >= 2, boundary.hasPrefix("\""), boundary.hasSuffix("\"") {
            boundary = String(boundary.dropFirst().dropLast())
        }

        let delimiter = Data("--\(boundary)".utf8)
        let crlf = Data("\r\n".utf8)
        let headerBreak = Data("\r\n\r\n".utf8)

        guard let first = body.range(of: delimiter, in: body.startIndex..<body.endIndex) else { return nil }
        var cursor = first.upperBound
        while let next = body.range(of: delimiter, in: cursor..<body.endIndex) {
            var part = body.subdata(in: cursor..<next.lowerBound)
            cursor = next.upperBound
            if part.starts(with: crlf) {
                part = part.subdata(in: (part.startIndex + 2)..<part.endIndex)
            }
            if part.count >= 2, part.suffix(2) == crlf {
                part = part.subdata(in: part.startIndex..<(part.endIndex - 2))
            }
            guard let split = part.range(of: headerBreak) else { continue }
            let headerText = String(data: part.subdata(in: part.startIndex..<split.lowerBound), encoding: .utf8) ?? ""
            let content = part.subdata(in: split.upperBound..<part.endIndex)
            guard let name = Self.dispositionParameter("name", in: headerText) else { continue }
            if Self.dispositionParameter("filename", in: headerText) != nil {
                files[name] = content
            } else {
                fields[name] = String(data: content, encoding: .utf8) ?? ""
            }
        }
        if fields.isEmpty && files.isEmpty { return nil }
    }

    private static func dispositionParameter(_ key: String, in headers: String) -> String? {
        for line in headers.components(separatedBy: "\r\n") where line.lowercased().hasPrefix("content-disposition") {
            for piece in line.components(separatedBy: ";") {
                let trimmed = piece.trimmingCharacters(in: .whitespaces)
                guard trimmed.lowercased().hasPrefix(key + "=") else { continue }
                var value = String(trimmed.dropFirst(key.count + 1))
                if value.count >= 2, value.hasPrefix("\""), value.hasSuffix("\"") {
                    value = String(value.dropFirst().dropLast())
                }
                return value
            }
        }
        return nil
    }
}
