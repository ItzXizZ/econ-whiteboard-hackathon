// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "adam-voice",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "adam-voice", targets: ["AdamVoice"]),
    ],
    dependencies: [
        .package(url: "https://github.com/argmaxinc/argmax-oss-swift.git", branch: "main"),
    ],
    targets: [
        .executableTarget(
            name: "AdamVoice",
            dependencies: [
                .product(name: "WhisperKit", package: "argmax-oss-swift"),
            ],
            path: "Sources/AdamVoice"
        ),
    ],
    swiftLanguageVersions: [.v5]
)
